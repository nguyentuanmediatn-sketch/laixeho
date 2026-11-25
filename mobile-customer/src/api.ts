export const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

let authToken: string | null = null;
export const setCustomerToken = (t: string | null) => {
  authToken = t;
};

export async function customerApi<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}
