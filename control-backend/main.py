from __future__ import annotations

import os
from pathlib import Path
import subprocess

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

import crud
from database import SessionLocal, init_db
from schemas import DeployResponse, ModelOut

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "storage" / "models"
RUNTIME_DIR = BASE_DIR / "runtime" / "k8s"


def _k8s_name(model_id: int) -> str:
    return f"model-{model_id}"


def _k8s_namespace() -> str:
    return os.getenv("K8S_NAMESPACE", "default")


def _model_image() -> str:
    # Phase 6 deploys a shared inference container. Later we’ll build per-upload images.
    return os.getenv("MODEL_SERVICE_IMAGE", "model-service:local")


def _render_manifests(*, name: str, image: str) -> str:
    return f"""apiVersion: apps/v1
kind: Deployment
metadata:
  name: {name}
  labels:
    app: {name}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: {name}
  template:
    metadata:
      labels:
        app: {name}
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "8000"
        prometheus.io/path: "/metrics"
    spec:
      containers:
        - name: {name}
          image: {image}
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8000
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 3
            periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: {name}
spec:
  selector:
    app: {name}
  ports:
    - port: 80
      targetPort: 8000
  type: ClusterIP
"""


def _kubectl_apply(path: Path) -> None:
    kubectl = os.getenv("KUBECTL_BIN", "kubectl")
    ns = _k8s_namespace()
    subprocess.run([kubectl, "apply", "-n", ns, "-f", str(path)], check=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


app = FastAPI(title="Control Backend", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    RUNTIME_DIR.mkdir(parents=True, exist_ok=True)
    init_db()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/models/upload", response_model=ModelOut)
async def upload_model(
    name: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    filename = Path(file.filename or "model.bin").name
    save_path = UPLOAD_DIR / f"{name}_{filename}"

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty upload.")

    save_path.write_bytes(content)
    rec = crud.create_model_record(db, name=name, file_path=str(save_path))
    return rec


@app.get("/models", response_model=list[ModelOut])
def list_models(db: Session = Depends(get_db)):
    return list(crud.list_models(db))


@app.get("/models/{model_id}", response_model=ModelOut)
def get_model(model_id: int, db: Session = Depends(get_db)):
    rec = crud.get_model(db, model_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Model not found.")
    return rec


@app.post("/models/{model_id}/deploy", response_model=DeployResponse)
def deploy_model(model_id: int, db: Session = Depends(get_db)):
    rec = crud.get_model(db, model_id)
    if not rec:
        raise HTTPException(status_code=404, detail="Model not found.")

    if rec.status in {"deploying", "running"}:
        return DeployResponse(model_id=rec.id, status=rec.status, endpoint_url=rec.endpoint_url)

    crud.set_deploying(db, rec)

    name = _k8s_name(rec.id)
    image = _model_image()
    manifest = _render_manifests(name=name, image=image)
    out_path = RUNTIME_DIR / f"{name}.yaml"
    out_path.write_text(manifest, encoding="utf-8")

    try:
        _kubectl_apply(out_path)
        ns = _k8s_namespace()
        # In-cluster DNS name; external access typically uses port-forward/Ingress in later phases.
        endpoint_url = f"http://{name}.{ns}.svc.cluster.local/predict"
        crud.set_running(db, rec, endpoint_url=endpoint_url)
    except Exception:  # noqa: BLE001
        crud.set_failed(db, rec)
        raise

    return DeployResponse(model_id=rec.id, status=rec.status, endpoint_url=rec.endpoint_url)

