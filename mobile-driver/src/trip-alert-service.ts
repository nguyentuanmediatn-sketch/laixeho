import { Platform, Vibration } from 'react-native';
import { Audio } from 'expo-av';
import * as Notifications from 'expo-notifications';

export const TRIP_ALERT_CHANNEL_ID = 'now-trip-alerts-v2';

// Luôn hiện banner thông báo + âm thanh kể cả khi App Tài xế đang mở trên màn hình
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

let loopingSound: Audio.Sound | null = null;
let ringtoneActive = false;

export async function initDriverNotifications(
  onNotificationTapped: (data: Record<string, any>) => void,
): Promise<() => void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(TRIP_ALERT_CHANNEL_ID, {
        name: 'Chuông báo đơn lái xe hộ mới',
        description: 'Thông báo ưu tiên cao kèm chuông khi có đơn mới hoặc tổng đài gán chuyến',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500, 250, 500],
        lightColor: '#E51922',
        enableLights: true,
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: true,
        sound: 'trip_alert.wav',
      });
    }

    const perm = await Notifications.getPermissionsAsync();
    if (perm.status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  } catch {
    // ignore permission/channel errors on restricted devices
  }

  const sub = Notifications.addNotificationResponseReceivedListener((response) => {
    const data = (response.notification.request.content.data || {}) as Record<string, any>;
    onNotificationTapped(data);
  });

  // Kiểm tra trường hợp tài xế vừa mở app bằng cách bấm vào thông báo từ thanh trạng thái
  Notifications.getLastNotificationResponseAsync()
    .then((last) => {
      if (last) {
        const data = (last.notification.request.content.data || {}) as Record<string, any>;
        if (data?.kind === 'TRIP_OFFER' || data?.kind === 'TRIP_ASSIGNED') {
          onNotificationTapped(data);
        }
      }
    })
    .catch(() => undefined);

  return () => {
    sub.remove();
  };
}

export async function startTripRingtone(): Promise<void> {
  try {
    await stopTripRingtone();
    ringtoneActive = true;

    Vibration.vibrate([0, 600, 350, 600, 800], true);

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: true,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    });

    const { sound } = await Audio.Sound.createAsync(
      require('../assets/trip-alert.wav'),
      { shouldPlay: true, isLooping: true, volume: 1.0 },
    );

    if (!ringtoneActive) {
      await sound.unloadAsync().catch(() => undefined);
      return;
    }
    loopingSound = sound;
  } catch {
    // fallback vibration already active
  }
}

export async function stopTripRingtone(): Promise<void> {
  ringtoneActive = false;
  Vibration.cancel();
  if (loopingSound) {
    const s = loopingSound;
    loopingSound = null;
    try {
      await s.stopAsync();
      await s.unloadAsync();
    } catch {
      // ignore
    }
  }
}

export async function playShortChime(): Promise<void> {
  try {
    Vibration.vibrate([0, 280, 150, 280]);
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });
    const { sound } = await Audio.Sound.createAsync(
      require('../assets/trip-alert.wav'),
      { shouldPlay: true, isLooping: false, volume: 1.0 },
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => undefined);
      }
    });
  } catch {
    // ignore
  }
}

export async function showLocalTripNotification(params: {
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
        sound: 'trip_alert.wav',
        priority: Notifications.AndroidNotificationPriority.MAX,
        vibrate: [0, 500, 250, 500],
      },
      trigger:
        Platform.OS === 'android'
          ? { channelId: TRIP_ALERT_CHANNEL_ID }
          : null,
    });
  } catch {
    // ignore if notification permission denied
  }
}
