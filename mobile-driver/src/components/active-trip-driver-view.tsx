import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { driverApi, fmtMoney, uploadFileWithProgress } from '../api';
import { COLORS, GRADIENTS, SHADOW } from '../theme';
import { DriverOsmMap } from './osm-map-view';
import { DriverAddressModal, DriverPlaceItem } from './driver-address-modal';

interface PendingRetry {
  stage: 'PICKUP' | 'DROPOFF';
  type: 'IMAGE' | 'VIDEO';
  isPlatePhoto: boolean;
  uri: string;
  durationSec?: number;
}

interface NavRouteInfo {
  distanceKm: number;
  durationMin: number;
  routePolyline: string;
  steps?: Array<{ instruction: string; distanceM: number; name: string }>;
}

const DRIVER_STEPS = ['ACCEPTED', 'ARRIVED', 'IN_PROGRESS'];

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcActualTrackKm(polyline?: string | null): number {
  if (!polyline) return 0;
  const pts = polyline
    .split(';')
    .map((p) => p.split(',').map(Number))
    .filter((a) => a.length === 2 && Number.isFinite(a[0]) && Number.isFinite(a[1]));
  if (pts.length < 2) return 0;
  let totalM = 0;
  for (let i = 1; i < pts.length; i++) {
    totalM += haversineMeters(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  }
  return Number((totalM / 1000).toFixed(2));
}

export function ActiveTripDriverView({
  trip,
  driverLoc,
  gpsSource = 'FALLBACK',
  hotline = '0973521456',
  onTripUpdated,
  onTripCompleted,
  onRefreshGps,
}: {
  trip: any;
  driverLoc: { lat: number; lng: number } | null;
  gpsSource?: 'REAL_GPS' | 'LAST_KNOWN' | 'FALLBACK';
  hotline?: string;
  onTripUpdated: (t: any) => void;
  onTripCompleted: (result: any) => void;
  onRefreshGps?: () => void;
}) {
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadLabel, setUploadLabel] = useState('');
  const [failedUpload, setFailedUpload] = useState<PendingRetry | null>(null);
  const [showDropoffModal, setShowDropoffModal] = useState(false);
  const [fullMapOpen, setFullMapOpen] = useState(false);
  const [followDriver, setFollowDriver] = useState(false);
  const [busy, setBusy] = useState(false);

  // Tuyến dẫn đường trực tiếp trên bản đồ trong app (Tài xế -> Điểm đón / Điểm trả)
  const [navRoute, setNavRoute] = useState<NavRouteInfo | null>(null);
  const lastRouteOriginRef = useRef<{ lat: number; lng: number; targetKey: string; at: number } | null>(null);

  const mediaList: any[] = trip.media || [];
  const pickupMedia = mediaList.filter((m) => m.stage === 'PICKUP');
  const plateCount = pickupMedia.filter((m) => m.type === 'IMAGE' && m.isPlatePhoto).length;
  const pickupPhotoCount = pickupMedia.filter((m) => m.type === 'IMAGE').length;
  const pickupVideoCount = pickupMedia.filter((m) => m.type === 'VIDEO').length;
  const dropoffMedia = mediaList.filter((m) => m.stage === 'DROPOFF' && m.type === 'IMAGE');

  const canStart = plateCount >= 1 && pickupVideoCount >= 1;
  const canComplete = dropoffMedia.length >= 1;
  const stepIdx = DRIVER_STEPS.indexOf(trip.status);
  const actualKm = calcActualTrackKm(trip.actualRoutePolyline);

  // Tự động vẽ đường trực tiếp từ vị trí thật của tài xế -> Điểm đón (khi ACCEPTED) hoặc Điểm trả (khi IN_PROGRESS)
  useEffect(() => {
    if (!driverLoc) return;
    let targetLat: number | null = null;
    let targetLng: number | null = null;
    let targetKey = '';

    if (trip.status === 'ACCEPTED') {
      targetLat = trip.pickupLat;
      targetLng = trip.pickupLng;
      targetKey = `PICKUP:${trip.pickupLat},${trip.pickupLng}`;
    } else if (trip.status === 'IN_PROGRESS' && trip.dropoffLat != null && trip.dropoffLng != null) {
      targetLat = trip.dropoffLat;
      targetLng = trip.dropoffLng;
      targetKey = `DROPOFF:${trip.dropoffLat},${trip.dropoffLng}`;
    } else {
      setNavRoute(null);
      return;
    }

    const prev = lastRouteOriginRef.current;
    const now = Date.now();
    if (prev && prev.targetKey === targetKey) {
      const movedM = haversineMeters(prev.lat, prev.lng, driverLoc.lat, driverLoc.lng);
      if (movedM < 35 && now - prev.at < 15000) return;
    }

    let cancelled = false;
    lastRouteOriginRef.current = { lat: driverLoc.lat, lng: driverLoc.lng, targetKey, at: now };

    driverApi<NavRouteInfo>(
      `/map/route?fromLat=${driverLoc.lat}&fromLng=${driverLoc.lng}&toLat=${targetLat}&toLng=${targetLng}`,
    )
      .then((res) => {
        if (!cancelled && res?.routePolyline) setNavRoute(res);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [
    trip.status,
    trip.pickupLat,
    trip.pickupLng,
    trip.dropoffLat,
    trip.dropoffLng,
    driverLoc?.lat,
    driverLoc?.lng,
  ]);

  const mapMode: 'TO_PICKUP' | 'ARRIVED' | 'IN_PROGRESS' | 'IDLE' =
    trip.status === 'ACCEPTED'
      ? 'TO_PICKUP'
      : trip.status === 'ARRIVED'
        ? 'ARRIVED'
        : trip.status === 'IN_PROGRESS'
          ? 'IN_PROGRESS'
          : 'IDLE';

  const nextStep =
    navRoute?.steps?.find((s) => s.distanceM > 20 && s.instruction !== 'Đã đến điểm đích') ||
    navRoute?.steps?.[0];

  const openExternalNavigation = () => {
    const isDropoffLeg = trip.status === 'IN_PROGRESS' && trip.dropoffLat != null && trip.dropoffLng != null;
    const lat = isDropoffLeg ? trip.dropoffLat : trip.pickupLat;
    const lng = isDropoffLeg ? trip.dropoffLng : trip.pickupLng;
    const url =
      Platform.OS === 'ios'
        ? `maps://app?daddr=${lat},${lng}`
        : `google.navigation:q=${lat},${lng}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
    );
  };

  const triggerDriverSos = () => {
    Alert.alert(
      '🆘 Phát tín hiệu SOS khẩn cấp?',
      'Hệ thống sẽ gửi vị trí GPS hiện tại và mã chuyến lên màn hình Tổng đài NOW Thái Nguyên ngay lập tức.',
      [
        { text: 'Hủy', style: 'cancel' },
        {
          text: 'Gửi SOS ngay',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await driverApi(`/trips/${trip.id}/sos`, {
                method: 'POST',
                body: JSON.stringify({
                  lat: driverLoc?.lat ?? trip.pickupLat,
                  lng: driverLoc?.lng ?? trip.pickupLng,
                  note: 'Tài xế kích hoạt SOS trong chuyến',
                }),
              });
              const callNum = res?.hotline || hotline;
              Alert.alert(
                'Đã gửi cảnh báo SOS lên Tổng đài!',
                'Chọn gọi khẩn cấp ngay nếu cần hỗ trợ trực tiếp:',
                [
                  { text: `Gọi Tổng đài (${callNum})`, onPress: () => Linking.openURL(`tel:${callNum}`) },
                  { text: 'Gọi 113', style: 'destructive', onPress: () => Linking.openURL('tel:113') },
                  { text: 'Đóng', style: 'cancel' },
                ],
              );
            } catch (e: any) {
              Alert.alert('Lỗi gửi SOS', `${e.message}. Bạn có thể gọi trực tiếp Tổng đài ${hotline}.`, [
                { text: `Gọi ${hotline}`, onPress: () => Linking.openURL(`tel:${hotline}`) },
                { text: 'Đóng', style: 'cancel' },
              ]);
            }
          },
        },
      ],
    );
  };

  const uploadCapturedAsset = async (item: PendingRetry) => {
    setFailedUpload(null);
    setUploadPct(0);
    setUploadLabel(item.type === 'VIDEO' ? 'Đang tải video quanh xe...' : 'Đang tải ảnh kiểm tra xe...');
    try {
      const ext = item.type === 'VIDEO' ? 'mp4' : 'jpg';
      const contentType = item.type === 'VIDEO' ? 'video/mp4' : 'image/jpeg';

      const presign = await driverApi(`/trips/${trip.id}/media/presign`, {
        method: 'POST',
        body: JSON.stringify({ ext, contentType }),
      });

      const fileSize = await uploadFileWithProgress(
        presign.uploadUrl,
        item.uri,
        contentType,
        (pct) => setUploadPct(pct),
      );

      let lat: number | undefined = driverLoc?.lat;
      let lng: number | undefined = driverLoc?.lng;
      try {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          lat = last.coords.latitude;
          lng = last.coords.longitude;
        }
      } catch {
        // use driverLoc
      }

      const created = await driverApi(`/trips/${trip.id}/media`, {
        method: 'POST',
        body: JSON.stringify({
          type: item.type,
          stage: item.stage,
          isPlatePhoto: item.isPlatePhoto,
          url: presign.publicUrl,
          size: fileSize || undefined,
          durationSec: item.durationSec,
          lat,
          lng,
        }),
      });

      onTripUpdated({ ...trip, media: [...mediaList, created] });
    } catch (e: any) {
      setFailedUpload(item);
      Alert.alert('Lỗi tải lên', `${e.message}. Bấm "Thử tải lại" khi mạng ổn định.`);
    } finally {
      setUploadPct(null);
      setUploadLabel('');
    }
  };

  const handleDeleteMedia = (mediaId: string) => {
    Alert.alert('Xóa ảnh/video này?', 'Bạn có muốn xóa tệp chụp nhầm hoặc bị mờ này không?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            const res = await driverApi(`/trips/${trip.id}/media/${mediaId}`, { method: 'DELETE' });
            if (res?.trip) onTripUpdated(res.trip);
            else onTripUpdated({ ...trip, media: mediaList.filter((m) => m.id !== mediaId) });
          } catch (e: any) {
            Alert.alert('Không thể xóa', e.message);
          }
        },
      },
    ]);
  };

  const handleUpdateDropoff = async (item: DriverPlaceItem) => {
    try {
      const updated = await driverApi(`/trips/${trip.id}/dropoff`, {
        method: 'PATCH',
        body: JSON.stringify({
          dropoffAddress: item.address,
          dropoffLat: item.lat,
          dropoffLng: item.lng,
        }),
      });
      setShowDropoffModal(false);
      onTripUpdated(updated);
      Alert.alert(
        'Đã cập nhật điểm trả',
        `Quãng đường: ${updated.distanceKm} km · Giá mới: ${fmtMoney(updated.estimatedPrice)}`,
      );
    } catch (e: any) {
      Alert.alert('Lỗi cập nhật điểm trả', e.message);
    }
  };

  const captureFromCamera = async (
    stage: 'PICKUP' | 'DROPOFF',
    type: 'IMAGE' | 'VIDEO',
    isPlatePhoto = false,
  ) => {
    if (stage === 'PICKUP' && type === 'IMAGE' && pickupPhotoCount >= 5) {
      return Alert.alert('Đã đủ số lượng', 'Tối đa 05 ảnh khi nhận xe.');
    }
    if (stage === 'PICKUP' && type === 'VIDEO' && pickupVideoCount >= 2) {
      return Alert.alert('Đã đủ số lượng', 'Tối đa 02 video khi nhận xe.');
    }

    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Thiếu quyền', 'Cần cấp quyền Camera để chụp/quay trực tiếp');

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: type === 'VIDEO' ? ['videos'] : ['images'],
      videoMaxDuration: 60,
      videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
      quality: 0.65,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const durationSec = asset.duration ? Math.min(60, Math.ceil(asset.duration / 1000)) : undefined;
    await uploadCapturedAsset({
      stage,
      type,
      isPlatePhoto,
      uri: asset.uri,
      durationSec,
    });
  };

  const markArrived = async () => {
    setBusy(true);
    try {
      const updated = await driverApi(`/trips/${trip.id}/arrived`, { method: 'POST' });
      onTripUpdated(updated);
    } catch (e: any) {
      Alert.alert('Lỗi', e.message);
    } finally {
      setBusy(false);
    }
  };

  const startTrip = async () => {
    setBusy(true);
    try {
      const updated = await driverApi(`/trips/${trip.id}/start`, { method: 'POST' });
      onTripUpdated(updated);
    } catch (e: any) {
      Alert.alert('Chưa đủ điều kiện', e.message);
    } finally {
      setBusy(false);
    }
  };

  const executeCompleteTrip = async () => {
    setBusy(true);
    try {
      let actualDropoffLat: number | undefined;
      let actualDropoffLng: number | undefined;

      if (trip.dropoffLat == null || trip.dropoffLng == null) {
        try {
          const fresh = await Promise.race([
            Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), 6000)),
          ]);
          if (fresh) {
            actualDropoffLat = fresh.coords.latitude;
            actualDropoffLng = fresh.coords.longitude;
          } else if (driverLoc) {
            actualDropoffLat = driverLoc.lat;
            actualDropoffLng = driverLoc.lng;
          }
        } catch {
          if (driverLoc) {
            actualDropoffLat = driverLoc.lat;
            actualDropoffLng = driverLoc.lng;
          }
        }

        if (actualDropoffLat == null || actualDropoffLng == null) {
          Alert.alert(
            'Chưa có tọa độ điểm trả',
            'Không lấy được GPS hiện tại. Vui lòng bấm "Chọn trả" để chọn địa chỉ trả xe chính xác trước khi chốt giá.',
          );
          setBusy(false);
          return;
        }
      }

      const res = await driverApi(`/trips/${trip.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ actualDropoffLat, actualDropoffLng }),
      });
      onTripCompleted(res);
    } catch (e: any) {
      Alert.alert('Chưa thể hoàn thành', e.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmCompleteTrip = () => {
    const summaryLine =
      trip.estimatedPrice != null
        ? `Quãng đường tính cước ${trip.distanceKm ?? '—'} km · Giá chốt ${fmtMoney(trip.estimatedPrice)}.`
        : 'Hệ thống sẽ tính quãng đường theo tọa độ GPS hiện tại tại điểm trả xe.';
    Alert.alert(
      'Xác nhận hoàn thành chuyến?',
      `${summaryLine}\nHệ thống sẽ tự động khấu trừ chiết khấu chuyến từ ví ký quỹ.`,
      [
        { text: 'Kiểm tra lại', style: 'cancel' },
        { text: 'Hoàn thành & Chốt giá', onPress: executeCompleteTrip },
      ],
    );
  };

  return (
    <View style={styles.root}>
      {/* Live Turn-By-Turn Banner ngay trên bản đồ trong app */}
      {(trip.status === 'ACCEPTED' || trip.status === 'IN_PROGRESS') && (
        <View style={[styles.navBanner, trip.status === 'IN_PROGRESS' && { backgroundColor: '#991B1B' }]}>
          <View style={styles.navIconBox}>
            <Ionicons
              name={trip.status === 'ACCEPTED' ? 'navigate' : 'trail-sign'}
              size={18}
              color="#fff"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.navBannerTitle} numberOfLines={1}>
              {trip.status === 'ACCEPTED'
                ? navRoute
                  ? `Đường đến điểm đón · ${navRoute.distanceKm.toFixed(1)} km (~${navRoute.durationMin} phút)`
                  : 'Đang vẽ đường từ vị trí của bạn đến điểm đón...'
                : `Đang ghi lộ trình thực tế · Đã đi ${actualKm} km`}
            </Text>
            <Text style={styles.navBannerSub} numberOfLines={1}>
              {nextStep
                ? `${nextStep.instruction}${nextStep.distanceM > 0 ? ` (${nextStep.distanceM >= 1000 ? `${(nextStep.distanceM / 1000).toFixed(1)} km` : `${nextStep.distanceM} m`})` : ''}`
                : gpsSource === 'REAL_GPS'
                  ? 'GPS thực đang cập nhật liên tục'
                  : 'Đang lấy tín hiệu GPS vị trí thật của bạn...'}
            </Text>
          </View>
          {onRefreshGps && (
            <TouchableOpacity style={styles.gpsMiniBtn} onPress={onRefreshGps}>
              <Ionicons name="locate" size={16} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Bản đồ trực tiếp trong app */}
      <View style={{ position: 'relative' }}>
        <DriverOsmMap
          pickup={{ lat: trip.pickupLat, lng: trip.pickupLng }}
          dropoff={
            trip.dropoffLat != null && trip.dropoffLng != null
              ? { lat: trip.dropoffLat, lng: trip.dropoffLng }
              : null
          }
          driver={driverLoc}
          polyline={trip.routePolyline}
          navPolyline={navRoute?.routePolyline}
          actualPolyline={trip.status === 'IN_PROGRESS' ? trip.actualRoutePolyline : null}
          mode={mapMode}
          followDriver={followDriver}
          height={250}
        />
        <View style={styles.floatingPill}>
          <Text style={styles.floatingPillTxt}>
            {trip.code} {trip.distanceKm != null ? `· ${trip.distanceKm} km` : ''}
          </Text>
        </View>
        <TouchableOpacity style={styles.expandMapFab} onPress={() => setFullMapOpen(true)}>
          <Ionicons name="expand" size={18} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.sheet}>
        <View style={styles.dragHandle} />

        {/* Step Progress */}
        <View style={styles.stepRow}>
          {['Đến đón', 'Nhận xe', 'Đang chạy'].map((lbl, idx) => (
            <View key={lbl} style={styles.stepItem}>
              <View style={[styles.stepBar, idx <= stepIdx && { backgroundColor: COLORS.primary }]} />
              <Text style={[styles.stepLbl, idx <= stepIdx && { color: COLORS.primary, fontWeight: '800' }]}>
                {lbl}
              </Text>
            </View>
          ))}
        </View>

        {/* Thẻ Đặt hộ (nếu khách đặt cho người khác) — nổi bật cho tài xế gọi đúng người đi */}
        {trip.isBookingForOther && (
          <View style={styles.proxyCard}>
            <View style={{ flex: 1 }}>
              <View style={styles.proxyBadge}>
                <Ionicons name="people" size={12} color="#fff" />
                <Text style={styles.proxyBadgeTxt}>ĐẶT HỘ · LIÊN HỆ NGƯỜI ĐI XE</Text>
              </View>
              <Text style={styles.proxyName}>{trip.passengerName || 'Khách sử dụng xe'}</Text>
              <Text style={styles.proxyPhone}>{trip.passengerPhone}</Text>
            </View>
            {trip.passengerPhone ? (
              <TouchableOpacity
                style={styles.callFab}
                onPress={() => Linking.openURL(`tel:${trip.passengerPhone}`)}
              >
                <Ionicons name="call" size={19} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        {/* Customer Card */}
        {trip.customer && (
          <View style={styles.customerCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>{(trip.customer.name || 'K')[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.caption}>
                {trip.isBookingForOther ? 'Người đặt hộ trên ứng dụng' : 'Khách hàng'}
              </Text>
              <Text style={styles.bold}>{trip.customer.name || 'Khách hàng NOW'}</Text>
              <Text style={styles.sub}>{trip.customer.phone}</Text>
            </View>
            <TouchableOpacity
              style={[styles.callFab, trip.isBookingForOther && { backgroundColor: '#475569' }]}
              onPress={() => Linking.openURL(`tel:${trip.customer.phone}`)}
            >
              <Ionicons name="call" size={19} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        {/* Route Connector + Driver Update Dropoff */}
        <View style={styles.routeBox}>
          <View style={styles.dotsCol}>
            <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
            <View style={styles.line} />
            <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />
          </View>
          <View style={{ flex: 1, gap: 8 }}>
            <View>
              <Text style={styles.caption}>Điểm đón</Text>
              <Text style={styles.addr}>{trip.pickupAddress}</Text>
            </View>
            <View style={styles.rowBetween}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.caption}>Điểm trả</Text>
                <Text style={styles.addr}>
                  {trip.dropoffAddress || 'Chưa cố định (chọn điểm hoặc đo GPS lúc trả)'}
                </Text>
              </View>
              <TouchableOpacity style={styles.dropoffEditBtn} onPress={() => setShowDropoffModal(true)}>
                <Ionicons name="location-outline" size={14} color={COLORS.primary} />
                <Text style={styles.dropoffEditTxt}>
                  {trip.dropoffAddress ? 'Đổi' : 'Chọn trả'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {trip.estimatedPrice != null && (
          <View style={styles.fareChip}>
            <View>
              <Text style={styles.sub}>Giá cước thu trực tiếp khách</Text>
              <Text style={styles.tiny}>
                {trip.distanceKm ?? '—'} km · Khung giờ {trip.timeSlot === 'NIGHT' ? 'Ban đêm' : 'Ban ngày'}
              </Text>
            </View>
            <Text style={styles.price}>{fmtMoney(trip.estimatedPrice)}</Text>
          </View>
        )}

        {trip.note ? (
          <View style={styles.noteBox}>
            <Ionicons name="information-circle-outline" size={16} color="#B45309" />
            <Text style={styles.noteTxt}>{trip.note}</Text>
          </View>
        ) : null}

        {/* Thanh điều hướng trực tiếp trong app + Google Maps + SOS */}
        <View style={styles.navActionsRow}>
          <TouchableOpacity style={styles.inAppMapBtn} onPress={() => setFullMapOpen(true)}>
            <Ionicons name="map" size={16} color="#fff" />
            <Text style={styles.navTxt}>
              Bản đồ lớn ({trip.status === 'IN_PROGRESS' ? 'Thực tế' : 'Đến đón'})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.extMapBtn} onPress={openExternalNavigation}>
            <Ionicons name="navigate-outline" size={16} color={COLORS.text} />
            <Text style={styles.extMapTxt}>Maps</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.sosBtn} onPress={triggerDriverSos}>
            <Ionicons name="warning" size={15} color="#fff" />
            <Text style={styles.sosTxt}>SOS</Text>
          </TouchableOpacity>
        </View>

        {uploadPct !== null && (
          <View style={styles.progressBox}>
            <View style={styles.rowBetween}>
              <Text style={styles.sub}>{uploadLabel}</Text>
              <Text style={[styles.bold, { color: COLORS.primary }]}>{uploadPct}%</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${uploadPct}%` }]} />
            </View>
          </View>
        )}

        {failedUpload && (
          <TouchableOpacity style={styles.retryBtn} onPress={() => uploadCapturedAsset(failedUpload)}>
            <Ionicons name="refresh" size={16} color="#fff" />
            <Text style={styles.ctaTxt}>Thử tải lại tệp vừa chụp</Text>
          </TouchableOpacity>
        )}

        {trip.status === 'ACCEPTED' && (
          <TouchableOpacity activeOpacity={0.88} onPress={markArrived} disabled={busy}>
            <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaBtn}>
              <Text style={styles.ctaTxt}>ĐÃ ĐẾN ĐIỂM ĐÓN  →</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {trip.status === 'ARRIVED' && (
          <View style={styles.checklist}>
            <Text style={styles.bold}>Kiểm tra tình trạng xe khi nhận (Camera trực tiếp)</Text>
            <View style={styles.checkPills}>
              <View style={[styles.checkPill, plateCount >= 1 && styles.checkPillOk]}>
                <Ionicons
                  name={plateCount >= 1 ? 'checkmark-circle' : 'ellipse-outline'}
                  size={15}
                  color={plateCount >= 1 ? COLORS.successDark : COLORS.textMuted}
                />
                <Text style={styles.checkPillTxt}>Biển số ({plateCount}/1+)</Text>
              </View>
              <View style={[styles.checkPill, pickupVideoCount >= 1 && styles.checkPillOk]}>
                <Ionicons
                  name={pickupVideoCount >= 1 ? 'checkmark-circle' : 'ellipse-outline'}
                  size={15}
                  color={pickupVideoCount >= 1 ? COLORS.successDark : COLORS.textMuted}
                />
                <Text style={styles.checkPillTxt}>Video ({pickupVideoCount}/2)</Text>
              </View>
              <View style={styles.checkPill}>
                <Text style={styles.checkPillTxt}>Ảnh ({pickupPhotoCount}/5)</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.camRow}
              onPress={() => captureFromCamera('PICKUP', 'IMAGE', true)}
              disabled={uploadPct !== null}
            >
              <Ionicons name="camera" size={18} color={COLORS.primary} />
              <Text style={styles.camTxt}>1. Chụp ảnh xe kèm biển số (Bắt buộc)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.camRow}
              onPress={() => captureFromCamera('PICKUP', 'IMAGE', false)}
              disabled={uploadPct !== null}
            >
              <Ionicons name="images" size={18} color={COLORS.text} />
              <Text style={styles.camTxt}>2. Chụp ảnh các góc xe ({pickupPhotoCount}/5)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.camRow}
              onPress={() => captureFromCamera('PICKUP', 'VIDEO', false)}
              disabled={uploadPct !== null}
            >
              <Ionicons name="videocam" size={18} color={COLORS.primaryDark} />
              <Text style={styles.camTxt}>3. Quay video quanh xe ≤ 60s (Bắt buộc)</Text>
            </TouchableOpacity>

            {pickupMedia.length > 0 && (
              <View style={styles.thumbRow}>
                {pickupMedia.map((m) => (
                  <View key={m.id} style={styles.thumbWrap}>
                    {m.type === 'IMAGE' ? (
                      <Image source={{ uri: m.url }} style={styles.thumb} />
                    ) : (
                      <View style={styles.videoThumb}>
                        <Ionicons name="videocam" size={18} color="#fff" />
                        <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                          {m.durationSec || 'OK'}s
                        </Text>
                      </View>
                    )}
                    <TouchableOpacity
                      style={styles.thumbDel}
                      onPress={() => handleDeleteMedia(m.id)}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity activeOpacity={0.88} onPress={startTrip} disabled={!canStart || busy}>
              <LinearGradient
                colors={canStart ? GRADIENTS.brand : ['#94A3B8', '#94A3B8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaBtn}
              >
                <Text style={styles.ctaTxt}>
                  {canStart ? 'BẮT ĐẦU CHUYẾN & GHI LỘ TRÌNH  →' : 'Cần đủ ảnh biển số + video để bắt đầu'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {trip.status === 'IN_PROGRESS' && (
          <View style={styles.checklist}>
            <View style={styles.trackSummary}>
              <Ionicons name="pulse" size={16} color={COLORS.primary} />
              <Text style={styles.trackSummaryTxt}>
                Đang vẽ đường đi thực tế trên bản đồ · Quãng đường đã ghi: {actualKm} km
              </Text>
            </View>
            <Text style={styles.bold}>
              Xác nhận bàn giao xe tại điểm trả ({dropoffMedia.length}/1+ ảnh)
            </Text>
            <TouchableOpacity
              style={styles.camRow}
              onPress={() => captureFromCamera('DROPOFF', 'IMAGE', false)}
              disabled={uploadPct !== null}
            >
              <Ionicons name="camera" size={18} color={COLORS.primary} />
              <Text style={styles.camTxt}>Chụp ảnh bàn giao xe tại điểm trả (Bắt buộc)</Text>
            </TouchableOpacity>

            {dropoffMedia.length > 0 && (
              <View style={styles.thumbRow}>
                {dropoffMedia.map((m) => (
                  <View key={m.id} style={styles.thumbWrap}>
                    <Image source={{ uri: m.url }} style={styles.thumb} />
                    <TouchableOpacity
                      style={styles.thumbDel}
                      onPress={() => handleDeleteMedia(m.id)}
                    >
                      <Ionicons name="close" size={12} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity activeOpacity={0.88} onPress={confirmCompleteTrip} disabled={!canComplete || busy}>
              <LinearGradient
                colors={canComplete ? GRADIENTS.brand : ['#94A3B8', '#94A3B8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.ctaBtn}
              >
                <Text style={styles.ctaTxt}>
                  {canComplete ? 'HOÀN THÀNH CHUYẾN & CHỐT GIÁ  ✓' : 'Chụp tối thiểu 1 ảnh bàn giao để hoàn thành'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Modal Bản đồ toàn màn hình trong app Tài xế */}
      <Modal visible={fullMapOpen} animationType="slide" onRequestClose={() => setFullMapOpen(false)}>
        <View style={styles.fullMapRoot}>
          <View style={styles.fullMapHeader}>
            <TouchableOpacity style={styles.fullMapClose} onPress={() => setFullMapOpen(false)}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.navBannerTitle} numberOfLines={1}>
                {trip.status === 'ACCEPTED'
                  ? navRoute
                    ? `Đến điểm đón · ${navRoute.distanceKm.toFixed(1)} km (~${navRoute.durationMin} phút)`
                    : 'Dẫn đường đến điểm đón'
                  : `Lộ trình thực tế · ${actualKm} km`}
              </Text>
              <Text style={styles.navBannerSub} numberOfLines={1}>
                {nextStep?.instruction || (trip.status === 'IN_PROGRESS' ? trip.dropoffAddress || 'Đang di chuyển' : trip.pickupAddress)}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.followBtn, followDriver && { backgroundColor: '#fff' }]}
              onPress={() => setFollowDriver((v) => !v)}
            >
              <Ionicons name="locate" size={18} color={followDriver ? COLORS.primary : '#fff'} />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1 }}>
            <DriverOsmMap
              pickup={{ lat: trip.pickupLat, lng: trip.pickupLng }}
              dropoff={
                trip.dropoffLat != null && trip.dropoffLng != null
                  ? { lat: trip.dropoffLat, lng: trip.dropoffLng }
                  : null
              }
              driver={driverLoc}
              polyline={trip.routePolyline}
              navPolyline={navRoute?.routePolyline}
              actualPolyline={trip.status === 'IN_PROGRESS' ? trip.actualRoutePolyline : null}
              mode={mapMode}
              followDriver={followDriver}
              height={640}
            />
          </View>

          <View style={styles.fullMapFooter}>
            <TouchableOpacity style={[styles.inAppMapBtn, { flex: 1 }]} onPress={() => setFullMapOpen(false)}>
              <Text style={styles.navTxt}>Quay lại thao tác đơn</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.extMapBtn} onPress={openExternalNavigation}>
              <Ionicons name="navigate-outline" size={16} color={COLORS.text} />
              <Text style={styles.extMapTxt}>Google Maps</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <DriverAddressModal
        visible={showDropoffModal}
        biasCoord={{ lat: trip.pickupLat, lng: trip.pickupLng }}
        onClose={() => setShowDropoffModal(false)}
        onSelect={handleUpdateDropoff}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 0 },
  navBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1D4ED8',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  navIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBannerTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  navBannerSub: { color: 'rgba(255,255,255,0.9)', fontSize: 11, marginTop: 1 },
  gpsMiniBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingPill: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#FEE2E2', ...SHADOW.card },
  floatingPillTxt: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  expandMapFab: {
    position: 'absolute',
    right: 12,
    bottom: 28,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.card,
  },
  sheet: { marginTop: -18, backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, gap: 12, ...SHADOW.card },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center' },
  stepRow: { flexDirection: 'row', gap: 6 },
  stepItem: { flex: 1, alignItems: 'center', gap: 4 },
  stepBar: { width: '100%', height: 5, borderRadius: 3, backgroundColor: '#E2E8F0' },
  stepLbl: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  proxyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    padding: 12,
    borderRadius: 16,
  },
  proxyBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    marginBottom: 4,
  },
  proxyBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900' },
  proxyName: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  proxyPhone: { fontSize: 13, fontWeight: '800', color: '#B45309', marginTop: 1 },
  customerCard: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', padding: 11, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 17, fontWeight: '900', color: COLORS.primary },
  callFab: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center' },
  routeBox: { flexDirection: 'row', gap: 10, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 14 },
  dotsCol: { alignItems: 'center', paddingVertical: 6 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  line: { width: 2, flex: 1, backgroundColor: '#CBD5E1', marginVertical: 4 },
  caption: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  addr: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  dropoffEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10 },
  dropoffEditTxt: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  fareChip: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF8F8', borderWidth: 1, borderColor: '#FECACA', padding: 12, borderRadius: 14 },
  price: { fontSize: 18, fontWeight: '900', color: COLORS.primary },
  noteBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.warningSoft, padding: 10, borderRadius: 12 },
  noteTxt: { flex: 1, fontSize: 12, color: '#92400E', fontWeight: '600' },
  navActionsRow: { flexDirection: 'row', gap: 8 },
  inAppMapBtn: { flex: 1.4, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#1D4ED8', padding: 12, borderRadius: 14 },
  extMapBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 11, paddingVertical: 12, borderRadius: 14 },
  extMapTxt: { color: COLORS.text, fontWeight: '800', fontSize: 12 },
  sosBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#DC2626', paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14 },
  sosTxt: { color: '#fff', fontWeight: '900', fontSize: 12 },
  navTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressBox: { gap: 6, backgroundColor: COLORS.primarySoft, padding: 10, borderRadius: 12 },
  progressTrack: { height: 7, backgroundColor: '#FECACA', borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 7, backgroundColor: COLORS.primary },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#D97706', padding: 12, borderRadius: 12 },
  checklist: { gap: 9, borderTopWidth: 1, borderColor: '#E2E8F0', paddingTop: 12 },
  trackSummary: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', padding: 9, borderRadius: 10 },
  trackSummaryTxt: { flex: 1, fontSize: 11, fontWeight: '700', color: COLORS.primaryDark },
  checkPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  checkPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  checkPillOk: { backgroundColor: COLORS.successSoft },
  checkPillTxt: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  camRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', padding: 12, borderRadius: 14 },
  camTxt: { fontSize: 13, fontWeight: '700', color: COLORS.text, flex: 1 },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  thumbWrap: { position: 'relative' },
  thumb: { width: 66, height: 66, borderRadius: 10, backgroundColor: '#E2E8F0' },
  videoThumb: { width: 66, height: 66, borderRadius: 10, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center', gap: 2 },
  thumbDel: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#fff' },
  ctaBtn: { padding: 15, borderRadius: 16, alignItems: 'center' },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  bold: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textMuted },
  tiny: { fontSize: 11, color: COLORS.textLight },
  fullMapRoot: { flex: 1, backgroundColor: '#FFFFFF' },
  fullMapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.primary,
    paddingTop: 42,
    paddingBottom: 12,
    paddingHorizontal: 14,
  },
  fullMapClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  followBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  fullMapFooter: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E2E8F0' },
});
