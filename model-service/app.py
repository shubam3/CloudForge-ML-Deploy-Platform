from __future__ import annotations

from pathlib import Path
import time
from typing import List

import joblib
import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response
from pydantic import BaseModel, Field
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest


class PredictRequest(BaseModel):
    features: List[float] = Field(..., min_length=4, max_length=4)


class PredictResponse(BaseModel):
    prediction: int


def load_bundle():
    model_path = Path(__file__).with_name("model.pkl")
    if not model_path.exists():
        raise RuntimeError(
            "model.pkl not found. Run `python train.py` in model-service/ first."
        )
    bundle = joblib.load(model_path)
    if not isinstance(bundle, dict) or "model" not in bundle:
        raise RuntimeError("model.pkl has unexpected format.")
    return bundle


bundle = load_bundle()
model = bundle["model"]

app = FastAPI(title="Model Service", version="0.1.0")

REQUESTS_TOTAL = Counter(
    "model_service_requests_total",
    "Total HTTP requests to model service",
    ["method", "path", "status"],
)
REQUEST_LATENCY_SECONDS = Histogram(
    "model_service_request_latency_seconds",
    "HTTP request latency in seconds",
    ["method", "path"],
)
PREDICT_ERRORS_TOTAL = Counter(
    "model_service_predict_errors_total",
    "Total prediction errors",
)


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time.perf_counter()
    status = "500"
    try:
        response = await call_next(request)
        status = str(response.status_code)
        return response
    finally:
        path = request.url.path
        method = request.method
        REQUESTS_TOTAL.labels(method=method, path=path, status=status).inc()
        REQUEST_LATENCY_SECONDS.labels(method=method, path=path).observe(
            max(0.0, time.perf_counter() - start)
        )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    try:
        x = np.array(req.features, dtype=float).reshape(1, -1)
        pred = model.predict(x)
        return PredictResponse(prediction=int(pred[0]))
    except Exception as e:  # noqa: BLE001
        PREDICT_ERRORS_TOTAL.inc()
        raise HTTPException(status_code=400, detail=str(e)) from e

