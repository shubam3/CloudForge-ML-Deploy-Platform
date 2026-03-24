import { useState } from "react";
import { uploadModel, type ModelOut } from "../api";

export default function UploadModel() {
  const [name, setName] = useState("iris");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ModelOut | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError("Choose a file to upload.");
      return;
    }
    if (!name.trim()) {
      setError("Provide a model name.");
      return;
    }

    try {
      setSaving(true);
      const rec = await uploadModel({ name: name.trim(), file });
      setResult(rec);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Upload model</h1>
        <p className="muted">Upload any artifact file. In later phases we’ll containerize + deploy it.</p>
      </header>

      <form className="card form" onSubmit={onSubmit}>
        <label className="field">
          <span className="label">Model name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. iris" />
        </label>

        <label className="field">
          <span className="label">File</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="help">Tip: upload `../model-service/model.pkl` from Phase 1.</span>
        </label>

        <button className="button" disabled={saving}>
          {saving ? "Uploading..." : "Upload"}
        </button>

        {error ? <div className="alert alert-error">{error}</div> : null}
        {result ? (
          <div className="alert alert-success">
            Uploaded as <span className="mono">id={result.id}</span> with status{" "}
            <span className="mono">{result.status}</span>.
          </div>
        ) : null}
      </form>
    </div>
  );
}

