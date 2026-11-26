import React, { useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

export function MediaViewerModal({
  visible,
  tripCode,
  media,
  onClose,
}: {
  visible: boolean;
  tripCode?: string;
  media: any[];
  onClose: () => void;
}) {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Ảnh & Video xe – {tripCode || ''}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>Đóng</Text>
          </TouchableOpacity>
        </View>

        {videoUrl && (
          <View style={styles.videoBox}>
            <WebView
              originWhitelist={['*']}
              allowsFullscreenVideo
              mediaPlaybackRequiresUserAction={false}
              source={{
                html: `<!DOCTYPE html><html><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;height:100vh;"><video src="${videoUrl}" controls autoplay playsinline style="width:100%;max-height:100vh;"></video></body></html>`,
              }}
            />
            <TouchableOpacity style={styles.closeVideoBtn} onPress={() => setVideoUrl(null)}>
              <Text style={styles.closeText}>Đóng trình phát video</Text>
            </TouchableOpacity>
          </View>
        )}

        <ScrollView contentContainerStyle={styles.list}>
          {(!media || media.length === 0) && (
            <Text style={styles.empty}>Chưa có ảnh hoặc video tình trạng xe.</Text>
          )}
          {(media || []).map((m) => (
            <View key={m.id} style={styles.card}>
              <Text style={styles.badge}>
                {m.stage === 'PICKUP' ? 'Nhận xe' : 'Trả xe'} · {m.type === 'VIDEO' ? 'Video' : 'Ảnh'}
                {m.isPlatePhoto ? ' (Ảnh biển số)' : ''}
              </Text>
              {m.type === 'IMAGE' ? (
                <Image source={{ uri: m.url }} style={styles.photo} resizeMode="cover" />
              ) : (
                <TouchableOpacity style={styles.playBtn} onPress={() => setVideoUrl(m.url)}>
                  <Text style={styles.playText}>▶ Xem video quay quanh xe ({m.durationSec || '?'}s)</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.meta}>
                Thời gian: {m.takenAt ? new Date(m.takenAt).toLocaleString('vi-VN') : '—'}
                {m.lat != null && m.lng != null ? ` · GPS: ${m.lat.toFixed(4)}, ${m.lng.toFixed(4)}` : ''}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc', paddingTop: 40 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: '#e2e8f0',
  },
  title: { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  closeBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#e2e8f0', borderRadius: 8 },
  closeText: { fontWeight: '700', color: '#0f172a', fontSize: 13 },
  videoBox: { height: 260, backgroundColor: '#000' },
  closeVideoBtn: { backgroundColor: '#f1f5f9', padding: 10, alignItems: 'center' },
  list: { padding: 16, gap: 12 },
  empty: { textAlign: 'center', color: '#64748b', marginTop: 24 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 12, gap: 8, elevation: 1 },
  badge: { fontSize: 13, fontWeight: '700', color: '#4f46e5' },
  photo: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#e2e8f0' },
  playBtn: { backgroundColor: '#1e293b', padding: 16, borderRadius: 10, alignItems: 'center' },
  playText: { color: '#fff', fontWeight: '700' },
  meta: { fontSize: 11, color: '#64748b' },
});
