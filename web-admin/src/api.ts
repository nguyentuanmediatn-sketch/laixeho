export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3005';

export function getToken(): string | null {
  return localStorage.getItem('admin_token');
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('admin_token', token);
  else localStorage.removeItem('admin_token');
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    setToken(null);
    throw new Error('Phiên đăng nhập hết hạn');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = Array.isArray(err.message) ? err.message.join(', ') : err.message;
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res.json();
}

export const fmtMoney = (n?: number | null) =>
  n != null ? `${n.toLocaleString('vi-VN')}đ` : '—';

export const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString('vi-VN') : '—';

export function exportCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | null | undefined>>,
) {
  const escapeCell = (val: string | number | null | undefined) => {
    const str = val == null ? '' : String(val);
    if (/[",\n\r]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const TRIP_STATUS_META: Record<string, { label: string; cls: string }> = {
  SEARCHING: { label: 'Đang tìm tài xế', cls: 'bg-blue-100 text-blue-800' },
  ACCEPTED: { label: 'Tài xế đang đến', cls: 'bg-red-100 text-red-800' },
  ARRIVED: { label: 'Đã đến điểm đón', cls: 'bg-purple-100 text-purple-800' },
  IN_PROGRESS: { label: 'Đang chạy', cls: 'bg-cyan-100 text-cyan-800' },
  COMPLETED: { label: 'Hoàn thành', cls: 'bg-emerald-100 text-emerald-800' },
  NO_DRIVER: { label: 'Không có tài xế', cls: 'bg-amber-100 text-amber-900 ring-1 ring-amber-400' },
  CANCELLED: { label: 'Đã hủy', cls: 'bg-slate-200 text-slate-700' },
};

export const DRIVER_STATUS_META: Record<string, { label: string; cls: string }> = {
  PENDING: { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-800' },
  ACTIVE: { label: 'Hoạt động', cls: 'bg-emerald-100 text-emerald-800' },
  LOCKED: { label: 'Đã khóa', cls: 'bg-red-100 text-red-800' },
};

export const WALLET_TX_META: Record<string, { label: string; cls: string }> = {
  TOPUP: { label: 'Nạp ví', cls: 'bg-emerald-100 text-emerald-800' },
  COMMISSION: { label: 'Chiết khấu chuyến', cls: 'bg-red-100 text-red-800' },
  ADJUSTMENT: { label: 'Điều chỉnh thủ công', cls: 'bg-amber-100 text-amber-800' },
};
