import React, { useState } from 'react';
import { Store, Plus, Download, ToggleLeft, ToggleRight, MapPin, Phone } from 'lucide-react';
import { apiFetch, exportCsv, fmtMoney } from '../api';

export function PartnersTab({
  partners,
  onReload,
  onNotify,
}: {
  partners: any[];
  onReload: () => void;
  onNotify: (msg: string) => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [commissionPerTrip, setCommissionPerTrip] = useState('15000');
  const [submitting, setSubmitting] = useState(false);

  const totalCompleted = partners.reduce((s, p) => s + Number(p.completedTrips || 0), 0);
  const totalCommission = partners.reduce((s, p) => s + Number(p.totalCommission || 0), 0);
  const activeCount = partners.filter((p) => p.isActive).length;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch('/admin/partners', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          name: name.trim(),
          contactName: contactName.trim() || undefined,
          phone: phone.trim() || undefined,
          address: address.trim() || undefined,
          commissionPerTrip: Number(commissionPerTrip || 15000),
        }),
      });
      setCode('');
      setName('');
      setContactName('');
      setPhone('');
      setAddress('');
      setCommissionPerTrip('15000');
      onNotify('Đã thêm đối tác quán / CTV mới.');
      onReload();
    } catch (err: any) {
      onNotify(`Lỗi tạo đối tác: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleActive = async (p: any) => {
    try {
      await apiFetch(`/admin/partners/${p.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !p.isActive }),
      });
      onNotify(`${!p.isActive ? 'Đã kích hoạt' : 'Đã tạm dừng'} đối tác ${p.code}.`);
      onReload();
    } catch (err: any) {
      onNotify(err.message);
    }
  };

  const handleExport = () => {
    exportCsv(
      `now-tn-hoa-hong-doi-tac-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Mã đối tác',
        'Tên quán / Nhà hàng / CTV',
        'Người liên hệ',
        'Số điện thoại',
        'Địa chỉ',
        'Hoa hồng/chuyến (VNĐ)',
        'Tổng đơn đặt',
        'Chuyến hoàn thành',
        'Tổng hoa hồng chi trả (VNĐ)',
        'Trạng thái',
      ],
      partners.map((p) => [
        p.code,
        p.name,
        p.contactName || '',
        p.phone || '',
        p.address || '',
        p.commissionPerTrip,
        p.totalTrips ?? 0,
        p.completedTrips ?? 0,
        p.totalCommission ?? 0,
        p.isActive ? 'Đang hợp tác' : 'Tạm dừng',
      ]),
    );
    onNotify(`Đã xuất bảng đối soát hoa hồng ${partners.length} đối tác ra file CSV (Excel).`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Store className="w-6 h-6 text-red-600" /> Đối tác Quán nhậu / Nhà hàng / CTV
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gắn mã đối tác (VD: QUAN01) khi đặt đơn hoặc đặt hộ để tự động ghi nhận hoa hồng khi chuyến hoàn thành
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={partners.length === 0}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm"
        >
          <Download className="w-4 h-4" /> Xuất Excel đối soát
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="text-xs text-slate-500">Đối tác đang hợp tác</div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            {activeCount} / {partners.length}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="text-xs text-slate-500">Tổng chuyến hoàn thành từ đối tác</div>
          <div className="text-2xl font-bold text-emerald-700 mt-1">{totalCompleted}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm">
          <div className="text-xs text-slate-500">Tổng hoa hồng đối tác phát sinh</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{fmtMoney(totalCommission)}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <form onSubmit={handleCreate} className="bg-white p-5 rounded-xl border shadow-sm space-y-3 h-fit">
          <h2 className="font-bold text-slate-900 flex items-center gap-1.5">
            <Plus className="w-4 h-4 text-red-600" /> Thêm Quán / Nhà hàng / CTV mới
          </h2>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Mã đối tác (3–20 ký tự) *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm uppercase font-mono"
              placeholder="VD: QUAN02, BIADONG"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Tên quán / Nhà hàng / CTV *</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="VD: Nhà hàng Bia Hơi Hà Nội TN"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Người liên hệ</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Quản lý / Lễ tân"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Số điện thoại</label>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="09xxxxxxxx"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Địa chỉ tại Thái Nguyên</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="Đường Lương Ngọc Quyến, TP. Thái Nguyên"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Hoa hồng / chuyến hoàn thành (VNĐ)</label>
            <input
              type="number"
              min={0}
              max={500000}
              step={1000}
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={commissionPerTrip}
              onChange={(e) => setCommissionPerTrip(e.target.value)}
              required
            />
          </div>
          <button
            disabled={submitting}
            className="w-full py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold shadow-sm"
          >
            {submitting ? 'Đang lưu...' : 'Tạo mã đối tác'}
          </button>
        </form>

        <div className="xl:col-span-2 bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-600 uppercase">
              <tr>
                <th className="p-3">Mã / Tên quán</th>
                <th className="p-3">Liên hệ</th>
                <th className="p-3 text-right">HH / chuyến</th>
                <th className="p-3 text-right">Đơn đặt / Xong</th>
                <th className="p-3 text-right">Tổng hoa hồng</th>
                <th className="p-3">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {partners.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="p-3">
                    <div className="inline-block font-mono font-bold px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200">
                      {p.code}
                    </div>
                    <div className="font-semibold text-slate-900 mt-1">{p.name}</div>
                    {p.address && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 shrink-0" /> {p.address}
                      </div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="font-medium text-slate-800">{p.contactName || '—'}</div>
                    {p.phone && (
                      <div className="text-[11px] text-slate-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {p.phone}
                      </div>
                    )}
                  </td>
                  <td className="p-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                    {fmtMoney(p.commissionPerTrip)}
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <span className="font-semibold text-emerald-700">{p.completedTrips ?? 0}</span>
                    <span className="text-slate-400"> / {p.totalTrips ?? 0}</span>
                  </td>
                  <td className="p-3 text-right font-bold text-red-600 whitespace-nowrap">
                    {fmtMoney(p.totalCommission ?? 0)}
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <button
                      onClick={() => toggleActive(p)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-semibold ${
                        p.isActive
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                      }`}
                    >
                      {p.isActive ? (
                        <>
                          <ToggleRight className="w-3.5 h-3.5" /> Hoạt động
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-3.5 h-3.5" /> Tạm dừng
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
              {partners.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    Chưa có đối tác quán nhậu / nhà hàng nào.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
