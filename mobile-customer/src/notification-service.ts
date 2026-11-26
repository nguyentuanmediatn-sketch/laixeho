import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

export const CUSTOMER_NOTIF_CHANNEL_ID = 'now-customer-alerts-v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function initCustomerNotifications(
  onNotificationTapped: (data: Record<string, any>) => void,
): Promise<() => void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CUSTOMER_NOTIF_CHANNEL_ID, {
        name: 'Thông báo & Khuyến mại NOW',
        description: 'Nhận thông báo chuyến đi, khuyến mại và cập nhật ứng dụng NOW Thái Nguyên',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 300, 150, 300],
        lightColor: '#E51922',
        enableLights: true,
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      });
    }

    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // ignore permission errors on restricted devices
  }

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = (response.notification.request.content.data || {}) as Record<string, any>;
    onNotificationTapped(data);
  });

  return () => {
    sub.remove();
  };
}

export async function showCustomerLocalNotification(params: {
  title: string;
  body: string;
  data?: Record<string, any>;
}): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: params.title,
        body: params.body,
        data: params.data || {},
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger:
        Platform.OS === 'android'
          ? { channelId: CUSTOMER_NOTIF_CHANNEL_ID }
          : null,
    });
  } catch {
    // ignore if notification permission denied
  }
}
