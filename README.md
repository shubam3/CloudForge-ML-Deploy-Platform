# AI Cloud Platform (ML Deployments)

This project is built **phase-by-phase** from `ML_Deployments/ai_cloud_platform_cursor_guide.md`.

**Cloud‑Native ML Model Deployment Platform** — Built a platform to upload ML artifacts, deploy inference services on Kubernetes, expose prediction APIs via FastAPI, and monitor performance with Prometheus + Grafana; added automated deployment generation and CPU-based autoscaling.

## Phase 1 (local inference)

### Setup

```bash
cd ML_Deployments/model-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python train.py
```

### Run

```bash
uvicorn app:app --reload --port 8000
```

### Test

```bash
curl -s localhost:8000/health
curl -s -X POST localhost:8000/predict \
  -H 'content-type: application/json' \
  -d '{"features":[5.1,3.5,1.4,0.2]}'
```

## Phase 3 (control backend)

### Setup

```bash
cd ML_Deployments/control-backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Run

```bash
uvicorn main:app --reload --port 9000
```

### Test

```bash
curl -s localhost:9000/health

# Upload a model artifact (example: upload the Phase 1 model.pkl)
curl -s -X POST "localhost:9000/models/upload?name=iris" \
  -F "file=@../model-service/model.pkl"

curl -s localhost:9000/models
curl -s -X POST localhost:9000/models/1/deploy
```

## Phase 4 (frontend dashboard)

### Setup

```bash
cd ML_Deployments/frontend
npm install
cp .env.example .env
```

### Run

```bash
npm run dev
```

Open the UI at `http://localhost:5173` and make sure the backend is running at `http://localhost:9000`.

## Phase 5 (Kubernetes deployment: model-service)

### Prerequisites

- `kubectl`
- `kind` or `minikube`
- Docker (to build the image)

### Deploy with kind (recommended)

```bash
# Build the image locally (creates model-service:local)
cd ML_Deployments/model-service
docker build -t model-service:local .

# Create a cluster (skip if you already have one)
kind create cluster

# Load the local image into the kind cluster
kind load docker-image model-service:local

# Apply manifests
kubectl apply -f ../k8s/

# Port-forward the service to your laptop
kubectl port-forward svc/model-service 8000:80
```

Then test:

```bash
curl -s localhost:8000/health
curl -s -X POST localhost:8000/predict \
  -H 'content-type: application/json' \
  -d '{"features":[5.1,3.5,1.4,0.2]}'
```

## Phase 6 (deployment automation from control-backend)

`POST /models/{id}/deploy` now:

- writes a generated manifest to `control-backend/runtime/k8s/model-<id>.yaml`
- runs `kubectl apply -n $K8S_NAMESPACE -f <file>`
- updates SQLite with an in-cluster endpoint URL: `http://model-<id>.<ns>.svc.cluster.local/predict`

### Requirements

- `kubectl` installed and pointing to your cluster
- the image configured in `MODEL_SERVICE_IMAGE` exists in the cluster

### Example (kind)

```bash
# Build and load model-service image into kind
cd ML_Deployments/model-service
docker build -t model-service:local .
kind load docker-image model-service:local

# Run control backend (in a separate terminal)
cd ../control-backend
export K8S_NAMESPACE=default
export MODEL_SERVICE_IMAGE=model-service:local
uvicorn main:app --reload --port 9000

# Upload + deploy
curl -s -X POST "localhost:9000/models/upload?name=iris" -F "file=@../model-service/model.pkl"
curl -s -X POST localhost:9000/models/1/deploy
```

## Phase 7 (Monitoring: Prometheus + Grafana)

### What’s included

- `model-service` now exposes `GET /metrics` (Prometheus format)
- Kubernetes pods created from:
  - `ML_Deployments/k8s/deployment.yaml`
  - Phase 6 generated manifests (`control-backend/runtime/k8s/*.yaml`)
  include scrape annotations:
  - `prometheus.io/scrape: "true"`
  - `prometheus.io/port: "8000"`
  - `prometheus.io/path: "/metrics"`
- Prometheus + Grafana manifests live in `ML_Deployments/k8s/monitoring/`

### Deploy monitoring stack

```bash
kubectl apply -f ML_Deployments/k8s/monitoring/
```

### Open Prometheus + Grafana

```bash
kubectl port-forward svc/prometheus 9090:9090
kubectl port-forward svc/grafana 3000:3000
```

- Prometheus UI: `http://localhost:9090`
- Grafana UI: `http://localhost:3000` (login `admin` / `admin`)

### Example queries

- `model_service_requests_total`
- `rate(model_service_requests_total[1m])`
- `histogram_quantile(0.95, sum(rate(model_service_request_latency_seconds_bucket[5m])) by (le))`

## Phase 8 (Autoscaling: HPA)

This phase uses Kubernetes **HorizontalPodAutoscaler** (CPU-based).

### Requirements

- Metrics Server installed in your cluster (HPA needs resource metrics).
  - On minikube: `minikube addons enable metrics-server`
  - On kind: install metrics-server (standard Kubernetes manifest)

### Apply HPA for the shared `model-service` Deployment

```bash
kubectl apply -f ML_Deployments/k8s/autoscaling/hpa-model-service.yaml
kubectl get hpa
```

### Note about Phase 6 per-model deployments

Phase 6 generated deployments now include **CPU requests**, so they are HPA-ready; you can create additional HPAs targeting `Deployment/model-<id>` the same way as the provided example.

