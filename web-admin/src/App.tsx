import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Car,
  Users,
  Settings as SettingsIcon,
  PlusCircle,
  Wallet,
  LogOut,
  RefreshCw,
  Landmark,
  Store,
  AlertOctagon,
  ExternalLink,
  CheckCircle2,
} from 'lucide-react';
import { io } from 'socket.io-client';
import { API_BASE, apiFetch, fmtDateTime, getToken, setToken } from './api';
import { DashboardTab } from './components/dashboard-tab';
import { ManualTripTab } from './components/manual-trip-tab';
import { TripsTab } from './components/trips-tab';
import { DriversTab } from './components/drivers-tab';
import { CustomersTab } from './components/customers-tab';
import { SettingsTab } from './components/settings-tab';
import { FinanceTab } from './components/finance-tab';
import { PartnersTab } from './components/partners-tab';

type Tab = 'dashboard' | 'manual' | 'trips' | 'finance' | 'drivers' | 'partners' | 'customers' | 'settings';

export default function App() {
  const [token, setAuthToken] = useState<string | null>(getToken());
  const [tab, setTab] = useState<Tab>('dashboard');
  const [tripsInitialFilter, setTripsInitialFilter] = useState<string>('ALL');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState<any>(null);
  const [trips, setTrips] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [sosAlerts, setSosAlerts] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const [financeRefreshKey, setFinanceRefreshKey] = useState(0);
  const [statusMsg, setStatusMsg] = useState('');
  const [wsConnected, setWsConnected] = useState(false);

  const loadData = async (from = dateFrom, to = dateTo) => {
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const q = params.toString() ? `?${params.toString()}` : '';

      const [st, tr, dr, cu, se, au, sos, pa] = await Promise.all([
        apiFetch(`/admin/stats${q}`),
        apiFetch('/admin/trips'),
        apiFetch('/admin/drivers'),
        apiFetch('/admin/customers'),
        apiFetch('/admin/settings'),
        apiFetch('/admin/audit-logs'),
        apiFetch('/admin/sos-alerts?status=OPEN'),
        apiFetch('/admin/partners'),
      ]);
      setStats(st);
      setTrips(tr);
      setDrivers(dr);
      setCustomers(cu);
      setSettings(Object.fromEntries(se.map((s: any) => [s.key, s.value])));
      setAuditLogs(au);
      setSosAlerts(sos);
      setPartners(pa);
    } catch (e: any) {
      setStatusMsg(e.message);
      if (e.message.includes('hết hạn')) setAuthToken(null);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadData();
    const socket = io(`${API_BASE}/ws`, { auth: { token } });
    socket.on('connect', () => setWsConnected(true));
    socket.on('disconnect', () => setWsConnected(false));
    socket.on('admin:trip:no_driver', (payload: any) => {
      setStatusMsg(`⚠️ CẢNH BÁO: Đơn ${payload.tripCode} không tìm được tài xế (NO_DRIVER)!`);
      loadData();
    });
    socket.on('admin:trip:dispatch_ring', (payload: any) => {
      setStatusMsg(
        `📡 Điều phối mở rộng: Đơn ${payload.tripCode} đang quét vòng ${payload.ring} (bán kính ${payload.radiusKm} km).`,
      );
    });
    socket.on('admin:trip:suspicious_cancel', (payload: any) => {
      setStatusMsg(
        `🚨 NGHI VẤN CẮT CẦU: Đơn ${payload.tripCode} bị khách hủy sau khi tài xế đã nhận/đến nơi (${payload.reason || 'không rõ lý do'}).`,
      );
      loadData();
    });
    socket.on('admin:payment:created', (payload: any) => {
      setStatusMsg(
        `💳 Tài xế ${payload.driver?.name || payload.driver?.phone || ''} vừa tạo phiếu VietQR ${payload.txCode} (${Number(payload.amount || 0).toLocaleString('vi-VN')}đ).`,
      );
      setFinanceRefreshKey((k) => k + 1);
      loadData();
    });
    socket.on('admin:payment:proof_uploaded', (payload: any) => {
      setStatusMsg(
        `🧾 Tài xế ${payload.driver?.name || payload.driver?.phone || ''} vừa tải ảnh chuyển khoản cho phiếu ${payload.txCode} (${Number(payload.amount || 0).toLocaleString('vi-VN')}đ) — vào Đối soát để kiểm tra & duyệt!`,
      );
      setFinanceRefreshKey((k) => k + 1);
      loadData();
    });
    socket.on('admin:sos:alert', (payload: any) => {
      setStatusMsg(
        `🆘 KHẨN CẤP SOS: ${payload.reporterRole === 'DRIVER' ? 'Tài xế' : 'Khách hàng'} ${payload.reporterName || payload.reporterPhone || ''} vừa phát tín hiệu SOS trên chuyến ${payload.trip?.code || ''}!`,
      );
      loadData();
    });
    socket.on('admin:trip:created', () => loadData());
    socket.on('admin:trip:updated', () => loadData());
    return () => {
      socket.disconnect();
    };
  }, [token]);

  const handleResolveSos = async (sosId: string) => {
    try {
      await apiFetch(`/admin/sos-alerts/${sosId}/resolve`, { method: 'POST' });
      setStatusMsg('Đã đánh dấu xử lý xong cảnh báo SOS.');
      loadData();
    } catch (e: any) {
      setStatusMsg(e.message);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginErr('');
    try {
      const res = await apiFetch('/auth/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(res.accessToken);
      setAuthToken(res.accessToken);
    } catch (err: any) {
      setLoginErr(err.message);
    }
  };

  const handleQuickRange = (preset: 'today' | '7d' | 'month' | 'all') => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (preset === 'all') {
      setDateFrom('');
      setDateTo('');
      loadData('', '');
      return;
    }
    const to = fmt(now);
    let from = to;
    if (preset === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      from = fmt(d);
    } else if (preset === 'month') {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    setDateFrom(from);
    setDateTo(to);
    loadData(from, to);
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      });
      setStatusMsg('Đã lưu cấu hình bảng giá & ghi nhật ký Audit Log.');
      loadData();
    } catch (err: any) {
      setStatusMsg(`Lỗi cấu hình: ${err.message}`);
    }
  };

  const handleRunMaintenanceCheck = async () => {
    try {
      await apiFetch('/admin/maintenance-fees/run-check', { method: 'POST' });
      setStatusMsg('Đã chạy quét nhắc phí duy trì cho tất cả tài xế.');
      loadData();
    } catch (err: any) {
      setStatusMsg(err.message);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-700 via-red-600 to-rose-700 p-4">
        <form
          onSubmit={handleLogin}
          className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md space-y-5 border border-red-100"
        >
          <div className="flex items-center gap-3.5">
            <img
              src="/logo-now-tn.png"
              alt="NOW Thái Nguyên"
              className="w-14 h-14 rounded-2xl shadow-md object-cover border border-red-100"
            />
            <div>
              <div className="text-red-600 font-extrabold text-xl tracking-tight">NOW Thái Nguyên</div>
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Quản trị Lái Xe Hộ
              </div>
            </div>
          </div>
          <p className="text-sm text-slate-500">Đăng nhập hệ thống điều phối, tài chính & đối soát ví</p>
          {loginErr && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl">
              {loginErr}
            </div>
          )}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Tài khoản</label>
            <input
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">Mật khẩu</label>
            <input
              type="password"
              className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-md shadow-red-200 transition">
            Đăng nhập hệ thống
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-slate-50">
      <aside className="w-64 bg-white text-slate-700 border-r border-slate-200 flex flex-col p-4 space-y-1.5 shrink-0 sticky top-0 h-screen shadow-sm">
        <div className="flex items-center justify-between px-2 py-3 mb-2 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <img
              src="/logo-now-tn.png"
              alt="NOW Thái Nguyên"
              className="w-10 h-10 rounded-xl shadow-sm object-cover"
            />
            <div>
              <div className="text-red-600 font-extrabold text-sm leading-tight">NOW Thái Nguyên</div>
              <div className="text-[11px] font-medium text-slate-400">Lái Xe Hộ Admin</div>
            </div>
          </div>
          <span
            title={wsConnected ? 'Kết nối Realtime đang hoạt động' : 'Mất kết nối Realtime'}
            className={`w-2.5 h-2.5 rounded-full ${wsConnected ? 'bg-emerald-500' : 'bg-red-500'}`}
          />
        </div>
        {[
          { id: 'dashboard', label: 'Thống kê tổng quan', icon: BarChart3 },
          { id: 'manual', label: 'Tạo đơn thủ công', icon: PlusCircle },
          { id: 'trips', label: 'Quản lý chuyến đi', icon: Car, badge: stats?.noDriverCount },
          { id: 'finance', label: 'Đối soát Ví & VietQR', icon: Landmark, badge: stats?.pendingPaymentCount },
          { id: 'drivers', label: 'Tài xế, Ví & Phí', icon: Wallet, badge: stats?.pendingDrivers },
          { id: 'partners', label: 'Đối tác Quán / CTV', icon: Store },
          { id: 'customers', label: 'Khách hàng', icon: Users },
          { id: 'settings', label: 'Cấu hình & Nhật ký', icon: SettingsIcon },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => {
                if (item.id === 'trips') setTripsInitialFilter('ALL');
                setTab(item.id as Tab);
              }}
              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                tab === item.id
                  ? 'bg-red-600 text-white shadow-sm shadow-red-200'
                  : 'text-slate-600 hover:bg-red-50 hover:text-red-700'
              }`}
            >
              <span className="flex items-center gap-3">
                <Icon className="w-4 h-4" /> {item.label}
              </span>
              {item.badge ? (
                <span
                  className={`px-2 py-0.5 text-xs rounded-full font-bold ${
                    tab === item.id ? 'bg-white text-red-600' : 'bg-amber-400 text-slate-950'
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() => loadData()}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-xl font-medium"
        >
          <RefreshCw className="w-4 h-4" /> Làm mới dữ liệu
        </button>
        <button
          onClick={() => {
            setToken(null);
            setAuthToken(null);
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl font-semibold"
        >
          <LogOut className="w-4 h-4" /> Đăng xuất
        </button>
      </aside>

      <main className="flex-1 p-6 overflow-y-auto">
        {sosAlerts.length > 0 && (
          <div className="mb-4 p-4 bg-red-600 text-white rounded-2xl shadow-lg border-2 border-red-300 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-extrabold text-sm tracking-wide">
                <AlertOctagon className="w-5 h-5 animate-pulse" />
                CẢNH BÁO SOS KHẨN CẤP ({sosAlerts.length}) — CẦN GỌI HỖ TRỢ NGAY
              </div>
            </div>
            <div className="space-y-2">
              {sosAlerts.map((sos) => (
                <div
                  key={sos.id}
                  className="bg-white/15 backdrop-blur rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-sm">
                      Chuyến {sos.trip?.code || '—'} ·{' '}
                      {sos.reporterRole === 'DRIVER' ? 'Tài xế' : 'Khách hàng'}:{' '}
                      {sos.reporterName || '—'} ({sos.reporterPhone || '—'})
                    </div>
                    <div className="text-red-100">
                      Thời gian: {fmtDateTime(sos.createdAt)}
                      {sos.note ? ` · Ghi chú: ${sos.note}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {sos.lat != null && sos.lng != null && (
                      <a
                        href={`https://www.google.com/maps?q=${sos.lat},${sos.lng}`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-white text-red-700 font-bold rounded-lg flex items-center gap-1 hover:bg-red-50"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Mở GPS
                      </a>
                    )}
                    <button
                      onClick={() => handleResolveSos(sos.id)}
                      className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-lg flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Đã xử lý
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {statusMsg && (
          <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-900 rounded-xl flex justify-between items-center text-sm font-medium">
            <span>{statusMsg}</span>
            <button onClick={() => setStatusMsg('')} className="font-bold px-2 text-red-700">
              ×
            </button>
          </div>
        )}

        {tab === 'dashboard' && (
          <DashboardTab
            stats={stats}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChangeRange={(f, t) => {
              setDateFrom(f);
              setDateTo(t);
              loadData(f, t);
            }}
            onQuickRange={handleQuickRange}
            onGoToTrips={() => {
              setTripsInitialFilter('NO_DRIVER');
              setTab('trips');
            }}
            onGoToDrivers={() => setTab('drivers')}
            onGoToFinance={() => setTab('finance')}
            onRunMaintenanceCheck={handleRunMaintenanceCheck}
          />
        )}

        {tab === 'manual' && (
          <ManualTripTab
            onCreated={(msg) => {
              setStatusMsg(msg);
              setTripsInitialFilter('ALL');
              setTab('trips');
              loadData();
            }}
            onError={(msg) => setStatusMsg(msg)}
          />
        )}

        {tab === 'trips' && (
          <TripsTab
            key={tripsInitialFilter}
            trips={trips}
            drivers={drivers}
            initialFilter={tripsInitialFilter}
            publicTrackBaseUrl={settings.public_track_base_url || 'https://now.tuannv.site'}
            onReload={() => loadData()}
            onNotify={(msg) => setStatusMsg(msg)}
          />
        )}

        {tab === 'finance' && (
          <FinanceTab
            refreshKey={financeRefreshKey}
            onNotify={(msg) => setStatusMsg(msg)}
            onAfterConfirm={() => loadData()}
          />
        )}

        {tab === 'drivers' && (
          <DriversTab drivers={drivers} onReload={() => loadData()} onNotify={(msg) => setStatusMsg(msg)} />
        )}

        {tab === 'partners' && (
          <PartnersTab partners={partners} onReload={() => loadData()} onNotify={(msg) => setStatusMsg(msg)} />
        )}

        {tab === 'customers' && <CustomersTab customers={customers} />}

        {tab === 'settings' && (
          <SettingsTab
            settings={settings}
            auditLogs={auditLogs}
            onChange={setSettings}
            onSave={handleSaveSettings}
          />
        )}
      </main>
    </div>
  );
}
