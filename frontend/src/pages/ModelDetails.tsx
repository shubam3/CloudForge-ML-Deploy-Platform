import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { deployModel, getModel, type DeployResponse, type ModelOut } from "../api";

export default function ModelDetails() {
  const { id } = useParams();
  const modelId = Number(id);

  const [model, setModel] = useState<ModelOut | null>(null);
  const [deploy, setDeploy] = useState<DeployResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const m = await getModel(modelId);
      setModel(m);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!Number.isFinite(modelId) || modelId <= 0) {
      setError("Invalid model id.");
      setLoading(false);
      return;
    }
    void refresh();
  }, [modelId]);

  async function onDeploy() {
    if (!model) return;
    setError(null);
    setDeploy(null);
    setDeploying(true);
    try {
      const resp = await deployModel(model.id);
      setDeploy(resp);
      await refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Deploy failed.");
    } finally {
      setDeploying(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header row">
        <div>
          <h1>Model details</h1>
          <p className="muted">
            <Link to="/models">← Back to models</Link>
          </p>
        </div>
        <div className="row">
          <button className="button secondary" onClick={() => void refresh()} disabled={loading}>
            Refresh
          </button>
          <button className="button" onClick={() => void onDeploy()} disabled={deploying || loading || !model}>
            {deploying ? "Deploying..." : "Deploy"}
          </button>
        </div>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="grid2">
        <section className="card">
          <div className="card-title">Record</div>
          {loading ? (
            <div className="muted">Loading...</div>
          ) : model ? (
            <div className="kv">
              <div className="k">id</div>
              <div className="v mono">{model.id}</div>

              <div className="k">name</div>
              <div className="v">{model.name}</div>

              <div className="k">status</div>
              <div className="v">
                <span className={`pill ${model.status}`}>{model.status}</span>
              </div>

              <div className="k">file_path</div>
              <div className="v mono">{model.file_path}</div>

              <div className="k">endpoint_url</div>
              <div className="v mono">{model.endpoint_url || "-"}</div>

              <div className="k">created_at</div>
              <div className="v mono">{model.created_at}</div>
            </div>
          ) : (
            <div className="muted">Not found.</div>
          )}
        </section>

        <section className="card">
          <div className="card-title">Deploy result</div>
          {deploy ? (
            <div className="kv">
              <div className="k">status</div>
              <div className="v mono">{deploy.status}</div>
              <div className="k">endpoint_url</div>
              <div className="v mono">{deploy.endpoint_url || "-"}</div>
            </div>
          ) : (
            <div className="muted">Click deploy to create/update an endpoint.</div>
          )}
        </section>
      </div>
    </div>
  );
}

