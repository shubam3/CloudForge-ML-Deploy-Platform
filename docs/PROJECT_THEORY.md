# Project Theory: Cloud‑Native ML Model Deployment Platform

This document is the “deep understanding” layer behind the code. Use it to explain the project clearly in interviews, answer follow-up questions, and reason about trade-offs and failure modes.

## What problem this platform solves

ML teams often have a gap between:

- **Training** (notebooks, experiments, artifacts like `.pkl`)
- and **Production inference** (reliable API endpoints, monitoring, scaling, rollouts)

This project builds a minimal platform that bridges that gap by separating:

- a **control plane** (upload + deploy + status)
- from a **data plane** (fast inference API)

Even though this project is intentionally simplified, the architecture mirrors real systems.

## Mental model: Control plane vs Data plane

### Data plane (serving)

- **Goal**: serve predictions with low latency and high availability.
- **Component**: `model-service/` (FastAPI app)
- **Interfaces**:
  - `/predict` for inference traffic
  - `/health` for kube probes
  - `/metrics` for Prometheus scraping

### Control plane (orchestration)

- **Goal**: manage lifecycle (uploaded → deploying → running/failed).
- **Component**: `control-backend/` (FastAPI app + SQLite)
- **Interfaces**:
  - upload/list/get model metadata
  - deploy a model by creating Kubernetes resources

### Why this separation matters (interviewer-friendly)

- **Scalability**: inference traffic can scale independently from management APIs.
- **Security**: control operations can be locked down and audited; inference endpoints can be exposed differently.
- **Reliability**: failures in deployment logic shouldn’t take down prediction serving.

## Phase-by-phase theory (what each phase proves)

### Phase 1 — Local inference API

**What you prove**: you can turn a trained model into a stable HTTP inference service.

- `train.py` produces `model.pkl`
- `app.py` loads model once at startup and serves `/predict`

Key concepts:

- **Cold start vs warm path**:
  - cold start: load model from disk at process start
  - warm path: in-memory predict per request
- **Input contract**:
  - Pydantic validates shape/types (4 floats for Iris)
  - In production you’d validate schema versioning and feature ordering too

### Phase 2 — Dockerization

**What you prove**: the service is reproducible and portable.

Key concepts:

- **Immutability**: same container image runs anywhere
- **Dependency pinning**: avoids “works on my laptop” surprises
- **Runtime boundary**: container isolates Python env and makes deployment consistent

### Phase 3 — Control backend (model registry-lite)

**What you prove**: you can track models and manage a deployment lifecycle.

DB fields:

- `id`: primary key
- `name`: human-friendly name
- `file_path`: where artifact is stored (local path in this phase)
- `status`: uploaded / deploying / running / failed
- `endpoint_url`: where the running service is reachable (metadata)
- `created_at`: audit trail

Key concepts:

- **Lifecycle state machine**: simple statuses are the basis of real model registries
- **Separation of concerns**:
  - artifact storage (files) is separate from metadata storage (DB)
- **Why SQLite here**:
  - quick start; but not ideal for concurrency/multi-node
  - production would use Postgres + migrations

### Phase 4 — Frontend dashboard

**What you prove**: you can provide a usable UI for operational workflows.

Key concepts:

- **Operational UX**: list models, view status, trigger deploy, see endpoint
- **API client boundary**: frontend speaks only to control backend (not to kubectl, not to DB)

### Phase 5 — Kubernetes manifests (manual deploy)

**What you prove**: the inference service runs in a real orchestrator.

Kubernetes objects:

- **Deployment**: desired state for pods (replicas, image, probes)
- **Service**: stable DNS + virtual IP for pods (load balancing)

Key concepts:

- **Readiness vs liveness**:
  - readiness: “should I receive traffic?”
  - liveness: “should I be restarted?”
- **Image pull policy** (`IfNotPresent`):
  - useful in local clusters with locally loaded images
  - production typically uses a registry + immutable tags/digests

### Phase 6 — Deployment automation

**What you prove**: the control plane can create runtime resources automatically.

What happens on `POST /models/{id}/deploy`:

1. Update DB status: `deploying`
2. Generate YAML for a `Deployment` + `Service` named `model-<id>`
3. Write YAML to `control-backend/runtime/k8s/model-<id>.yaml`
4. Run `kubectl apply` (declarative, idempotent)
5. On success set DB status: `running` and store endpoint URL
6. On error set DB status: `failed`

Key concepts (and interview follow-ups):

- **Idempotency**: deterministic names + `kubectl apply` means deploy can be repeated safely.
- **Why kubectl from backend is “okay” here**:
  - prototype approach
  - production evolution is Kubernetes API client or operator/controller
- **Reconciliation**:
  - real control planes reconcile desired state (DB) with actual state (K8s)
  - this project doesn’t continuously reconcile (intentional simplicity)

### Phase 7 — Monitoring (Prometheus + Grafana)

**What you prove**: you can observe performance and reliability over time.

Instrumentation strategy:

- Add request middleware that records:
  - request count (`Counter`)
  - latency (`Histogram`)
  - error count (predict failures)

Prometheus strategy:

- Kubernetes pod discovery + relabeling filters pods by annotations
- The service exposes `/metrics` in Prometheus text format

Key concepts:

- **Why histograms**: allow p95/p99 computations (tail latency)
- **What to alert on**:
  - high error rate
  - latency SLO violations
  - saturation (CPU)

### Phase 8 — Autoscaling (HPA)

**What you prove**: the platform can scale based on load.

HPA basics:

- HPA reads metrics (CPU via metrics-server).
- CPU utilization is roughly: \(usage / requested\).
- That’s why **CPU requests are mandatory** for predictable autoscaling.

Key concepts:

- **Why HPA sometimes doesn’t scale**:
  - metrics-server missing
  - no CPU requests
  - low traffic / stable CPU
- **Better scaling signals**:
  - request rate (custom metrics)
  - latency (SLO-based scaling)

## How the system behaves at runtime (important!)

### 1) Inference request path

When a client hits `/predict`:

1. FastAPI parses JSON body
2. Pydantic validates `features` shape
3. Model predicts from in-memory model
4. Middleware records latency and increments request counter
5. Response returns prediction

Failure cases:

- invalid JSON → 422
- wrong feature length → 422
- model predict error → 400 (and `predict_errors_total` increments)

### 2) Deploy request path

When a user deploys a model:

1. Control backend validates record exists
2. Generates a K8s manifest with:
   - health probes
   - resource requests (HPA readiness)
   - Prometheus scrape annotations
3. Applies YAML to cluster
4. Stores in-cluster endpoint URL

Failure cases:

- kube context wrong → `kubectl apply` fails → status `failed`
- image not present in cluster → pods stuck → (improvement: poll pod status and surface to UI)

## Kubernetes theory you should explain clearly

### Deployment

- Ensures desired replicas exist.
- Rolls out changes gradually (rolling update by default).
- Combined with probes, it prevents traffic to unhealthy pods.

### Service

- Selects pods by labels (e.g., `app: model-1`).
- Provides stable DNS name.
- Load balances across matching pods.

### In-cluster DNS vs external access

- `http://service.namespace.svc.cluster.local` works **inside** the cluster.
- For **outside** traffic you normally use:
  - `kubectl port-forward` (dev)
  - Ingress / Gateway / LoadBalancer (prod)

## Monitoring theory you should explain clearly

### Why `/metrics` and Prometheus?

- Metrics are numeric, aggregated, and good for alerting and dashboards.
- Prometheus scraping is simple and works well in Kubernetes.

### Key queries (explain what they mean)

- **Traffic**: `rate(model_service_requests_total[1m])`
  - requests per second (approx) over last minute
- **Error rate**: `rate(model_service_predict_errors_total[5m])`
  - how often inference fails
- **p95 latency**:
  - `histogram_quantile(0.95, sum(rate(model_service_request_latency_seconds_bucket[5m])) by (le))`

## Scaling theory you should explain clearly

### CPU-based HPA

- Works well when inference is CPU-bound.
- Requires CPU requests.
- Not ideal when bottleneck is IO or downstream calls (then scale on request rate/latency).

### Limits vs requests

- **requests**: what the scheduler guarantees; used for HPA utilization calculation.
- **limits**: maximum allowed usage; can cause throttling if too low.

## Security and safety theory (interviewers care)

### Artifact safety (very important)

Loading `.pkl` can execute arbitrary code if it’s untrusted.

Production-grade answers:

- Don’t accept arbitrary pickles from unknown users.
- Prefer safer formats (ONNX), signature verification, malware scanning.
- Sandbox model execution (restricted container, seccomp, no host mounts).

### Control plane RBAC

- Control backend should run with a service account that has only required permissions.
- Limit namespace access; avoid cluster-admin.
- Audit deploy actions.

## Trade-offs you should explicitly mention

This is how you sound senior: state trade-offs before being asked.

- **Using `kubectl` vs Kubernetes API**:
  - kubectl is fast to implement
  - API/controller gives better reliability, retries, and reconciliation
- **SQLite/local files vs Postgres/S3**:
  - simplest for local dev
  - not robust for multi-node or cloud
- **Single shared model-service image**:
  - simplifies deployment
  - per-model images are the production direction

## “How to explain it” scripts (practice these)

### 60-second walkthrough

“Users upload an ML artifact to the control backend, which stores metadata in SQLite and stores the file locally. When they click deploy, the backend generates Kubernetes manifests for a Deployment and Service named `model-<id>` and applies them to the cluster. The data plane is a FastAPI model-service exposing `/predict`, with `/health` for probes. We instrument it with Prometheus metrics on `/metrics`, scrape in Kubernetes, and visualize in Grafana. We also add an HPA to scale pods based on CPU utilization.”

### 2-minute deep dive

“This is a control-plane / data-plane architecture. The control plane manages lifecycle: uploaded → deploying → running/failed, and the data plane is optimized for inference. The deployment automation is declarative and idempotent using deterministic names and `kubectl apply`. Observability uses middleware metrics to measure request volume, latency distributions, and errors; Prometheus discovers pods via annotations. Autoscaling uses HPA v2 and relies on metrics-server and CPU requests, so we ensure requests exist in both static and generated deployments.”

## Glossary (quick definitions)

- **Control plane**: management layer for lifecycle/state.
- **Data plane**: request-serving layer.
- **Idempotent**: safe to repeat without changing outcome unexpectedly.
- **Reconciliation loop**: continuously drives actual state to desired state.
- **HPA**: Kubernetes autoscaler for workloads.

