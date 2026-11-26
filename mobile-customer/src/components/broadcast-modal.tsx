import React from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS } from '../theme';

const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  PROMO: { label: 'KHUYẾN MẠI & ƯU ĐÃI', icon: 'gift' },
  UPDATE: { label: 'CẬP NHẬT ỨNG DỤNG', icon: 'rocket' },
  SYSTEM: { label: 'THÔNG BÁO HỆ THỐNG', icon: 'megaphone' },
  GENERAL: { label: 'THÔNG BÁO TỪ NOW THÁI NGUYÊN', icon: 'notifications' },
};

export function BroadcastAnnouncementModal({
  notification,
  onDismiss,
}: {
  notification: any | null;
  onDismiss: (notif: any) => void;
}) {
  if (!notification) return null;

  const category = notification?.data?.category || 'GENERAL';
  const actionUrl = notification?.data?.actionUrl as string | undefined;
  const meta = CATEGORY_LABELS[category] || CATEGORY_LABELS.GENERAL;

  const handleOpenLink = () => {
    if (actionUrl) {
      Linking.openURL(actionUrl).catch(() => undefined);
    }
    onDismiss(notification);
  };

  return (
    <Modal
      visible={Boolean(notification)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => onDismiss(notification)}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <LinearGradient colors={GRADIENTS.brand} style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name={meta.icon as any} size={26} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.badgeTxt}>{meta.label}</Text>
              <Text style={styles.title}>{notification.title}</Text>
            </View>
          </LinearGradient>

          <ScrollView style={styles.bodyScroll} contentContainerStyle={styles.body}>
            <Text style={styles.bodyTxt}>{notification.body}</Text>
            {notification.sentAt ? (
              <Text style={styles.timeTxt}>
                Gửi lúc {new Date(notification.sentAt).toLocaleString('vi-VN')}
              </Text>
            ) : null}
          </ScrollView>

          <View style={styles.actions}>
            {actionUrl ? (
              <TouchableOpacity activeOpacity={0.88} style={styles.primaryBtn} onPress={handleOpenLink}>
                <Ionicons name="open-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnTxt}>Xem chi tiết ngay</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              activeOpacity={0.85}
              style={actionUrl ? styles.secondaryBtn : styles.primaryBtn}
              onPress={() => onDismiss(notification)}
            >
              <Text style={actionUrl ? styles.secondaryBtnTxt : styles.primaryBtnTxt}>Đã hiểu</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
    maxHeight: '82%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
  },
  iconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeTxt: {
    color: '#FEF08A',
    fontSize: 10.5,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '900',
    marginTop: 2,
    lineHeight: 22,
  },
  bodyScroll: {
    maxHeight: 280,
  },
  body: {
    padding: 18,
    gap: 10,
  },
  bodyTxt: {
    fontSize: 14,
    color: '#1E293B',
    lineHeight: 22,
  },
  timeTxt: {
    fontSize: 11.5,
    color: COLORS.textMuted,
  },
  actions: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    gap: 8,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: COLORS.primary,
    paddingVertical: 13,
    borderRadius: 14,
  },
  primaryBtnTxt: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontWeight: '800',
  },
  secondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 14,
  },
  secondaryBtnTxt: {
    color: '#334155',
    fontSize: 14,
    fontWeight: '800',
  },
});
