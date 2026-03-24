import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listModels, type ModelOut } from "../api";

export default function ModelsList() {
  const [models, setModels] = useState<ModelOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setError(null);
    setLoading(true);
    try {
      const ms = await listModels();
      setModels(ms);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="page">
      <header className="page-header row">
        <div>
          <h1>Models</h1>
          <p className="muted">Uploaded artifacts and deployment status.</p>
        </div>
        <button className="button secondary" onClick={() => void refresh()} disabled={loading}>
          Refresh
        </button>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <div className="card">
        <div className="table">
          <div className="tr th">
            <div>ID</div>
            <div>Name</div>
            <div>Status</div>
            <div>Endpoint</div>
          </div>
          {loading ? (
            <div className="tr">
              <div className="muted">Loading...</div>
              <div />
              <div />
              <div />
            </div>
          ) : models.length === 0 ? (
            <div className="tr">
              <div className="muted">No models yet.</div>
              <div />
              <div />
              <div />
            </div>
          ) : (
            models.map((m) => (
              <div className="tr" key={m.id}>
                <div className="mono">
                  <Link to={`/models/${m.id}`}>{m.id}</Link>
                </div>
                <div>{m.name}</div>
                <div>
                  <span className={`pill ${m.status}`}>{m.status}</span>
                </div>
                <div className="mono">{m.endpoint_url || "-"}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

