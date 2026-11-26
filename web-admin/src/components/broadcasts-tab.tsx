import React, { useEffect, useState } from 'react';
import {
  Megaphone,
  Send,
  Users,
  Car,
  Sparkles,
  Rocket,
  Bell,
  Trash2,
  Copy,
  ExternalLink,
  CheckCircle2,
  Smartphone,
  RefreshCw,
} from 'lucide-react';
import { apiFetch, fmtDateTime } from '../api';

type Target = 'ALL' | 'CUSTOMERS' | 'DRIVERS' | 'ACTIVE_DRIVERS';
type Category = 'PROMO' | 'UPDATE' | 'SYSTEM' | 'GENERAL';

interface AudienceStats {
  allCustomers: number;
  allDrivers: number;
  activeDrivers: number;
  onlineDrivers: number;
  totalAll: number;
  customerPushReady: number;
  driverPushReady: number;
  fcmConfigured?: boolean;
}

const TARGET_META: Record<Target, { label: string; short: string; color: string }> = {
  ALL: { label: 'Toàn bộ (Khách + Tài xế)', short: 'Tất cả', color: 'bg-red-100 text-red-700' },
  CUSTOMERS: { label: 'Tất cả Khách hàng', short: 'Khách hàng', color: 'bg-blue-100 text-blue-700' },
  DRIVERS: { label: 'Tất cả Tài xế', short: 'Tất cả Tài xế', color: 'bg-amber-100 text-amber-800' },
  ACTIVE_DRIVERS: {
    label: 'Tài xế đang hoạt động (ACTIVE)',
    short: 'Tài xế ACTIVE',
    color: 'bg-emerald-100 text-emerald-800',
  },
};

const CATEGORY_META: Record<Category, { label: string; badge: string; emoji: string }> = {
  PROMO: { label: 'Khuyến mại / Ưu đãi', badge: 'bg-rose-100 text-rose-700 border-rose-200', emoji: '🎁' },
  UPDATE: { label: 'Cập nhật ứng dụng', badge: 'bg-indigo-100 text-indigo-700 border-indigo-200', emoji: '🚀' },
  SYSTEM: { label: 'Thông báo vận hành', badge: 'bg-amber-100 text-amber-800 border-amber-200', emoji: '📢' },
  GENERAL: { label: 'Thông báo chung', badge: 'bg-slate-100 text-slate-700 border-slate-200', emoji: '🔔' },
};

const TEMPLATES: Array<{
  name: string;
  target: Target;
  category: Category;
  title: string;
  body: string;
  showPopup: boolean;
  actionUrl: string;
}> = [
  {
    name: '🎁 Khuyến mại cuối tuần (Khách)',
    target: 'CUSTOMERS',
    category: 'PROMO',
    title: 'Ưu đãi cuối tuần NOW Thái Nguyên 🎉',
    body: 'Uống có trách nhiệm – Về nhà an toàn! Đặt lái xe hộ NOW Thái Nguyên cuối tuần này để nhận ưu đãi hấp dẫn. Gọi hotline 0973.521.456 hoặc đặt trực tiếp trên app!',
    showPopup: true,
    actionUrl: '',
  },
  {
    name: '🚀 Mời cập nhật phiên bản mới',
    target: 'ALL',
    category: 'UPDATE',
    title: 'Đã có bản cập nhật mới NOW Thái Nguyên 🚀',
    body: 'Phiên bản mới đã sẵn sàng với chuông báo nhận đơn rõ hơn, định vị chính xác hơn và nhiều cải tiến mới. Bấm mở trang tải để cập nhật ngay (giữ nguyên tài khoản).',
    showPopup: true,
    actionUrl: 'https://now.tuannv.site/apk/',
  },
  {
    name: '💰 Thưởng doanh thu Tài xế',
    target: 'ACTIVE_DRIVERS',
    category: 'PROMO',
    title: 'Chương trình thưởng Tài xế NOW Thái Nguyên 💰',
    body: 'Bật Trực tuyến khung giờ vàng 19h–23h cuối tuần để tăng thu nhập! Các tài xế hoàn thành tốt, không bỏ đơn sẽ được tổng đài ưu tiên điều phối và thưởng nóng vào ví.',
    showPopup: true,
    actionUrl: '',
  },
  {
    name: '📢 Thông báo vận hành / Lễ Tết',
    target: 'ALL',
    category: 'SYSTEM',
    title: 'Thông báo lịch hoạt động NOW Thái Nguyên 📢',
    body: 'Hệ thống Lái Xe Hộ NOW Thái Nguyên phục vụ 24/7. Mọi nhu cầu hỗ trợ khẩn cấp hoặc đặt xe hộ cho người thân, vui lòng liên hệ tổng đài 0973.521.456.',
    showPopup: false,
    actionUrl: '',
  },
];

export function BroadcastsTab({ onNotify }: { onNotify: (msg: string) => void }) {
  const [stats, setStats] = useState<AudienceStats | null>(null);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [target, setTarget] = useState<Target>('ALL');
  const [category, setCategory] = useState<Category>('PROMO');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [actionUrl, setActionUrl] = useState('');
  const [showPopup, setShowPopup] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [st, list] = await Promise.all([
        apiFetch('/admin/broadcasts/audience-stats'),
        apiFetch('/admin/broadcasts'),
      ]);
      setStats(st);
      setCampaigns(list || []);
    } catch (e: any) {
      onNotify(`Lỗi tải dữ liệu thông báo: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const targetCount = (t: Target): number => {
    if (!stats) return 0;
    if (t === 'ALL') return stats.totalAll;
    if (t === 'CUSTOMERS') return stats.allCustomers;
    if (t === 'DRIVERS') return stats.allDrivers;
    return stats.activeDrivers;
  };

  const applyTemplate = (tpl: (typeof TEMPLATES)[number]) => {
    setTarget(tpl.target);
    setCategory(tpl.category);
    setTitle(tpl.title);
    setBody(tpl.body);
    setShowPopup(tpl.showPopup);
    setActionUrl(tpl.actionUrl);
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const count = targetCount(target);
    if (count === 0) {
      onNotify('Nhóm đối tượng đã chọn hiện chưa có tài khoản nào.');
      return;
    }
    const ok = window.confirm(
      `Xác nhận gửi thông báo "${title.trim()}" tới ${count} người (${TARGET_META[target].label})?${
        showPopup ? '\n\n⚠️ Đã bật hiện hộp thoại Popup nổi bật trên màn hình app.' : ''
      }`,
    );
    if (!ok) return;

    setSending(true);
    try {
      const res = await apiFetch('/admin/broadcasts', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          target,
          category,
          showPopup,
          actionUrl: actionUrl.trim() || undefined,
        }),
      });
      onNotify(
        `📢 Đã gửi thông báo thành công tới ${res.recipientCount} tài khoản (${res.customerCount} khách hàng, ${res.driverCount} tài xế)!`,
      );
      setTitle('');
      setBody('');
      setActionUrl('');
      await loadAll();
    } catch (err: any) {
      onNotify(`Lỗi gửi thông báo: ${err.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleRetract = async (camp: any) => {
    const ok = window.confirm(
      `Thu hồi thông báo "${camp.title}"?\nThao tác này sẽ xóa thông báo khỏi hộp thư và đóng popup đang mở trên máy người dùng.`,
    );
    if (!ok) return;
    try {
      await apiFetch(`/admin/broadcasts/${camp.id}`, { method: 'DELETE' });
      onNotify(`Đã thu hồi chiến dịch "${camp.title}".`);
      await loadAll();
    } catch (err: any) {
      onNotify(`Lỗi thu hồi: ${err.message}`);
    }
  };

  const catInfo = CATEGORY_META[category];
  const estimatedReach = targetCount(target);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-red-600" /> Gửi thông báo hàng loạt (Khuyến mại & Cập nhật)
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gửi tin nhắn tức thì tới Khách hàng & Tài xế — lưu vĩnh viễn trong hộp thư app, bắn banner realtime + thông báo Android và tùy chọn bật Popup nổi bật khi mở app.
          </p>
        </div>
        <button
          onClick={loadAll}
          className="px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Làm mới thống kê
        </button>
      </div>

      {/* Trạng thái Firebase FCM đẩy xuyên màn hình khóa */}
      {stats && (
        <div
          className={`rounded-xl border px-4 py-2.5 text-xs flex flex-wrap items-center justify-between gap-2 ${
            stats.fcmConfigured
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="font-semibold">
            {stats.fcmConfigured ? (
              <>
                🟢 <b>Firebase FCM đã kích hoạt:</b> Gửi thông báo xuyên màn hình khóa kể cả khi khách/tài xế đã tắt hẳn app.
              </>
            ) : (
              <>
                🟡 <b>Chưa gắn Firebase Service Account:</b> Hiện gửi tức thì qua Realtime khi mở app + tự hiện Popup lần mở sau. Gắn file <code className="px-1 py-0.5 bg-white/80 rounded">google-services.json</code> &amp; <code className="px-1 py-0.5 bg-white/80 rounded">firebase-service-account.json</code> để bật đẩy xuyên màn hình khóa.
              </>
            )}
          </div>
          <div className="text-[11px] font-bold">
            Thiết bị đã gắn Push Token: {stats.customerPushReady} KH · {stats.driverPushReady} TX
          </div>
        </div>
      )}

      {/* Chọn nhanh nhóm đối tượng + số lượng thực tế */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {(
          [
            { id: 'ALL', label: 'Toàn bộ hệ thống', sub: 'Khách hàng + Tài xế', icon: Megaphone, val: stats?.totalAll ?? 0 },
            { id: 'CUSTOMERS', label: 'Tất cả Khách hàng', sub: 'Gửi khuyến mại đặt xe', icon: Users, val: stats?.allCustomers ?? 0 },
            { id: 'DRIVERS', label: 'Tất cả Tài xế', sub: 'Gồm cả đang chờ duyệt', icon: Car, val: stats?.allDrivers ?? 0 },
            {
              id: 'ACTIVE_DRIVERS',
              label: 'Tài xế đang hoạt động',
              sub: `Đang trực tuyến: ${stats?.onlineDrivers ?? 0}`,
              icon: CheckCircle2,
              val: stats?.activeDrivers ?? 0,
            },
          ] as const
        ).map((card) => {
          const Icon = card.icon;
          const active = target === card.id;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => setTarget(card.id)}
              className={`text-left p-4 rounded-xl border-2 transition shadow-sm ${
                active
                  ? 'border-red-600 bg-red-50/70'
                  : 'border-slate-200 bg-white hover:border-red-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{card.label}</span>
                <Icon className={`w-4 h-4 ${active ? 'text-red-600' : 'text-slate-400'}`} />
              </div>
              <div className={`text-2xl font-black mt-1 ${active ? 'text-red-600' : 'text-slate-900'}`}>
                {card.val}
                <span className="text-xs font-semibold text-slate-500 ml-1">tài khoản</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{card.sub}</div>
            </button>
          );
        })}
      </div>

      {/* Mẫu soạn nhanh */}
      <div className="bg-white rounded-xl border shadow-sm p-4 space-y-2.5">
        <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-amber-500" /> Mẫu thông báo có sẵn (bấm để điền nhanh rồi chỉnh sửa):
        </div>
        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((tpl) => (
            <button
              key={tpl.name}
              type="button"
              onClick={() => applyTemplate(tpl)}
              className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-red-50 hover:text-red-700 border border-slate-200 hover:border-red-200 text-xs font-semibold text-slate-700 transition"
            >
              {tpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Soạn thảo + Xem trước giao diện trên điện thoại */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <form onSubmit={handleSend} className="xl:col-span-2 bg-white p-5 rounded-xl border shadow-sm space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nhóm người nhận *</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
                value={target}
                onChange={(e) => setTarget(e.target.value as Target)}
              >
                <option value="ALL">Toàn bộ Khách hàng + Tài xế ({stats?.totalAll ?? 0})</option>
                <option value="CUSTOMERS">Chỉ Khách hàng ({stats?.allCustomers ?? 0})</option>
                <option value="DRIVERS">Tất cả Tài xế ({stats?.allDrivers ?? 0})</option>
                <option value="ACTIVE_DRIVERS">Chỉ Tài xế đang hoạt động ({stats?.activeDrivers ?? 0})</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Phân loại chiến dịch *</label>
              <select
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
                value={category}
                onChange={(e) => setCategory(e.target.value as Category)}
              >
                <option value="PROMO">🎁 Khuyến mại / Ưu đãi</option>
                <option value="UPDATE">🚀 Cập nhật ứng dụng</option>
                <option value="SYSTEM">📢 Thông báo vận hành / Nghỉ lễ</option>
                <option value="GENERAL">🔔 Thông báo chung</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Tiêu đề thông báo * <span className="font-normal text-slate-400">({title.length}/140)</span>
            </label>
            <input
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm font-semibold focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
              placeholder="VD: Giảm 20% cước lái xe hộ cuối tuần này!"
              maxLength={140}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nội dung chi tiết * <span className="font-normal text-slate-400">({body.length}/2000)</span>
            </label>
            <textarea
              rows={4}
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2.5 text-sm leading-relaxed focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
              placeholder="Nhập chi tiết chương trình khuyến mại, hướng dẫn cập nhật, mã ưu đãi hoặc thông báo quan trọng..."
              maxLength={2000}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Đường dẫn đính kèm khi bấm vào (tùy chọn)
            </label>
            <input
              type="url"
              className="w-full border border-slate-200 rounded-lg px-3.5 py-2 text-sm font-mono focus:ring-2 focus:ring-red-200 focus:border-red-500 outline-none"
              placeholder="VD: https://now.tuannv.site/apk/ hoặc link bài viết Facebook/Zalo"
              value={actionUrl}
              onChange={(e) => setActionUrl(e.target.value)}
            />
          </div>

          <label className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer">
            <input
              type="checkbox"
              checked={showPopup}
              onChange={(e) => setShowPopup(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-red-600"
            />
            <div className="text-xs leading-relaxed">
              <div className="font-bold text-amber-950">
                Hiện hộp thoại nổi bật (Popup) ngay trên màn hình app
              </div>
              <div className="text-amber-800">
                Nếu bật: máy đang mở sẽ hiện Popup ngay lập tức; máy đang tắt sẽ tự hiện Popup ngay lần tiếp theo khách/tài xế mở app cho tới khi họ bấm "Đã hiểu".
              </div>
            </div>
          </label>

          <div className="flex items-center justify-between gap-3 pt-1">
            <div className="text-xs text-slate-500">
              Dự kiến gửi tới: <b className="text-red-600 text-sm">{estimatedReach}</b> tài khoản (
              {TARGET_META[target].short})
            </div>
            <button
              type="submit"
              disabled={sending || estimatedReach === 0}
              className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-md shadow-red-200 transition"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Đang gửi...' : `Gửi ngay tới ${estimatedReach} người`}
            </button>
          </div>
        </form>

        {/* Xem trước trực quan trên điện thoại */}
        <div className="bg-slate-900 rounded-2xl p-4 text-white space-y-4 shadow-lg border border-slate-800 h-fit">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5 font-semibold text-slate-200">
              <Smartphone className="w-4 h-4 text-red-400" /> Xem trước trên điện thoại
            </span>
            <span>NOW Thái Nguyên</span>
          </div>

          {/* Preview 1: Thanh thông báo Android */}
          <div className="space-y-1.5">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
              1. Thông báo thanh trạng thái / Banner
            </div>
            <div className="bg-white text-slate-900 rounded-2xl p-3 shadow flex items-start gap-2.5">
              <img src="/logo-now-tn.png" alt="NOW" className="w-9 h-9 rounded-xl shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-red-600 uppercase">NOW Thái Nguyên</span>
                  <span className="text-[10px] text-slate-400">Vừa xong</span>
                </div>
                <div className="text-xs font-extrabold truncate">
                  {title.trim() || 'Tiêu đề thông báo sẽ hiện ở đây'}
                </div>
                <div className="text-[11px] text-slate-600 line-clamp-2 mt-0.5">
                  {body.trim() || 'Nội dung ngắn gọn hiển thị ngay trên thanh thông báo Android...'}
                </div>
              </div>
            </div>
          </div>

          {/* Preview 2: Hộp thoại Popup nổi bật */}
          {showPopup && (
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">
                2. Hộp thoại Popup nổi bật trong App
              </div>
              <div className="bg-white text-slate-900 rounded-2xl overflow-hidden shadow-xl">
                <div className="bg-gradient-to-r from-red-700 to-red-600 p-3.5 text-white">
                  <div className="text-[10px] font-extrabold text-amber-200 uppercase tracking-wider">
                    {catInfo.emoji} {catInfo.label}
                  </div>
                  <div className="text-sm font-black mt-0.5 leading-snug">
                    {title.trim() || 'Tiêu đề chương trình khuyến mại / cập nhật'}
                  </div>
                </div>
                <div className="p-3.5 space-y-3">
                  <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                    {body.trim() || 'Nội dung thông báo chi tiết sẽ hiện tại đây khi người dùng mở ứng dụng.'}
                  </p>
                  {actionUrl.trim() && (
                    <div className="w-full py-2 rounded-xl bg-red-600 text-white text-xs font-bold text-center flex items-center justify-center gap-1">
                      <ExternalLink className="w-3.5 h-3.5" /> Xem chi tiết ngay
                    </div>
                  )}
                  <div className="w-full py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold text-center">
                    Đã hiểu
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Lịch sử các chiến dịch đã gửi */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-4 h-4 text-red-600" /> Lịch sử thông báo đã gửi ({campaigns.length})
          </h2>
          <span className="text-xs text-slate-500">Theo dõi trực tiếp số lượt đã mở đọc</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-100 text-slate-600 uppercase">
              <tr>
                <th className="p-3">Thời gian</th>
                <th className="p-3">Phân loại / Nhóm nhận</th>
                <th className="p-3">Tiêu đề & Nội dung</th>
                <th className="p-3 text-center">Đã đọc / Đã gửi</th>
                <th className="p-3 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {campaigns.map((c) => {
                const cm = CATEGORY_META[(c.category as Category) || 'GENERAL'] || CATEGORY_META.GENERAL;
                const tm = TARGET_META[(c.target as Target) || 'ALL'] || TARGET_META.ALL;
                return (
                  <tr key={c.id} className="hover:bg-slate-50 align-top">
                    <td className="p-3 whitespace-nowrap text-slate-600">
                      <div className="font-semibold text-slate-800">{fmtDateTime(c.createdAt)}</div>
                      <div className="text-[11px] text-slate-400">
                        Bởi: {c.createdByAdmin?.name || c.createdByAdmin?.username || 'Admin'}
                      </div>
                    </td>
                    <td className="p-3 whitespace-nowrap space-y-1.5">
                      <div>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold border ${cm.badge}`}>
                          {cm.emoji} {cm.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${tm.color}`}>
                          {tm.short}
                        </span>
                        {c.showPopup && (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            Popup
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 max-w-md">
                      <div className="font-bold text-slate-900">{c.title}</div>
                      <div className="text-slate-600 mt-0.5 whitespace-pre-line line-clamp-3">{c.body}</div>
                      {c.actionUrl && (
                        <a
                          href={c.actionUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-1 font-mono"
                        >
                          <ExternalLink className="w-3 h-3" /> {c.actionUrl}
                        </a>
                      )}
                    </td>
                    <td className="p-3 text-center whitespace-nowrap">
                      <div className="font-bold text-slate-900">
                        <span className="text-emerald-700">{c.readCount ?? 0}</span> / {c.recipientCount}
                        <span className="text-slate-400 font-normal ml-1">({c.readRate ?? 0}%)</span>
                      </div>
                      <div className="w-24 h-1.5 bg-slate-200 rounded-full overflow-hidden mx-auto mt-1">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.min(100, c.readRate ?? 0)}%` }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {c.customerCount} KH · {c.driverCount} TX
                      </div>
                    </td>
                    <td className="p-3 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setTarget(c.target as Target);
                            setCategory((c.category as Category) || 'GENERAL');
                            setTitle(c.title);
                            setBody(c.body);
                            setShowPopup(Boolean(c.showPopup));
                            setActionUrl(c.actionUrl || '');
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          title="Dùng lại nội dung này"
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold inline-flex items-center gap-1"
                        >
                          <Copy className="w-3.5 h-3.5" /> Dùng lại
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRetract(c)}
                          title="Thu hồi & xóa thông báo khỏi máy người dùng"
                          className="px-2.5 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-700 font-semibold inline-flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Thu hồi
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {campaigns.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-slate-400">
                    <Rocket className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    Chưa có chiến dịch thông báo nào được gửi. Hãy chọn mẫu ở trên để gửi thông báo đầu tiên!
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
