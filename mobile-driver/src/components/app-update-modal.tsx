import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { getApiBase } from '../api';
import { COLORS, GRADIENTS } from '../theme';

export const CURRENT_APP_VERSION = '1.2.1';

interface AppUpdateInfo {
  latestVersion: string;
  minVersion: string;
  apkUrl: string;
  releaseNotes?: string;
}

interface Props {
  apiBase?: string;
  refreshSignal?: number;
}

function compareVersions(a: string, b: string): number {
  const pa = String(a || '0')
    .split('.')
    .map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  const pb = String(b || '0')
    .split('.')
    .map((n) => parseInt(n.replace(/\D/g, ''), 10) || 0);
  const len = Math.max(pa.length, pb.length, 3);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function AppUpdateModal({ apiBase, refreshSignal = 0 }: Props) {
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [downloadedMb, setDownloadedMb] = useState(0);
  const [totalMb, setTotalMb] = useState(0);
  const [readyApkUri, setReadyApkUri] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const checkingRef = useRef(false);

  const checkForUpdate = useCallback(async () => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    try {
      const base = (apiBase || getApiBase()).replace(/\/+$/, '');
      const res = await fetch(`${base}/trips/config`, {
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (!res.ok) return;
      const cfg = await res.json();
      const drv: AppUpdateInfo | undefined = cfg?.appUpdate?.driver;
      if (!drv?.latestVersion || !drv?.apkUrl) return;
      setInfo(drv);
    } catch {
      // Bỏ qua khi mất mạng tạm thời
    } finally {
      checkingRef.current = false;
    }
  }, [apiBase]);

  useEffect(() => {
    checkForUpdate();
  }, [checkForUpdate, refreshSignal]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkForUpdate();
      }
    });
    return () => sub.remove();
  }, [checkForUpdate]);

  if (!info) return null;

  const isForced = compareVersions(CURRENT_APP_VERSION, info.minVersion) < 0;
  const hasUpdate = compareVersions(CURRENT_APP_VERSION, info.latestVersion) < 0;
  const visible = isForced || (hasUpdate && dismissedVersion !== info.latestVersion);

  if (!visible) return null;

  const targetVersion =
    compareVersions(info.latestVersion, info.minVersion) >= 0 ? info.latestVersion : info.minVersion;
  const cacheBustUrl = `${info.apkUrl}${info.apkUrl.includes('?') ? '&' : '?'}v=${encodeURIComponent(targetVersion)}&t=${Date.now()}`;

  const launchAndroidInstaller = async (localFileUri: string) => {
    const contentUri = await FileSystem.getContentUriAsync(localFileUri);
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      // FLAG_GRANT_READ_URI_PERMISSION (1) | FLAG_ACTIVITY_NEW_TASK (268435456)
      flags: 268435457,
      type: 'application/vnd.android.package-archive',
    });
  };

  const handleDownloadAndInstall = async () => {
    setErrorMsg(null);
    if (Platform.OS !== 'android') {
      Linking.openURL(cacheBustUrl).catch(() => undefined);
      return;
    }

    // Nếu đã tải sẵn bản mới trong máy -> mở trình cài đặt ngay không cần tải lại
    if (readyApkUri) {
      try {
        const stat = await FileSystem.getInfoAsync(readyApkUri);
        if (stat.exists) {
          await launchAndroidInstaller(readyApkUri);
          return;
        }
      } catch {
        setReadyApkUri(null);
      }
    }

    setDownloading(true);
    setProgressPct(0);
    setDownloadedMb(0);
    setTotalMb(0);

    const destUri = `${FileSystem.cacheDirectory}now-driver-v${targetVersion.replace(/[^0-9.]/g, '')}.apk`;
    try {
      await FileSystem.deleteAsync(destUri, { idempotent: true }).catch(() => undefined);

      const downloadResumable = FileSystem.createDownloadResumable(
        cacheBustUrl,
        destUri,
        {},
        (p) => {
          const done = p.totalBytesWritten || 0;
          const total = p.totalBytesExpectedToWrite || 0;
          setDownloadedMb(done / (1024 * 1024));
          if (total > 0) {
            setTotalMb(total / (1024 * 1024));
            setProgressPct(Math.min(100, Math.round((done / total) * 100)));
          }
        },
      );

      const result = await downloadResumable.downloadAsync();
      if (!result || result.status !== 200 || !result.uri) {
        throw new Error(`Tải bộ cài thất bại (HTTP ${result?.status ?? 'lỗi mạng'})`);
      }

      setProgressPct(100);
      setReadyApkUri(result.uri);
      await launchAndroidInstaller(result.uri);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Không thể tải hoặc mở trình cài đặt. Hãy thử lại hoặc tải qua trình duyệt.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (!isForced && !downloading) {
          setDismissedVersion(info.latestVersion);
        }
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient
            colors={isForced ? ['#991B1B', '#DC2626'] : GRADIENTS.brand}
            style={styles.header}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="cloud-download" size={28} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.badgeTxt}>
                {isForced ? 'BẮT BUỘC CẬP NHẬT' : 'PHIÊN BẢN MỚI SẴN SÀNG'}
              </Text>
              <Text style={styles.title}>NOW Tài Xế v{targetVersion}</Text>
            </View>
          </LinearGradient>

          <View style={styles.body}>
            <View style={styles.versionRow}>
              <Text style={styles.versionPillOld}>Đang dùng: v{CURRENT_APP_VERSION}</Text>
              <Ionicons name="arrow-forward" size={14} color={COLORS.textMuted} />
              <Text style={styles.versionPillNew}>Bản mới: v{targetVersion}</Text>
            </View>

            <Text style={styles.desc}>
              {isForced
                ? 'Phiên bản hiện tại đã cũ và cần cập nhật để đảm bảo nhận chuyến, chuông báo và tính cước chính xác.'
                : 'Đã có bản nâng cấp mới cho ứng dụng NOW Tài Xế. Bấm 1 chạm để tải và cài đè ngay.'}
            </Text>

            {info.releaseNotes ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesLabel}>Có gì mới:</Text>
                <Text style={styles.notesTxt}>{info.releaseNotes}</Text>
              </View>
            ) : null}

            {downloading ? (
              <View style={styles.progressBox}>
                <View style={styles.progressHead}>
                  <Text style={styles.progressTitle}>Đang tải bản cập nhật...</Text>
                  <Text style={styles.progressPct}>
                    {totalMb > 0
                      ? `${progressPct}% (${downloadedMb.toFixed(1)}/${totalMb.toFixed(1)} MB)`
                      : `${downloadedMb.toFixed(1)} MB`}
                  </Text>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.max(4, progressPct)}%` }]} />
                </View>
              </View>
            ) : null}

            {errorMsg ? (
              <View style={styles.errBox}>
                <Text style={styles.errTxt}>⚠️ {errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.88}
              disabled={downloading}
              onPress={handleDownloadAndInstall}
              style={[styles.primaryBtn, downloading && { opacity: 0.7 }]}
            >
              {downloading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Ionicons name="download-outline" size={20} color="#FFFFFF" />
              )}
              <Text style={styles.primaryBtnTxt}>
                {downloading
                  ? `Đang tải ${progressPct}%...`
                  : readyApkUri
                    ? 'Mở trình cài đặt ngay'
                    : 'Tải & Cài đặt ngay'}
              </Text>
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <TouchableOpacity
                disabled={downloading}
                onPress={() => Linking.openURL(cacheBustUrl).catch(() => undefined)}
                style={styles.linkBtn}
              >
                <Text style={styles.linkTxt}>Tải qua trình duyệt</Text>
              </TouchableOpacity>

              {!isForced ? (
                <TouchableOpacity
                  disabled={downloading}
                  onPress={() => setDismissedVersion(info.latestVersion)}
                  style={styles.linkBtn}
                >
                  <Text style={styles.laterTxt}>Để sau</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <Text style={styles.hint}>
              Cài đè trực tiếp, giữ nguyên tài khoản & ví tiền. Lần đầu máy có thể hỏi bật quyền "Cài đặt ứng dụng từ nguồn này".
            </Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: {
    color: '#FEF08A',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
    marginTop: 2,
  },
  body: {
    padding: 18,
    gap: 12,
  },
  versionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  versionPillOld: {
    backgroundColor: '#F1F5F9',
    color: '#475569',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: '700',
  },
  versionPillNew: {
    backgroundColor: '#DCFCE7',
    color: '#166534',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: '800',
  },
  desc: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 19,
    textAlign: 'center',
  },
  notesBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  notesLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.primary,
    textTransform: 'uppercase',
  },
  notesTxt: {
    fontSize: 12.5,
    color: '#1E293B',
    lineHeight: 18,
  },
  progressBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  progressHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  progressPct: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FEE2E2',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  errBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 10,
    padding: 10,
  },
  errTxt: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '700',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryBtnTxt: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 20,
  },
  linkBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  linkTxt: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  laterTxt: {
    fontSize: 12.5,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  hint: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
});
