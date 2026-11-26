import React, { useState } from 'react';
import {
  CheckCircle2,
  Lock,
  Eye,
  AlertTriangle,
  Wallet,
  FileImage,
  UserPlus,
  Search,
  KeyRound,
  Copy,
  Upload,
  Trash2,
  Pencil,
  Save,
} from 'lucide-react';
import { apiFetch, DRIVER_STATUS_META, fmtDateTime, fmtMoney, uploadAdminImage } from '../api';

const QUICK_BALANCES = [0, 100000, 200000, 500000, 1000000];

export function DriversTab({
  drivers,
  onReload,
  onNotify,
}: {
  drivers: any[];
  onReload: () => void;
  onNotify: (msg: string) => void;
}) {
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'ACTIVE' | 'LOCKED' | 'OVERDUE'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // State tạo tài xế mới
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newStatus, setNewStatus] = useState<'ACTIVE' | 'PENDING'>('ACTIVE');
  const [newBalance, setNewBalance] = useState<string>('200000');
  const [newNote, setNewNote] = useState('Nạp ví ký quỹ khi cấp tài khoản');
  const [newAvatarUrl, setNewAvatarUrl] = useState('');
  const [newIdCardUrls, setNewIdCardUrls] = useState<string[]>([]);
  const [newLicenseUrls, setNewLicenseUrls] = useState<string[]>([]);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<any | null>(null);

  // State hiển thị OTP cấp nhanh
  const [otpModal, setOtpModal] = useState<{
    name?: string;
    phone: string;
    otp: string;
    expiresInSec: number;
  } | null>(null);

  // State chỉnh sửa hồ sơ trong modal chi tiết
  const [editingProfile, setEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editIdCardUrls, setEditIdCardUrls] = useState<string[]>([]);
  const [editLicenseUrls, setEditLicenseUrls] = useState<string[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);

  const isOverdue = (d: any) => d.feeDueDate && new Date(d.feeDueDate) < new Date();

  const filtered = drivers.filter((d) => {
    if (filter === 'OVERDUE' && !isOverdue(d)) return false;
    if (filter !== 'ALL' && filter !== 'OVERDUE' && d.status !== filter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      return d.name?.toLowerCase().includes(q) || d.phone?.toLowerCase().includes(q);
    }
    return true;
  });

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    setEditingProfile(false);
    try {
      const data = await apiFetch(`/admin/drivers/${id}`);
      setDetail(data);
      setEditName(data.name || '');
      setEditPhone(data.phone || '');
      setEditAvatarUrl(data.avatarUrl || '');
      setEditIdCardUrls(data.idCardUrls || []);
      setEditLicenseUrls(data.licenseUrls || []);
    } catch (e: any) {
      onNotify(e.message);
    } finally {
      setLoadingDetail(false);
    }
  };

  const resetCreateForm = () => {
    setNewName('');
    setNewPhone('');
    setNewStatus('ACTIVE');
    setNewBalance('200000');
    setNewNote('Nạp ví ký quỹ khi cấp tài khoản');
    setNewAvatarUrl('');
    setNewIdCardUrls([]);
    setNewLicenseUrls([]);
    setCreatedCredentials(null);
  };

  const handleUploadDoc = async (
    files: FileList | null,
    target: 'new_avatar' | 'new_cccd' | 'new_gplx' | 'edit_avatar' | 'edit_cccd' | 'edit_gplx',
  ) => {
    if (!files || files.length === 0) return;
    setUploadingField(target);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files).slice(0, 2)) {
        const url = await uploadAdminImage(file);
        uploaded.push(url);
      }
      if (target === 'new_avatar') setNewAvatarUrl(uploaded[0]);
      else if (target === 'new_cccd') setNewIdCardUrls((prev) => [...prev, ...uploaded].slice(-2));
      else if (target === 'new_gplx') setNewLicenseUrls((prev) => [...prev, ...uploaded].slice(-2));
      else if (target === 'edit_avatar') setEditAvatarUrl(uploaded[0]);
      else if (target === 'edit_cccd') setEditIdCardUrls((prev) => [...prev, ...uploaded].slice(-2));
      else if (target === 'edit_gplx') setEditLicenseUrls((prev) => [...prev, ...uploaded].slice(-2));
    } catch (e: any) {
      onNotify(e.message);
    } finally {
      setUploadingField(null);
    }
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    const initialBalance = Math.max(0, Math.round(Number(newBalance || 0)));
    if (!Number.isFinite(initialBalance)) {
      onNotify('Số dư ví khởi tạo không hợp lệ');
      return;
    }
    setCreating(true);
    try {
      const res = await apiFetch('/admin/drivers', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          phone: newPhone.trim(),
          status: newStatus,
          initialBalance,
          initialNote: newNote.trim() || undefined,
          avatarUrl: newAvatarUrl || undefined,
          idCardUrls: newIdCardUrls.length > 0 ? newIdCardUrls : undefined,
          licenseUrls: newLicenseUrls.length > 0 ? newLicenseUrls : undefined,
        }),
      });
      setCreatedCredentials(res);
      onNotify(
        `✅ Đã tạo tài khoản tài xế ${res.driver.name} (${res.driver.phone}) — Số dư ví: ${fmtMoney(
          res.driver.wallet?.balance ?? 0,
        )}`,
      );
      onReload();
    } catch (err: any) {
      onNotify(`Lỗi tạo tài xế: ${err.message}`);
    } finally {
      setCreating(false);
    }
  };

  const handleSaveDriverProfile = async () => {
    if (!detail) return;
    setSavingProfile(true);
    try {
      await apiFetch(`/admin/drivers/${detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editName.trim(),
          phone: editPhone.trim(),
          avatarUrl: editAvatarUrl,
          idCardUrls: editIdCardUrls,
          licenseUrls: editLicenseUrls,
        }),
      });
      onNotify('Đã cập nhật thông tin & hồ sơ giấy tờ tài xế.');
      setEditingProfile(false);
      onReload();
      await openDetail(detail.id);
    } catch (e: any) {
      onNotify(`Lỗi cập nhật hồ sơ: ${e.message}`);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleIssueOtp = async (driverId: string) => {
    try {
      const res = await apiFetch(`/admin/drivers/${driverId}/issue-otp`, { method: 'POST' });
      setOtpModal({
        name: res.name,
        phone: res.phone,
        otp: res.otp,
        expiresInSec: res.expiresInSec || 600,
      });
    } catch (e: any) {
      onNotify(e.message);
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    onNotify(`Đã sao chép ${label} vào bộ nhớ tạm.`);
  };

  const handleStatus = async (id: string, status: 'ACTIVE' | 'LOCKED') => {
    try {
      await apiFetch(`/admin/drivers/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      onNotify(status === 'ACTIVE' ? 'Đã duyệt / mở khóa tài xế.' : 'Đã khóa tài khoản tài xế.');
      onReload();
      if (detail?.id === id) openDetail(id);
    } catch (e: any) {
      onNotify(e.message);
    }
  };

  const handleTopup = async (driverId: string) => {
    const raw = window.prompt('Nhập số tiền nạp vào ví (VNĐ):', '500000');
    if (!raw) return;
    const amount = parseInt(raw, 10);
    if (!Number.isFinite(amount) || amount <= 0) return alert('Số tiền không hợp lệ');
    const note = window.prompt('Ghi chú / Mã giao dịch ngân hàng:', 'Chuyển khoản nạp ví') || 'Nạp ví';
    try {
      await apiFetch(`/admin/drivers/${driverId}/wallet/topup`, {
        method: 'POST',
        body: JSON.stringify({ amount, note }),
      });
      onNotify(`Đã cộng ${fmtMoney(amount)} vào ví tài xế.`);
      onReload();
      if (detail?.id === driverId) openDetail(driverId);
    } catch (e: any) {
      onNotify(e.message);
    }
  };

  const handleAdjust = async (driverId: string) => {
    const raw = window.prompt('Nhập số tiền điều chỉnh (+ hoặc -):', '0');
    if (!raw) return;
    const amount = parseInt(raw, 10);
    if (!Number.isFinite(amount) || amount === 0) return alert('Số tiền phải khác 0');
    const note = window.prompt('Bắt buộc nhập lý do điều chỉnh số dư:');
    if (!note?.trim()) return alert('Bắt buộc phải nhập lý do!');
    try {
      await apiFetch(`/admin/drivers/${driverId}/wallet/adjust`, {
        method: 'POST',
        body: JSON.stringify({ amount, note }),
      });
      onNotify('Đã điều chỉnh số dư ví & ghi Audit Log.');
      onReload();
      if (detail?.id === driverId) openDetail(driverId);
    } catch (e: any) {
      onNotify(e.message);
    }
  };

  const handleConfirmFee = async (driverId: string) => {
    if (!window.confirm('Xác nhận tài xế đã đóng phí duy trì và gia hạn +1 tháng?')) return;
    try {
      const res = await apiFetch(`/admin/drivers/${driverId}/maintenance-fee/confirm`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      onNotify(`Đã xác nhận phí duy trì. Hạn mới: ${new Date(res.nextDueDate).toLocaleDateString('vi-VN')}`);
      onReload();
      if (detail?.id === driverId) openDetail(driverId);
    } catch (e: any) {
      onNotify(e.message);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Quản lý Tài xế, Hồ sơ, Ví & Phí duy trì</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Cấp tài khoản trực tiếp cho tài xế mới tuyển dụng hoặc xét duyệt hồ sơ tài xế tự đăng ký từ App
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              className="pl-9 pr-3 py-2 border rounded-lg text-sm bg-white w-60"
              placeholder="Tìm tên hoặc SĐT tài xế..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => {
              resetCreateForm();
              setShowCreateModal(true);
            }}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm transition"
          >
            <UserPlus className="w-4 h-4" /> + Cấp tài khoản tài xế mới
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {[
          { id: 'ALL', label: `Tất cả (${drivers.length})` },
          { id: 'PENDING', label: `Chờ duyệt (${drivers.filter((d) => d.status === 'PENDING').length})` },
          { id: 'ACTIVE', label: `Hoạt động (${drivers.filter((d) => d.status === 'ACTIVE').length})` },
          { id: 'LOCKED', label: `Đã khóa (${drivers.filter((d) => d.status === 'LOCKED').length})` },
          { id: 'OVERDUE', label: `Quá hạn phí (${drivers.filter(isOverdue).length})` },
        ].map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
              filter === f.id
                ? 'bg-red-600 text-white'
                : f.id === 'OVERDUE'
                  ? 'bg-red-50 text-red-700 border border-red-200'
                  : 'bg-white border text-slate-600 hover:bg-red-50 hover:text-red-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-3">Tài xế</th>
              <th className="p-3">Trạng thái / Khóa đơn</th>
              <th className="p-3">Số dư ví</th>
              <th className="p-3">Hạn phí duy trì</th>
              <th className="p-3">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((d) => {
              const meta = DRIVER_STATUS_META[d.status] || { label: d.status, cls: 'bg-slate-100' };
              const overdue = isOverdue(d);
              const lockedOrder = d.lockedUntil && new Date(d.lockedUntil) > new Date();
              return (
                <tr key={d.id} className={overdue ? 'bg-rose-50/40' : 'hover:bg-slate-50'}>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{d.name || 'Chưa cập nhật'}</div>
                    <div className="text-xs text-slate-500 font-mono">{d.phone}</div>
                    <div className="text-[11px] text-slate-400">
                      {d._count?.trips ?? 0} chuyến · {d._count?.driverLocks ?? 0} lần bị khóa đơn
                    </div>
                  </td>
                  <td className="p-3 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded text-xs font-semibold ${meta.cls}`}>{meta.label}</span>
                      {d.isOnline && <span className="text-xs font-medium text-emerald-600">● Online</span>}
                    </div>
                    {lockedOrder && (
                      <div className="text-xs text-amber-700 font-medium">
                        Khóa nhận đơn đến {new Date(d.lockedUntil).toLocaleTimeString('vi-VN')}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-bold text-slate-800">{fmtMoney(d.wallet?.balance ?? 0)}</td>
                  <td className="p-3 text-xs">
                    {d.feeDueDate ? (
                      <div className="space-y-1">
                        <div>{new Date(d.feeDueDate).toLocaleDateString('vi-VN')}</div>
                        {overdue && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-600 text-white rounded-full text-[10px] font-bold">
                            <AlertTriangle className="w-3 h-3" /> QUÁ HẠN
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400">Chưa kích hoạt</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => openDetail(d.id)}
                        className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded text-xs font-medium flex items-center gap-1"
                      >
                        <Eye className="w-3.5 h-3.5" /> Hồ sơ
                      </button>
                      <button
                        onClick={() => handleIssueOtp(d.id)}
                        title="Lấy mã OTP 6 số để hỗ trợ tài xế đăng nhập App"
                        className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-xs font-semibold flex items-center gap-1"
                      >
                        <KeyRound className="w-3.5 h-3.5" /> Mã OTP
                      </button>
                      {d.status !== 'ACTIVE' ? (
                        <button
                          onClick={() => handleStatus(d.id, 'ACTIVE')}
                          className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt/Mở
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatus(d.id, 'LOCKED')}
                          className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-medium flex items-center gap-1"
                        >
                          <Lock className="w-3.5 h-3.5" /> Khóa
                        </button>
                      )}
                      <button
                        onClick={() => handleTopup(d.id)}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium"
                      >
                        + Nạp ví
                      </button>
                      <button
                        onClick={() => handleAdjust(d.id)}
                        className="px-2.5 py-1 bg-slate-700 hover:bg-slate-800 text-white rounded text-xs font-medium"
                      >
                        Điều chỉnh
                      </button>
                      <button
                        onClick={() => handleConfirmFee(d.id)}
                        className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-medium"
                      >
                        Đã đóng phí
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-400">
                  Không tìm thấy tài xế nào phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Cấp tài khoản Tài xế mới */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 space-y-5 max-h-[92vh] overflow-y-auto shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <UserPlus className="w-5 h-5 text-red-600" /> Cấp tài khoản Tài xế mới
                </h2>
                <p className="text-xs text-slate-500">
                  Tạo sẵn hồ sơ, kích hoạt quyền nhận đơn và cấp số dư ví ban đầu cho tài xế
                </p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-2xl font-bold text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            {createdCredentials ? (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-2">
                  <div className="flex items-center gap-2 text-emerald-800 font-bold text-base">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    Đã khởi tạo tài khoản tài xế thành công!
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-800 pt-1">
                    <div>
                      Họ tên: <b>{createdCredentials.driver.name}</b>
                    </div>
                    <div>
                      SĐT đăng nhập: <b className="font-mono text-red-700">{createdCredentials.driver.phone}</b>
                    </div>
                    <div>
                      Trạng thái:{' '}
                      <b>
                        {createdCredentials.driver.status === 'ACTIVE'
                          ? 'Hoạt động (Nhận đơn ngay)'
                          : 'Chờ duyệt hồ sơ'}
                      </b>
                    </div>
                    <div>
                      Số dư ví khởi tạo: <b>{fmtMoney(createdCredentials.driver.wallet?.balance ?? 0)}</b>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-2">
                  <div className="text-xs text-slate-300 font-semibold uppercase tracking-wider">
                    Hướng dẫn gửi cho Tài xế đăng nhập App
                  </div>
                  <div className="text-xs text-slate-200 leading-relaxed space-y-1">
                    <div>1. Tải & mở ứng dụng <b>Tài xế NOW Thái Nguyên</b></div>
                    <div>
                      2. Nhập số điện thoại: <b className="text-amber-300 font-mono">{createdCredentials.driver.phone}</b>
                    </div>
                    <div>
                      3. Bấm gửi OTP (mã kích hoạt hiện tại:{' '}
                      <span className="px-2 py-0.5 rounded bg-white/15 font-mono font-extrabold text-amber-300 tracking-widest">
                        {createdCredentials.loginOtp}
                      </span>{' '}
                      — hiệu lực 10 phút, hoặc bấm "Mã OTP" ngoài danh sách bất cứ lúc nào để lấy lại).
                    </div>
                  </div>
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() =>
                        copyText(
                          `Tài khoản Tài xế NOW Thái Nguyên của bạn đã được kích hoạt!\n- Tải App Tài xế: https://now.tuannv.site/apk/\n- SĐT đăng nhập: ${createdCredentials.driver.phone}\n- Số dư ví ban đầu: ${fmtMoney(createdCredentials.driver.wallet?.balance ?? 0)}\n- Mã OTP đăng nhập: ${createdCredentials.loginOtp}`,
                          'thông tin tài khoản gửi Zalo',
                        )
                      }
                      className="px-3.5 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                    >
                      <Copy className="w-3.5 h-3.5" /> Sao chép tin nhắn gửi Zalo / SMS cho tài xế
                    </button>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={resetCreateForm}
                    className="px-4 py-2 rounded-xl border text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    + Tạo thêm tài xế khác
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold"
                  >
                    Hoàn tất
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreateDriver} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Họ và tên tài xế *</label>
                    <input
                      className="w-full border rounded-xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
                      placeholder="VD: Nguyễn Văn Hùng"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số điện thoại đăng nhập App *
                    </label>
                    <input
                      className="w-full border rounded-xl px-3.5 py-2 text-sm font-mono focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
                      placeholder="09xxxxxxxx"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Trạng thái ban đầu</label>
                    <select
                      className="w-full border rounded-xl px-3 py-2 text-sm bg-white font-medium"
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value as 'ACTIVE' | 'PENDING')}
                    >
                      <option value="ACTIVE">✅ Hoạt động ngay (ACTIVE + cấp hạn phí 1 tháng)</option>
                      <option value="PENDING">⏳ Chờ duyệt (PENDING — nộp giấy tờ sau)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Số dư ví ký quỹ ban đầu (VNĐ)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100000000}
                      step={10000}
                      className="w-full border rounded-xl px-3.5 py-2 text-sm font-bold text-emerald-700"
                      value={newBalance}
                      onChange={(e) => setNewBalance(e.target.value)}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-slate-500 mr-1">Chọn nhanh số dư:</span>
                  {QUICK_BALANCES.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setNewBalance(String(amt))}
                      className={`px-2.5 py-1 rounded-lg border font-semibold transition ${
                        Number(newBalance) === amt
                          ? 'bg-red-600 text-white border-red-600'
                          : 'bg-slate-50 text-slate-700 hover:bg-red-50 hover:text-red-700'
                      }`}
                    >
                      {fmtMoney(amt)}
                    </button>
                  ))}
                </div>

                {Number(newBalance) > 0 && (
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ghi chú sổ cái nạp ví đầu kỳ</label>
                    <input
                      className="w-full border rounded-xl px-3.5 py-2 text-xs"
                      value={newNote}
                      onChange={(e) => setNewNote(e.target.value)}
                      placeholder="VD: Thu tiền mặt ký quỹ tại văn phòng"
                    />
                  </div>
                )}

                <div className="p-3.5 rounded-xl bg-slate-50 border space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <FileImage className="w-4 h-4 text-red-600" /> Hồ sơ giấy tờ (tùy chọn — hoặc để tài xế tự chụp trên App)
                    </span>
                    {uploadingField && (
                      <span className="text-xs font-semibold text-red-600 animate-pulse">Đang tải ảnh lên...</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <AdminDocPicker
                      label="Ảnh chân dung"
                      urls={newAvatarUrl ? [newAvatarUrl] : []}
                      multiple={false}
                      onPick={(files) => handleUploadDoc(files, 'new_avatar')}
                      onRemove={() => setNewAvatarUrl('')}
                    />
                    <AdminDocPicker
                      label={`CCCD (${newIdCardUrls.length}/2)`}
                      urls={newIdCardUrls}
                      multiple
                      onPick={(files) => handleUploadDoc(files, 'new_cccd')}
                      onRemove={(idx) => setNewIdCardUrls((prev) => prev.filter((_, i) => i !== idx))}
                    />
                    <AdminDocPicker
                      label={`GPLX (${newLicenseUrls.length}/2)`}
                      urls={newLicenseUrls}
                      multiple
                      onPick={(files) => handleUploadDoc(files, 'new_gplx')}
                      onRemove={(idx) => setNewLicenseUrls((prev) => prev.filter((_, i) => i !== idx))}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-xl border text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={creating || Boolean(uploadingField)}
                    className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-bold shadow-sm flex items-center gap-1.5"
                  >
                    <UserPlus className="w-4 h-4" />
                    {creating ? 'Đang khởi tạo...' : 'Tạo tài khoản tài xế'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal hiển thị nhanh Mã OTP 6 số hỗ trợ đăng nhập */}
      {otpModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-600" /> Mã OTP đăng nhập App Tài xế
              </h2>
              <button
                onClick={() => setOtpModal(null)}
                className="text-2xl font-bold text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>
            <div className="text-xs text-slate-600 space-y-1">
              <div>
                Tài xế: <b>{otpModal.name || 'Chưa đặt tên'}</b> ({otpModal.phone})
              </div>
              <div>
                Hướng dẫn: Tài xế nhập SĐT <b>{otpModal.phone}</b> trên App Tài xế → bấm <b>Gửi mã OTP</b> → nhập mã 6 số dưới đây:
              </div>
            </div>
            <div className="p-4 rounded-2xl bg-indigo-50 border border-indigo-200 text-center space-y-1">
              <div className="text-3xl font-black tracking-[0.3em] text-indigo-800 font-mono">{otpModal.otp}</div>
              <div className="text-[11px] text-indigo-600 font-medium">
                Có hiệu lực trong {Math.round(otpModal.expiresInSec / 60)} phút (đã mở khóa giới hạn chờ 60s)
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => copyText(otpModal.otp, 'mã OTP')}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5"
              >
                <Copy className="w-3.5 h-3.5" /> Sao chép mã OTP
              </button>
              <button
                type="button"
                onClick={() => setOtpModal(null)}
                className="px-4 py-2 rounded-xl border text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {loadingDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 text-white font-semibold">
          Đang tải hồ sơ tài xế...
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex flex-wrap justify-between items-center gap-2 border-b pb-3">
              <div>
                <h2 className="text-lg font-bold">
                  {detail.name || 'Chưa đặt tên'} — <span className="font-mono">{detail.phone}</span>
                </h2>
                <p className="text-xs text-slate-500">
                  Trạng thái: {DRIVER_STATUS_META[detail.status]?.label} · Số dư ví:{' '}
                  <b>{fmtMoney(detail.wallet?.balance ?? 0)}</b>
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleIssueOtp(detail.id)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-semibold flex items-center gap-1"
                >
                  <KeyRound className="w-3.5 h-3.5" /> Cấp mã OTP
                </button>
                <button
                  type="button"
                  onClick={() => setEditingProfile((v) => !v)}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1"
                >
                  <Pencil className="w-3.5 h-3.5" /> {editingProfile ? 'Đóng sửa' : 'Sửa thông tin & Giấy tờ'}
                </button>
                <button onClick={() => setDetail(null)} className="text-2xl font-bold text-slate-400 px-1">
                  ×
                </button>
              </div>
            </div>

            {editingProfile ? (
              <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200 space-y-3">
                <div className="text-xs font-bold text-slate-800">
                  Cập nhật thông tin định danh & bổ sung giấy tờ hộ tài xế
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Họ và tên</label>
                    <input
                      className="w-full border rounded-lg px-3 py-1.5 text-sm bg-white"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Số điện thoại đăng nhập</label>
                    <input
                      className="w-full border rounded-lg px-3 py-1.5 text-sm font-mono bg-white"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <AdminDocPicker
                    label="Ảnh chân dung"
                    urls={editAvatarUrl ? [editAvatarUrl] : []}
                    multiple={false}
                    onPick={(files) => handleUploadDoc(files, 'edit_avatar')}
                    onRemove={() => setEditAvatarUrl('')}
                  />
                  <AdminDocPicker
                    label={`CCCD (${editIdCardUrls.length}/2)`}
                    urls={editIdCardUrls}
                    multiple
                    onPick={(files) => handleUploadDoc(files, 'edit_cccd')}
                    onRemove={(idx) => setEditIdCardUrls((prev) => prev.filter((_, i) => i !== idx))}
                  />
                  <AdminDocPicker
                    label={`GPLX (${editLicenseUrls.length}/2)`}
                    urls={editLicenseUrls}
                    multiple
                    onPick={(files) => handleUploadDoc(files, 'edit_gplx')}
                    onRemove={(idx) => setEditLicenseUrls((prev) => prev.filter((_, i) => i !== idx))}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setEditingProfile(false)}
                    className="px-3 py-1.5 rounded-lg border bg-white text-xs font-medium text-slate-600"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    disabled={savingProfile || Boolean(uploadingField)}
                    onClick={handleSaveDriverProfile}
                    className="px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1"
                  >
                    <Save className="w-3.5 h-3.5" /> {savingProfile ? 'Đang lưu...' : 'Lưu cập nhật hồ sơ'}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <h3 className="font-bold text-sm mb-2 flex items-center gap-1.5">
                  <FileImage className="w-4 h-4 text-red-600" /> Hồ sơ tài xế (Chân dung, CCCD, GPLX)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {detail.avatarUrl && <DocImage label="Ảnh chân dung" url={detail.avatarUrl} />}
                  {(detail.idCardUrls || []).map((u: string, i: number) => (
                    <DocImage key={`cccd-${i}`} label={`CCCD #${i + 1}`} url={u} />
                  ))}
                  {(detail.licenseUrls || []).map((u: string, i: number) => (
                    <DocImage key={`gplx-${i}`} label={`GPLX #${i + 1}`} url={u} />
                  ))}
                  {!detail.avatarUrl && !detail.idCardUrls?.length && !detail.licenseUrls?.length && (
                    <div className="col-span-full text-xs text-slate-400 bg-slate-50 p-3 rounded-lg">
                      Tài xế chưa tải ảnh hồ sơ lên hệ thống (bấm "Sửa thông tin & Giấy tờ" ở góc trên để tải hộ từ máy tính).
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Lịch sử giao dịch ví */}
              <div className="border rounded-xl p-4 space-y-2">
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  <Wallet className="w-4 h-4 text-emerald-600" /> Lịch sử giao dịch ví
                </h3>
                <div className="max-h-56 overflow-y-auto divide-y text-xs">
                  {(detail.wallet?.transactions || []).map((tx: any) => (
                    <div key={tx.id} className="py-2 flex justify-between gap-2">
                      <div>
                        <div className="font-semibold">{tx.type}</div>
                        <div className="text-slate-500">{tx.note}</div>
                        <div className="text-[11px] text-slate-400">{fmtDateTime(tx.createdAt)}</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold ${tx.amount >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {tx.amount >= 0 ? '+' : ''}
                          {fmtMoney(tx.amount)}
                        </div>
                        <div className="text-[11px] text-slate-400">Sau GD: {fmtMoney(tx.balanceAfter)}</div>
                      </div>
                    </div>
                  ))}
                  {!detail.wallet?.transactions?.length && (
                    <div className="text-slate-400 py-2">Chưa có giao dịch.</div>
                  )}
                </div>
              </div>

              {/* Lịch sử bị khóa nhận đơn */}
              <div className="border rounded-xl p-4 space-y-2">
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-amber-600" /> Lịch sử khóa quyền nhận đơn (
                  {detail.driverLocks?.length || 0})
                </h3>
                <div className="max-h-56 overflow-y-auto divide-y text-xs">
                  {(detail.driverLocks || []).map((lk: any) => (
                    <div key={lk.id} className="py-2">
                      <div className="font-semibold text-amber-800">{lk.reason}</div>
                      <div className="text-slate-500">
                        {fmtDateTime(lk.lockedFrom)} → {fmtDateTime(lk.lockedUntil)}
                      </div>
                    </div>
                  ))}
                  {!detail.driverLocks?.length && (
                    <div className="text-slate-400 py-2">Không có lịch sử vi phạm.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Lịch sử phí duy trì */}
            <div className="border rounded-xl p-4 space-y-2">
              <h3 className="font-bold text-sm">Lịch sử phí duy trì hàng tháng</h3>
              <div className="flex flex-wrap gap-2 text-xs">
                {(detail.maintenanceFees || []).map((f: any) => (
                  <div key={f.id} className="px-3 py-2 bg-slate-50 border rounded-lg">
                    <div className="font-semibold">
                      Kỳ {f.period} — {fmtMoney(f.amount)}
                    </div>
                    <div className="text-slate-500">
                      Trạng thái: <b>{f.status}</b> · Hạn: {new Date(f.dueDate).toLocaleDateString('vi-VN')}
                    </div>
                  </div>
                ))}
                {!detail.maintenanceFees?.length && (
                  <div className="text-slate-400 text-xs">Chưa có bản ghi kỳ phí.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminDocPicker({
  label,
  urls,
  multiple,
  onPick,
  onRemove,
}: {
  label: string;
  urls: string[];
  multiple: boolean;
  onPick: (files: FileList | null) => void;
  onRemove: (index: number) => void;
}) {
  return (
    <div className="bg-white border rounded-xl p-2.5 space-y-2">
      <div className="font-semibold text-slate-700">{label}</div>
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {urls.map((u, idx) => (
            <div key={idx} className="relative group">
              <img src={u} alt={label} className="w-16 h-12 object-cover rounded border" />
              <button
                type="button"
                onClick={() => onRemove(idx)}
                title="Xóa ảnh"
                className="absolute -top-1.5 -right-1.5 bg-rose-600 text-white rounded-full p-0.5 shadow"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-700 text-slate-700 font-semibold transition">
        <Upload className="w-3.5 h-3.5" /> Chọn ảnh
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            onPick(e.target.files);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}

function DocImage({ label, url }: { label: string; url: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="border rounded-lg overflow-hidden bg-slate-50 block hover:ring-2 hover:ring-red-400"
    >
      <img src={url} alt={label} className="w-full h-28 object-cover" />
      <div className="p-1.5 text-[11px] font-medium text-center text-slate-700">{label}</div>
    </a>
  );
}
