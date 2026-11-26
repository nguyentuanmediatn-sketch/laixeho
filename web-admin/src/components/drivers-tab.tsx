import { useState } from 'react';
import { CheckCircle2, Lock, Eye, AlertTriangle, Wallet, FileImage } from 'lucide-react';
import { apiFetch, DRIVER_STATUS_META, fmtDateTime, fmtMoney } from '../api';

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
  const [detail, setDetail] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const isOverdue = (d: any) => d.feeDueDate && new Date(d.feeDueDate) < new Date();

  const filtered = drivers.filter((d) => {
    if (filter === 'ALL') return true;
    if (filter === 'OVERDUE') return isOverdue(d);
    return d.status === filter;
  });

  const openDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const data = await apiFetch(`/admin/drivers/${id}`);
      setDetail(data);
    } catch (e: any) {
      onNotify(e.message);
    } finally {
      setLoadingDetail(false);
    }
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
      <h1 className="text-2xl font-bold">Quản lý Tài xế, Hồ sơ, Ví & Phí duy trì</h1>

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
                    <div className="font-semibold">{d.name || 'Chưa cập nhật'}</div>
                    <div className="text-xs text-slate-500">{d.phone}</div>
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
                      {d.status !== 'ACTIVE' ? (
                        <button
                          onClick={() => handleStatus(d.id, 'ACTIVE')}
                          className="px-2.5 py-1 bg-emerald-600 text-white rounded text-xs font-medium flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt/Mở
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatus(d.id, 'LOCKED')}
                          className="px-2.5 py-1 bg-rose-600 text-white rounded text-xs font-medium flex items-center gap-1"
                        >
                          <Lock className="w-3.5 h-3.5" /> Khóa
                        </button>
                      )}
                      <button onClick={() => handleTopup(d.id)} className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium">
                        + Nạp ví
                      </button>
                      <button onClick={() => handleAdjust(d.id)} className="px-2.5 py-1 bg-slate-700 text-white rounded text-xs font-medium">
                        Điều chỉnh
                      </button>
                      <button onClick={() => handleConfirmFee(d.id)} className="px-2.5 py-1 bg-amber-600 text-white rounded text-xs font-medium">
                        Đã đóng phí
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {loadingDetail && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 text-white font-semibold">
          Đang tải hồ sơ tài xế...
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h2 className="text-lg font-bold">{detail.name || 'Chưa đặt tên'} — {detail.phone}</h2>
                <p className="text-xs text-slate-500">
                  Trạng thái: {DRIVER_STATUS_META[detail.status]?.label} · Số dư ví: <b>{fmtMoney(detail.wallet?.balance ?? 0)}</b>
                </p>
              </div>
              <button onClick={() => setDetail(null)} className="text-2xl font-bold text-slate-400">×</button>
            </div>

            {/* Hồ sơ giấy tờ */}
            <div>
              <h3 className="font-bold text-sm mb-2 flex items-center gap-1.5">
                <FileImage className="w-4 h-4 text-red-600" /> Hồ sơ tài xế (Chân dung, CCCD, GPLX)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {detail.avatarUrl && (
                  <DocImage label="Ảnh chân dung" url={detail.avatarUrl} />
                )}
                {(detail.idCardUrls || []).map((u: string, i: number) => (
                  <DocImage key={`cccd-${i}`} label={`CCCD #${i + 1}`} url={u} />
                ))}
                {(detail.licenseUrls || []).map((u: string, i: number) => (
                  <DocImage key={`gplx-${i}`} label={`GPLX #${i + 1}`} url={u} />
                ))}
                {!detail.avatarUrl && (!detail.idCardUrls?.length) && (!detail.licenseUrls?.length) && (
                  <div className="col-span-full text-xs text-slate-400 bg-slate-50 p-3 rounded-lg">
                    Tài xế chưa tải ảnh hồ sơ lên hệ thống.
                  </div>
                )}
              </div>
            </div>

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
                          {tx.amount >= 0 ? '+' : ''}{fmtMoney(tx.amount)}
                        </div>
                        <div className="text-[11px] text-slate-400">Sau GD: {fmtMoney(tx.balanceAfter)}</div>
                      </div>
                    </div>
                  ))}
                  {!detail.wallet?.transactions?.length && <div className="text-slate-400 py-2">Chưa có giao dịch.</div>}
                </div>
              </div>

              {/* Lịch sử bị khóa nhận đơn */}
              <div className="border rounded-xl p-4 space-y-2">
                <h3 className="font-bold text-sm flex items-center gap-1.5">
                  <Lock className="w-4 h-4 text-amber-600" /> Lịch sử khóa quyền nhận đơn ({detail.driverLocks?.length || 0})
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
                  {!detail.driverLocks?.length && <div className="text-slate-400 py-2">Không có lịch sử vi phạm.</div>}
                </div>
              </div>
            </div>

            {/* Lịch sử phí duy trì */}
            <div className="border rounded-xl p-4 space-y-2">
              <h3 className="font-bold text-sm">Lịch sử phí duy trì hàng tháng</h3>
              <div className="flex flex-wrap gap-2 text-xs">
                {(detail.maintenanceFees || []).map((f: any) => (
                  <div key={f.id} className="px-3 py-2 bg-slate-50 border rounded-lg">
                    <div className="font-semibold">Kỳ {f.period} — {fmtMoney(f.amount)}</div>
                    <div className="text-slate-500">Trạng thái: <b>{f.status}</b> · Hạn: {new Date(f.dueDate).toLocaleDateString('vi-VN')}</div>
                  </div>
                ))}
                {!detail.maintenanceFees?.length && <div className="text-slate-400 text-xs">Chưa có bản ghi kỳ phí.</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DocImage({ label, url }: { label: string; url: string }) {
  return (
    <a href={url} target="_blank" rel="noreferrer" className="border rounded-lg overflow-hidden bg-slate-50 block hover:ring-2 hover:ring-red-400">
      <img src={url} alt={label} className="w-full h-28 object-cover" />
      <div className="p-1.5 text-[11px] font-medium text-center text-slate-700">{label}</div>
    </a>
  );
}
