import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { driverApi, uploadFileWithProgress } from '../api';
import { COLORS, GRADIENTS, SHADOW } from '../theme';

export function DriverProfileView({
  driver,
  onUpdated,
  onLogout,
}: {
  driver: any;
  onUpdated: (d: any) => void;
  onLogout: () => void;
}) {
  const [name, setName] = useState(driver.name || '');
  const [avatarUrl, setAvatarUrl] = useState<string>(driver.avatarUrl || '');
  const [idCardUrls, setIdCardUrls] = useState<string[]>(driver.idCardUrls || []);
  const [licenseUrls, setLicenseUrls] = useState<string[]>(driver.licenseUrls || []);
  const [uploadingLabel, setUploadingLabel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pickAndUploadDoc = async (target: 'avatar' | 'cccd' | 'gplx', useCamera: boolean) => {
    try {
      if (useCamera) {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        if (!p.granted) return Alert.alert('Thiếu quyền', 'Vui lòng cấp quyền Camera');
      } else {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!p.granted) return Alert.alert('Thiếu quyền', 'Vui lòng cấp quyền Thư viện ảnh');
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });

      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setUploadingLabel(
        target === 'avatar' ? 'Đang tải ảnh chân dung...' : target === 'cccd' ? 'Đang tải ảnh CCCD...' : 'Đang tải ảnh GPLX...',
      );

      const presign = await driverApi('/driver/profile/presign', {
        method: 'POST',
        body: JSON.stringify({ ext: 'jpg', contentType: 'image/jpeg' }),
      });
      await uploadFileWithProgress(presign.uploadUrl, asset.uri, 'image/jpeg');

      if (target === 'avatar') setAvatarUrl(presign.publicUrl);
      else if (target === 'cccd') setIdCardUrls((prev) => [...prev.slice(-1), presign.publicUrl]);
      else setLicenseUrls((prev) => [...prev.slice(-1), presign.publicUrl]);
    } catch (e: any) {
      Alert.alert('Lỗi tải ảnh', e.message);
    } finally {
      setUploadingLabel(null);
    }
  };

  const handleSaveProfile = async () => {
    if (!name.trim()) return Alert.alert('Thiếu thông tin', 'Vui lòng nhập họ tên đầy đủ');
    setSaving(true);
    try {
      const updated = await driverApi('/driver/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          name: name.trim(),
          avatarUrl: avatarUrl || undefined,
          idCardUrls,
          licenseUrls,
        }),
      });
      onUpdated(updated);
      Alert.alert(
        'Đã lưu hồ sơ',
        driver.status === 'PENDING'
          ? 'Hồ sơ của bạn đã gửi Admin xét duyệt.'
          : 'Đã cập nhật hồ sơ tài xế thành công.',
      );
    } catch (e: any) {
      Alert.alert('Lỗi lưu hồ sơ', e.message);
    } finally {
      setSaving(false);
    }
  };

  const statusMeta =
    driver.status === 'ACTIVE'
      ? { txt: 'Đã duyệt · Đang hoạt động', bg: COLORS.successSoft, color: COLORS.successDark }
      : driver.status === 'LOCKED'
        ? { txt: 'Tài khoản bị Admin khóa', bg: COLORS.dangerSoft, color: COLORS.danger }
        : { txt: 'Chờ Admin duyệt hồ sơ', bg: COLORS.warningSoft, color: '#B45309' };

  return (
    <View style={styles.list}>
      <Text style={styles.pageTitle}>Hồ sơ & Giấy tờ tài xế</Text>

      <View style={styles.card}>
        <View style={styles.profileTop}>
          <LinearGradient colors={GRADIENTS.brand} style={styles.avatarRing}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <View style={styles.avatarInner}>
                <Text style={styles.avatarChar}>{(driver.name || driver.phone || 'T')[0].toUpperCase()}</Text>
              </View>
            )}
          </LinearGradient>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{driver.name || 'Tài xế mới'}</Text>
            <Text style={styles.sub}>{driver.phone}</Text>
            <View style={[styles.badge, { backgroundColor: statusMeta.bg }]}>
              <Text style={[styles.badgeTxt, { color: statusMeta.color }]}>{statusMeta.txt}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.label}>Họ và tên đầy đủ *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Nhập họ tên theo CCCD"
        />

        {uploadingLabel && (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={COLORS.primary} />
            <Text style={[styles.sub, { color: COLORS.primary, fontWeight: '700' }]}>{uploadingLabel}</Text>
          </View>
        )}

        <DocSection
          title="1. Ảnh chân dung"
          urls={avatarUrl ? [avatarUrl] : []}
          onCamera={() => pickAndUploadDoc('avatar', true)}
          onGallery={() => pickAndUploadDoc('avatar', false)}
        />
        <DocSection
          title={`2. Ảnh CCCD (${idCardUrls.length}/2 mặt)`}
          urls={idCardUrls}
          onCamera={() => pickAndUploadDoc('cccd', true)}
          onGallery={() => pickAndUploadDoc('cccd', false)}
        />
        <DocSection
          title={`3. Giấy phép lái xe (${licenseUrls.length}/2 mặt)`}
          urls={licenseUrls}
          onCamera={() => pickAndUploadDoc('gplx', true)}
          onGallery={() => pickAndUploadDoc('gplx', false)}
        />

        <TouchableOpacity activeOpacity={0.88} onPress={handleSaveProfile} disabled={saving}>
          <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.ctaBtn}>
            <Text style={styles.ctaTxt}>{saving ? 'Đang lưu...' : 'Lưu & Gửi hồ sơ duyệt'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.logoutCard} onPress={onLogout}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.danger} />
        <Text style={styles.logoutTxt}>Đăng xuất tài khoản</Text>
      </TouchableOpacity>
    </View>
  );
}

function DocSection({
  title,
  urls,
  onCamera,
  onGallery,
}: {
  title: string;
  urls: string[];
  onCamera: () => void;
  onGallery: () => void;
}) {
  return (
    <View style={styles.docBox}>
      <Text style={styles.label}>{title}</Text>
      {urls.length > 0 && (
        <View style={styles.thumbRow}>
          {urls.map((u, i) => (
            <Image key={i} source={{ uri: u }} style={styles.thumb} />
          ))}
        </View>
      )}
      <View style={styles.btnRow}>
        <TouchableOpacity style={styles.docBtn} onPress={onCamera}>
          <Ionicons name="camera-outline" size={16} color={COLORS.primary} />
          <Text style={styles.docBtnTxt}>Chụp ảnh</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.docBtn} onPress={onGallery}>
          <Ionicons name="image-outline" size={16} color={COLORS.indigo} />
          <Text style={[styles.docBtnTxt, { color: COLORS.indigo }]}>Chọn thư viện</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 14 },
  pageTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, gap: 12, ...SHADOW.card },
  profileTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarRing: { width: 62, height: 62, borderRadius: 31, padding: 3, alignItems: 'center', justifyContent: 'center' },
  avatarImg: { width: 56, height: 56, borderRadius: 28 },
  avatarInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  avatarChar: { fontSize: 24, fontWeight: '900', color: COLORS.primary },
  name: { fontSize: 17, fontWeight: '900', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textMuted },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, marginTop: 4 },
  badgeTxt: { fontSize: 11, fontWeight: '800' },
  label: { fontSize: 12, fontWeight: '700', color: '#334155' },
  input: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: 11, fontSize: 14 },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  docBox: { gap: 8, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 84, height: 60, borderRadius: 8, backgroundColor: '#E2E8F0' },
  btnRow: { flexDirection: 'row', gap: 8 },
  docBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingVertical: 9, borderRadius: 10 },
  docBtnTxt: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  ctaBtn: { padding: 15, borderRadius: 16, alignItems: 'center', marginTop: 4 },
  ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  logoutCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#FFFFFF', padding: 15, borderRadius: 18, ...SHADOW.card },
  logoutTxt: { color: COLORS.danger, fontWeight: '800', fontSize: 14 },
});
