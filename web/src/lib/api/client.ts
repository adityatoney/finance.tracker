const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:10611";

export async function apiPost<T>(path: string, data: FormData | Record<string, unknown>): Promise<T> {
  const isFormData = data instanceof FormData;
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: isFormData ? data : JSON.stringify(data),
    headers: isFormData ? {} : { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: `API error: ${response.status}` }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
  return response.json();
}

export async function apiPut<T>(path: string, data: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    body: JSON.stringify(data),
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: `API error: ${response.status}` }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
  return response.json();
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: `API error: ${response.status}` }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: `API error: ${response.status}` }));
    throw new Error(error.detail || `API error: ${response.status}`);
  }
  return response.json();
}
