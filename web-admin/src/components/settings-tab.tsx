import React from 'react';
import { History, Save } from 'lucide-react';
import { fmtDateTime } from '../api';

const SETTING_GROUPS: Array<{
  title: string;
  fields: Array<{ key: string; label: string; type?: 'text' | 'number' | 'select'; options?: string[] }>;
}> = [
  {
    title: 'Bảng giá & Khung giờ',
    fields: [
      { key: 'day_start', label: 'Giờ bắt đầu ban ngày (HH:mm)' },
      { key: 'night_start', label: 'Giờ bắt đầu ban đêm (HH:mm)' },
      { key: 'base_km', label: 'Mốc km giá mở cửa (km)', type: 'number' },
      { key: 'day_base', label: 'Giá mở cửa ban ngày (VNĐ)', type: 'number' },
      { key: 'day_per_km', label: 'Đơn giá/km ban ngày (VNĐ)', type: 'number' },
      { key: 'night_base', label: 'Giá mở cửa ban đêm (VNĐ)', type: 'number' },
      { key: 'night_per_km', label: 'Đơn giá/km ban đêm (VNĐ)', type: 'number' },
      { key: 'distance_round_step', label: 'Bước làm tròn km (vd 0.1)', type: 'number' },
    ],
  },
  {
    title: 'Chiết khấu, Điều phối mở rộng & Khóa nhận đơn',
    fields: [
      { key: 'commission_type', label: 'Loại chiết khấu', type: 'select', options: ['PERCENT', 'FIXED'] },
      { key: 'commission_value', label: 'Giá trị chiết khấu (% hoặc VNĐ)', type: 'number' },
      { key: 'radius_km', label: 'Bán kính tìm tài xế vòng 1 (km)', type: 'number' },
      { key: 'radius_steps_km', label: 'Các vòng bán kính mở rộng (km, vd 3,6,10)' },
      { key: 'offer_timeout_sec', label: 'Thời gian chờ tài xế xác nhận (giây)', type: 'number' },
      { key: 'lock_minutes', label: 'Thời gian khóa khi bỏ qua đơn (phút)', type: 'number' },
    ],
  },
  {
    title: 'Ví tài xế, Phí duy trì & Tài khoản VietQR MB Bank',
    fields: [
      { key: 'min_wallet_balance', label: 'Số dư ví tối thiểu để nhận đơn (VNĐ)', type: 'number' },
      { key: 'maintenance_fee', label: 'Mức phí duy trì hàng tháng (VNĐ)', type: 'number' },
      { key: 'remind_days_before', label: 'Số ngày nhắc phí trước hạn', type: 'number' },
      { key: 'bank_code', label: 'Mã ngân hàng VietQR (vd: MB)' },
      { key: 'bank_name', label: 'Tên ngân hàng (vd: MB Bank)' },
      { key: 'bank_account', label: 'Số tài khoản nhận tiền' },
      { key: 'bank_owner', label: 'Tên chủ tài khoản (IN HOA không dấu)' },
      { key: 'hotline', label: 'Hotline Tổng đài / Hỗ trợ SOS' },
      { key: 'public_track_base_url', label: 'Tên miền công khai chia sẻ hành trình (vd: https://now.tuannv.site)' },
      { key: 'bank_info', label: 'Mô tả tài khoản hiển thị trên App' },
    ],
  },
];

export function SettingsTab({
  settings,
  auditLogs,
  onChange,
  onSave,
}: {
  settings: Record<string, string>;
  auditLogs: any[];
  onChange: (next: Record<string, string>) => void;
  onSave: (e: React.FormEvent) => void;
}) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <form onSubmit={onSave} className="bg-white p-6 rounded-xl shadow-sm border space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Cấu hình Bảng giá & Điều phối</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Mọi thay đổi chỉ áp dụng cho đơn mới; đơn đang chạy giữ nguyên bảng giá khóa lúc đặt.
            </p>
          </div>
          <button className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 shrink-0 shadow-sm">
            <Save className="w-4 h-4" /> Lưu cấu hình
          </button>
        </div>

        {SETTING_GROUPS.map((group) => (
          <div key={group.title} className="space-y-2.5 border-t pt-4 first:border-t-0 first:pt-0">
            <h2 className="text-sm font-bold text-red-700">{group.title}</h2>
            {group.fields.map((f) => (
              <div key={f.key} className="grid grid-cols-1 sm:grid-cols-2 items-center gap-2 text-sm">
                <label className="text-slate-700">{f.label}</label>
                {f.type === 'select' ? (
                  <select
                    className="border rounded-lg px-3 py-1.5 bg-white"
                    value={settings[f.key] ?? f.options?.[0] ?? ''}
                    onChange={(e) => onChange({ ...settings, [f.key]: e.target.value })}
                  >
                    {f.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt === 'PERCENT' ? 'Phần trăm (%)' : 'Số tiền cố định (VNĐ)'}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="border rounded-lg px-3 py-1.5"
                    value={settings[f.key] ?? ''}
                    onChange={(e) => onChange({ ...settings, [f.key]: e.target.value })}
                  />
                )}
              </div>
            ))}
          </div>
        ))}
      </form>

      <div className="bg-white p-6 rounded-xl shadow-sm border space-y-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <History className="w-5 h-5 text-red-600" /> Nhật ký thao tác (Audit Logs)
        </h2>
        <div className="space-y-3 max-h-[680px] overflow-y-auto text-xs">
          {auditLogs.map((log) => (
            <div key={log.id} className="p-3 bg-slate-50 rounded-xl border space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-800">{log.action}</span>
                <span className="text-slate-400">{fmtDateTime(log.createdAt)}</span>
              </div>
              <div className="text-slate-600">Thực hiện bởi: <b>{log.admin?.name || log.admin?.username}</b></div>
              {(log.before || log.after) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 font-mono text-[11px]">
                  {log.before && (
                    <pre className="bg-rose-50 text-rose-900 p-2 rounded overflow-x-auto max-h-28">
                      Trước: {JSON.stringify(log.before, null, 2)}
                    </pre>
                  )}
                  {log.after && (
                    <pre className="bg-emerald-50 text-emerald-900 p-2 rounded overflow-x-auto max-h-28">
                      Sau: {JSON.stringify(log.after, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))}
          {auditLogs.length === 0 && <div className="text-slate-400">Chưa có nhật ký thay đổi.</div>}
        </div>
      </div>
    </div>
  );
}
