import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import { API_BASE, customerApi, setCustomerToken } from './src/api';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [phone, setPhone] = useState('0900000001');
  const [otp, setOtp] = useState('123456');
  const [otpSent, setOtpSent] = useState(false);

  const [tab, setTab] = useState<'book' | 'history'>('book');
  const [pickupAddress, setPickupAddress] = useState('Vị trí hiện tại của tôi');
  const [pickupCoord, setPickupCoord] = useState({ lat: 10.7769, lng: 106.7009 });
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoord, setDropoffCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [estimate, setEstimate] = useState<any>(null);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setPickupCoord({ lat: loc.coords.latitude, lng: loc.coords.longitude });
      }
    })();
  }, []);

  useEffect(() => {
    if (!user) return;
    const socket = io(`${API_BASE}/ws`, {
      query: { userId: user.id, role: 'CUSTOMER' },
    });
    socket.on('trip:status', (trip: any) => {
      setActiveTrip(trip);
      if (trip.status === 'COMPLETED' || trip.status === 'CANCELLED') {
        loadHistory();
      }
    });
    socket.on('driver:location', (loc: { lat: number; lng: number }) => {
      setActiveTrip((prev: any) =>
        prev ? { ...prev, driver: { ...prev.driver, lat: loc.lat, lng: loc.lng } } : prev,
      );
    });
    loadHistory();
    return () => {
      socket.disconnect();
    };
  }, [user]);

  const requestOtp = async () => {
    try {
      await customerApi('/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone, userType: 'CUSTOMER' }),
      });
      setOtpSent(true);
    } catch (e: any) {
      Alert.alert('Lỗi', e.message);
    }
  };

  const verifyOtp = async () => {
    try {
      const res = await customerApi('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone, otp, userType: 'CUSTOMER' }),
      });
      setCustomerToken(res.accessToken);
      setUser(res.user);
    } catch (e: any) {
      Alert.alert('Lỗi', e.message);
    }
  };

  const loadHistory = async () => {
    try {
      const data = await customerApi('/trips/my-history');
      setHistory(data);
    } catch {
      // ignore
    }
  };

  const handleEstimate = async () => {
    if (!dropoffCoord) {
      // Demo coordinate offset if user only typed text
      const dest = { lat: pickupCoord.lat + 0.04, lng: pickupCoord.lng + 0.03 };
      setDropoffCoord(dest);
      const res = await customerApi('/trips/estimate', {
        method: 'POST',
        body: JSON.stringify({
          pickupLat: pickupCoord.lat,
          pickupLng: pickupCoord.lng,
          dropoffLat: dest.lat,
          dropoffLng: dest.lng,
        }),
      });
      setEstimate(res);
      return;
    }
    const res = await customerApi('/trips/estimate', {
      method: 'POST',
      body: JSON.stringify({
        pickupLat: pickupCoord.lat,
        pickupLng: pickupCoord.lng,
        dropoffLat: dropoffCoord.lat,
        dropoffLng: dropoffCoord.lng,
      }),
    });
    setEstimate(res);
  };

  const handleBookOneTap = async () => {
    try {
      const trip = await customerApi('/trips', {
        method: 'POST',
        body: JSON.stringify({
          pickupAddress,
          pickupLat: pickupCoord.lat,
          pickupLng: pickupCoord.lng,
          dropoffAddress: dropoffAddress || undefined,
          dropoffLat: dropoffCoord?.lat,
          dropoffLng: dropoffCoord?.lng,
        }),
      });
      setActiveTrip(trip);
    } catch (e: any) {
      Alert.alert('Lỗi đặt xe', e.message);
    }
  };

  const handleCancelTrip = async () => {
    if (!activeTrip) return;
    try {
      const updated = await customerApi(`/trips/${activeTrip.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Khách hàng hủy trên ứng dụng' }),
      });
      setActiveTrip(updated);
    } catch (e: any) {
      Alert.alert('Không thể hủy', e.message);
    }
  };

  if (!user) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.card}>
          <Text style={styles.title}>Lái Xe Hộ – Khách Hàng</Text>
          <Text style={styles.subtitle}>Đăng nhập bằng số điện thoại</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Số điện thoại" />
          {otpSent && (
            <TextInput style={styles.input} value={otp} onChangeText={setOtp} keyboardType="number-pad" placeholder="Mã OTP (6 số)" />
          )}
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
        <Text style={styles.headerTitle}>Xin chào, {user.name || user.phone}</Text>
        <View style={styles.tabs}>
          <TouchableOpacity onPress={() => setTab('book')} style={[styles.tabBtn, tab === 'book' && styles.tabActive]}>
            <Text style={styles.tabText}>Đặt lái hộ</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { setTab('history'); loadHistory(); }} style={[styles.tabBtn, tab === 'history' && styles.tabActive]}>
            <Text style={styles.tabText}>Lịch sử</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {tab === 'book' ? (
          activeTrip && !['COMPLETED', 'CANCELLED'].includes(activeTrip.status) ? (
            <View style={styles.card}>
              <Text style={styles.title}>Chuyến {activeTrip.code}</Text>
              <Text style={styles.badge}>Trạng thái: {activeTrip.status}</Text>
              <Text style={styles.info}>Điểm đón: {activeTrip.pickupAddress}</Text>
              {activeTrip.dropoffAddress && <Text style={styles.info}>Điểm đến: {activeTrip.dropoffAddress}</Text>}
              {activeTrip.estimatedPrice && (
                <Text style={styles.price}>Giá dự kiến: {activeTrip.estimatedPrice.toLocaleString('vi-VN')}đ</Text>
              )}
              {activeTrip.driver && (
                <View style={styles.driverBox}>
                  <Text style={styles.info}>Tài xế: {activeTrip.driver.name || activeTrip.driver.phone}</Text>
                  <TouchableOpacity
                    style={styles.callBtn}
                    onPress={() => Linking.openURL(`tel:${activeTrip.driver.phone}`)}
                  >
                    <Text style={styles.btnText}>Gọi tài xế ({activeTrip.driver.phone})</Text>
                  </TouchableOpacity>
                </View>
              )}
              {activeTrip.status !== 'IN_PROGRESS' && (
                <TouchableOpacity style={styles.dangerBtn} onPress={handleCancelTrip}>
                  <Text style={styles.btnText}>Hủy chuyến</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.card}>
              <Text style={styles.label}>Điểm đón (Tự định vị GPS)</Text>
              <TextInput style={styles.input} value={pickupAddress} onChangeText={setPickupAddress} />
              <Text style={styles.label}>Điểm đến (Không bắt buộc)</Text>
              <TextInput
                style={styles.input}
                value={dropoffAddress}
                onChangeText={setDropoffAddress}
                placeholder="Nhập điểm đến để xem giá dự kiến"
              />
              {dropoffAddress.length > 0 && (
                <TouchableOpacity style={styles.secondaryBtn} onPress={handleEstimate}>
                  <Text style={styles.secondaryText}>Xem giá dự kiến</Text>
                </TouchableOpacity>
              )}
              {estimate && (
                <View style={styles.estimateBox}>
                  <Text style={styles.price}>
                    {estimate.price.toLocaleString('vi-VN')}đ ({estimate.distanceKm} km · {estimate.timeSlot})
                  </Text>
                </View>
              )}
              <TouchableOpacity style={styles.primaryBtn} onPress={handleBookOneTap}>
                <Text style={styles.btnText}>GỌI LÁI HỘ NGAY (1 CHẠM)</Text>
              </TouchableOpacity>
            </View>
          )
        ) : (
          history.map((h) => (
            <View key={h.id} style={styles.card}>
              <Text style={styles.title}>{h.code} – {h.status}</Text>
              <Text style={styles.info}>{h.pickupAddress} → {h.dropoffAddress || '—'}</Text>
              <Text style={styles.price}>
                {(h.finalPrice ?? h.estimatedPrice ?? 0).toLocaleString('vi-VN')}đ
              </Text>
              <Text style={styles.subtitle}>Ảnh/Video tình trạng xe: {h.media?.length ?? 0} tệp</Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', padding: 16 },
  header: { marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  tabs: { flexDirection: 'row', gap: 8 },
  tabBtn: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e2e8f0' },
  tabActive: { backgroundColor: '#4f46e5' },
  tabText: { fontWeight: '600', color: '#1e293b' },
  scroll: { gap: 12, paddingBottom: 24 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 10, elevation: 2 },
  title: { fontSize: 18, fontWeight: '700', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b' },
  label: { fontSize: 13, fontWeight: '600', color: '#334155' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 15 },
  primaryBtn: { backgroundColor: '#4f46e5', padding: 14, borderRadius: 12, alignItems: 'center' },
  secondaryBtn: { backgroundColor: '#e0e7ff', padding: 12, borderRadius: 10, alignItems: 'center' },
  secondaryText: { color: '#3730a3', fontWeight: '600' },
  callBtn: { backgroundColor: '#059669', padding: 12, borderRadius: 10, alignItems: 'center', marginTop: 6 },
  dangerBtn: { backgroundColor: '#dc2626', padding: 12, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  badge: { color: '#4f46e5', fontWeight: '700' },
  info: { fontSize: 14, color: '#334155' },
  price: { fontSize: 17, fontWeight: '700', color: '#059669' },
  driverBox: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 10 },
  estimateBox: { backgroundColor: '#ecfdf5', padding: 12, borderRadius: 10 },
});
