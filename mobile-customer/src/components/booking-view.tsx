import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { customerApi, fmtMoney } from '../api';
import { COLORS, GRADIENTS, SHADOW } from '../theme';
import { OsmMapView } from './osm-map-view';
import { AddressSearchModal, PlaceItem } from './address-search-modal';

const SAVED_PLACES_KEY = 'lxh_customer_saved_places';

export function BookingView({ onTripCreated }: { onTripCreated: (trip: any) => void }) {
  const [pickupAddress, setPickupAddress] = useState('Quảng trường Võ Nguyên Giáp, TP. Thái Nguyên');
  const [pickupCoord, setPickupCoord] = useState({ lat: 21.5931, lng: 105.8442 });
  const [dropoffAddress, setDropoffAddress] = useState('');
  const [dropoffCoord, setDropoffCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [mapTapTarget, setMapTapTarget] = useState<'pickup' | 'dropoff'>('pickup');
  const [isBookingForOther, setIsBookingForOther] = useState(false);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [partnerCode, setPartnerCode] = useState('');
  const [note, setNote] = useState('');
  const [estimate, setEstimate] = useState<any>(null);
  const [locating, setLocating] = useState(false);
  const [booking, setBooking] = useState(false);
  const [searchMode, setSearchMode] = useState<'pickup' | 'dropoff' | 'save_home' | 'save_work' | null>(null);
  const [savedPlaces, setSavedPlaces] = useState<Array<{ tag: string; place: PlaceItem }>>([]);

  useEffect(() => {
    AsyncStorage.getItem(SAVED_PLACES_KEY)
      .then((raw) => {
        if (raw) setSavedPlaces(JSON.parse(raw));
      })
      .catch(() => undefined);
  }, []);

  const persistSavedPlace = async (tag: string, place: PlaceItem) => {
    const next = [...savedPlaces.filter((s) => s.tag !== tag), { tag, place }];
    setSavedPlaces(next);
    await AsyncStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
  };

  const reverseLookup = async (lat: number, lng: number, target: 'pickup' | 'dropoff' = 'pickup') => {
    try {
      const res = await customerApi<{ address: string }>(`/map/reverse?lat=${lat}&lng=${lng}`);
      if (target === 'pickup') setPickupAddress(res.address);
      else setDropoffAddress(res.address);
    } catch {
      const fallback = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
      if (target === 'pickup') setPickupAddress(fallback);
      else setDropoffAddress(fallback);
    }
  };

  const locateMe = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          const c = { lat: last.coords.latitude, lng: last.coords.longitude };
          setPickupCoord(c);
          reverseLookup(c.lat, c.lng);
        }
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((r) => setTimeout(() => r(null), 4000)),
        ]);
        if (loc) {
          const coord = { lat: loc.coords.latitude, lng: loc.coords.longitude };
          setPickupCoord(coord);
          await reverseLookup(coord.lat, coord.lng);
        } else if (!last) {
          await reverseLookup(pickupCoord.lat, pickupCoord.lng);
        }
      } else {
        await reverseLookup(pickupCoord.lat, pickupCoord.lng);
      }
    } catch {
      await reverseLookup(pickupCoord.lat, pickupCoord.lng);
    } finally {
      setLocating(false);
    }
  };

  useEffect(() => {
    locateMe();
  }, []);

  useEffect(() => {
    if (!dropoffCoord) {
      setEstimate(null);
      return;
    }
    let cancelled = false;
    customerApi('/trips/estimate', {
      method: 'POST',
      body: JSON.stringify({
        pickupLat: pickupCoord.lat,
        pickupLng: pickupCoord.lng,
        dropoffLat: dropoffCoord.lat,
        dropoffLng: dropoffCoord.lng,
      }),
    })
      .then((res) => {
        if (!cancelled) setEstimate(res);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [pickupCoord.lat, pickupCoord.lng, dropoffCoord?.lat, dropoffCoord?.lng]);

  const handleBookOneTap = async () => {
    if (booking) return;
    if (isBookingForOther) {
      const cleanPhone = passengerPhone.trim();
      if (!cleanPhone || !/^[\d+\s.-]{8,16}$/.test(cleanPhone)) {
        return Alert.alert(
          'Thiếu SĐT người đi',
          'Khi đặt hộ cho người khác, vui lòng nhập số điện thoại liên hệ hợp lệ để tài xế gọi đón khách.',
        );
      }
    }
    setBooking(true);
    try {
      const trip = await customerApi('/trips', {
        method: 'POST',
        body: JSON.stringify({
          pickupAddress: pickupAddress || 'Vị trí hiện tại',
          pickupLat: pickupCoord.lat,
          pickupLng: pickupCoord.lng,
          dropoffAddress: dropoffAddress.trim() || undefined,
          dropoffLat: dropoffCoord?.lat,
          dropoffLng: dropoffCoord?.lng,
          isBookingForOther,
          passengerName: isBookingForOther ? passengerName.trim() || undefined : undefined,
          passengerPhone: isBookingForOther ? passengerPhone.trim() : undefined,
          partnerCode: partnerCode.trim() ? partnerCode.trim().toUpperCase() : undefined,
          note: note.trim() || undefined,
        }),
      });
      onTripCreated(trip);
    } catch (e: any) {
      Alert.alert('Lỗi đặt xe', e.message);
    } finally {
      setBooking(false);
    }
  };

  const nowHour = new Date().getHours();
  const isNightNow = nowHour >= 22 || nowHour < 7;
  const homePlace = savedPlaces.find((p) => p.tag === 'Nhà riêng')?.place;
  const workPlace = savedPlaces.find((p) => p.tag === 'Công ty')?.place;

  return (
    <View style={styles.root}>
      {/* Full-bleed Map Hero with Floating Pill & GPS Button */}
      <View style={styles.mapContainer}>
        <OsmMapView
          pickup={pickupCoord}
          dropoff={dropoffCoord}
          polyline={estimate?.routePolyline}
          height={275}
          interactive
          hintText={
            mapTapTarget === 'pickup'
              ? 'Chạm bản đồ để chỉnh ĐIỂM ĐÓN'
              : 'Chạm bản đồ để chọn ĐIỂM TRẢ'
          }
          onSelectPickup={(lat, lng) => {
            if (mapTapTarget === 'pickup') {
              setPickupCoord({ lat, lng });
              reverseLookup(lat, lng, 'pickup');
            } else {
              setDropoffCoord({ lat, lng });
              reverseLookup(lat, lng, 'dropoff');
            }
          }}
        />
        <View style={styles.mapTargetSwitch}>
          <TouchableOpacity
            style={[styles.mapTargetBtn, mapTapTarget === 'pickup' && styles.mapTargetBtnOn]}
            onPress={() => setMapTapTarget('pickup')}
          >
            <Text style={[styles.mapTargetTxt, mapTapTarget === 'pickup' && styles.mapTargetTxtOn]}>
              Chấm đón
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mapTargetBtn, mapTapTarget === 'dropoff' && styles.mapTargetBtnRed]}
            onPress={() => setMapTapTarget('dropoff')}
          >
            <Text style={[styles.mapTargetTxt, mapTapTarget === 'dropoff' && styles.mapTargetTxtOn]}>
              Chấm trả
            </Text>
          </TouchableOpacity>
        </View>
        {estimate ? (
          <View style={styles.floatingPill}>
            <Text style={styles.floatingPillTxt}>
              {estimate.distanceKm} km · ~{estimate.durationMin} phút
            </Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.gpsFab} onPress={locateMe} activeOpacity={0.85}>
          {locating ? (
            <ActivityIndicator size="small" color={COLORS.primary} />
          ) : (
            <Ionicons name="locate" size={20} color={COLORS.primary} />
          )}
        </TouchableOpacity>
      </View>

      {/* Overlapping Rounded White Sheet Card */}
      <View style={styles.sheet}>
        <View style={styles.dragHandle} />

        {/* Vertical Route Connector */}
        <View style={styles.routeCard}>
          <View style={styles.dotsCol}>
            <View style={[styles.dot, { backgroundColor: COLORS.success }]} />
            <View style={styles.dottedLine} />
            <View style={[styles.dot, { backgroundColor: COLORS.primary }]} />
          </View>

          <View style={styles.routeInputs}>
            <TouchableOpacity style={styles.routeRow} onPress={() => setSearchMode('pickup')}>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeCaption}>Điểm đón</Text>
                <Text style={styles.routeValue} numberOfLines={1}>
                  {pickupAddress}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
            </TouchableOpacity>

            <View style={styles.divider} />

            <TouchableOpacity style={styles.routeRow} onPress={() => setSearchMode('dropoff')}>
              <View style={{ flex: 1 }}>
                <Text style={styles.routeCaption}>Điểm trả (tùy chọn)</Text>
                <Text
                  style={[styles.routeValue, !dropoffAddress && { color: COLORS.textLight }]}
                  numberOfLines={1}
                >
                  {dropoffAddress || 'Bạn muốn đến đâu? (Xem giá trước)'}
                </Text>
              </View>
              {dropoffAddress ? (
                <TouchableOpacity
                  onPress={() => {
                    setDropoffAddress('');
                    setDropoffCoord(null);
                  }}
                >
                  <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
                </TouchableOpacity>
              ) : (
                <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Quick Saved Places Row */}
        <View style={styles.savedRow}>
          <TouchableOpacity
            style={styles.savedChip}
            onPress={() => {
              if (homePlace) {
                setDropoffAddress(homePlace.address);
                setDropoffCoord({ lat: homePlace.lat, lng: homePlace.lng });
              } else {
                setSearchMode('save_home');
              }
            }}
          >
            <Ionicons name="home-outline" size={15} color={COLORS.primary} />
            <Text style={styles.savedChipTxt}>{homePlace ? 'Về nhà' : '+ Thêm Nhà'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.savedChip}
            onPress={() => {
              if (workPlace) {
                setDropoffAddress(workPlace.address);
                setDropoffCoord({ lat: workPlace.lat, lng: workPlace.lng });
              } else {
                setSearchMode('save_work');
              }
            }}
          >
            <Ionicons name="briefcase-outline" size={15} color={COLORS.primary} />
            <Text style={styles.savedChipTxt}>{workPlace ? 'Công ty' : '+ Thêm Công ty'}</Text>
          </TouchableOpacity>
        </View>

        {/* Service & Transparent Fare Summary Card */}
        <View style={styles.serviceCard}>
          <View style={styles.serviceTop}>
            <View style={styles.serviceLeft}>
              <LinearGradient colors={GRADIENTS.brand} style={styles.carBadge}>
                <Ionicons name="car-sport-outline" size={22} color="#fff" />
              </LinearGradient>
              <View style={{ flex: 1 }}>
                <Text style={styles.serviceTitle}>NOW Lái Xe Hộ Ô Tô</Text>
                <Text style={styles.serviceSub}>
                  {estimate
                    ? `${estimate.distanceKm} km · Khung giờ ${estimate.timeSlot === 'DAY' ? 'Ban ngày' : 'Ban đêm'}`
                    : isNightNow
                      ? 'Ban đêm (22h–07h): 200.000đ / 5km đầu'
                      : 'Ban ngày (07h–22h): 150.000đ / 5km đầu'}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.fareBig}>
                {estimate ? fmtMoney(estimate.price) : isNightNow ? '200.000đ+' : '150.000đ+'}
              </Text>
              <Text style={styles.payHint}>Trả trực tiếp TX</Text>
            </View>
          </View>

          {estimate && (
            <View style={styles.breakdownBox}>
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownTxt}>
                  Giá mở cửa ({estimate.baseKm ?? 5} km đầu)
                </Text>
                <Text style={styles.breakdownVal}>{fmtMoney(estimate.basePrice)}</Text>
              </View>
              {(estimate.extraKm ?? 0) > 0 && (
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownTxt}>
                    Phụ trội {estimate.extraKm} km × {fmtMoney(estimate.perKmPrice)}/km
                  </Text>
                  <Text style={styles.breakdownVal}>{fmtMoney(estimate.extraFee)}</Text>
                </View>
              )}
              {estimate.routeSource === 'FALLBACK_HAVERSINE' && (
                <Text style={styles.fallbackNote}>
                  * Quãng đường ước tính tạm thời khi đường truyền bản đồ gián đoạn.
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Lựa chọn Đặt hộ cho người khác */}
        <View style={styles.proxyCard}>
          <TouchableOpacity
            style={styles.proxyToggleRow}
            activeOpacity={0.8}
            onPress={() => setIsBookingForOther((v) => !v)}
          >
            <View style={[styles.checkbox, isBookingForOther && styles.checkboxChecked]}>
              {isBookingForOther && <Ionicons name="checkmark" size={14} color="#fff" />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.proxyTitle}>Đặt hộ cho người khác</Text>
              <Text style={styles.proxySub}>Ghi rõ tên & SĐT người đi để tài xế liên hệ trực tiếp</Text>
            </View>
            <Ionicons
              name={isBookingForOther ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={COLORS.textMuted}
            />
          </TouchableOpacity>

          {isBookingForOther && (
            <View style={styles.proxyFields}>
              <View style={styles.proxyInputRow}>
                <Ionicons name="person-outline" size={16} color={COLORS.primary} />
                <TextInput
                  style={styles.noteInput}
                  value={passengerName}
                  onChangeText={setPassengerName}
                  placeholder="Tên người đi (VD: Anh Hùng)"
                  placeholderTextColor={COLORS.textLight}
                />
              </View>
              <View style={styles.proxyInputRow}>
                <Ionicons name="call-outline" size={16} color={COLORS.primary} />
                <TextInput
                  style={styles.noteInput}
                  value={passengerPhone}
                  onChangeText={setPassengerPhone}
                  keyboardType="phone-pad"
                  placeholder="Số điện thoại người liên hệ *"
                  placeholderTextColor={COLORS.textLight}
                />
              </View>
            </View>
          )}
        </View>

        {/* Optional Note */}
        <View style={styles.noteBox}>
          <Ionicons name="create-outline" size={16} color={COLORS.textMuted} />
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder="Ghi chú cho tài xế (biển số 20A..., vị trí đứng...)"
            placeholderTextColor={COLORS.textLight}
          />
        </View>

        {/* Mã đối tác Quán / Nhà hàng / CTV (tùy chọn) */}
        <View style={styles.noteBox}>
          <Ionicons name="storefront-outline" size={16} color={COLORS.primary} />
          <TextInput
            style={styles.noteInput}
            value={partnerCode}
            onChangeText={(t) => setPartnerCode(t.toUpperCase())}
            autoCapitalize="characters"
            placeholder="Mã quán / đối tác CTV nếu có (VD: QUAN01)"
            placeholderTextColor={COLORS.textLight}
          />
        </View>

        {/* NOW Red Gradient Booking CTA */}
        <TouchableOpacity activeOpacity={0.88} onPress={handleBookOneTap} disabled={booking}>
          <LinearGradient
            colors={GRADIENTS.brand}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.ctaBtn, booking && { opacity: 0.65 }]}
          >
            {booking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.ctaTxt}>
                {estimate
                  ? `Gọi lái hộ NOW · ${fmtMoney(estimate.price)}  →`
                  : 'Gọi lái hộ 1 chạm ngay  →'}
              </Text>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <AddressSearchModal
        visible={searchMode !== null}
        title={
          searchMode === 'pickup'
            ? 'Chọn điểm đón'
            : searchMode === 'save_home'
              ? 'Lưu địa chỉ Nhà riêng'
              : searchMode === 'save_work'
                ? 'Lưu địa chỉ Công ty'
                : 'Chọn điểm trả'
        }
        biasCoord={pickupCoord}
        savedPlaces={savedPlaces}
        onClose={() => setSearchMode(null)}
        onSelect={async (item) => {
          if (searchMode === 'pickup') {
            setPickupAddress(item.address);
            setPickupCoord({ lat: item.lat, lng: item.lng });
          } else if (searchMode === 'save_home') {
            await persistSavedPlace('Nhà riêng', item);
            setDropoffAddress(item.address);
            setDropoffCoord({ lat: item.lat, lng: item.lng });
          } else if (searchMode === 'save_work') {
            await persistSavedPlace('Công ty', item);
            setDropoffAddress(item.address);
            setDropoffCoord({ lat: item.lat, lng: item.lng });
          } else {
            setDropoffAddress(item.address);
            setDropoffCoord({ lat: item.lat, lng: item.lng });
          }
          setSearchMode(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 0 },
  mapContainer: { position: 'relative' },
  floatingPill: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    ...SHADOW.card,
  },
  floatingPillTxt: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  mapTargetSwitch: {
    position: 'absolute',
    top: 12,
    right: 10,
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 3,
    gap: 3,
    ...SHADOW.card,
  },
  mapTargetBtn: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 13 },
  mapTargetBtnOn: { backgroundColor: COLORS.success },
  mapTargetBtnRed: { backgroundColor: COLORS.primary },
  mapTargetTxt: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted },
  mapTargetTxtOn: { color: '#fff' },
  proxyCard: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 11,
    gap: 10,
  },
  proxyToggleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D97706',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  proxyTitle: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  proxySub: { fontSize: 11, color: '#92400E' },
  proxyFields: { gap: 8 },
  proxyInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCD34D',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  gpsFab: {
    position: 'absolute',
    right: 12,
    bottom: 30,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOW.card,
  },
  sheet: {
    marginTop: -18,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    gap: 12,
    ...SHADOW.card,
  },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 2 },
  routeCard: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  dotsCol: { alignItems: 'center', justifyContent: 'center', paddingVertical: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dottedLine: { width: 2, flex: 1, backgroundColor: '#CBD5E1', marginVertical: 4 },
  routeInputs: { flex: 1 },
  routeRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  routeCaption: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  routeValue: { fontSize: 14, fontWeight: '700', color: COLORS.text, marginTop: 1 },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 2 },
  savedRow: { flexDirection: 'row', gap: 8 },
  savedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  savedChipTxt: { fontSize: 12, fontWeight: '700', color: COLORS.primaryDark },
  serviceCard: {
    backgroundColor: '#FFF8F8',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  serviceTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  serviceLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  carBadge: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  serviceTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  serviceSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  fareBig: { fontSize: 17, fontWeight: '900', color: COLORS.primary },
  payHint: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  breakdownBox: {
    borderTopWidth: 1,
    borderColor: '#FEE2E2',
    paddingTop: 8,
    gap: 4,
  },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  breakdownTxt: { fontSize: 11, color: '#475569' },
  breakdownVal: { fontSize: 11, fontWeight: '700', color: COLORS.text },
  fallbackNote: { fontSize: 10, color: '#B45309', marginTop: 2 },
  noteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  noteInput: { flex: 1, fontSize: 13, color: COLORS.text, paddingVertical: 2 },
  ctaBtn: { paddingVertical: 15, borderRadius: 16, alignItems: 'center' },
  ctaTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
});
