import { useEffect, useState } from 'react';
import {
  Download,
  Search,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  SlidersHorizontal,
  QrCode,
  CheckCircle2,
  XCircle,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';
import { apiFetch, exportCsv, fmtDateTime, fmtMoney, WALLET_TX_META } from '../api';

export function FinanceTab({
  refreshKey = 0,
  onNotify,
  onAfterConfirm,
}: {
  refreshKey?: number;
  onNotify: (msg: string) => void;
  onAfterConfirm?: () => void;
}) {
  const [txs, setTxs] = useState<any[]>([]);
  const [intents, setIntents] = useState<any[]>([]);
  const [intentFilter, setIntentFilter] = useState<string>('PENDING');
  const [intentQuery, setIntentQuery] = useState('');
  const [previewQr, setPreviewQr] = useState<any>(null);
  const [busyIntentId, setBusyIntentId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [query, setQuery] = useState('');

  const loadIntents = async (st = intentFilter) => {
    try {
      const q = st !== 'ALL' ? `?status=${encodeURIComponent(st)}` : '';
      const data = await apiFetch<any[]>(`/admin/payment-intents${q}`);
      setIntents(data);
    } catch (e: any) {
      onNotify(e.message);
    }
  };

  const loadLedger = async (type = typeFilter, from = dateFrom, to = dateTo) => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (type !== 'ALL') p.set('type', type);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      const q = p.toString() ? `?${p.toString()}` : '';
      const data = await apiFetch<any[]>(`/admin/wallet-transactions${q}`);
      setTxs(data);
    } catch (e: any) {
      onNotify(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLedger();
    loadIntents(intentFilter);
  }, [refreshKey]);

  const handleConfirmIntent = async (item: any) => {
    const label = item.purpose === 'MAINTENANCE_FEE' ? `đóng quỹ kỳ ${item.period || ''}` : 'nạp tiền vào ví';
    if (
      !window.confirm(
        `Xác nhận đã nhận ${fmtMoney(item.amount)} từ tài xế ${item.driver?.name || item.driver?.phone} (${label})?\nMã GD: ${item.txCode}\nNội dung CK: ${item.transferContent}`,
      )
    ) {
      return;
    }
    setBusyIntentId(item.id);
    try {
      await apiFetch(`/admin/payment-intents/${item.id}/confirm`, { method: 'POST' });
      onNotify(`✅ Đã duyệt phiếu VietQR ${item.txCode} (${fmtMoney(item.amount)}) thành công!`);
      setPreviewQr(null);
      await Promise.all([loadIntents(intentFilter), loadLedger()]);
      onAfterConfirm?.();
    } catch (e: any) {
      onNotify(`Lỗi duyệt phiếu: ${e.message}`);
    } finally {
      setBusyIntentId(null);
    }
  };

  const handleCancelIntent = async (item: any) => {
    if (!window.confirm(`Hủy phiếu VietQR ${item.txCode} (${fmtMoney(item.amount)})?`)) return;
    setBusyIntentId(item.id);
    try {
      await apiFetch(`/admin/payment-intents/${item.id}/cancel`, { method: 'POST' });
      onNotify(`Đã hủy phiếu VietQR ${item.txCode}.`);
      setPreviewQr(null);
      await loadIntents(intentFilter);
      onAfterConfirm?.();
    } catch (e: any) {
      onNotify(e.message);
    } finally {
      setBusyIntentId(null);
    }
  };

  const filteredIntents = intents.filter((it) => {
    if (!intentQuery.trim()) return true;
    const q = intentQuery.trim().toLowerCase();
    return (
      it.txCode?.toLowerCase().includes(q) ||
      it.transferContent?.toLowerCase().includes(q) ||
      it.driver?.name?.toLowerCase().includes(q) ||
      it.driver?.phone?.toLowerCase().includes(q)
    );
  });

  const filtered = txs.filter((tx) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      tx.wallet?.driver?.phone?.toLowerCase().includes(q) ||
      tx.wallet?.driver?.name?.toLowerCase().includes(q) ||
      tx.trip?.code?.toLowerCase().includes(q) ||
      tx.note?.toLowerCase().includes(q)
    );
  });

  const totalTopup = filtered
    .filter((t) => t.type === 'TOPUP')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const totalCommission = filtered
    .filter((t) => t.type === 'COMMISSION')
    .reduce((s, t) => s + Math.abs(Number(t.amount || 0)), 0);
  const totalAdjust = filtered
    .filter((t) => t.type === 'ADJUSTMENT')
    .reduce((s, t) => s + Number(t.amount || 0), 0);
  const netDelta = filtered.reduce((s, t) => s + Number(t.amount || 0), 0);

  const handleExport = () => {
    exportCsv(
      `now-tn-doi-soat-vi-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Thời gian',
        'Tài xế',
        'SĐT tài xế',
        'Loại giao dịch',
        'Mã chuyến',
        'Giá chuyến (VNĐ)',
        'Số tiền GD (VNĐ)',
        'Số dư sau GD (VNĐ)',
        'Admin thực hiện',
        'Ghi chú',
      ],
      filtered.map((t) => [
        fmtDateTime(t.createdAt),
        t.wallet?.driver?.name || '',
        t.wallet?.driver?.phone || '',
        WALLET_TX_META[t.type]?.label || t.type,
        t.trip?.code || '',
        t.trip?.finalPrice ?? '',
        t.amount,
        t.balanceAfter,
        t.admin?.name || t.admin?.username || 'Hệ thống',
        t.note || '',
      ]),
    );
    onNotify(`Đã xuất ${filtered.length} giao dịch ví ra file CSV (Excel).`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Đối soát Ví & Dòng tiền</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Sổ cái giao dịch bất biến (khóa hàng FOR UPDATE) · Kiểm tra nạp ví, khấu trừ chiết khấu và điều chỉnh
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              loadLedger();
              loadIntents(intentFilter);
            }}
            className="px-3 py-2 bg-white border rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại
          </button>
          <button
            onClick={handleExport}
            disabled={filtered.length === 0}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shadow-sm"
          >
            <Download className="w-4 h-4" /> Xuất Excel (CSV)
          </button>
        </div>
      </div>

      {/* Khu vực Đối soát Phiếu VietQR MB Bank (0973521456 - NGUYEN VAN TUAN) */}
      <div className="bg-white rounded-xl border-2 border-red-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <QrCode className="w-5 h-5 text-red-600" /> Đối soát Phiếu VietQR MB Bank (0973521456 · NGUYEN VAN TUAN)
            </h2>
            <p className="text-xs text-slate-500">
              Tra nhanh theo Mã GD tự sinh (NOWV / NOWQ) trên sao kê MB Bank và bấm duyệt 1 chạm (khóa hàng FOR UPDATE chống duyệt trùng)
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { id: 'PENDING', label: 'Chờ duyệt' },
              { id: 'CONFIRMED', label: 'Đã duyệt' },
              { id: 'CANCELLED', label: 'Đã hủy' },
              { id: 'ALL', label: 'Tất cả' },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setIntentFilter(s.id);
                  loadIntents(s.id);
                }}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${
                  intentFilter === s.id
                    ? 'bg-red-600 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-700'
                }`}
              >
                {s.label}
              </button>
            ))}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
              <input
                className="pl-7 pr-2.5 py-1 border rounded-lg text-xs w-52"
                placeholder="Tìm mã GD NOWV/NOWQ, tên TX..."
                value={intentQuery}
                onChange={(e) => setIntentQuery(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-600 uppercase">
              <tr>
                <th className="p-2.5">Mã GD / Thời gian</th>
                <th className="p-2.5">Tài xế</th>
                <th className="p-2.5">Mục đích & Nội dung CK (MB Bank)</th>
                <th className="p-2.5">Biên lai CK</th>
                <th className="p-2.5 text-right">Số tiền / Trạng thái</th>
                <th className="p-2.5">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredIntents.map((it) => (
                <tr key={it.id} className={it.status === 'PENDING' ? 'bg-amber-50/40' : 'hover:bg-slate-50'}>
                  <td className="p-2.5 whitespace-nowrap">
                    <div className="font-mono font-bold text-red-700">{it.txCode}</div>
                    <div className="text-[11px] text-slate-400">{fmtDateTime(it.createdAt)}</div>
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">{it.driver?.name || '—'}</div>
                    <div className="text-[11px] text-slate-500">{it.driver?.phone}</div>
                  </td>
                  <td className="p-2.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold mb-1 ${
                        it.purpose === 'MAINTENANCE_FEE'
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {it.purpose === 'MAINTENANCE_FEE' ? `Quỹ tháng ${it.period || ''}` : 'Nạp tiền vào ví'}
                    </span>
                    <div className="font-mono text-[11px] text-slate-800 break-all">{it.transferContent}</div>
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    {it.proofImageUrl ? (
                      <button
                        onClick={() => setPreviewQr(it)}
                        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold"
                      >
                        <img
                          src={it.proofImageUrl}
                          alt="Biên lai"
                          className="w-6 h-6 rounded object-cover border border-emerald-300"
                        />
                        Xem ảnh CK
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Chưa tải ảnh</span>
                    )}
                  </td>
                  <td className="p-2.5 text-right whitespace-nowrap">
                    <div className="font-bold text-slate-900">{fmtMoney(it.amount)}</div>
                    <span
                      className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        it.status === 'CONFIRMED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : it.status === 'CANCELLED'
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {it.status === 'CONFIRMED'
                        ? 'Đã duyệt'
                        : it.status === 'CANCELLED'
                          ? 'Đã hủy'
                          : 'Chờ đối soát'}
                    </span>
                  </td>
                  <td className="p-2.5 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => setPreviewQr(it)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium flex items-center gap-1"
                      >
                        <QrCode className="w-3.5 h-3.5" /> Đối chiếu
                      </button>
                      {it.status === 'PENDING' && (
                        <>
                          <button
                            disabled={busyIntentId === it.id}
                            onClick={() => handleConfirmIntent(it)}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded font-semibold flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Duyệt
                          </button>
                          <button
                            disabled={busyIntentId === it.id}
                            onClick={() => handleCancelIntent(it)}
                            className="px-2 py-1 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 text-rose-700 rounded font-medium flex items-center gap-1"
                          >
                            <XCircle className="w-3.5 h-3.5" /> Hủy
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredIntents.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-5 text-center text-slate-400">
                    Không có phiếu VietQR nào trong mục này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {previewQr && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b pb-2.5">
              <div>
                <div className="font-bold text-slate-900 text-base">
                  Đối chiếu giao dịch VietQR · {previewQr.txCode}
                </div>
                <div className="text-xs text-slate-500">
                  Tài xế: <b>{previewQr.driver?.name || '—'}</b> ({previewQr.driver?.phone}) ·{' '}
                  {previewQr.purpose === 'MAINTENANCE_FEE'
                    ? `Đóng quỹ tháng ${previewQr.period || ''}`
                    : 'Nạp tiền vào ví ký quỹ'}
                </div>
              </div>
              <button onClick={() => setPreviewQr(null)} className="text-2xl font-bold text-slate-400 hover:text-slate-700">
                ×
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Cột trái: Ảnh biên lai chuyển khoản tài xế tải lên */}
              <div className="space-y-2 border rounded-xl p-3 bg-slate-50">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                  <span className="flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-emerald-600" /> Ảnh biên lai tài xế gửi lên
                  </span>
                  {previewQr.proofImageUrl && (
                    <a
                      href={previewQr.proofImageUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-red-600 hover:underline flex items-center gap-1 font-semibold"
                    >
                      Mở ảnh gốc <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
                {previewQr.proofImageUrl ? (
                  <>
                    <a href={previewQr.proofImageUrl} target="_blank" rel="noreferrer">
                      <img
                        src={previewQr.proofImageUrl}
                        alt="Biên lai chuyển khoản"
                        className="w-full max-h-80 object-contain rounded-lg border bg-white"
                      />
                    </a>
                    {previewQr.proofUploadedAt && (
                      <div className="text-[11px] text-slate-500">
                        Tải lên lúc: {fmtDateTime(previewQr.proofUploadedAt)}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="h-60 flex flex-col items-center justify-center text-center text-xs text-slate-400 bg-white rounded-lg border border-dashed p-4">
                    <ImageIcon className="w-8 h-8 mb-2 opacity-40" />
                    Tài xế chưa tải lên ảnh chụp chuyển khoản.
                    <br />
                    Admin vẫn có thể đối chiếu trực tiếp trên app MB Bank theo mã {previewQr.txCode}.
                  </div>
                )}
              </div>

              {/* Cột phải: Thông tin chuẩn & QR */}
              <div className="space-y-3">
                <div className="text-xs text-slate-700 bg-red-50/60 border border-red-200 p-3 rounded-xl space-y-1.5">
                  <div>
                    <b>Ngân hàng / STK:</b> {previewQr.bankCode} · <b>{previewQr.bankAccount}</b>
                  </div>
                  <div>
                    <b>Chủ tài khoản:</b> {previewQr.bankOwner}
                  </div>
                  <div>
                    <b>Số tiền cần khớp:</b>{' '}
                    <span className="text-red-600 font-extrabold text-sm">{fmtMoney(previewQr.amount)}</span>
                  </div>
                  <div>
                    <b>Nội dung CK chuẩn:</b>{' '}
                    <span className="font-mono font-bold text-slate-900 bg-white px-1.5 py-0.5 rounded border">
                      {previewQr.transferContent}
                    </span>
                  </div>
                </div>
                <img
                  src={previewQr.qrUrl}
                  alt={previewQr.txCode}
                  className="w-48 mx-auto rounded-xl border"
                />
              </div>
            </div>

            {previewQr.status === 'PENDING' && (
              <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
                <button
                  disabled={busyIntentId === previewQr.id}
                  onClick={() => handleCancelIntent(previewQr)}
                  className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-sm font-semibold"
                >
                  Từ chối / Hủy phiếu
                </button>
                <button
                  disabled={busyIntentId === previewQr.id}
                  onClick={() => handleConfirmIntent(previewQr)}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {previewQr.purpose === 'MAINTENANCE_FEE'
                    ? 'Xác nhận đã nhận tiền & Gia hạn quỹ +1 tháng'
                    : `Xác nhận đã nhận tiền & Cộng ${fmtMoney(previewQr.amount)} vào ví`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" /> Tổng Nạp ví (+)
          </div>
          <div className="text-xl font-bold text-emerald-700 mt-1">{fmtMoney(totalTopup)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-red-200 shadow-sm">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <ArrowUpRight className="w-4 h-4 text-red-600" /> Tổng Chiết khấu (-)
          </div>
          <div className="text-xl font-bold text-red-600 mt-1">-{fmtMoney(totalCommission)}</div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <SlidersHorizontal className="w-4 h-4 text-amber-600" /> Tổng Điều chỉnh
          </div>
          <div className="text-xl font-bold text-amber-700 mt-1">
            {totalAdjust > 0 ? '+' : ''}
            {fmtMoney(totalAdjust)}
          </div>
        </div>
        <div className="bg-white p-4 rounded-xl border shadow-sm">
          <div className="text-xs text-slate-500">Biến động ròng sổ cái ({filtered.length} GD)</div>
          <div className={`text-xl font-bold mt-1 ${netDelta >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
            {netDelta > 0 ? '+' : ''}
            {fmtMoney(netDelta)}
          </div>
        </div>
      </div>

      <div className="bg-white p-4 rounded-xl border shadow-sm flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'ALL', label: 'Tất cả' },
            { id: 'TOPUP', label: 'Nạp ví' },
            { id: 'COMMISSION', label: 'Chiết khấu' },
            { id: 'ADJUSTMENT', label: 'Điều chỉnh' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTypeFilter(t.id);
                loadLedger(t.id, dateFrom, dateTo);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                typeFilter === t.id
                  ? 'bg-red-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-red-50 hover:text-red-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs ml-auto flex-wrap">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              loadLedger(typeFilter, e.target.value, dateTo);
            }}
            className="border rounded-lg px-2.5 py-1.5"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              loadLedger(typeFilter, dateFrom, e.target.value);
            }}
            className="border rounded-lg px-2.5 py-1.5"
          />
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-2" />
            <input
              className="pl-8 pr-3 py-1.5 border rounded-lg text-xs w-56"
              placeholder="Tìm SĐT tài xế, mã chuyến..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="bg-slate-100 text-slate-600 text-xs uppercase">
            <tr>
              <th className="p-3">Thời gian</th>
              <th className="p-3">Tài xế</th>
              <th className="p-3">Loại GD</th>
              <th className="p-3">Chuyến liên quan</th>
              <th className="p-3 text-right">Số tiền</th>
              <th className="p-3 text-right">Số dư sau GD</th>
              <th className="p-3">Ghi chú / Người thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((tx) => {
              const meta = WALLET_TX_META[tx.type] || { label: tx.type, cls: 'bg-slate-100 text-slate-700' };
              return (
                <tr key={tx.id} className="hover:bg-slate-50">
                  <td className="p-3 text-xs text-slate-500 whitespace-nowrap">{fmtDateTime(tx.createdAt)}</td>
                  <td className="p-3">
                    <div className="font-semibold text-slate-900">{tx.wallet?.driver?.name || '—'}</div>
                    <div className="text-xs text-slate-500">{tx.wallet?.driver?.phone}</div>
                  </td>
                  <td className="p-3 whitespace-nowrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${meta.cls}`}>
                      {meta.label}
                    </span>
                  </td>
                  <td className="p-3 text-xs">
                    {tx.trip ? (
                      <>
                        <div className="font-mono font-semibold text-slate-800">{tx.trip.code}</div>
                        <div className="text-slate-500">
                          {tx.trip.distanceKm ?? '—'} km · {fmtMoney(tx.trip.finalPrice)}
                        </div>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td
                    className={`p-3 text-right font-bold whitespace-nowrap ${
                      tx.amount >= 0 ? 'text-emerald-600' : 'text-red-600'
                    }`}
                  >
                    {tx.amount >= 0 ? '+' : ''}
                    {fmtMoney(tx.amount)}
                  </td>
                  <td className="p-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                    {fmtMoney(tx.balanceAfter)}
                  </td>
                  <td className="p-3 text-xs max-w-xs">
                    <div className="text-slate-700">{tx.note || '—'}</div>
                    <div className="text-[11px] text-slate-400">
                      Bởi: {tx.admin ? tx.admin.name || tx.admin.username : 'Tự động hệ thống'}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400">
                  Không có giao dịch ví nào trong khoảng lọc này.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
