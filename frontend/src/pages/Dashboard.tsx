import { useEffect, useMemo, useState } from "react";
import { listModels, type ModelOut } from "../api";

function countByStatus(models: ModelOut[]) {
  const map: Record<string, number> = {};
  for (const m of models) map[m.status] = (map[m.status] ?? 0) + 1;
  return map;
}

export default function Dashboard() {
  const [models, setModels] = useState<ModelOut[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listModels()
      .then((ms) => {
        if (!cancelled) setModels(ms);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => countByStatus(models), [models]);

  return (
    <div className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="muted">Control plane for uploaded models and deployments.</p>
      </header>

      {error ? <div className="alert alert-error">{error}</div> : null}

      <section className="grid">
        <div className="card">
          <div className="card-title">Total models</div>
          <div className="card-metric">{models.length}</div>
        </div>
        <div className="card">
          <div className="card-title">Uploaded</div>
          <div className="card-metric">{stats.uploaded ?? 0}</div>
        </div>
        <div className="card">
          <div className="card-title">Running</div>
          <div className="card-metric">{stats.running ?? 0}</div>
        </div>
        <div className="card">
          <div className="card-title">Failed</div>
          <div className="card-metric">{stats.failed ?? 0}</div>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-title">API base</div>
        <div className="mono">{import.meta.env.VITE_API_BASE_URL || "http://localhost:9000"}</div>
      </section>
    </div>
  );
}

