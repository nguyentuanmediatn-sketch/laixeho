import React, { useState } from 'react';
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
import { driverApi } from '../api';
import { COLORS } from '../theme';

export interface DriverPlaceItem {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

const THAI_NGUYEN_PLACES: DriverPlaceItem[] = [
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

export function DriverAddressModal({
  visible,
  biasCoord,
  onSelect,
  onClose,
}: {
  visible: boolean;
  biasCoord: { lat: number; lng: number };
  onSelect: (item: DriverPlaceItem) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<DriverPlaceItem[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setLoading(true);
    try {
      const list = await driverApi<DriverPlaceItem[]>(
        `/map/autocomplete?q=${encodeURIComponent(query.trim())}&lat=${biasCoord.lat}&lng=${biasCoord.lng}`,
      );
      setResults(list || []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={COLORS.text} />
          </TouchableOpacity>
          <Text style={styles.title}>Cập nhật điểm trả khách</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={COLORS.primary} />
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="Nhập địa chỉ điểm trả tại Thái Nguyên..."
              placeholderTextColor={COLORS.textLight}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={runSearch}
            />
          </View>
          <TouchableOpacity style={styles.searchBtn} onPress={runSearch}>
            <Text style={styles.searchBtnTxt}>Tìm</Text>
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {loading && <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 16 }} />}

          {results.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.secTitle}>Kết quả tìm kiếm</Text>
              {results.map((item, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.row}
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
              ))}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.secTitle}>Địa điểm phổ biến tại Thái Nguyên</Text>
            {THAI_NGUYEN_PLACES.map((p, idx) => (
              <TouchableOpacity key={idx} style={styles.row} onPress={() => onSelect(p)}>
                <View style={styles.pinIcon}>
                  <Ionicons name="navigate-outline" size={17} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{p.label}</Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {p.address}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF', paddingTop: 42 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingBottom: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  searchWrap: { flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingBottom: 12, borderBottomWidth: 1, borderColor: COLORS.border },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F1F5F9', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 9 },
  input: { flex: 1, fontSize: 14, color: COLORS.text },
  searchBtn: { backgroundColor: COLORS.primary, paddingHorizontal: 16, borderRadius: 14, justifyContent: 'center' },
  searchBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 14 },
  body: { padding: 14, gap: 18 },
  section: { gap: 4 },
  secTitle: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderColor: '#F1F5F9' },
  pinIcon: { width: 36, height: 36, borderRadius: 12, backgroundColor: COLORS.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  rowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
});
