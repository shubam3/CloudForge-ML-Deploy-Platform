# Architecture

## High-level diagram

```mermaid
flowchart LR
  U[User] -->|Browser| FE[Frontend (React)]
  FE -->|REST| CB[Control Backend (FastAPI)]
  CB -->|Stores metadata| DB[(SQLite)]
  CB -->|Uploads artifacts| ST[(Local Storage)]
  CB -->|kubectl apply| K8S[(Kubernetes Cluster)]
  K8S --> MS[Model Service pods (FastAPI)]
  U -->|Port-forward / Ingress (later)| MS

  subgraph Monitoring
    P[Prometheus] -->|Scrape /metrics| MS
    G[Grafana] -->|Dashboards| P
  end
```

## Components

- **Model Service (`model-service/`)**: inference API (`/predict`), health check (`/health`), metrics (`/metrics`).
- **Control Backend (`control-backend/`)**: upload/list/deploy APIs + SQLite tracking.
- **Frontend (`frontend/`)**: dashboard UI that calls control-backend APIs.
- **Kubernetes (`k8s/`)**: manifests for deployments/services + monitoring + autoscaling.

## Current limitations (by design)

- **Uploads are not yet “containerized per model”**; Phase 6 deploys a shared `MODEL_SERVICE_IMAGE`.
- **Endpoint URL stored is in-cluster DNS**; external access is via `kubectl port-forward` (Ingress/LoadBalancer can be added later).

