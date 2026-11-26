import React, { useState } from 'react';
import { Alert, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { customerApi, fmtMoney, STATUS_LABELS } from '../api';
import { COLORS, GRADIENTS, SHADOW } from '../theme';
import { MediaViewerModal } from './media-viewer-modal';

export function HistoryTab({ history }: { history: any[] }) {
  const [mediaTrip, setMediaTrip] = useState<any>(null);

  return (
    <View style={styles.list}>
      <Text style={styles.pageTitle}>Hoạt động chuyến đi</Text>
      {history.length === 0 && (
        <View style={styles.emptyBox}>
          <Ionicons name="car-outline" size={40} color={COLORS.textLight} />
          <Text style={styles.emptyTxt}>Bạn chưa có chuyến lái xe hộ nào.</Text>
        </View>
      )}
      {history.map((h) => (
        <View key={h.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <Text style={styles.code}>{h.code}</Text>
            <View style={[styles.pill, h.status === 'COMPLETED' && { backgroundColor: COLORS.successSoft }]}>
              <Text style={[styles.pillTxt, h.status === 'COMPLETED' && { color: '#047857' }]}>
                {STATUS_LABELS[h.status] || h.status}
              </Text>
            </View>
          </View>
          <Text style={styles.sub}>
            {new Date(h.orderedAt).toLocaleString('vi-VN')}
            {h.distanceKm != null ? ` · ${h.distanceKm} km · ${h.timeSlot === 'NIGHT' ? 'Ban đêm' : 'Ban ngày'}` : ''}
          </Text>
          <View style={styles.routeMini}>
            <Text style={styles.info} numberOfLines={1}>● {h.pickupAddress}</Text>
            <Text style={styles.info} numberOfLines={1}>● {h.dropoffAddress || '—'}</Text>
          </View>
          <View style={styles.rowBetween}>
            <Text style={styles.price}>{fmtMoney(h.finalPrice ?? h.estimatedPrice ?? 0)}</Text>
            <TouchableOpacity style={styles.mediaChip} onPress={() => setMediaTrip(h)}>
              <Ionicons name="images-outline" size={14} color={COLORS.primary} />
              <Text style={styles.mediaChipTxt}>Ảnh/Video ({h.media?.length ?? 0})</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <MediaViewerModal
        visible={Boolean(mediaTrip)}
        tripCode={mediaTrip?.code}
        media={mediaTrip?.media || []}
        onClose={() => setMediaTrip(null)}
      />
    </View>
  );
}

const BROADCAST_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  PROMO: { label: '🎁 Khuyến mại', bg: '#FFE4E6', fg: '#BE123C' },
  UPDATE: { label: '🚀 Cập nhật', bg: '#E0E7FF', fg: '#3730A3' },
  SYSTEM: { label: '📢 Hệ thống', bg: '#FEF3C7', fg: '#92400E' },
  GENERAL: { label: '🔔 Thông báo', bg: '#F1F5F9', fg: '#334155' },
};

export function NotificationsTab({
  items,
  onMarkRead,
  onMarkAllRead,
}: {
  items: any[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead: () => void;
}) {
  return (
    <View style={styles.list}>
      <View style={styles.rowBetween}>
        <Text style={styles.pageTitle}>Thông báo</Text>
        {items.length > 0 && (
          <TouchableOpacity style={styles.mediaChip} onPress={onMarkAllRead}>
            <Text style={styles.mediaChipTxt}>Đọc tất cả</Text>
          </TouchableOpacity>
        )}
      </View>
      {items.length === 0 && (
        <View style={styles.emptyBox}>
          <Ionicons name="notifications-off-outline" size={38} color={COLORS.textLight} />
          <Text style={styles.emptyTxt}>Chưa có thông báo nào.</Text>
        </View>
      )}
      {items.map((n) => {
        const badge = n?.data?.kind === 'BROADCAST' ? BROADCAST_BADGE[n.data.category || 'GENERAL'] : null;
        const actionUrl = n?.data?.actionUrl as string | undefined;
        return (
          <TouchableOpacity
            key={n.id}
            activeOpacity={0.85}
            onPress={() => {
              if (!n.readAt) onMarkRead?.(n.id);
            }}
            style={[styles.card, !n.readAt && styles.unreadCard]}
          >
            {badge && (
              <View style={{ alignSelf: 'flex-start', backgroundColor: badge.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                <Text style={{ fontSize: 10.5, fontWeight: '800', color: badge.fg }}>{badge.label}</Text>
              </View>
            )}
            <View style={styles.rowBetween}>
              <Text style={[styles.code, { flex: 1 }]}>{n.title}</Text>
              {!n.readAt && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.info}>{n.body}</Text>
            {actionUrl ? (
              <TouchableOpacity
                style={styles.actionLinkBtn}
                onPress={() => {
                  if (!n.readAt) onMarkRead?.(n.id);
                  Linking.openURL(actionUrl).catch(() => undefined);
                }}
              >
                <Ionicons name="open-outline" size={14} color="#FFFFFF" />
                <Text style={styles.actionLinkTxt}>Xem chi tiết</Text>
              </TouchableOpacity>
            ) : null}
            <Text style={styles.sub}>{new Date(n.sentAt).toLocaleString('vi-VN')}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function ProfileTab({
  user,
  onUpdated,
  onLogout,
}: {
  user: any;
  onUpdated: (u: any) => void;
  onLogout: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Lỗi', 'Vui lòng nhập họ tên');
    setSaving(true);
    try {
      const updated = await customerApi('/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim() }),
      });
      onUpdated(updated);
      setEditing(false);
      Alert.alert('Thành công', 'Đã cập nhật họ tên');
    } catch (e: any) {
      Alert.alert('Lỗi', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.list}>
      <Text style={styles.pageTitle}>Tài khoản</Text>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <LinearGradient colors={GRADIENTS.brand} style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarChar}>{(user.name || user.phone || 'K')[0].toUpperCase()}</Text>
            </View>
          </LinearGradient>
          <TouchableOpacity onPress={() => setEditing((v) => !v)}>
            <Text style={styles.editTxt}>{editing ? 'Hủy' : 'Chỉnh sửa'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.userName}>{user.name || 'Khách hàng NOW Thái Nguyên'}</Text>
        <Text style={styles.sub}>{user.phone}</Text>
        <View style={styles.codePill}>
          <Text style={styles.codePillTxt}>MÃ KH: {user.phone}</Text>
        </View>

        {editing && (
          <View style={{ gap: 8, marginTop: 8 }}>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Nhập họ tên"
            />
            <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
              <Text style={styles.saveBtnTxt}>{saving ? 'Đang lưu...' : 'Lưu thông tin'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <LinearGradient
        colors={GRADIENTS.card}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.bannerCard}
      >
        <View style={styles.bannerIcon}>
          <Ionicons name="pricetag" size={20} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerLabel}>BẢNG GIÁ NIÊM YẾT NOW THÁI NGUYÊN</Text>
          <Text style={styles.bannerVal}>Ngày 150.000đ · Đêm 200.000đ</Text>
          <Text style={styles.bannerSub}>5 km đầu tiên · +10k/km (ngày) · +15k/km (đêm)</Text>
        </View>
      </LinearGradient>

      <View style={styles.menuCard}>
        <View style={styles.menuItem}>
          <Ionicons name="shield-checkmark-outline" size={20} color={COLORS.primary} />
          <Text style={styles.menuTxt}>Tài xế đã xác minh CCCD & GPLX</Text>
        </View>
        <View style={styles.menuDivider} />
        <View style={styles.menuItem}>
          <Ionicons name="videocam-outline" size={20} color={COLORS.primary} />
          <Text style={styles.menuTxt}>Chụp ảnh & quay video xe trước khi chạy</Text>
        </View>
        <View style={styles.menuDivider} />
        <TouchableOpacity style={styles.menuItem} onPress={onLogout}>
          <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
          <Text style={[styles.menuTxt, { color: COLORS.danger, fontWeight: '700' }]}>Đăng xuất tài khoản</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 14 },
  pageTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  emptyBox: { backgroundColor: '#fff', borderRadius: 18, padding: 32, alignItems: 'center', gap: 8, ...SHADOW.card },
  emptyTxt: { color: COLORS.textMuted, fontSize: 13 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, gap: 8, ...SHADOW.card },
  unreadCard: { borderLeftWidth: 4, borderLeftColor: COLORS.primary },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.primary },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  pill: { backgroundColor: COLORS.primarySoft, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillTxt: { fontSize: 11, fontWeight: '700', color: COLORS.primary },
  routeMini: { gap: 3, backgroundColor: '#F8FAFC', padding: 10, borderRadius: 10 },
  info: { fontSize: 13, color: '#334155' },
  sub: { fontSize: 12, color: COLORS.textMuted },
  price: { fontSize: 16, fontWeight: '900', color: COLORS.primary },
  mediaChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: COLORS.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  mediaChipTxt: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  actionLinkBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  actionLinkTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
  avatarRing: { width: 58, height: 58, borderRadius: 29, padding: 3, alignItems: 'center', justifyContent: 'center' },
  avatarInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  avatarChar: { fontSize: 22, fontWeight: '900', color: COLORS.primary },
  editTxt: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  userName: { fontSize: 19, fontWeight: '900', color: COLORS.text, marginTop: 4 },
  codePill: { alignSelf: 'flex-start', backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  codePillTxt: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: 11, fontSize: 14 },
  saveBtn: { backgroundColor: COLORS.primary, padding: 12, borderRadius: 12, alignItems: 'center' },
  saveBtnTxt: { color: '#fff', fontWeight: '800' },
  bannerCard: { borderRadius: 18, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14, ...SHADOW.card },
  bannerIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  bannerLabel: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.9)', letterSpacing: 0.6 },
  bannerVal: { fontSize: 16, fontWeight: '900', color: '#FFFFFF', marginTop: 2 },
  bannerSub: { fontSize: 11, color: 'rgba(255,255,255,0.92)', marginTop: 2 },
  menuCard: { backgroundColor: '#FFFFFF', borderRadius: 18, paddingHorizontal: 14, ...SHADOW.card },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  menuTxt: { fontSize: 14, color: COLORS.text, fontWeight: '600' },
  menuDivider: { height: 1, backgroundColor: '#F1F5F9' },
});
