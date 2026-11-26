import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'lxh_customer_token';
const API_KEY = 'lxh_customer_api_base';
const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL || 'https://api.tuannv.site';

let authToken: string | null = null;
let apiBase: string = DEFAULT_API;

export function getApiBase(): string {
  return apiBase;
}

export async function setApiBase(url: string) {
  const clean = url.trim().replace(/\/+$/, '') || DEFAULT_API;
  apiBase = clean;
  await AsyncStorage.setItem(API_KEY, clean);
}

export function getCustomerToken(): string | null {
  return authToken;
}

export async function setCustomerToken(t: string | null) {
  authToken = t;
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function loadSavedSession(): Promise<{ token: string | null; apiBase: string }> {
  const [savedToken, savedApi] = await Promise.all([
    AsyncStorage.getItem(TOKEN_KEY),
    AsyncStorage.getItem(API_KEY),
  ]);
  if (savedApi) apiBase = savedApi;
  if (savedToken) authToken = savedToken;
  return { token: authToken, apiBase };
}

export async function customerApi<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${apiBase}${path}`, { ...options, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

export const fmtMoney = (n?: number | null) =>
  n != null ? `${n.toLocaleString('vi-VN')}đ` : '—';

export const STATUS_LABELS: Record<string, string> = {
  SEARCHING: 'Đang tìm tài xế gần bạn...',
  ACCEPTED: 'Tài xế đã nhận đơn & đang đến',
  ARRIVED: 'Tài xế đã đến điểm đón',
  IN_PROGRESS: 'Đang trên hành trình',
  COMPLETED: 'Chuyến đi hoàn thành',
  NO_DRIVER: 'Chưa có tài xế phù hợp',
  CANCELLED: 'Chuyến đã hủy',
};
