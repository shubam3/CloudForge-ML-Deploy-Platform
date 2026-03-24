export type ModelOut = {
  id: number;
  name: string;
  file_path: string;
  status: string;
  endpoint_url?: string | null;
  created_at: string;
};

export type DeployResponse = {
  model_id: number;
  status: string;
  endpoint_url?: string | null;
};

const DEFAULT_BASE = "http://localhost:9000";

export function apiBase(): string {
  const env = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return (env && env.trim()) || DEFAULT_BASE;
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, init);
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export function listModels(): Promise<ModelOut[]> {
  return http<ModelOut[]>("/models");
}

export function getModel(id: number): Promise<ModelOut> {
  return http<ModelOut>(`/models/${id}`);
}

export async function uploadModel(params: { name: string; file: File }): Promise<ModelOut> {
  const body = new FormData();
  body.append("file", params.file);
  const url = `${apiBase()}/models/upload?name=${encodeURIComponent(params.name)}`;
  const res = await fetch(url, { method: "POST", body });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || `Upload failed (${res.status})`);
  }
  return (await res.json()) as ModelOut;
}

export function deployModel(id: number): Promise<DeployResponse> {
  return http<DeployResponse>(`/models/${id}/deploy`, { method: "POST" });
}

