# API Reference

## Model Service (inference)

Base URL (local): `http://localhost:8000`

### `GET /health`

Response:

```json
{ "status": "ok" }
```

### `POST /predict`

Request:

```json
{ "features": [5.1, 3.5, 1.4, 0.2] }
```

Response:

```json
{ "prediction": 0 }
```

### `GET /metrics`

Prometheus text format metrics (scraped by Prometheus).

Key metrics:

- `model_service_requests_total{method,path,status}`
- `model_service_request_latency_seconds_bucket{method,path,le}`
- `model_service_predict_errors_total`

## Control Backend (control plane)

Base URL (local): `http://localhost:9000`

### `GET /health`

Response:

```json
{ "status": "ok" }
```

### `POST /models/upload`

Query parameters:

- `name` (string): model name

Multipart body:

- `file`: uploaded artifact file

Example:

```bash
curl -s -X POST "localhost:9000/models/upload?name=iris" \
  -F "file=@../model-service/model.pkl"
```

Response fields:

- `id`, `name`, `file_path`, `status`, `endpoint_url`, `created_at`

### `GET /models`

Returns an array of model records.

### `GET /models/{id}`

Returns a single model record.

### `POST /models/{id}/deploy`

Behavior:

- Generates a Kubernetes Deployment+Service manifest for `model-<id>`
- Applies it using `kubectl`
- Updates the DB status and stored endpoint URL

Environment variables:

- `K8S_NAMESPACE` (default `default`)
- `MODEL_SERVICE_IMAGE` (default `model-service:local`)
- `KUBECTL_BIN` (default `kubectl`)

## Frontend

Base URL (local): `http://localhost:5173`

Environment:

- `VITE_API_BASE_URL` (default `http://localhost:9000`)

