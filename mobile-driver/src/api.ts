import AsyncStorage from '@react-native-async-storage/async-storage';

const TOKEN_KEY = 'lxh_driver_token';
const API_KEY = 'lxh_driver_api_base';
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

export function getDriverToken(): string | null {
  return authToken;
}

export async function setDriverToken(t: string | null) {
  authToken = t;
  if (t) await AsyncStorage.setItem(TOKEN_KEY, t);
  else await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function loadSavedDriverSession(): Promise<{ token: string | null; apiBase: string }> {
  const [savedToken, savedApi] = await Promise.all([
    AsyncStorage.getItem(TOKEN_KEY),
    AsyncStorage.getItem(API_KEY),
  ]);
  if (savedApi) apiBase = savedApi;
  if (savedToken) authToken = savedToken;
  return { token: authToken, apiBase };
}

export async function driverApi<T = any>(path: string, options: RequestInit = {}): Promise<T> {
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

/**
 * Tải tệp ảnh/video thật lên Presigned PUT URL có báo tiến độ % và tự thử lại khi mạng yếu
 */
export async function uploadFileWithProgress(
  uploadUrl: string,
  fileUri: string,
  contentType: string,
  onProgress?: (pct: number) => void,
  maxRetries = 2,
): Promise<number> {
  const fileResp = await fetch(fileUri);
  const blob = await fileResp.blob();
  const size = blob.size || 0;

  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.upload.onprogress = (ev) => {
          if (ev.lengthComputable && ev.total > 0 && onProgress) {
            onProgress(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            onProgress?.(100);
            resolve();
          } else {
            reject(new Error(`Upload thất bại (HTTP ${xhr.status})`));
          }
        };
        xhr.onerror = () => reject(new Error('Lỗi kết nối mạng khi tải tệp'));
        xhr.ontimeout = () => reject(new Error('Hết thời gian tải tệp'));
        xhr.timeout = 60000;
        xhr.send(blob);
      });
      return size;
    } catch (err: any) {
      lastErr = err;
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    }
  }
  throw lastErr || new Error('Tải tệp thất bại');
}

export const fmtMoney = (n?: number | null) =>
  n != null ? `${n.toLocaleString('vi-VN')}đ` : '—';
