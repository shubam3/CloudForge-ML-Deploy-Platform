# Operations

## Local run (Phase 1 + Phase 3 + Phase 4)

- Model service: `uvicorn app:app --reload --port 8000` (from `model-service/`)
- Control backend: `uvicorn main:app --reload --port 9000` (from `control-backend/`)
- Frontend: `npm run dev` (from `frontend/`)

## Kubernetes

### Build + deploy model-service (shared)

```bash
cd ML_Deployments/model-service
docker build -t model-service:local .
kind load docker-image model-service:local
kubectl apply -f ../k8s/
kubectl port-forward svc/model-service 8000:80
```

### Deploy via control-backend (Phase 6)

```bash
cd ML_Deployments/control-backend
export K8S_NAMESPACE=default
export MODEL_SERVICE_IMAGE=model-service:local
uvicorn main:app --reload --port 9000
```

Then call `POST /models/{id}/deploy`.

## Monitoring

```bash
kubectl apply -f ML_Deployments/k8s/monitoring/
kubectl port-forward svc/prometheus 9090:9090
kubectl port-forward svc/grafana 3000:3000
```

Grafana login: `admin` / `admin`.

## Autoscaling

- Ensure Metrics Server is installed.
- Apply HPA:

```bash
kubectl apply -f ML_Deployments/k8s/autoscaling/hpa-model-service.yaml
kubectl get hpa
```

