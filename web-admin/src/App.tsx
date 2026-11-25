import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Car,
  Users,
  Settings as SettingsIcon,
  PlusCircle,
  Wallet,
  LogOut,
  CheckCircle2,
  Lock,
  AlertTriangle,
  History,
} from 'lucide-react';
import { apiFetch, getToken, setToken } from './api';

type Tab = 'dashboard' | 'manual' | 'trips' | 'drivers' | 'customers' | 'settings';

const fmtMoney = (n?: number | null) =>
  n != null ? `${n.toLocaleString('vi-VN')}đ` : '—';

export default function App() {
  const [token, setAuthToken] = useState<string | null>(getToken());
  const [tab, setTab] = useState<Tab>('dashboard');
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [loginErr, setLoginErr] = useState('');

  const [stats, setStats] = useState<any>(null);
  const [trips, setTrips] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [statusMsg, setStatusMsg] = useState('');

  // Manual trip form
  const [manualForm, setManualForm] = useState({
    customerPhone: '',
    customerName: '',
    pickupAddress: '',
    pickupLat: '10.7769',
    pickupLng: '106.7009',
    dropoffAddress: '',
    dropoffLat: '10.8012',
    dropoffLng: '106.7145',
    note: '',
  });

  const loadData = async () => {
    try {
      const [st, tr, dr, cu, se, au] = await Promise.all([
        apiFetch('/admin/stats'),
        apiFetch('/admin/trips'),
        apiFetch('/admin/drivers'),
        apiFetch('/admin/customers'),
        apiFetch('/admin/settings'),
        apiFetch('/admin/audit-logs'),
      ]);
      setStats(st);
      setTrips(tr);
      setDrivers(dr);
      setCustomers(cu);
      setSettings(Object.fromEntries(se.map((s: any) => [s.key, s.value])));
      setAuditLogs(au);
    } catch (e: any) {
      setStatusMsg(e.message);
    }
  };

  useEffect(() => {
    if (token) loadData();
  }, [token]);

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

  const handleCreateManualTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/admin/trips/manual', {
        method: 'POST',
        body: JSON.stringify({
          customerPhone: manualForm.customerPhone,
          customerName: manualForm.customerName || undefined,
          pickupAddress: manualForm.pickupAddress,
          pickupLat: parseFloat(manualForm.pickupLat),
          pickupLng: parseFloat(manualForm.pickupLng),
          dropoffAddress: manualForm.dropoffAddress || undefined,
          dropoffLat: manualForm.dropoffLat ? parseFloat(manualForm.dropoffLat) : undefined,
          dropoffLng: manualForm.dropoffLng ? parseFloat(manualForm.dropoffLng) : undefined,
          note: manualForm.note || undefined,
        }),
      });
      setStatusMsg('Đã tạo đơn thủ công và đẩy vào hệ thống điều phối!');
      setTab('trips');
      loadData();
    } catch (err: any) {
      setStatusMsg(err.message);
    }
  };

  const handleDriverStatus = async (id: string, status: 'ACTIVE' | 'LOCKED') => {
    await apiFetch(`/admin/drivers/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    loadData();
  };

  const handleTopup = async (driverId: string) => {
    const raw = window.prompt('Nhập số tiền nạp vào ví (VNĐ):', '500000');
    if (!raw) return;
    const amount = parseInt(raw, 10);
    const note = window.prompt('Ghi chú / Mã giao dịch ngân hàng:', 'Chuyển khoản nạp ví') || 'Nạp ví';
    await apiFetch(`/admin/drivers/${driverId}/wallet/topup`, {
      method: 'POST',
      body: JSON.stringify({ amount, note }),
    });
    loadData();
  };

  const handleAdjustWallet = async (driverId: string) => {
    const raw = window.prompt('Nhập số tiền điều chỉnh (+ hoặc -):', '0');
    if (!raw) return;
    const amount = parseInt(raw, 10);
    const note = window.prompt('Bắt buộc nhập lý do điều chỉnh số dư:');
    if (!note) return alert('Bắt buộc phải nhập lý do!');
    await apiFetch(`/admin/drivers/${driverId}/wallet/adjust`, {
      method: 'POST',
      body: JSON.stringify({ amount, note }),
    });
    loadData();
  };

  const handleConfirmFee = async (driverId: string) => {
    if (!window.confirm('Xác nhận tài xế đã đóng phí duy trì kỳ này?')) return;
    await apiFetch(`/admin/drivers/${driverId}/maintenance-fee/confirm`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    loadData();
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
    setStatusMsg('Đã lưu cấu hình & ghi nhật ký Audit Log.');
    loadData();
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
        <form onSubmit={handleLogin} className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md space-y-4">
          <div className="flex items-center gap-2 text-indigo-600 font-bold text-xl">
            <Car className="w-7 h-7" /> Lái Xe Hộ – Web Admin
          </div>
          <p className="text-sm text-slate-500">Đăng nhập hệ thống quản trị & điều phối</p>
          {loginErr && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{loginErr}</div>}
          <div>
            <label className="block text-sm font-medium mb-1">Tài khoản</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Mật khẩu</label>
            <input
              type="password"
              className="w-full border rounded-lg px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 rounded-lg">
            Đăng nhập
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col p-4 space-y-2">
        <div className="flex items-center gap-2 text-white font-bold text-lg px-2 py-3 border-b border-slate-800">
          <Car className="w-6 h-6 text-indigo-400" /> Lái Xe Hộ Admin
        </div>
        {[
          { id: 'dashboard', label: 'Thống kê tổng quan', icon: BarChart3 },
          { id: 'manual', label: 'Tạo đơn thủ công', icon: PlusCircle },
          { id: 'trips', label: 'Quản lý chuyến đi', icon: Car },
          { id: 'drivers', label: 'Tài xế, Ví & Phí', icon: Wallet },
          { id: 'customers', label: 'Khách hàng', icon: Users },
          { id: 'settings', label: 'Cấu hình & Nhật ký', icon: SettingsIcon },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => setTab(item.id as Tab)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                tab === item.id ? 'bg-indigo-600 text-white' : 'hover:bg-slate-800'
              }`}
            >
              <Icon className="w-4 h-4" /> {item.label}
            </button>
          );
        })}
        <div className="flex-1" />
        <button
          onClick={() => {
            setToken(null);
            setAuthToken(null);
          }}
          className="flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-slate-800 rounded-lg"
        >
          <LogOut className="w-4 h-4" /> Đăng xuất
        </button>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 overflow-y-auto">
        {statusMsg && (
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-lg flex justify-between items-center text-sm">
            <span>{statusMsg}</span>
            <button onClick={() => setStatusMsg('')} className="font-bold">×</button>
          </div>
        )}

        {tab === 'dashboard' && stats && (
          <div className="space-y-6">
            <h1 className="text-2xl font-bold">Thống kê hệ thống</h1>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <StatCard title="Tổng số chuyến" value={stats.totalTrips} sub={`Hoàn thành: ${stats.completedTrips}`} />
              <StatCard title="Tổng tiền chuyến" value={fmtMoney(stats.totalRevenue)} sub="Chuyến hoàn thành" />
              <StatCard title="Tổng chiết khấu" value={fmtMoney(stats.totalCommission)} sub="Đã trừ ví tài xế" />
              <StatCard title="Phí duy trì đã thu" value={fmtMoney(stats.totalMaintenanceCollected)} sub={`Quá hạn: ${stats.overdueFees}`} />
            </div>
            {stats.noDriverCount > 0 && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-3 text-amber-800">
                  <AlertTriangle className="w-5 h-5" />
                  <span>Có <b>{stats.noDriverCount}</b> đơn chưa tìm được tài xế (NO_DRIVER) cần Admin xử lý.</span>
                </div>
                <button
                  onClick={() => setTab('trips')}
                  className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded-lg"
                >
                  Xem đơn ngay
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'manual' && (
          <div className="max-w-2xl bg-white p-6 rounded-xl shadow-sm border space-y-4">
            <h1 className="text-xl font-bold">Tạo đơn thủ công (Khách gọi tổng đài)</h1>
            <form onSubmit={handleCreateManualTrip} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Input label="Số điện thoại khách *" value={manualForm.customerPhone} onChange={(v) => setManualForm({ ...manualForm, customerPhone: v })} required />
                <Input label="Tên khách hàng" value={manualForm.customerName} onChange={(v) => setManualForm({ ...manualForm, customerName: v })} />
              </div>
              <Input label="Địa chỉ đón *" value={manualForm.pickupAddress} onChange={(v) => setManualForm({ ...manualForm, pickupAddress: v })} required />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Vĩ độ đón (pickupLat)" value={manualForm.pickupLat} onChange={(v) => setManualForm({ ...manualForm, pickupLat: v })} required />
                <Input label="Kinh độ đón (pickupLng)" value={manualForm.pickupLng} onChange={(v) => setManualForm({ ...manualForm, pickupLng: v })} required />
              </div>
              <Input label="Địa chỉ trả (tùy chọn)" value={manualForm.dropoffAddress} onChange={(v) => setManualForm({ ...manualForm, dropoffAddress: v })} />
              <div className="grid grid-cols-2 gap-4">
                <Input label="Vĩ độ trả" value={manualForm.dropoffLat} onChange={(v) => setManualForm({ ...manualForm, dropoffLat: v })} />
                <Input label="Kinh độ trả" value={manualForm.dropoffLng} onChange={(v) => setManualForm({ ...manualForm, dropoffLng: v })} />
              </div>
              <Input label="Ghi chú" value={manualForm.note} onChange={(v) => setManualForm({ ...manualForm, note: v })} />
              <button className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700">
                Tạo đơn & Tìm tài xế tự động
              </button>
            </form>
          </div>
        )}

        {tab === 'trips' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Danh sách chuyến đi</h1>
            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-3">Mã chuyến</th>
                    <th className="p-3">Khách hàng</th>
                    <th className="p-3">Tài xế</th>
                    <th className="p-3">Điểm đón → Điểm trả</th>
                    <th className="p-3">Giá / Chiết khấu</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {trips.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-semibold">{t.code}</td>
                      <td className="p-3">{t.customer?.phone}<br /><span className="text-xs text-slate-500">{t.customer?.name}</span></td>
                      <td className="p-3">{t.driver ? `${t.driver.name || ''} (${t.driver.phone})` : '—'}</td>
                      <td className="p-3 max-w-xs truncate">{t.pickupAddress} → {t.dropoffAddress || 'Chưa nhập'}</td>
                      <td className="p-3">{fmtMoney(t.finalPrice ?? t.estimatedPrice)}<br /><span className="text-xs text-slate-500">CK: {fmtMoney(t.commissionAmount)}</span></td>
                      <td className="p-3"><span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100">{t.status}</span></td>
                      <td className="p-3">
                        <button onClick={() => setSelectedTrip(t)} className="text-indigo-600 hover:underline">Xem ảnh/video</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedTrip && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
                <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
                  <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold">Chi tiết chuyến {selectedTrip.code}</h2>
                    <button onClick={() => setSelectedTrip(null)} className="text-xl font-bold">×</button>
                  </div>
                  <p className="text-sm"><b>Đón:</b> {selectedTrip.pickupAddress}</p>
                  <p className="text-sm"><b>Trả:</b> {selectedTrip.dropoffAddress || '—'}</p>
                  <p className="text-sm"><b>Quãng đường:</b> {selectedTrip.distanceKm ?? '—'} km | <b>Khung giờ:</b> {selectedTrip.timeSlot}</p>
                  <div>
                    <h3 className="font-semibold text-sm mb-2">Ảnh & Video nhận/trả xe ({selectedTrip.media?.length || 0})</h3>
                    <div className="grid grid-cols-2 gap-3">
                      {selectedTrip.media?.map((m: any) => (
                        <div key={m.id} className="border rounded-lg p-2 text-xs space-y-1">
                          <div className="font-semibold">{m.stage} – {m.type} {m.isPlatePhoto ? '(Biển số)' : ''}</div>
                          <a href={m.url} target="_blank" rel="noreferrer" className="text-indigo-600 break-all underline">{m.url}</a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'drivers' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Quản lý Tài xế, Ví & Phí duy trì</h1>
            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-3">Tài xế</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3">Số dư ví</th>
                    <th className="p-3">Hạn phí duy trì</th>
                    <th className="p-3">Hành động</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {drivers.map((d) => (
                    <tr key={d.id}>
                      <td className="p-3 font-medium">{d.name || 'Chưa cập nhật'}<br /><span className="text-xs text-slate-500">{d.phone}</span></td>
                      <td className="p-3">
                        <span className="px-2 py-1 rounded text-xs font-semibold bg-slate-100">{d.status}</span>
                        {d.isOnline && <span className="ml-1 text-xs text-emerald-600">● Online</span>}
                      </td>
                      <td className="p-3 font-semibold">{fmtMoney(d.wallet?.balance ?? 0)}</td>
                      <td className="p-3 text-xs">{d.feeDueDate ? new Date(d.feeDueDate).toLocaleDateString('vi-VN') : 'Chưa kích hoạt'}</td>
                      <td className="p-3 flex flex-wrap gap-2">
                        {d.status !== 'ACTIVE' ? (
                          <button onClick={() => handleDriverStatus(d.id, 'ACTIVE')} className="px-2 py-1 bg-emerald-600 text-white rounded text-xs flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" /> Duyệt / Mở
                          </button>
                        ) : (
                          <button onClick={() => handleDriverStatus(d.id, 'LOCKED')} className="px-2 py-1 bg-red-600 text-white rounded text-xs flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Khóa
                          </button>
                        )}
                        <button onClick={() => handleTopup(d.id)} className="px-2 py-1 bg-indigo-600 text-white rounded text-xs">+ Nạp ví</button>
                        <button onClick={() => handleAdjustWallet(d.id)} className="px-2 py-1 bg-slate-700 text-white rounded text-xs">Điều chỉnh ví</button>
                        <button onClick={() => handleConfirmFee(d.id)} className="px-2 py-1 bg-amber-600 text-white rounded text-xs">Đóng phí 200k</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'customers' && (
          <div className="space-y-4">
            <h1 className="text-2xl font-bold">Danh sách Khách hàng</h1>
            <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-3">Số điện thoại</th>
                    <th className="p-3">Họ tên</th>
                    <th className="p-3">Số chuyến đã đặt</th>
                    <th className="p-3">Ngày tạo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td className="p-3 font-medium">{c.phone}</td>
                      <td className="p-3">{c.name || '—'}</td>
                      <td className="p-3">{c._count?.trips ?? 0}</td>
                      <td className="p-3 text-xs">{new Date(c.createdAt).toLocaleString('vi-VN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <form onSubmit={handleSaveSettings} className="bg-white p-6 rounded-xl shadow-sm border space-y-3">
              <h1 className="text-xl font-bold mb-2">Cấu hình Bảng giá & Điều phối</h1>
              {Object.entries(settings).map(([k, v]) => (
                <div key={k} className="grid grid-cols-2 items-center gap-2 text-sm">
                  <label className="font-mono text-slate-600">{k}</label>
                  <input
                    className="border rounded px-2.5 py-1.5"
                    value={v}
                    onChange={(e) => setSettings({ ...settings, [k]: e.target.value })}
                  />
                </div>
              ))}
              <button className="mt-4 px-5 py-2 bg-indigo-600 text-white rounded-lg font-medium">
                Lưu cấu hình
              </button>
            </form>

            <div className="bg-white p-6 rounded-xl shadow-sm border space-y-3">
              <h2 className="text-xl font-bold flex items-center gap-2"><History className="w-5 h-5" /> Nhật ký thao tác (Audit Logs)</h2>
              <div className="space-y-2 max-h-[500px] overflow-y-auto text-xs">
                {auditLogs.map((log) => (
                  <div key={log.id} className="p-3 bg-slate-50 rounded-lg border">
                    <div className="font-semibold">{log.action} – {log.admin?.name}</div>
                    <div className="text-slate-500">{new Date(log.createdAt).toLocaleString('vi-VN')}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({ title, value, sub }: { title: string; value: string | number; sub: string }) {
  return (
    <div className="bg-white p-5 rounded-xl shadow-sm border">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input
        className="w-full border rounded-lg px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
      />
    </div>
  );
}
