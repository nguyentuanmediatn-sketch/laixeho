import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { io } from 'socket.io-client';
import { API_BASE, driverApi, setDriverToken } from './src/api';

export default function App() {
  const [driver, setDriver] = useState<any>(null);
  const [phone, setPhone] = useState('0900000002');
  const [otp, setOtp] = useState('123456');
  const [otpSent, setOtpSent] = useState(false);

  const [tab, setTab] = useState<'home' | 'wallet' | 'fee'>('home');
  const [incomingOffer, setIncomingOffer] = useState<any>(null);
  const [countdown, setCountdown] = useState(0);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [walletData, setWalletData] = useState<any>(null);
  const [pickupMediaCount, setPickupMediaCount] = useState({ plate: 0, photos: 0, videos: 0 });
  const [dropoffPhotos, setDropoffPhotos] = useState(0);

  useEffect(() => {
    if (!driver) return;
    const socket = io(`${API_BASE}/ws`, {
      query: { userId: driver.id, role: 'DRIVER' },
    });
    socket.on('trip:offer', (offer: any) => {
      setIncomingOffer(offer);
      setCountdown(offer.timeoutSec || 30);
    });
    socket.on('driver:locked', (info: any) => {
      setIncomingOffer(null);
      Alert.alert('Tạm khóa nhận đơn', `Bạn bị khóa nhận đơn ${info.lockMinutes} phút.`);
      refreshMe();
    });
    socket.on('trip:status', (trip: any) => {
      setActiveTrip(trip);
    });
    refreshMe();
    loadWallet();
    return () => {
      socket.disconnect();
    };
  }, [driver?.id]);

  // Offer countdown timer
  useEffect(() => {
    if (!incomingOffer || countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [incomingOffer, countdown]);

  // Send GPS location every 10s when online
  useEffect(() => {
    if (!driver?.isOnline) return;
    const interval = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({});
        await driverApi('/driver/location', {
          method: 'POST',
          body: JSON.stringify({ lat: loc.coords.latitude, lng: loc.coords.longitude }),
        });
      } catch {
        // ignore
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [driver?.isOnline]);

  const refreshMe = async () => {
    const me = await driverApi('/driver/me');
    setDriver(me);
  };

  const loadWallet = async () => {
    const data = await driverApi('/driver/wallet');
    setWalletData(data);
  };

  const requestOtp = async () => {
    try {
      await driverApi('/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone, userType: 'DRIVER' }),
      });
      setOtpSent(true);
    } catch (e: any) {
      Alert.alert('Lỗi', e.message);
    }
  };

  const verifyOtp = async () => {
    try {
      const res = await driverApi('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, otp, userType: 'DRIVER' }),
      });
      setDriverToken(res.accessToken);
      setDriver(res.user);
    } catch (e: any) {
      Alert.alert('Lỗi', e.message);
    }
  };

  const toggleOnline = async (val: boolean) => {
    try {
      if (val) {
        await Location.requestForegroundPermissionsAsync();
      }
      const updated = await driverApi('/driver/online', {
        method: 'PATCH',
        body: JSON.stringify({ isOnline: val }),
      });
      setDriver((prev: any) => ({ ...prev, isOnline: updated.isOnline }));
    } catch (e: any) {
      Alert.alert('Không thể bật trực tuyến', e.message);
    }
  };

  const acceptOffer = async () => {
    if (!incomingOffer) return;
    try {
      const trip = await driverApi(`/trips/offers/${incomingOffer.offerId}/accept`, {
        method: 'POST',
      });
      setIncomingOffer(null);
      setActiveTrip(trip);
      setPickupMediaCount({ plate: 0, photos: 0, videos: 0 });
      setDropoffPhotos(0);
    } catch (e: any) {
      Alert.alert('Lỗi', e.message);
      setIncomingOffer(null);
    }
  };

  const rejectOffer = async () => {
    if (!incomingOffer) return;
    await driverApi(`/trips/offers/${incomingOffer.offerId}/reject`, { method: 'POST' });
    setIncomingOffer(null);
  };

  const openNavigation = (lat: number, lng: number) => {
    const url =
      Platform.OS === 'ios'
        ? `maps://app?daddr=${lat},${lng}`
        : `google.navigation:q=${lat},${lng}`;
    Linking.openURL(url);
  };

  const captureAndUploadMedia = async (
    stage: 'PICKUP' | 'DROPOFF',
    type: 'IMAGE' | 'VIDEO',
    isPlatePhoto = false,
  ) => {
    if (!activeTrip) return;
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return Alert.alert('Thiếu quyền', 'Cần cấp quyền Camera để chụp/quay xe');

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: type === 'VIDEO' ? ['videos'] : ['images'],
      videoMaxDuration: 60,
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    const ext = type === 'VIDEO' ? 'mp4' : 'jpg';
    const contentType = type === 'VIDEO' ? 'video/mp4' : 'image/jpeg';

    const presign = await driverApi(`/trips/${activeTrip.id}/media/presign`, {
      method: 'POST',
      body: JSON.stringify({ ext, contentType }),
    });

    await driverApi(`/trips/${activeTrip.id}/media`, {
      method: 'POST',
      body: JSON.stringify({
        type,
        stage,
        isPlatePhoto,
        url: presign.publicUrl,
        durationSec: asset.duration ? Math.ceil(asset.duration / 1000) : undefined,
      }),
    });

    if (stage === 'PICKUP') {
      setPickupMediaCount((c) => ({
        plate: c.plate + (isPlatePhoto ? 1 : 0),
        photos: c.photos + (type === 'IMAGE' ? 1 : 0),
        videos: c.videos + (type === 'VIDEO' ? 1 : 0),
      }));
    } else {
      setDropoffPhotos((c) => c + 1);
    }
    Alert.alert('Thành công', 'Đã tải lên tệp kiểm tra xe');
  };

  const markArrived = async () => {
    const updated = await driverApi(`/trips/${activeTrip.id}/arrived`, { method: 'POST' });
    setActiveTrip(updated);
  };

  const startTrip = async () => {
    try {
      const updated = await driverApi(`/trips/${activeTrip.id}/start`, { method: 'POST' });
      setActiveTrip(updated);
    } catch (e: any) {
      Alert.alert('Chưa đủ điều kiện', e.message);
    }
  };

  const completeTrip = async () => {
    try {
      const updated = await driverApi(`/trips/${activeTrip.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setActiveTrip(null);
      loadWallet();
      Alert.alert(
        'Hoàn thành chuyến',
        `Thu của khách: ${(updated.finalPrice ?? 0).toLocaleString('vi-VN')}đ\nĐã trừ chiết khấu: ${(updated.commissionAmount ?? 0).toLocaleString('vi-VN')}đ`,
      );
    } catch (e: any) {
      Alert.alert('Chưa thể hoàn thành', e.message);
    }
  };

  if (!driver) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Lái Xe Hộ – Tài Xế</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Số điện thoại" />
          {otpSent && <TextInput style={styles.input} value={otp} onChangeText={setOtp} keyboardType="number-pad" placeholder="Mã OTP" />}
          <TouchableOpacity style={styles.primaryBtn} onPress={otpSent ? verifyOtp : requestOtp}>
            <Text style={styles.btnText}>{otpSent ? 'Xác nhận OTP' : 'Gửi mã OTP'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.rowBetween}>
          <Text style={styles.headerTitle}>{driver.name || driver.phone}</Text>
          <View style={styles.row}>
            <Text style={styles.label}>{driver.isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}</Text>
            <Switch value={Boolean(driver.isOnline)} onValueChange={toggleOnline} />
          </View>
        </View>
        <View style={styles.tabs}>
          {(['home', 'wallet', 'fee'] as const).map((t) => (
            <TouchableOpacity key={t} onPress={() => setTab(t)} style={[styles.tabBtn, tab === t && styles.tabActive]}>
              <Text style={styles.tabText}>{t === 'home' ? 'Nhận đơn' : t === 'wallet' ? 'Ví' : 'Phí duy trì'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {tab === 'home' && (
          <>
            {incomingOffer && (
              <View style={[styles.card, { borderColor: '#4f46e5', borderWidth: 2 }]}>
                <Text style={styles.title}>ĐƠN MỚI ({countdown}s)</Text>
                <Text style={styles.info}>Đón: {incomingOffer.pickupAddress} (cách {incomingOffer.distanceToPickupKm} km)</Text>
                {incomingOffer.dropoffAddress && <Text style={styles.info}>Trả: {incomingOffer.dropoffAddress}</Text>}
                {incomingOffer.estimatedPrice && (
                  <Text style={styles.price}>Giá dự kiến: {incomingOffer.estimatedPrice.toLocaleString('vi-VN')}đ</Text>
                )}
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.primaryBtn, { flex: 1 }]} onPress={acceptOffer}>
                    <Text style={styles.btnText}>NHẬN ĐƠN</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.dangerBtn, { flex: 1 }]} onPress={rejectOffer}>
                    <Text style={styles.btnText}>TỪ CHỐI</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activeTrip ? (
              <View style={styles.card}>
                <Text style={styles.title}>Chuyến {activeTrip.code} ({activeTrip.status})</Text>
                <Text style={styles.info}>Đón: {activeTrip.pickupAddress}</Text>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => openNavigation(activeTrip.pickupLat, activeTrip.pickupLng)}
                >
                  <Text style={styles.secondaryText}>Mở bản đồ dẫn đường</Text>
                </TouchableOpacity>

                {activeTrip.status === 'ACCEPTED' && (
                  <TouchableOpacity style={styles.primaryBtn} onPress={markArrived}>
                    <Text style={styles.btnText}>ĐÃ ĐẾN ĐIỂM ĐÓN</Text>
                  </TouchableOpacity>
                )}

                {activeTrip.status === 'ARRIVED' && (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.label}>
                      Nhận xe: Biển số ({pickupMediaCount.plate}/1+) · Ảnh ({pickupMediaCount.photos}/5) · Video ({pickupMediaCount.videos}/2)
                    </Text>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => captureAndUploadMedia('PICKUP', 'IMAGE', true)}>
                      <Text style={styles.secondaryText}>1. Chụp ảnh xe + biển số (Bắt buộc)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => captureAndUploadMedia('PICKUP', 'VIDEO', false)}>
                      <Text style={styles.secondaryText}>2. Quay video quanh xe ≤ 60s (Bắt buộc)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryBtn} onPress={startTrip}>
                      <Text style={styles.btnText}>BẮT ĐẦU CHUYẾN</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {activeTrip.status === 'IN_PROGRESS' && (
                  <View style={{ gap: 8 }}>
                    <Text style={styles.label}>Ảnh bàn giao xe tại điểm trả: {dropoffPhotos}/1+</Text>
                    <TouchableOpacity style={styles.secondaryBtn} onPress={() => captureAndUploadMedia('DROPOFF', 'IMAGE', false)}>
                      <Text style={styles.secondaryText}>Chụp ảnh bàn giao xe (Bắt buộc)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.primaryBtn} onPress={completeTrip}>
                      <Text style={styles.btnText}>HOÀN THÀNH CHUYẾN</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : (
              !incomingOffer && (
                <View style={styles.card}>
                  <Text style={styles.info}>Trạng thái tài khoản: {driver.status}</Text>
                  <Text style={styles.info}>
                    {driver.isOnline ? 'Đang trực tuyến, chờ hệ thống điều phối đơn trong bán kính 3–5 km...' : 'Bật công tắc Trực tuyến để nhận đơn.'}
                  </Text>
                </View>
              )
            )}
          </>
        )}

        {tab === 'wallet' && walletData && (
          <View style={styles.card}>
            <Text style={styles.title}>Số dư ví: {(walletData.wallet?.balance ?? 0).toLocaleString('vi-VN')}đ</Text>
            <Text style={styles.info}>Hướng dẫn nạp tiền: {walletData.bankInfo}</Text>
            <Text style={styles.label}>Lịch sử giao dịch gần đây:</Text>
            {walletData.wallet?.transactions?.map((tx: any) => (
              <View key={tx.id} style={styles.txRow}>
                <Text style={styles.info}>{tx.type}: {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString('vi-VN')}đ</Text>
                <Text style={styles.subtitle}>{tx.note}</Text>
              </View>
            ))}
          </View>
        )}

        {tab === 'fee' && (
          <View style={styles.card}>
            <Text style={styles.title}>Phí duy trì hàng tháng (200.000đ)</Text>
            <Text style={styles.info}>
              Hạn đóng tiếp theo: {driver.feeDueDate ? new Date(driver.feeDueDate).toLocaleDateString('vi-VN') : 'Chưa kích hoạt'}
            </Text>
            <Text style={styles.subtitle}>Hệ thống sẽ tự động nhắc trước hạn 3 ngày và nhắc hàng ngày nếu quá hạn.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  header: { marginBottom: 12, gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: 8 },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e2e8f0' },
  tabActive: { backgroundColor: '#4f46e5' },
  tabText: { fontWeight: '600', color: '#1e293b' },
  scroll: { gap: 12, paddingBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10, elevation: 2 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 12, color: '#64748b' },
  label: { fontSize: 13, fontWeight: '600', color: '#334155' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 15 },
  primaryBtn: { backgroundColor: '#4f46e5', padding: 14, borderRadius: 12, alignItems: 'center' },
  secondaryBtn: { backgroundColor: '#e0e7ff', padding: 12, borderRadius: 10, alignItems: 'center' },
  secondaryText: { color: '#3730a3', fontWeight: '600' },
  dangerBtn: { backgroundColor: '#dc2626', padding: 14, borderRadius: 12, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  info: { fontSize: 14, color: '#334155' },
  price: { fontSize: 17, fontWeight: '700', color: '#059669' },
  txRow: { borderTopWidth: 1, borderTopColor: '#e2e8f0', paddingTop: 6 },
});
