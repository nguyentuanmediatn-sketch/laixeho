import React, { useEffect, useState } from 'react';
import { MapPin, Search, Calculator } from 'lucide-react';
import { apiFetch, fmtMoney } from '../api';
import { OsmMapPicker } from './osm-map-picker';

interface Suggestion {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

export function ManualTripTab({
  onCreated,
  onError,
}: {
  onCreated: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [pickupAddress, setPickupAddress] = useState('Quảng trường Võ Nguyên Giáp, TP. Thái Nguyên');
  const [pickupCoord, setPickupCoord] = useState({ lat: 21.5931, lng: 105.8442 });
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoord, setDropoffCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [isBookingForOther, setIsBookingForOther] = useState(false);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [note, setNote] = useState('');

  const [pickMode, setPickMode] = useState<'pickup' | 'dropoff'>('pickup');
  const [pickupResults, setPickupResults] = useState<Suggestion[]>([]);
  const [dropoffResults, setDropoffResults] = useState<Suggestion[]>([]);
  const [estimate, setEstimate] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const searchAddress = async (q: string, target: 'pickup' | 'dropoff') => {
    if (q.trim().length < 2) {
      target === 'pickup' ? setPickupResults([]) : setDropoffResults([]);
      return;
    }
    try {
      const list = await apiFetch<Suggestion[]>(
        `/map/autocomplete?q=${encodeURIComponent(q)}&lat=${pickupCoord.lat}&lng=${pickupCoord.lng}`,
      );
      target === 'pickup' ? setPickupResults(list) : setDropoffResults(list);
    } catch {
      // ignore autocomplete network error
    }
  };

  useEffect(() => {
    if (!dropoffCoord) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    apiFetch('/trips/estimate', {
      method: 'POST',
      body: JSON.stringify({
        pickupLat: pickupCoord.lat,
        pickupLng: pickupCoord.lng,
        dropoffLat: dropoffCoord.lat,
        dropoffLng: dropoffCoord.lng,
      }),
    })
      .then((res) => {
        if (!cancelled) setEstimate(res);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pickupCoord.lat, pickupCoord.lng, dropoffCoord?.lat, dropoffCoord?.lng]);

  const handleMapClick = async (lat: number, lng: number) => {
    try {
      const rev = await apiFetch<{ address: string }>(`/map/reverse?lat=${lat}&lng=${lng}`);
      if (pickMode === 'pickup') {
        setPickupCoord({ lat, lng });
        setPickupAddress(rev.address);
      } else {
        setDropoffCoord({ lat, lng });
        setDropoffAddress(rev.address);
      }
    } catch {
      if (pickMode === 'pickup') {
        setPickupCoord({ lat, lng });
        setPickupAddress(`${lat}, ${lng}`);
      } else {
        setDropoffCoord({ lat, lng });
        setDropoffAddress(`${lat}, ${lng}`);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await apiFetch('/admin/trips/manual', {
        method: 'POST',
        body: JSON.stringify({
          customerPhone,
          customerName: customerName || undefined,
          pickupAddress,
          pickupLat: pickupCoord.lat,
          pickupLng: pickupCoord.lng,
          dropoffAddress: dropoffAddress || undefined,
          dropoffLat: dropoffCoord?.lat,
          dropoffLng: dropoffCoord?.lng,
          isBookingForOther,
          passengerName: isBookingForOther ? passengerName.trim() || undefined : undefined,
          passengerPhone: isBookingForOther ? passengerPhone.trim() || undefined : undefined,
          partnerCode: partnerCode.trim() ? partnerCode.trim().toUpperCase() : undefined,
          note: note || undefined,
        }),
      });
      onCreated(`Đã tạo đơn ${created.code} và tự động tìm tài xế gần nhất!`);
    } catch (err: any) {
      onError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-xl shadow-sm border space-y-4">
        <h1 className="text-xl font-bold text-slate-900">Tạo đơn thủ công (Tổng đài NOW Thái Nguyên)</h1>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Số điện thoại khách *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
              placeholder="09xxxxxxxx"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Tên khách hàng</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
              placeholder="Anh/Chị..."
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </div>
        </div>

        <div className="relative">
          <label className="block text-sm font-medium mb-1">Điểm đón *</label>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              value={pickupAddress}
              onChange={(e) => setPickupAddress(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => searchAddress(pickupAddress, 'pickup')}
              className="px-3 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-700 rounded-lg text-sm flex items-center gap-1"
            >
              <Search className="w-4 h-4" /> Tìm
            </button>
          </div>
          {pickupResults.length > 0 && (
            <div className="mt-1 border rounded-lg bg-white shadow-lg max-h-44 overflow-y-auto divide-y text-xs">
              {pickupResults.map((r, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => {
                    setPickupAddress(r.address);
                    setPickupCoord({ lat: r.lat, lng: r.lng });
                    setPickupResults([]);
                  }}
                  className="w-full text-left p-2 hover:bg-red-50"
                >
                  <div className="font-semibold">{r.label}</div>
                  <div className="text-slate-500 truncate">{r.address}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <label className="block text-sm font-medium mb-1">Điểm trả (tùy chọn)</label>
          <div className="flex gap-2">
            <input
              className="flex-1 border rounded-lg px-3 py-2 text-sm"
              placeholder="Nhập địa chỉ đích rồi bấm Tìm hoặc chọn trên bản đồ"
              value={dropoffAddress}
              onChange={(e) => {
                setDropoffAddress(e.target.value);
                if (!e.target.value.trim()) setDropoffCoord(null);
              }}
            />
            <button
              type="button"
              onClick={() => searchAddress(dropoffAddress, 'dropoff')}
              className="px-3 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-700 rounded-lg text-sm flex items-center gap-1"
            >
              <Search className="w-4 h-4" /> Tìm
            </button>
          </div>
          {dropoffResults.length > 0 && (
            <div className="mt-1 border rounded-lg bg-white shadow-lg max-h-44 overflow-y-auto divide-y text-xs">
              {dropoffResults.map((r, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => {
                    setDropoffAddress(r.address);
                    setDropoffCoord({ lat: r.lat, lng: r.lng });
                    setDropoffResults([]);
                  }}
                  className="w-full text-left p-2 hover:bg-red-50"
                >
                  <div className="font-semibold">{r.label}</div>
                  <div className="text-slate-500 truncate">{r.address}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2.5">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-800 cursor-pointer">
            <input
              type="checkbox"
              checked={isBookingForOther}
              onChange={(e) => setIsBookingForOther(e.target.checked)}
              className="w-4 h-4 accent-red-600"
            />
            Đặt hộ cho người khác (ghi rõ người liên hệ cho tài xế)
          </label>
          {isBookingForOther && (
            <div className="grid grid-cols-2 gap-3">
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="Tên người đi (VD: Anh Hùng)"
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
              />
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="SĐT người liên hệ *"
                value={passengerPhone}
                onChange={(e) => setPassengerPhone(e.target.value)}
                required={isBookingForOther}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Mã đối tác / Quán</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm uppercase font-mono"
              value={partnerCode}
              onChange={(e) => setPartnerCode(e.target.value.toUpperCase())}
              placeholder="VD: QUAN01"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-1">Ghi chú (loại xe, biển số, yêu cầu)</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Xe 5 chỗ 20A-123.45, khách đứng trước cổng"
            />
          </div>
        </div>

        {estimate && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1.5 text-sm">
            <div className="flex items-center justify-between font-bold text-red-700">
              <span className="flex items-center gap-2">
                <Calculator className="w-4 h-4" /> Báo giá dự kiến: {fmtMoney(estimate.price)}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-white text-red-700 border border-red-200">
                {estimate.routeSource || 'OSRM'}
              </span>
            </div>
            <div className="text-xs text-slate-700">
              Lộ trình ngắn nhất: <b>{estimate.distanceKm} km</b> (~{estimate.durationMin} phút) · Khung giờ:{' '}
              <b>{estimate.timeSlot === 'DAY' ? 'Ban ngày' : 'Ban đêm'}</b>
            </div>
            <div className="text-xs text-slate-600">
              Mở cửa {estimate.baseKm ?? 5} km: <b>{fmtMoney(estimate.basePrice)}</b>
              {(estimate.extraKm ?? 0) > 0 && (
                <>
                  {' '}
                  + Phụ trội {estimate.extraKm} km ({fmtMoney(estimate.perKmPrice)}/km):{' '}
                  <b>{fmtMoney(estimate.extraFee)}</b>
                </>
              )}
            </div>
            <div className="text-xs text-slate-600">
              Chiết khấu ví: <b className="text-red-700">{fmtMoney(estimate.commissionAmount)}</b> · Thực nhận tài xế:{' '}
              <b className="text-emerald-700">{fmtMoney(estimate.driverNetIncome)}</b>
            </div>
          </div>
        )}

        <button
          disabled={submitting}
          className="w-full px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg font-semibold shadow-sm"
        >
          {submitting ? 'Đang tạo đơn...' : 'Tạo đơn & Tự động tìm tài xế'}
        </button>
      </form>

      <div className="bg-white p-6 rounded-xl shadow-sm border space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-bold flex items-center gap-2">
            <MapPin className="w-5 h-5 text-red-600" /> Chọn điểm trên bản đồ Thái Nguyên
          </h2>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setPickMode('pickup')}
              className={`px-3 py-1.5 rounded-lg font-medium ${
                pickMode === 'pickup' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Chấm điểm đón
            </button>
            <button
              type="button"
              onClick={() => setPickMode('dropoff')}
              className={`px-3 py-1.5 rounded-lg font-medium ${
                pickMode === 'dropoff' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Chấm điểm trả
            </button>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Bấm trực tiếp lên bản đồ để chọn <b>{pickMode === 'pickup' ? 'Điểm đón (xanh)' : 'Điểm trả (đỏ)'}</b>.
        </p>
        <OsmMapPicker
          pickup={pickupCoord}
          dropoff={dropoffCoord}
          polyline={estimate?.routePolyline}
          height={420}
          onMapClick={handleMapClick}
        />
        <div className="text-xs text-slate-500 flex justify-between">
          <span>
            Đón: {pickupCoord.lat.toFixed(5)}, {pickupCoord.lng.toFixed(5)}
          </span>
          {dropoffCoord && (
            <span>
              Trả: {dropoffCoord.lat.toFixed(5)}, {dropoffCoord.lng.toFixed(5)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
