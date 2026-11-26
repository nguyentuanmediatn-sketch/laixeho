import { useState } from 'react';
import {
  RefreshCw,
  XCircle,
  Eye,
  Search,
  Image as ImageIcon,
  Video,
  Download,
  UserPlus,
  AlertTriangle,
} from 'lucide-react';
import { apiFetch, exportCsv, fmtDateTime, fmtMoney, TRIP_STATUS_META } from '../api';
import { OsmMapPicker } from './osm-map-picker';

const STATUS_FILTERS = [
  'ALL',
  'NO_DRIVER',
  'SEARCHING',
  'ACCEPTED',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export function TripsTab({
  trips,
  drivers = [],
  initialFilter = 'ALL',
  publicTrackBaseUrl = 'https://now.tuannv.site',
  onReload,
  onNotify,
}: {
  trips: any[];
  drivers?: any[];
  initialFilter?: string;
  publicTrackBaseUrl?: string;
  onReload: () => void;
  onNotify: (msg: string) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>(initialFilter);
  const [query, setQuery] = useState('');
  const [selectedTrip, setSelectedTrip] = useState<any>(null);
  const [assignModalTrip, setAssignModalTrip] = useState<any>(null);
  const [chosenDriverId, setChosenDriverId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  const activeDrivers = drivers.filter((d) => d.status === 'ACTIVE');

  const filtered = trips.filter((t) => {
    if (statusFilter !== 'ALL' && t.status !== statusFilter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      return (
        t.code?.toLowerCase().includes(q) ||
        t.customer?.phone?.toLowerCase().includes(q) ||
        t.driver?.phone?.toLowerCase().includes(q) ||
        t.pickupAddress?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const handleRedispatch = async (tripId: string) => {
    try {
      await apiFetch(`/admin/trips/${tripId}/redispatch`, { method: 'POST' });
      onNotify('Đã đẩy đơn vào hàng đợi tìm tài xế trở lại.');
      onReload();
    } catch (e: any) {
      onNotify(e.message);
    }
  };

  const handleAssignSubmit = async () => {
    if (!assignModalTrip || !chosenDriverId) return;
    setAssigning(true);
    try {
      await apiFetch(`/admin/trips/${assignModalTrip.id}/assign-driver`, {
        method: 'POST',
        body: JSON.stringify({ driverId: chosenDriverId }),
      });
      onNotify(`Đã gán tài xế thủ công cho đơn ${assignModalTrip.code} & ghi Audit Log.`);
      setAssignModalTrip(null);
      setChosenDriverId('');
      onReload();
    } catch (e: any) {
      onNotify(e.message);
    } finally {
      setAssigning(false);
    }
  };

  const handleCancel = async (tripId: string) => {
    const reason = window.prompt('Nhập lý do Admin hủy chuyến:', 'Điều phối viên hủy theo yêu cầu');
    if (reason === null) return;
    try {
      await apiFetch(`/admin/trips/${tripId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: reason || 'Admin hủy' }),
      });
      onNotify('Đã hủy chuyến.');
      setSelectedTrip(null);
      onReload();
    } catch (e: any) {
      onNotify(e.message);
    }
  };

  const handleExportTrips = () => {
    exportCsv(
      `now-tn-chuyen-di-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Mã chuyến',
        'Giờ đặt',
        'Khách hàng',
        'SĐT khách',
        'Tài xế',
        'SĐT tài xế',
        'Điểm đón',
        'Điểm trả',
        'Quãng đường (km)',
        'Nguồn lộ trình',
        'Khung giờ',
        'Giá dự kiến (VNĐ)',
        'Giá chốt (VNĐ)',
        'Chiết khấu (VNĐ)',
        'Thực nhận TX (VNĐ)',
        'Trạng thái',
      ],
      filtered.map((t) => {
        const net =
          t.finalPrice != null && t.commissionAmount != null ? t.finalPrice - t.commissionAmount : '';
        return [
          t.code,
          fmtDateTime(t.orderedAt),
          t.customer?.name || '',
          t.customer?.phone || '',
          t.driver?.name || '',
          t.driver?.phone || '',
          t.pickupAddress,
          t.dropoffAddress || '',
          t.distanceKm ?? '',
          t.routeSource || '',
          t.timeSlot === 'DAY' ? 'Ban ngày' : 'Ban đêm',
          t.estimatedPrice ?? '',
          t.finalPrice ?? '',
          t.commissionAmount ?? '',
          net,
          TRIP_STATUS_META[t.status]?.label || t.status,
        ];
      }),
    );
    onNotify(`Đã xuất ${filtered.length} chuyến đi ra file CSV (Excel).`);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Quản lý chuyến đi ({filtered.length})</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              className="pl-9 pr-3 py-2 border rounded-lg text-sm bg-white w-64"
              placeholder="Tìm mã chuyến, SĐT, địa chỉ..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            onClick={handleExportTrips}
            disabled={filtered.length === 0}
            className="px-3.5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-4 h-4" /> Xuất Excel
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((st) => {
          const count = st === 'ALL' ? trips.length : trips.filter((t) => t.status === st).length;
          const active = statusFilter === st;
          return (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                active
                  ? 'bg-red-600 text-white'
                  : st === 'NO_DRIVER' && count > 0
                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                    : 'bg-white border text-slate-600 hover:bg-red-50 hover:text-red-700'
              }`}
            >
              {st === 'ALL' ? 'Tất cả' : TRIP_STATUS_META[st]?.label || st} ({count})
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead className="bg-slate-100 text-slate-600">
            <tr>
              <th className="p-2.5">Mã chuyến / Giờ đặt</th>
              <th className="p-2.5">Khách hàng</th>
              <th className="p-2.5">Tài xế</th>
              <th className="p-2.5">Lộ trình</th>
              <th className="p-2.5">Giá / Chiết khấu</th>
              <th className="p-2.5">Trạng thái</th>
              <th className="p-2.5">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((t) => {
              const meta = TRIP_STATUS_META[t.status] || { label: t.status, cls: 'bg-slate-100' };
              const pickupCount = t.media?.filter((m: any) => m.stage === 'PICKUP').length || 0;
              const dropoffCount = t.media?.filter((m: any) => m.stage === 'DROPOFF').length || 0;
              const canAssign = t.status === 'NO_DRIVER' || t.status === 'SEARCHING';
              return (
                <tr key={t.id} className={t.status === 'NO_DRIVER' ? 'bg-amber-50/60' : 'hover:bg-slate-50'}>
                  <td className="p-2.5">
                    <div className="font-mono font-semibold text-slate-900">{t.code}</div>
                    <div className="text-[11px] text-slate-500">{fmtDateTime(t.orderedAt)}</div>
                    {t.partnerCode && (
                      <div className="mt-0.5 inline-block px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 text-[10px] font-bold">
                        CTV: {t.partnerCode}
                      </div>
                    )}
                  </td>
                  <td className="p-2.5">
                    <div className="font-medium">{t.customer?.phone}</div>
                    <div className="text-[11px] text-slate-500">{t.customer?.name || '—'}</div>
                    {t.isBookingForOther && (
                      <div className="mt-0.5 inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">
                        Đặt hộ: {t.passengerName || 'Khách'} ({t.passengerPhone})
                      </div>
                    )}
                  </td>
                  <td className="p-2.5">
                    {t.driver ? (
                      <>
                        <div className="font-medium">{t.driver.name || '—'}</div>
                        <div className="text-[11px] text-slate-500">{t.driver.phone}</div>
                      </>
                    ) : (
                      <span className="text-slate-400">Chưa có</span>
                    )}
                  </td>
                  <td className="p-2.5 max-w-[190px]">
                    <div className="truncate text-xs">
                      <b>Đón:</b> {t.pickupAddress}
                    </div>
                    <div className="truncate text-xs text-slate-500">
                      <b>Trả:</b> {t.dropoffAddress || 'Chưa nhập'}
                    </div>
                    {t.distanceKm != null && (
                      <div className="text-xs text-red-600 font-semibold flex items-center gap-1.5 mt-0.5">
                        <span>
                          {t.distanceKm} km · {t.timeSlot === 'DAY' ? 'Ngày' : 'Đêm'}
                        </span>
                        {t.routeSource === 'FALLBACK_HAVERSINE' && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px]">
                            Ước tính
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-semibold text-emerald-700">{fmtMoney(t.finalPrice ?? t.estimatedPrice)}</div>
                    <div className="text-xs text-slate-500">CK: {fmtMoney(t.commissionAmount)}</div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span
                      className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${meta.cls}`}
                    >
                      {meta.label}
                    </span>
                    {t.status === 'CANCELLED' && t.arrivedAt && (
                      <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-rose-100 text-rose-800 border border-rose-300 text-[10px] font-bold">
                        <AlertTriangle className="w-3 h-3" /> Nghi vấn cắt cầu
                      </div>
                    )}
                    <div className="text-[11px] text-slate-400 mt-1">
                      Media: nhận {pickupCount} · trả {dropoffCount}
                    </div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => setSelectedTrip(t)}
                        className="px-2.5 py-1 bg-slate-100 text-slate-800 hover:bg-slate-200 rounded text-xs font-medium flex items-center gap-1 whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" /> Chi tiết
                      </button>
                      {canAssign && (
                        <button
                          onClick={() => {
                            setAssignModalTrip(t);
                            setChosenDriverId(activeDrivers[0]?.id || '');
                          }}
                          className="px-2.5 py-1 bg-red-600 text-white hover:bg-red-700 rounded text-xs font-medium flex items-center gap-1"
                        >
                          <UserPlus className="w-3.5 h-3.5" /> Gán TX
                        </button>
                      )}
                      {t.status === 'NO_DRIVER' && (
                        <button
                          onClick={() => handleRedispatch(t.id)}
                          className="px-2.5 py-1 bg-amber-600 text-white hover:bg-amber-700 rounded text-xs font-medium flex items-center gap-1"
                        >
                          <RefreshCw className="w-3.5 h-3.5" /> Tìm lại
                        </button>
                      )}
                      {!['COMPLETED', 'CANCELLED'].includes(t.status) && (
                        <button
                          onClick={() => handleCancel(t.id)}
                          className="px-2.5 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-xs font-medium flex items-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" /> Hủy
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  Không có chuyến đi nào phù hợp bộ lọc.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Gán tài xế thủ công */}
      {assignModalTrip && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                Gán tài xế thủ công · {assignModalTrip.code}
              </h2>
              <button
                onClick={() => setAssignModalTrip(null)}
                className="text-2xl font-bold text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>
            <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl">
              <div>
                <b>Điểm đón:</b> {assignModalTrip.pickupAddress}
              </div>
              <div className="mt-1">
                <b>Khách:</b> {assignModalTrip.customer?.name || '—'} ({assignModalTrip.customer?.phone})
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Chọn tài xế đang hoạt động</label>
              <select
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                value={chosenDriverId}
                onChange={(e) => setChosenDriverId(e.target.value)}
              >
                {activeDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name || d.phone} ({d.phone}) · {d.isOnline ? '● Online' : '○ Offline'} · Ví{' '}
                    {fmtMoney(d.wallet?.balance ?? 0)}
                  </option>
                ))}
              </select>
              {activeDrivers.length === 0 && (
                <p className="text-xs text-red-600 mt-1">Không có tài xế nào ở trạng thái Hoạt động.</p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAssignModalTrip(null)}
                className="px-4 py-2 text-sm rounded-lg border text-slate-600 hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                disabled={!chosenDriverId || assigning}
                onClick={handleAssignSubmit}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-semibold"
              >
                {assigning ? 'Đang gán...' : 'Xác nhận gán chuyến'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedTrip && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-4xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h2 className="text-lg font-bold">Chi tiết chuyến {selectedTrip.code}</h2>
                <p className="text-xs text-slate-500">Đặt lúc: {fmtDateTime(selectedTrip.orderedAt)}</p>
              </div>
              <button
                onClick={() => setSelectedTrip(null)}
                className="text-2xl font-bold text-slate-400 hover:text-slate-700"
              >
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-1.5 bg-slate-50 p-4 rounded-xl">
                <div>
                  <b>Khách đặt:</b> {selectedTrip.customer?.name || '—'} ({selectedTrip.customer?.phone})
                </div>
                {selectedTrip.isBookingForOther && (
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs">
                    <b>Đặt hộ cho người đi:</b> {selectedTrip.passengerName || 'Khách'} ·{' '}
                    <b>{selectedTrip.passengerPhone}</b>
                  </div>
                )}
                <div>
                  <b>Tài xế:</b>{' '}
                  {selectedTrip.driver
                    ? `${selectedTrip.driver.name || ''} (${selectedTrip.driver.phone})`
                    : 'Chưa gán'}
                </div>
                <div>
                  <b>Điểm đón:</b> {selectedTrip.pickupAddress}
                </div>
                <div>
                  <b>Điểm trả:</b> {selectedTrip.dropoffAddress || '—'}
                </div>
                {selectedTrip.partnerCode && (
                  <div className="p-2 rounded-lg bg-purple-50 border border-purple-200 text-purple-900 text-xs">
                    <b>Đối tác giới thiệu:</b> <span className="font-mono font-bold">{selectedTrip.partnerCode}</span>
                    {selectedTrip.partnerCommission != null && (
                      <span> · Hoa hồng: <b>{fmtMoney(selectedTrip.partnerCommission)}</b></span>
                    )}
                  </div>
                )}
                {selectedTrip.shareToken && (
                  <div className="text-xs text-slate-600">
                    <b>Link theo dõi hành trình:</b>{' '}
                    <a
                      href={`${publicTrackBaseUrl.replace(/\/+$/, '')}/track/${selectedTrip.shareToken}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-red-600 underline font-mono break-all"
                    >
                      {publicTrackBaseUrl.replace(/\/+$/, '')}/track/{selectedTrip.shareToken}
                    </a>
                  </div>
                )}
                {selectedTrip.note && (
                  <div>
                    <b>Ghi chú:</b> {selectedTrip.note}
                  </div>
                )}
                {selectedTrip.cancelReason && (
                  <div className="text-red-600">
                    <b>Lý do hủy ({selectedTrip.cancelledBy}):</b> {selectedTrip.cancelReason}
                  </div>
                )}
              </div>
              <div className="space-y-1.5 bg-slate-50 p-4 rounded-xl">
                <div>
                  <b>Trạng thái:</b> {TRIP_STATUS_META[selectedTrip.status]?.label || selectedTrip.status}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span>
                    <b>Quãng đường:</b> {selectedTrip.distanceKm ?? '—'} km | <b>Khung giờ:</b>{' '}
                    {selectedTrip.timeSlot === 'DAY' ? 'Ban ngày' : 'Ban đêm'}
                  </span>
                  {selectedTrip.routeSource && (
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        selectedTrip.routeSource === 'FALLBACK_HAVERSINE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      Nguồn: {selectedTrip.routeSource}
                    </span>
                  )}
                </div>
                <div>
                  <b>Giá dự kiến:</b> {fmtMoney(selectedTrip.estimatedPrice)}
                </div>
                <div>
                  <b>Giá chốt:</b>{' '}
                  <span className="font-bold text-emerald-700">{fmtMoney(selectedTrip.finalPrice)}</span>
                </div>
                <div>
                  <b>Chiết khấu ví:</b>{' '}
                  <span className="font-semibold text-red-600">{fmtMoney(selectedTrip.commissionAmount)}</span>
                  {selectedTrip.finalPrice != null && selectedTrip.commissionAmount != null && (
                    <span className="ml-2 text-slate-600">
                      · Thực nhận TX:{' '}
                      <b>{fmtMoney(selectedTrip.finalPrice - selectedTrip.commissionAmount)}</b>
                    </span>
                  )}
                </div>
                {selectedTrip.pricingSnapshot && (
                  <div className="text-[11px] bg-white border rounded-lg p-2 text-slate-600 mt-1">
                    <b>Bảng giá khóa lúc đặt:</b> Mở cửa {selectedTrip.pricingSnapshot.baseKm}km (
                    Ngày {fmtMoney(selectedTrip.pricingSnapshot.dayBase)} / Đêm{' '}
                    {fmtMoney(selectedTrip.pricingSnapshot.nightBase)}) · Phụ trội Ngày{' '}
                    {fmtMoney(selectedTrip.pricingSnapshot.dayPerKm)}/km, Đêm{' '}
                    {fmtMoney(selectedTrip.pricingSnapshot.nightPerKm)}/km · CK{' '}
                    {selectedTrip.pricingSnapshot.commissionType === 'PERCENT'
                      ? `${selectedTrip.pricingSnapshot.commissionValue}%`
                      : fmtMoney(selectedTrip.pricingSnapshot.commissionValue)}
                  </div>
                )}
                {selectedTrip.routeSource === 'FALLBACK_HAVERSINE' && (
                  <div className="text-[11px] text-amber-800 flex items-center gap-1 pt-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Quãng đường tính từ công thức ước tính khi API bản đồ gián đoạn.
                  </div>
                )}
                <div className="text-xs text-slate-500 pt-1">
                  Nhận: {fmtDateTime(selectedTrip.acceptedAt)} · Đến: {fmtDateTime(selectedTrip.arrivedAt)} · Chạy:{' '}
                  {fmtDateTime(selectedTrip.startedAt)} · Xong: {fmtDateTime(selectedTrip.completedAt)}
                </div>
              </div>
            </div>

            <OsmMapPicker
              pickup={{ lat: selectedTrip.pickupLat, lng: selectedTrip.pickupLng }}
              dropoff={
                selectedTrip.dropoffLat != null && selectedTrip.dropoffLng != null
                  ? { lat: selectedTrip.dropoffLat, lng: selectedTrip.dropoffLng }
                  : null
              }
              polyline={selectedTrip.routePolyline}
              actualPolyline={selectedTrip.actualRoutePolyline}
              height={240}
            />

            <div>
              <h3 className="font-bold text-sm mb-3">
                Ảnh & Video kiểm tra xe ({selectedTrip.media?.length || 0} tệp)
              </h3>
              {!selectedTrip.media || selectedTrip.media.length === 0 ? (
                <div className="text-xs text-slate-400 bg-slate-50 p-4 rounded-lg">
                  Chưa có ảnh/video nào được tải lên.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {selectedTrip.media.map((m: any) => (
                    <div key={m.id} className="border rounded-xl overflow-hidden bg-slate-50 flex flex-col">
                      {m.type === 'VIDEO' ? (
                        <video src={m.url} controls className="w-full h-44 bg-black object-contain" />
                      ) : (
                        <a href={m.url} target="_blank" rel="noreferrer">
                          <img src={m.url} alt="Trip media" className="w-full h-44 object-cover hover:opacity-90" />
                        </a>
                      )}
                      <div className="p-2.5 text-xs space-y-0.5">
                        <div className="font-semibold flex items-center gap-1">
                          {m.type === 'VIDEO' ? (
                            <Video className="w-3.5 h-3.5 text-red-600" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                          )}
                          {m.stage === 'PICKUP' ? 'Nhận xe' : 'Trả xe'}
                          {m.isPlatePhoto && (
                            <span className="ml-1 px-1.5 py-0.5 bg-red-100 text-red-800 rounded text-[10px]">
                              Biển số
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500">{fmtDateTime(m.takenAt)}</div>
                        {m.lat != null && m.lng != null && (
                          <div className="text-[11px] text-slate-400">
                            GPS: {m.lat.toFixed(5)}, {m.lng.toFixed(5)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
