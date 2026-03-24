# Interview Guide: Cloud‑Native ML Deployment Platform

This is the “tell the story” doc for interviews: how the platform works end-to-end, why the design choices were made, and the exact technical follow-ups an interviewer will likely ask.

## The 30-second pitch (say this first)

I built a small cloud platform that:

- lets you **upload ML artifacts**
- tracks them in a **control plane (FastAPI + SQLite)**
- **deploys an inference service** onto Kubernetes by generating manifests and running `kubectl apply`
- exposes a **prediction API** (`/predict`) with **health probes**
- adds **observability** (Prometheus metrics + Grafana) and **autoscaling** (HPA)

It’s intentionally incremental: local inference → Docker → control plane → UI → Kubernetes → automation → monitoring → autoscaling.

## Architecture you should be able to explain

Read `docs/ARCHITECTURE.md` first; then use this section to “walk the arrows”.

### Data plane vs control plane

- **Data plane**: inference traffic goes to **Model Service** pods.
- **Control plane**: user actions go to **Control Backend**, which orchestrates deployments and stores metadata.

That distinction is a common interview topic.

## End-to-end flows (the “how does it work?” section)

### Flow A: Train + serve locally (Phase 1)

1. `train.py` trains an Iris classifier and writes `model.pkl`
2. `model-service/app.py` loads `model.pkl` at startup
3. Requests:
   - `GET /health` returns readiness/liveness signal
   - `POST /predict` runs `model.predict(features)`

What to emphasize:

- **Cold start**: model is loaded once at startup (fast requests afterward).
- **Input validation**: `pydantic` ensures exactly 4 features for Iris.

### Flow B: Upload an artifact (Phase 3)

1. UI (or curl) calls `POST /models/upload?name=<name>` with a multipart file
2. Control Backend stores the file in `control-backend/storage/models/`
3. Control Backend writes a DB row with:
   - `status=uploaded`
   - `file_path=<saved path>`

What to emphasize:

- **Artifact storage is local** in this phase; in production you’d use S3/GCS/Blob storage with signed URLs.
- The DB is the **source of truth** for lifecycle state.

### Flow C: Deploy to Kubernetes (Phase 6)

1. User triggers deploy from UI (or curl): `POST /models/{id}/deploy`
2. Control Backend:
   - sets status to `deploying`
   - generates a Deployment + Service YAML for `model-<id>`
   - saves it to `control-backend/runtime/k8s/model-<id>.yaml`
   - runs: `kubectl apply -n <ns> -f <yaml>`
3. Control Backend sets DB status:
   - `running` on success (and stores an endpoint URL)
   - `failed` on error

What to emphasize:

- This is “GitOps-like” in spirit: manifests are generated and applied; in production you’d apply via a controller or CI/CD pipeline.

### Flow D: Monitoring (Phase 7)

1. Model Service exposes `GET /metrics`
2. Pods have scrape annotations:
   - `prometheus.io/scrape: "true"`
   - `prometheus.io/port: "8000"`
   - `prometheus.io/path: "/metrics"`
3. Prometheus discovers pods via Kubernetes SD and scrapes annotated targets
4. Grafana is provisioned with a Prometheus datasource

What to emphasize:

- You chose **black-box + white-box**: `/health` for probes and `/metrics` for detailed telemetry.
- Key metrics:
  - request count, latency histogram, error count

### Flow E: Autoscaling (Phase 8)

1. HPA targets a Deployment (example provided for `model-service`)
2. HPA scales between 1 and 5 replicas based on **CPU utilization**

What to emphasize:

- HPA needs **metrics-server** and **CPU requests**; you ensured requests exist in both:
  - static k8s manifests
  - Phase 6 generated manifests

## What this project is *not* (and how you’d evolve it)

Interviewers love asking what you’d do next. Have a crisp answer.

### Current simplifications (intentional)

- **No per-model container builds**: deploy uses a shared `MODEL_SERVICE_IMAGE`.
- **Endpoint URL is in-cluster DNS**: external access is via port-forward (Ingress next).
- **SQLite + local storage**: simple for dev; not for multi-node production.

### Next steps (production-grade roadmap)

- **Artifact storage**: move to S3 with signed URLs and lifecycle policies.
- **Per-model images**:
  - build OCI image on upload (Kaniko/BuildKit)
  - scan images (Trivy)
  - push to registry (ECR/GCR)
- **Kubernetes API integration**:
  - use the Kubernetes Python client instead of calling `kubectl`
  - or create a controller/operator for Model CRDs
- **Ingress**:
  - NGINX Ingress / Gateway API
  - TLS via cert-manager
- **Authn/Authz**:
  - JWT + RBAC (who can deploy/scale/delete)
- **Multi-tenancy**:
  - namespaces per team
  - resource quotas/limits
- **Model versioning**:
  - semantic versions; immutable artifacts; rollback support
- **Observability**:
  - tracing (OpenTelemetry)
  - structured logs + correlation IDs
- **Reliability**:
  - retries with backoff in deploy
  - idempotency keys for deploy requests
  - background jobs/queue (Celery/RQ) so deploy isn’t a blocking HTTP request

## Technical deep dives interviewers ask (with “good” answers)

### 1) Why FastAPI?

- async-friendly, strong typing via Pydantic, fast iteration, simple OpenAPI generation.

### 2) Why a control plane service at all?

- decouples user workflows (upload/deploy/status) from inference traffic.
- enables policy enforcement, auditing, and lifecycle management.

### 3) How do you ensure deployments are safe?

Today:

- health probes reduce bad rollouts
- status transitions (`uploaded → deploying → running/failed`)

Production:

- run validation before apply (schema + policy)
- canary deployments and gradual traffic shifting
- immutable artifact versions + rollbacks

### 4) What happens if `kubectl apply` fails?

- deploy endpoint marks the record `failed` and surfaces the error.
- follow-up improvement: capture stderr, store it in DB, and expose it in UI; add retries.

### 5) Why store endpoint URLs? How do clients reach it?

- stored URL is primarily metadata for discovery/visibility.
- in-cluster DNS is correct for internal callers; for external, you’d add Ingress or a gateway and store that URL.

### 6) Why Prometheus metrics vs logs?

- metrics are cheap, aggregatable, and good for SLOs and alerts.
- logs are needed for debugging; next step is structured logs + centralized collection.

### 7) Explain your Prometheus configuration

- Kubernetes service discovery watches pods
- relabeling keeps only pods with `prometheus.io/scrape=true`
- path/port come from annotations

### 8) Why histogram for latency?

- supports p95/p99 latency calculations with `histogram_quantile`
- better than average latency for tail performance

### 9) How does HPA decide to scale?

- compares current CPU usage vs requested CPU to compute utilization
- scales within min/max, subject to stabilization windows (cluster default behavior)

### 10) How would you handle model upgrades (v1 → v2)?

- treat model version as immutable
- deploy new Deployment (`model-<id>-v2`) and shift traffic gradually
- keep ability to rollback

## Behavior / operational questions you should be ready for

### Failure modes checklist

- **Model load fails** (bad pickle): container crashes → K8s restarts; surface “failed” in control plane with validation pre-check.
- **Bad input**: returns 400; increments `predict_errors_total`.
- **Cluster unreachable / kubeconfig wrong**: deploy fails; mark model as failed.
- **Image not present in cluster**: pods stuck `ImagePullBackOff`; detect via `kubectl get pods` / events (improvement: poll status after apply).
- **No metrics-server**: HPA stays `Unknown` for metrics.

### Security checklist (what interviewers want to hear)

- Don’t unpickle untrusted artifacts in production.
- Validate uploads (size/type), scan artifacts, and isolate execution (sandbox).
- Add auth for upload/deploy; store secrets safely (K8s Secrets, external secret managers).
- Principle of least privilege: service account permissions scoped to namespace/resources.

### Performance checklist

- Load model once per process (already done).
- Use multiple workers (`uvicorn --workers N`) for CPU-bound inference (or use a model server).
- Consider batching, caching, and request timeouts.

## Demo script (10 minutes)

Use this to “show not tell”.

1. Train + start `model-service`
2. Run `control-backend`
3. Upload `model.pkl`
4. Deploy model (`/deploy`)
5. Show pods + service
6. Port-forward Prometheus and query `model_service_requests_total`
7. Hit `/predict` a few times and show Grafana/Prometheus changes
8. Apply HPA and show `kubectl get hpa`

## Key commands you should remember

- `kubectl get pods`, `kubectl describe pod <name>`, `kubectl get events`
- `kubectl port-forward svc/<svc> <local>:<remote>`
- `kubectl logs deploy/<name> --tail=200`
- `kubectl get hpa`

## Rapid-fire question bank (memorize these)

Use these to practice quick answers (10–30 seconds each).

### System design / architecture

- **Why separate control plane and data plane?**: Control plane handles lifecycle and policy; data plane focuses on low-latency inference. It improves scalability, security boundaries, and operability.
- **What’s the single source of truth?**: The DB record tracks model lifecycle state; Kubernetes is the runtime state. In production I’d reconcile the two with a controller.
- **How do you handle multi-tenancy?**: Namespace-per-tenant, RBAC per namespace, resource quotas/limits, and separate artifact buckets/prefixes.
- **How do clients reach the model endpoint?**: Currently via port-forward (dev). In production via Ingress/Gateway with TLS, auth, and a stable DNS name.

### Kubernetes

- **What does a Service do?**: Stable virtual IP + DNS and load-balancing across pods selected by labels.
- **Difference between readiness and liveness probes?**: Readiness gates traffic; liveness restarts unhealthy containers.
- **What happens if the image isn’t in the cluster?**: Pods go `ImagePullBackOff`; you’d see events via `kubectl describe pod`.
- **Why do you set `imagePullPolicy: IfNotPresent`?**: Works well for local images in kind/minikube; production would typically rely on registry pulls and tags/digests.

### Deployment automation

- **Why call `kubectl` from the backend?**: Fast way to prototype. Next step is Kubernetes API client or a controller/operator for reconciliation and retries.
- **How do you make deploy idempotent?**: Using deterministic resource names (e.g. `model-<id>`). `kubectl apply` is declarative and repeatable.
- **What’s a better async design?**: Put deploy into a background job queue; return 202 + job id; UI polls status.

### ML / inference

- **Why load the model at startup?**: Avoid per-request disk IO; reduces latency and variance. Trade-off is larger cold start.
- **How would you support multiple models?**: Per-model image or mount artifact from object storage; route by model id/version; versioned endpoints and rollbacks.
- **Pickle security?**: Don’t unpickle untrusted files. Use safer formats (ONNX), scanning, signature verification, sandboxing, or isolate in a restricted runtime.

### Observability

- **What metrics matter most?**: Request rate, error rate, latency (p95/p99), saturation (CPU/memory), and queue depth if async.
- **Why histogram for latency?**: Tail latency is what users feel; histogram allows p95/p99 via `histogram_quantile`.
- **How do you trace a slow request?**: Add structured logs + correlation IDs; add OpenTelemetry traces and propagate trace context.

### Autoscaling

- **How does HPA compute CPU utilization?**: \(utilization = usage / requested\). That’s why CPU requests must be set.
- **Why might HPA not scale?**: metrics-server missing, no CPU requests, or traffic too low; check `kubectl describe hpa`.

### Reliability / security

- **What happens on deploy failure?**: The control plane marks status `failed`. Next step: persist error details, retry with backoff, and reconcile actual K8s state.
- **How do you secure the control backend?**: Auth (JWT/OIDC), RBAC, input validation, upload limits, malware scanning, and least-privilege K8s service accounts.

### “What would you improve next?”

- **Biggest improvement**: Per-model immutable builds (BuildKit/Kaniko), registry push, and GitOps/Controller-based deployments; plus Ingress + TLS + auth.

