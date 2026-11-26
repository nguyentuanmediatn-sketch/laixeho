import {
  AlertTriangle,
  BellRing,
  Calendar,
  CheckCircle2,
  Clock,
  Landmark,
  Users,
  Wallet,
} from 'lucide-react';
import { fmtMoney } from '../api';

interface DashboardTabProps {
  stats: any;
  dateFrom: string;
  dateTo: string;
  onChangeRange: (from: string, to: string) => void;
  onQuickRange: (preset: 'today' | '7d' | 'month' | 'all') => void;
  onGoToTrips: () => void;
  onGoToDrivers: () => void;
  onGoToFinance: () => void;
  onRunMaintenanceCheck: () => void;
}

export function DashboardTab({
  stats,
  dateFrom,
  dateTo,
  onChangeRange,
  onQuickRange,
  onGoToTrips,
  onGoToDrivers,
  onGoToFinance,
  onRunMaintenanceCheck,
}: DashboardTabProps) {
  if (!stats) return <div className="text-slate-500 text-sm">Đang tải thống kê...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Tổng quan vận hành · NOW Thái Nguyên</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Theo dõi doanh thu chuyến đi, chiết khấu, số dư ví ký quỹ đội xe và cảnh báo điều phối thời gian thực
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 bg-white p-2 rounded-xl border shadow-sm text-sm">
          <Calendar className="w-4 h-4 text-red-500 ml-1" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => onChangeRange(e.target.value, dateTo)}
            className="border rounded px-2 py-1 text-xs"
          />
          <span className="text-slate-400">→</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => onChangeRange(dateFrom, e.target.value)}
            className="border rounded px-2 py-1 text-xs"
          />
          {[
            { id: 'today', label: 'Hôm nay' },
            { id: '7d', label: '7 ngày' },
            { id: 'month', label: 'Tháng này' },
            { id: 'all', label: 'Tất cả' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => onQuickRange(p.id as any)}
              className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-700 font-medium transition"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Hàng 1: Vận hành & Doanh thu */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Tổng số chuyến"
          value={stats.totalTrips}
          sub={`Hoàn thành: ${stats.completedTrips} · Đang chạy: ${stats.activeTrips ?? 0} · Hủy: ${stats.cancelledTrips ?? 0}`}
        />
        <StatCard
          title="Tổng tiền chuyến (GMV)"
          value={fmtMoney(stats.totalRevenue)}
          sub={`TB/chuyến: ${fmtMoney(stats.avgTripValue ?? 0)}`}
          accent="text-emerald-700"
        />
        <StatCard
          title="Tổng chiết khấu hệ thống"
          value={fmtMoney(stats.totalCommission)}
          sub="Khấu trừ tự động từ ví tài xế"
          accent="text-red-600"
          border="border-red-200"
        />
        <StatCard
          title="Phí duy trì đã thu"
          value={fmtMoney(stats.totalMaintenanceCollected)}
          sub={`Đang quá hạn: ${stats.overdueFees} tài xế`}
          accent="text-amber-700"
        />
      </div>

      {/* Hàng 2: Đối soát dòng tiền Ví ký quỹ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-red-100 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tổng số dư ví toàn đội xe
            </div>
            <div className="text-2xl font-extrabold text-slate-900 mt-1">
              {fmtMoney(stats.totalDriverWalletBalance ?? 0)}
            </div>
            <div className="text-xs text-slate-500 mt-1">Nghĩa vụ ký quỹ hiện hành</div>
          </div>
          <button
            onClick={onGoToFinance}
            className="p-2.5 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 transition"
            title="Mở sổ cái đối soát ví"
          >
            <Landmark className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tổng nạp ví trong kỳ
            </div>
            <div className="text-2xl font-extrabold text-emerald-700 mt-1">
              +{fmtMoney(stats.totalTopups ?? 0)}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Điều chỉnh thủ công: {fmtMoney(stats.totalAdjustments ?? 0)}
            </div>
          </div>
          <button
            onClick={onGoToFinance}
            className="text-xs text-red-600 font-semibold hover:underline flex items-center gap-1"
          >
            <Wallet className="w-4 h-4" /> Đối soát
          </button>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BellRing className="w-9 h-9 text-red-600 bg-red-50 p-2 rounded-xl" />
            <div>
              <div className="text-xs font-semibold text-slate-700">Nhắc phí duy trì tự động</div>
              <div className="text-xs text-slate-500">Quét định kỳ 08:00 mỗi sáng</div>
            </div>
          </div>
          <button
            onClick={onRunMaintenanceCheck}
            className="px-3.5 py-2 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm"
          >
            Quét nhắc ngay
          </button>
        </div>
      </div>

      {/* Hàng 3: Đội ngũ tài xế */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white p-4 rounded-xl border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Users className="w-8 h-8 text-emerald-600 bg-emerald-50 p-1.5 rounded-lg" />
            <div>
              <div className="text-xs text-slate-500">Tài xế đang hoạt động</div>
              <div className="text-xl font-bold">{stats.activeDrivers}</div>
            </div>
          </div>
          <button onClick={onGoToDrivers} className="text-xs text-red-600 font-semibold hover:underline">
            Xem danh sách →
          </button>
        </div>

        <div className="bg-white p-4 rounded-xl border flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Clock className="w-8 h-8 text-amber-600 bg-amber-50 p-1.5 rounded-lg" />
            <div>
              <div className="text-xs text-slate-500">Hồ sơ tài xế chờ duyệt</div>
              <div className="text-xl font-bold">{stats.pendingDrivers ?? 0}</div>
            </div>
          </div>
          <button onClick={onGoToDrivers} className="text-xs text-red-600 font-semibold hover:underline">
            Duyệt ngay →
          </button>
        </div>
      </div>

      {stats.noDriverCount > 0 ? (
        <div className="p-4 bg-red-50 border border-red-300 rounded-xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-red-900 text-sm">
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-600" />
            <span>
              Có <b>{stats.noDriverCount}</b> đơn chưa tìm được tài xế (NO_DRIVER) cần điều phối viên gán tay hoặc tìm lại ngay.
            </span>
          </div>
          <button
            onClick={onGoToTrips}
            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg shrink-0"
          >
            Xử lý đơn NO_DRIVER
          </button>
        </div>
      ) : (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3 text-emerald-800 text-sm">
          <CheckCircle2 className="w-5 h-5" />
          Hệ thống vận hành ổn định — hiện không có đơn tồn đọng thiếu tài xế.
        </div>
      )}
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  accent = 'text-slate-900',
  border = 'border-slate-200',
}: {
  title: string;
  value: string | number;
  sub: string;
  accent?: string;
  border?: string;
}) {
  return (
    <div className={`bg-white p-5 rounded-xl shadow-sm border ${border}`}>
      <div className="text-sm text-slate-500 font-medium">{title}</div>
      <div className={`text-2xl font-extrabold mt-1 ${accent}`}>{value}</div>
      <div className="text-xs text-slate-400 mt-1">{sub}</div>
    </div>
  );
}
