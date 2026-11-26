import React, { useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { customerApi, fmtMoney, getApiBase, STATUS_LABELS } from '../api';
import { COLORS, GRADIENTS, SHADOW } from '../theme';
import { OsmMapView } from './osm-map-view';
import { MediaViewerModal } from './media-viewer-modal';
import { AddressSearchModal } from './address-search-modal';

const CANCEL_REASONS = [
  'Thay đổi kế hoạch, không cần nữa',
  'Thời gian chờ tài xế quá lâu',
  'Đặt nhầm điểm đón',
  'Lý do khác',
];

const STEPS = ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];

export function ActiveTripView({
  trip,
  dispatchRingInfo = null,
  publicTrackBaseUrl = 'https://tuannv.site',
  hotline = '0973521456',
  onUpdated,
  onResetNewTrip,
}: {
  trip: any;
  dispatchRingInfo?: { ring: number; radiusKm: number } | null;
  publicTrackBaseUrl?: string;
  hotline?: string;
  onUpdated: (t: any) => void;
  onResetNewTrip: () => void;
}) {
  const [showMedia, setShowMedia] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [customReason, setCustomReason] = useState('');
  const [showDropoff, setShowDropoff] = useState(false);

  const isTerminal = ['COMPLETED', 'CANCELLED', 'NO_DRIVER'].includes(trip.status);
  const canCancel = ['SEARCHING', 'ACCEPTED', 'ARRIVED'].includes(trip.status);
  const canChangeDropoff = ['SEARCHING', 'ACCEPTED', 'ARRIVED', 'IN_PROGRESS'].includes(trip.status);
  const stepIdx = STEPS.indexOf(trip.status);

  const snap = trip.pricingSnapshot;
  const baseKm = snap?.baseKm ?? 5;
  const basePrice = trip.timeSlot === 'NIGHT' ? snap?.nightBase ?? 200000 : snap?.dayBase ?? 150000;
  const perKmPrice = trip.timeSlot === 'NIGHT' ? snap?.nightPerKm ?? 15000 : snap?.dayPerKm ?? 10000;
  const extraKm = trip.distanceKm != null ? Math.max(0, Math.round((trip.distanceKm - baseKm) * 1000) / 1000) : 0;

  const handleCancel = async (reason: string) => {
    try {
      const updated = await customerApi(`/trips/${trip.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      setShowCancel(false);
      onUpdated(updated);
    } catch (e: any) {
      Alert.alert('Không thể hủy', e.message);
    }
  };

  const applyDropoff = async (item: any) => {
    try {
      const updated = await customerApi(`/trips/${trip.id}/dropoff`, {
        method: 'PATCH',
        body: JSON.stringify({
          dropoffAddress: item.address,
          dropoffLat: item.lat,
          dropoffLng: item.lng,
        }),
      });
      setShowDropoff(false);
      onUpdated(updated);
      Alert.alert('Đã đổi điểm trả', `Giá dự kiến mới: ${fmtMoney(updated.estimatedPrice)}`);
    } catch (e: any) {
      Alert.alert('Lỗi', e.message);
    }
  };

  const handleShareTrip = async () => {
    if (!trip.shareToken) return;
    const base = (publicTrackBaseUrl || getApiBase()).replace(/\/+$/, '');
    const trackUrl = `${base}/track/${trip.shareToken}`;
    const driverInfo = trip.driver
      ? `\nTài xế NOW: ${trip.driver.name || 'Tài xế NOW'} (${trip.driver.phone})`
      : '';
    try {
      await Share.share({
        title: `Theo dõi chuyến lái hộ NOW ${trip.code}`,
        message: `Mình đang sử dụng Lái Xe Hộ NOW Thái Nguyên (${trip.code}).${driverInfo}\nĐiểm đón: ${trip.pickupAddress}\nTheo dõi trực tiếp hành trình tại: ${trackUrl}`,
      });
    } catch {
      // user cancelled share
    }
  };

  const handleTriggerSos = () => {
    Alert.alert(
      '🆘 Phát tín hiệu SOS khẩn cấp?',
      'Hệ thống sẽ gửi cảnh báo đỏ kèm vị trí chuyến đi lên Tổng đài NOW Thái Nguyên ngay lập tức.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gửi SOS ngay',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await customerApi(`/trips/${trip.id}/sos`, {
                method: 'POST',
                body: JSON.stringify({
                  lat: trip.driver?.lat ?? trip.pickupLat,
                  lng: trip.driver?.lng ?? trip.pickupLng,
                  note: 'Khách hàng kích hoạt SOS trong chuyến',
                }),
              });
              const callNum = res?.hotline || hotline || '0973521456';
              Alert.alert(
                'Đã gửi cảnh báo SOS lên Tổng đài!',
                'Chọn gọi khẩn cấp ngay nếu bạn cần hỗ trợ trực tiếp:',
                [
                  { text: `Gọi Tổng đài NOW (${callNum})`, onPress: () => Linking.openURL(`tel:${callNum}`) },
                  { text: 'Gọi 113', style: 'destructive', onPress: () => Linking.openURL('tel:113') },
                  { text: 'Đóng', style: 'cancel' },
                ],
              );
            } catch (e: any) {
              const fallbackNum = hotline || '0973521456';
              Alert.alert('Lỗi gửi SOS', `${e.message}. Gọi ngay Tổng đài ${fallbackNum}.`, [
                { text: `Gọi ${fallbackNum}`, onPress: () => Linking.openURL(`tel:${fallbackNum}`) },
                { text: 'Đóng', style: 'cancel' },
              ]);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.root}>
      <View style={{ position: 'relative' }}>
        <OsmMapView
          pickup={{ lat: trip.pickupLat, lng: trip.pickupLng }}
          dropoff={
            trip.dropoffLat != null && trip.dropoffLng != null
              ? { lat: trip.dropoffLat, lng: trip.dropoffLng }
              : null
          }
          driver={
            trip.driver?.lat != null && trip.driver?.lng != null
              ? { lat: trip.driver.lat, lng: trip.driver.lng }
              : null
          }
          polyline={trip.routePolyline}
          actualPolyline={trip.status === 'IN_PROGRESS' ? trip.actualRoutePolyline : null}
          height={250}
        />
        <View style={styles.floatingCode}>
          <Text style={styles.floatingCodeTxt}>
            {trip.code} ·{' '}
            {trip.distanceKm != null
              ? `${trip.distanceKm} km`
              : trip.timeSlot === 'DAY'
                ? 'Ban ngày'
                : 'Ban đêm'}
          </Text>
        </View>
      </View>

      <View style={styles.sheet}>
        <View style={styles.dragHandle} />

        {/* Status Header + Visual Stepper */}
        <View style={[styles.statusBanner, trip.status === 'NO_DRIVER' && { backgroundColor: COLORS.warningSoft }]}>
          <Ionicons
            name={
              trip.status === 'COMPLETED'
                ? 'checkmark-circle'
                : trip.status === 'NO_DRIVER'
                  ? 'alert-circle'
                  : trip.status === 'CANCELLED'
                    ? 'close-circle'
                    : 'navigate-circle'
            }
            size={20}
            color={
              trip.status === 'COMPLETED'
                ? COLORS.success
                : trip.status === 'NO_DRIVER'
                  ? '#D97706'
                  : COLORS.primary
            }
          />
          <Text style={styles.statusTxt}>
            {trip.status === 'SEARCHING' && dispatchRingInfo
              ? `Đang mở rộng tìm tài xế vòng ${dispatchRingInfo.ring} (bán kính ${dispatchRingInfo.radiusKm} km)...`
              : STATUS_LABELS[trip.status] || trip.status}
          </Text>
        </View>

        {stepIdx >= 0 && (
          <View style={styles.stepper}>
            {STEPS.map((st, idx) => (
              <View
                key={st}
                style={[styles.stepBar, idx <= stepIdx && { backgroundColor: COLORS.primary }]}
              />
            ))}
          </View>
        )}

        {/* Driver Card */}
        {trip.driver && (
          <View style={styles.driverCard}>
            <LinearGradient colors={GRADIENTS.brand} style={styles.avatarRing}>
              {trip.driver.avatarUrl ? (
                <Image source={{ uri: trip.driver.avatarUrl }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarInner}>
                  <Text style={styles.avatarChar}>{(trip.driver.name || 'T')[0]}</Text>
                </View>
              )}
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <Text style={styles.driverName}>{trip.driver.name || 'Tài xế NOW Thái Nguyên'}</Text>
              <Text style={styles.sub}>{trip.driver.phone} · Đã xác minh CCCD/GPLX</Text>
            </View>
            <TouchableOpacity
              style={styles.callFab}
              onPress={() => Linking.openURL(`tel:${trip.driver.phone}`)}
            >
              <Ionicons name="call" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Book-for-other Contact Badge */}
        {trip.isBookingForOther && (
          <View style={styles.proxyBanner}>
            <Ionicons name="people" size={16} color="#B45309" />
            <Text style={styles.proxyBannerTxt}>
              Đặt hộ cho: {trip.passengerName || 'Khách'} · {trip.passengerPhone}
            </Text>
          </View>
        )}

        {trip.partnerCode && (
          <View style={styles.partnerBadge}>
            <Ionicons name="storefront-outline" size={14} color="#6D28D9" />
            <Text style={styles.partnerBadgeTxt}>Mã đối tác giới thiệu: {trip.partnerCode}</Text>
          </View>
        )}

        {/* Route Summary */}
        <View style={styles.routeBox}>
          <View style={styles.dotsCol}>
            <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
            <View style={styles.line} />
            <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />
          </View>
          <View style={{ flex: 1, gap: 10 }}>
            <View>
              <Text style={styles.caption}>Điểm đón</Text>
              <Text style={styles.addr} numberOfLines={2}>
                {trip.pickupAddress}
              </Text>
            </View>
            <View>
              <Text style={styles.caption}>Điểm trả</Text>
              <Text style={styles.addr} numberOfLines={2}>
                {trip.dropoffAddress || 'Chưa cố định (tính tại điểm kết thúc)'}
              </Text>
            </View>
          </View>
        </View>

        {/* Fare Box + Transparent Formula */}
        <View style={styles.fareBox}>
          <View style={styles.fareRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.caption}>
                {trip.status === 'COMPLETED' ? 'Giá chốt thanh toán cho tài xế' : 'Giá cước dự kiến'}
              </Text>
              <Text style={styles.sub}>Thanh toán trực tiếp bằng tiền mặt / CK</Text>
            </View>
            <Text style={styles.fareVal}>{fmtMoney(trip.finalPrice ?? trip.estimatedPrice)}</Text>
          </View>
          {trip.distanceKm != null && (
            <View style={styles.fareDetail}>
              <Text style={styles.sub}>
                Khung giờ {trip.timeSlot === 'NIGHT' ? 'Ban đêm' : 'Ban ngày'} · Mở cửa {baseKm} km:{' '}
                {fmtMoney(basePrice)}
                {extraKm > 0 ? ` + ${extraKm} km × ${fmtMoney(perKmPrice)}` : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Media button */}
        {(trip.media?.length > 0 || ['ARRIVED', 'IN_PROGRESS', 'COMPLETED'].includes(trip.status)) && (
          <TouchableOpacity style={styles.mediaBtn} onPress={() => setShowMedia(true)}>
            <Ionicons name="images-outline" size={18} color={COLORS.primary} />
            <Text style={styles.mediaBtnTxt}>
              Xem ảnh & video tình trạng xe ({trip.media?.length || 0} tệp)
            </Text>
          </TouchableOpacity>
        )}

        {/* Safety Row: Chia sẻ hành trình + SOS khẩn cấp */}
        {!isTerminal && (
          <View style={styles.actionsRow}>
            {trip.shareToken ? (
              <TouchableOpacity style={styles.shareBtn} onPress={handleShareTrip}>
                <Ionicons name="share-social-outline" size={16} color="#1D4ED8" />
                <Text style={styles.shareTxt}>Chia sẻ hành trình</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.sosBtn} onPress={handleTriggerSos}>
              <Ionicons name="warning" size={16} color="#fff" />
              <Text style={styles.sosTxt}>SOS Khẩn cấp</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsRow}>
          {canChangeDropoff && (
            <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowDropoff(true)}>
              <Ionicons name="swap-horizontal" size={16} color={COLORS.text} />
              <Text style={styles.outlineTxt}>Đổi điểm trả</Text>
            </TouchableOpacity>
          )}
          {canCancel && (
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCancel(true)}>
              <Ionicons name="close-circle-outline" size={16} color={COLORS.danger} />
              <Text style={styles.cancelTxt}>Hủy chuyến</Text>
            </TouchableOpacity>
          )}
        </View>

        {isTerminal && (
          <TouchableOpacity onPress={onResetNewTrip} activeOpacity={0.85}>
            <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaBtn}>
              <Text style={styles.ctaTxt}>Đặt chuyến mới  →</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      <MediaViewerModal
        visible={showMedia}
        tripCode={trip.code}
        media={trip.media || []}
        onClose={() => setShowMedia(false)}
      />

      <AddressSearchModal
        visible={showDropoff}
        title="Chọn điểm trả mới"
        biasCoord={{ lat: trip.pickupLat, lng: trip.pickupLng }}
        savedPlaces={[]}
        onClose={() => setShowDropoff(false)}
        onSelect={applyDropoff}
      />

      <Modal visible={showCancel} transparent animationType="slide" onRequestClose={() => setShowCancel(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Chọn lý do hủy chuyến</Text>
            {CANCEL_REASONS.map((r) => (
              <TouchableOpacity key={r} style={styles.reasonRow} onPress={() => handleCancel(r)}>
                <Text style={styles.addr}>{r}</Text>
                <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
              </TouchableOpacity>
            ))}
            <TextInput
              style={styles.input}
              placeholder="Hoặc nhập lý do khác..."
              value={customReason}
              onChangeText={setCustomReason}
            />
            <View style={styles.actionsRow}>
              <TouchableOpacity style={styles.outlineBtn} onPress={() => setShowCancel(false)}>
                <Text style={styles.outlineTxt}>Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => handleCancel(customReason.trim() || 'Khách hàng hủy')}
              >
                <Text style={styles.ctaTxt}>Xác nhận hủy</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 0 },
  floatingCode: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    ...SHADOW.card,
  },
  floatingCodeTxt: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  sheet: {
    marginTop: -18,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    gap: 12,
    ...SHADOW.card,
  },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center' },
  statusBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primarySoft, padding: 11, borderRadius: 14 },
  statusTxt: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  stepper: { flexDirection: 'row', gap: 5 },
  stepBar: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#E2E8F0' },
  driverCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  avatarRing: { width: 48, height: 48, borderRadius: 24, padding: 2.5, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 43, height: 43, borderRadius: 22 },
  avatarInner: { width: 43, height: 43, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  avatarChar: { fontSize: 18, fontWeight: '900', color: COLORS.primary },
  driverName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  callFab: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center' },
  routeBox: { flexDirection: 'row', gap: 10, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 14 },
  proxyBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D', padding: 10, borderRadius: 12 },
  proxyBannerTxt: { flex: 1, fontSize: 12, fontWeight: '800', color: '#92400E' },
  partnerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  partnerBadgeTxt: { fontSize: 12, fontWeight: '700', color: '#5B21B6' },
  dotsCol: { alignItems: 'center', paddingVertical: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  line: { width: 2, flex: 1, backgroundColor: '#CBD5E1', marginVertical: 4 },
  caption: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  addr: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  sub: { fontSize: 11, color: COLORS.textMuted },
  fareBox: { backgroundColor: '#FFF8F8', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#FECACA', gap: 6 },
  fareRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  fareDetail: { borderTopWidth: 1, borderColor: '#FEE2E2', paddingTop: 6 },
  fareVal: { fontSize: 20, fontWeight: '900', color: COLORS.primary },
  mediaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: COLORS.primarySoft, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#FECACA' },
  mediaBtnTxt: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  actionsRow: { flexDirection: 'row', gap: 10 },
  shareBtn: { flex: 1.2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', padding: 11, borderRadius: 14 },
  shareTxt: { fontWeight: '800', color: '#1D4ED8', fontSize: 12 },
  sosBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#DC2626', padding: 11, borderRadius: 14 },
  sosTxt: { fontWeight: '900', color: '#fff', fontSize: 12 },
  outlineBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: '#CBD5E1', padding: 12, borderRadius: 14 },
  outlineTxt: { fontWeight: '700', color: COLORS.text, fontSize: 13 },
  cancelBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: COLORS.dangerSoft, borderWidth: 1, borderColor: '#FECACA', padding: 12, borderRadius: 14 },
  cancelTxt: { fontWeight: '700', color: COLORS.danger, fontSize: 13 },
  ctaBtn: { padding: 15, borderRadius: 16, alignItems: 'center' },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 10 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  reasonRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12 },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: 11, fontSize: 14 },
  confirmCancelBtn: { flex: 1, backgroundColor: COLORS.danger, padding: 12, borderRadius: 14, alignItems: 'center' },
});
