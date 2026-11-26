import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { customerApi } from '../api';
import { COLORS } from '../theme';
import { OsmMapView } from './osm-map-view';

export interface PlaceItem {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

const QUICK_PLACES: PlaceItem[] = [
  {
    label: 'Quảng trường Võ Nguyên Giáp',
    address: 'Quảng trường Võ Nguyên Giáp, Trưng Vương, TP. Thái Nguyên',
    lat: 21.5931,
    lng: 105.8442,
  },
  {
    label: 'Vincom Plaza Thái Nguyên',
    address: '286 Lương Ngọc Quyến, Quang Trung, TP. Thái Nguyên',
    lat: 21.5945,
    lng: 105.8398,
  },
  {
    label: 'Bệnh viện Trung ương Thái Nguyên',
    address: '479 Lương Ngọc Quyến, Phan Đình Phùng, TP. Thái Nguyên',
    lat: 21.5882,
    lng: 105.8446,
  },
  {
    label: 'Đại học Thái Nguyên',
    address: 'Phường Tân Thịnh, TP. Thái Nguyên',
    lat: 21.5855,
    lng: 105.8065,
  },
  {
    label: 'Bến xe Trung tâm Thái Nguyên',
    address: 'Đường Cách Mạng Tháng 8, Đồng Quang, TP. Thái Nguyên',
    lat: 21.5819,
    lng: 105.8484,
  },
  {
    label: 'KCN Samsung Yên Bình (Phổ Yên)',
    address: 'Khu công nghiệp Yên Bình, TP. Phổ Yên, Thái Nguyên',
    lat: 21.4256,
    lng: 105.8758,
  },
];

export function AddressSearchModal({
  visible,
  title,
  biasCoord,
  savedPlaces,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  biasCoord: { lat: number; lng: number };
  savedPlaces: Array<{ tag: string; place: PlaceItem }>;
  onSelect: (item: PlaceItem) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'search' | 'map'>('search');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Trạng thái ghim bản đồ trực tiếp (Tìm vị trí trên map theo địa chỉ hoặc chạm bản đồ)
  const [pinCoord, setPinCoord] = useState<{ lat: number; lng: number }>(biasCoord);
  const [pinAddress, setPinAddress] = useState('Chạm bản đồ để chọn vị trí chính xác');
  const [reversing, setReversing] = useState(false);

  useEffect(() => {
    if (visible) {
      setMode('search');
      setPinCoord(biasCoord);
    }
  }, [visible, biasCoord.lat, biasCoord.lng]);

  // Tự động gợi ý địa chỉ khi khách gõ (debounce 450ms)
  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(() => {
      runSearch(trimmed);
    }, 450);
    return () => clearTimeout(timer);
  }, [query, visible]);

  const runSearch = async (text = query.trim()) => {
    if (text.length < 2) return;
    setLoading(true);
    try {
      const list = await customerApi<PlaceItem[]>(
        `/map/autocomplete?q=${encodeURIComponent(text)}&lat=${biasCoord.lat}&lng=${biasCoord.lng}`,
      );
      setResults(list || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const reversePin = async (lat: number, lng: number) => {
    setPinCoord({ lat, lng });
    setReversing(true);
    try {
      const res = await customerApi<{ address: string }>(`/map/reverse?lat=${lat}&lng=${lng}`);
      setPinAddress(res.address);
    } catch {
      setPinAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    } finally {
      setReversing(false);
    }
  };

  const previewOnMap = (item: PlaceItem) => {
    setPinCoord({ lat: item.lat, lng: item.lng });
    setPinAddress(item.address);
    setMode('map');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{title}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Thanh tìm địa chỉ + Chuyển chế độ Tìm / Bản đồ */}
        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={COLORS.primary} />
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Nhập tên đường, quán, địa chỉ tại Thái Nguyên..."
              placeholderTextColor={COLORS.textLight}
              autoFocus={mode === 'search'}
              returnKeyType="search"
              onSubmitEditing={() => runSearch()}
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setQuery('');
                  setResults([]);
                }}
              >
                <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={() => runSearch()}>
            <Text style={styles.searchBtnTxt}>Tìm</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.modeBar}>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'search' && styles.modeBtnActive]}
            onPress={() => setMode('search')}
          >
            <Ionicons name="list" size={15} color={mode === 'search' ? '#fff' : COLORS.textMuted} />
            <Text style={[styles.modeTxt, mode === 'search' && styles.modeTxtActive]}>
              Danh sách địa chỉ
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, mode === 'map' && styles.modeBtnActive]}
            onPress={() => {
              setMode('map');
              reversePin(pinCoord.lat, pinCoord.lng);
            }}
          >
            <Ionicons name="map" size={15} color={mode === 'map' ? '#fff' : COLORS.textMuted} />
            <Text style={[styles.modeTxt, mode === 'map' && styles.modeTxtActive]}>
              Chọn trực tiếp trên bản đồ
            </Text>
          </TouchableOpacity>
        </View>

        {mode === 'map' ? (
          <View style={styles.mapModeWrap}>
            <View style={{ flex: 1, paddingHorizontal: 12, paddingTop: 10 }}>
              <OsmMapView
                pickup={pinCoord}
                height={430}
                interactive
                hintText="Chạm trực tiếp vào điểm bạn muốn trên bản đồ"
                onSelectPickup={(lat, lng) => reversePin(lat, lng)}
              />
            </View>
            <View style={styles.mapConfirmCard}>
              <View style={styles.mapAddrRow}>
                <Ionicons name="location" size={20} color={COLORS.primary} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.mapAddrCap}>Vị trí đang chọn trên bản đồ</Text>
                  {reversing ? (
                    <ActivityIndicator size="small" color={COLORS.primary} style={{ alignSelf: 'flex-start', marginTop: 4 }} />
                  ) : (
                    <Text style={styles.mapAddrVal} numberOfLines={2}>
                      {pinAddress}
                    </Text>
                  )}
                  <Text style={styles.coordTxt}>
                    {pinCoord.lat.toFixed(5)}, {pinCoord.lng.toFixed(5)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.confirmPinBtn}
                onPress={() => {
                  onSelect({
                    label: pinAddress.split(',')[0] || pinAddress,
                    address: pinAddress,
                    lat: pinCoord.lat,
                    lng: pinCoord.lng,
                  });
                  setQuery('');
                  setResults([]);
                }}
              >
                <Text style={styles.confirmPinTxt}>Xác nhận vị trí này</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {loading && <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 14 }} />}

            {results.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.secTitle}>Kết quả tìm kiếm</Text>
                {results.map((item, idx) => (
                  <View key={idx} style={styles.row}>
                    <TouchableOpacity
                      style={styles.rowMain}
                      onPress={() => {
                        onSelect(item);
                        setQuery('');
                        setResults([]);
                      }}
                    >
                      <View style={styles.pinIcon}>
                        <Ionicons name="location" size={18} color={COLORS.primary} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{item.label}</Text>
                        <Text style={styles.rowSub} numberOfLines={2}>
                          {item.address}
                        </Text>
                      </View>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.viewMapChip}
                      onPress={() => previewOnMap(item)}
                    >
                      <Ionicons name="map-outline" size={14} color={COLORS.primary} />
                      <Text style={styles.viewMapTxt}>Map</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {savedPlaces.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.secTitle}>Địa điểm đã lưu</Text>
                {savedPlaces.map((sp, i) => (
                  <TouchableOpacity key={i} style={styles.row} onPress={() => onSelect(sp.place)}>
                    <View style={[styles.pinIcon, { backgroundColor: COLORS.primarySoft }]}>
                      <Ionicons
                        name={sp.tag === 'Nhà riêng' ? 'home' : 'briefcase'}
                        size={17}
                        color={COLORS.primary}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{sp.tag}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {sp.place.address}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.section}>
              <Text style={styles.secTitle}>Địa điểm nổi bật tại Thái Nguyên</Text>
              {QUICK_PLACES.map((p, idx) => (
                <View key={idx} style={styles.row}>
                  <TouchableOpacity style={styles.rowMain} onPress={() => onSelect(p)}>
                    <View style={[styles.pinIcon, { backgroundColor: '#FEF2F2' }]}>
                      <Ionicons name="navigate-outline" size={17} color={COLORS.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{p.label}</Text>
                      <Text style={styles.rowSub} numberOfLines={1}>
                        {p.address}
                      </Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.viewMapChip} onPress={() => previewOnMap(p)}>
                    <Ionicons name="map-outline" size={14} color={COLORS.primary} />
                    <Text style={styles.viewMapTxt}>Map</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', paddingTop: 42 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  searchWrap: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F1F5F9', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  input: { flex: 1, fontSize: 14, color: COLORS.text },
  searchBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, borderRadius: 14, justifyContent: 'center' },
  searchBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modeBar: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1, borderColor: COLORS.border },
  modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F1F5F9', paddingVertical: 8, borderRadius: 12 },
  modeBtnActive: { backgroundColor: COLORS.primary },
  modeTxt: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  modeTxtActive: { color: '#fff' },
  mapModeWrap: { flex: 1, justifyContent: 'space-between' },
  mapConfirmCard: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderColor: '#E2E8F0', padding: 14, gap: 10 },
  mapAddrRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  mapAddrCap: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  mapAddrVal: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginTop: 2 },
  coordTxt: { fontSize: 11, color: COLORS.textLight, marginTop: 2 },
  confirmPinBtn: { backgroundColor: COLORS.primary, paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  confirmPinTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  body: { padding: 14, gap: 18 },
  section: { gap: 4 },
  secTitle: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  pinIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  viewMapChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 10 },
  viewMapTxt: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
});
