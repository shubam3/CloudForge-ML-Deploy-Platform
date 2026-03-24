# How to Run: Local + Cloud

This doc focuses on **running** the platform (not just building it).

## Local (recommended for demo/interview)

### 1) Model service (inference)

```bash
cd ML_Deployments/model-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python train.py
uvicorn app:app --reload --port 8000
```

Test:

```bash
curl -s localhost:8000/health
curl -s -X POST localhost:8000/predict \
  -H 'content-type: application/json' \
  -d '{"features":[5.1,3.5,1.4,0.2]}'
curl -s localhost:8000/metrics | head -n 20
```

### 2) Control backend (control plane)

```bash
cd ML_Deployments/control-backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 9000
```

Upload + deploy (deploy will require kubectl configured if you call it):

```bash
curl -s -X POST "localhost:9000/models/upload?name=iris" \
  -F "file=@../model-service/model.pkl"
curl -s localhost:9000/models
```

### 3) Frontend

```bash
cd ML_Deployments/frontend
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:5173`.

## Local Kubernetes (kind/minikube)

### Prereqs

- `docker`
- `kubectl`
- `kind` or `minikube`

### Deploy shared model-service

```bash
cd ML_Deployments/model-service
docker build -t model-service:local .
kind create cluster || true
kind load docker-image model-service:local

kubectl apply -f ../k8s/
kubectl port-forward svc/model-service 8000:80
```

### Deploy via control-backend (Phase 6 automation)

In terminal A (ensure kube context points at kind/minikube):

```bash
cd ML_Deployments/control-backend
export K8S_NAMESPACE=default
export MODEL_SERVICE_IMAGE=model-service:local
uvicorn main:app --reload --port 9000
```

In terminal B:

```bash
curl -s -X POST "localhost:9000/models/upload?name=iris" -F "file=@../model-service/model.pkl"
curl -s -X POST localhost:9000/models/1/deploy
kubectl get pods
kubectl get svc
```

## Cloud (practical path: Managed Kubernetes)

The platform is Kubernetes-first. “Cloud run” typically means:

1. **Build and push images** to a cloud container registry
2. **Deploy to a managed Kubernetes cluster**
3. Expose services via **Ingress / LoadBalancer**
4. Configure monitoring and autoscaling in-cluster

Below is a provider-agnostic checklist, followed by concrete examples.

### Cloud checklist (provider-agnostic)

- **Container registry**: push `model-service` (and later: `control-backend`, `frontend`)
- **Cluster**: create managed K8s (EKS/GKE/AKS)
- **kubectl access**: configure kubeconfig for the cluster
- **Image pull**: ensure nodes can pull from registry (IAM/workload identity)
- **Ingress**: install an ingress controller + TLS (cert-manager)
- **Secrets**: move config/credentials to a secret manager and K8s Secrets
- **Storage**:
  - replace local uploads with object storage (S3/GCS/Azure Blob)
  - replace SQLite with Postgres (managed DB)

### Example: Cloud deploy of model-service (minimal)

1) Build + push to registry (replace placeholders):

```bash
docker build -t <registry>/<project>/model-service:<tag> ML_Deployments/model-service
docker push <registry>/<project>/model-service:<tag>
```

2) Update images used by deployments:

- For static manifest `k8s/deployment.yaml`: set `image: <registry>/<project>/model-service:<tag>`
- For Phase 6 automation: set:

```bash
export MODEL_SERVICE_IMAGE=<registry>/<project>/model-service:<tag>
```

3) Apply manifests to cloud cluster:

```bash
kubectl apply -f ML_Deployments/k8s/
```

4) Expose publicly (recommended approach):

- Install an ingress controller (NGINX Ingress or Gateway API)
- Create an Ingress resource routing:
  - `/predict` → model-service
  - `/models/*` → control-backend
  - `/` → frontend (or host frontend separately)

### What to say in interviews about “cloud”

- **Today**: runs locally and on any Kubernetes cluster; cloud deployment is “push images to registry + apply manifests”.
- **Production upgrades**:
  - Use Postgres + object storage
  - Add Ingress + TLS + auth
  - Replace `kubectl` calls with Kubernetes API/controller for reconciliation

