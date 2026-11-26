import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { io } from 'socket.io-client';
import {
  driverApi,
  fmtMoney,
  getApiBase,
  getDriverToken,
  loadSavedDriverSession,
  setDriverToken,
} from './src/api';
import { COLORS, GRADIENTS, SHADOW } from './src/theme';
import { DriverLoginScreen } from './src/components/driver-login-screen';
import { DriverProfileView } from './src/components/driver-profile-view';
import { ActiveTripDriverView } from './src/components/active-trip-driver-view';
import {
  DriverHistoryAndNotifsView,
  MaintenanceFeeView,
  WalletView,
} from './src/components/wallet-fee-views';
import {
  initDriverNotifications,
  playShortChime,
  registerDriverFcmToken,
  showLocalTripNotification,
  startTripRingtone,
  stopTripRingtone,
} from './src/trip-alert-service';
import { AppUpdateModal } from './src/components/app-update-modal';
import { BroadcastAnnouncementModal } from './src/components/broadcast-modal';

type Tab = 'home' | 'wallet' | 'fee' | 'history' | 'profile';

function DriverAppContent() {
  const [booting, setBooting] = useState(true);
  const [driver, setDriver] = useState<any>(null);
  const [serverUrl, setServerUrl] = useState(getApiBase());

  const [tab, setTab] = useState<Tab>('home');
  const [incomingOffer, setIncomingOffer] = useState<any>(null);
  const [assignedAlert, setAssignedAlert] = useState<any>(null);
  const [toastBanner, setToastBanner] = useState<{ title: string; body: string } | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [driverLoc, setDriverLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsSource, setGpsSource] = useState<'REAL_GPS' | 'LAST_KNOWN' | 'FALLBACK'>('FALLBACK');
  const [walletData, setWalletData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [lockRemainSec, setLockRemainSec] = useState(0);
  const [completedSummary, setCompletedSummary] = useState<any>(null);
  const [popupNotif, setPopupNotif] = useState<any | null>(null);
  const [updateCheckSignal, setUpdateCheckSignal] = useState(0);

  const alertedOfferIdRef = useRef<string | null>(null);
  const alertedAssignedTripIdRef = useRef<string | null>(null);
  const activeTripIdRef = useRef<string | null>(null);
  const initialSyncedRef = useRef<boolean>(false);
  const shownPopupIdsRef = useRef<Set<string>>(new Set());

  const maybeShowPendingPopup = (list: any[]) => {
    const pending = (list || []).find(
      (n) => n?.data?.kind === 'BROADCAST' && n?.data?.showPopup && !n.readAt && !shownPopupIdsRef.current.has(n.id),
    );
    if (pending) {
      shownPopupIdsRef.current.add(pending.id);
      setPopupNotif(pending);
    }
  };

  const markNotifRead = (id: string) => {
    const nowIso = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: n.readAt || nowIso } : n)));
    driverApi(`/notifications/${id}/read`, { method: 'PATCH' }).catch(() => undefined);
  };

  const dismissPopupNotif = (notif: any) => {
    setPopupNotif(null);
    if (notif?.id) markNotifRead(notif.id);
  };

  useEffect(() => {
    activeTripIdRef.current = activeTrip?.id ?? null;
  }, [activeTrip?.id]);

  const triggerOfferAlert = (offer: any) => {
    if (!offer?.offerId) return;
    setIncomingOffer(offer);
    setCountdown(offer.timeoutSec || 30);
    setTab('home');
    if (alertedOfferIdRef.current !== offer.offerId) {
      alertedOfferIdRef.current = offer.offerId;
      startTripRingtone();
      showLocalTripNotification({
        title: `🔔 ĐƠN LÁI HỘ MỚI · ${offer.estimatedPrice ? fmtMoney(offer.estimatedPrice) : 'NOW TN'}`,
        body: `Đón tại: ${offer.pickupAddress} (cách ${offer.distanceToPickupKm ?? '?'} km) — Bấm để nhận đơn ngay!`,
        data: { kind: 'TRIP_OFFER', offerId: offer.offerId, tripId: offer.tripId },
      });
    }
  };

  const triggerAssignedTripAlert = (trip: any) => {
    if (!trip?.id) return;
    setIncomingOffer(null);
    setActiveTrip(trip);
    setTab('home');
    if (alertedAssignedTripIdRef.current !== trip.id) {
      alertedAssignedTripIdRef.current = trip.id;
      setAssignedAlert(trip);
      startTripRingtone();
      showLocalTripNotification({
        title: `🚨 TỔNG ĐÀI GÁN CHUYẾN ${trip.code || ''}`,
        body: `Đón tại: ${trip.pickupAddress} — Bấm để nhận chuyến & đi đón ngay!`,
        data: { kind: 'TRIP_ASSIGNED', tripId: trip.id },
      });
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const session = await loadSavedDriverSession();
        setServerUrl(session.apiBase);
        if (session.token) {
          const me = await driverApi('/driver/me');
          if (me) setDriver(me);
        }
      } catch {
        await setDriverToken(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const refreshMe = async () => {
    try {
      const me = await driverApi('/driver/me');
      setDriver(me);
    } catch {
      // ignore
    }
  };

  const syncActiveTripAndOffer = async (alertOnNewAssigned = true) => {
    try {
      const active = await driverApi('/trips/active');
      if (active?.activeTrip) {
        const prevId = activeTripIdRef.current;
        setActiveTrip(active.activeTrip);
        // Nếu phát hiện chuyến mới được Tổng đài gán (trạng thái ACCEPTED mà app chưa biết) -> bật chuông & popup ngay!
        if (
          alertOnNewAssigned &&
          initialSyncedRef.current &&
          active.activeTrip.status === 'ACCEPTED' &&
          active.activeTrip.id !== prevId &&
          alertedAssignedTripIdRef.current !== active.activeTrip.id
        ) {
          triggerAssignedTripAlert(active.activeTrip);
        }
      }
      if (active?.pendingOffer) {
        triggerOfferAlert(active.pendingOffer);
      }
      initialSyncedRef.current = true;
    } catch {
      // ignore transient network blip
    }
  };

  const loadAll = async () => {
    try {
      const [me, active, wallet, hist, notifs] = await Promise.all([
        driverApi('/driver/me'),
        driverApi('/trips/active'),
        driverApi('/driver/wallet'),
        driverApi('/trips/driver-history'),
        driverApi('/notifications'),
      ]);
      setDriver(me);
      if (active?.activeTrip) {
        const prevId = activeTripIdRef.current;
        setActiveTrip(active.activeTrip);
        if (
          initialSyncedRef.current &&
          active.activeTrip.status === 'ACCEPTED' &&
          active.activeTrip.id !== prevId &&
          alertedAssignedTripIdRef.current !== active.activeTrip.id
        ) {
          triggerAssignedTripAlert(active.activeTrip);
        } else if (!initialSyncedRef.current) {
          alertedAssignedTripIdRef.current = active.activeTrip.id;
        }
      }
      if (active?.pendingOffer) {
        triggerOfferAlert(active.pendingOffer);
      }
      initialSyncedRef.current = true;
      setWalletData(wallet);
      setHistory(hist || []);
      const notifList = notifs || [];
      setNotifications(notifList);
      maybeShowPendingPopup(notifList);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!driver?.id) return;
    const token = getDriverToken();
    if (!token) return;

    let unsubNotif: (() => void) | undefined;
    initDriverNotifications(() => {
      setTab('home');
      syncActiveTripAndOffer(true);
    }).then((cleanup) => {
      unsubNotif = cleanup;
      registerDriverFcmToken((fcmToken) =>
        driverApi('/auth/fcm-token', {
          method: 'POST',
          body: JSON.stringify({ fcmToken }),
        }).catch(() => undefined),
      );
    });

    const socket = io(`${getApiBase()}/ws`, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1500,
    });

    socket.on('connect', () => {
      syncActiveTripAndOffer(true);
    });
    socket.on('trip:offer', (offer: any) => {
      triggerOfferAlert(offer);
    });
    socket.on('trip:assigned', (trip: any) => {
      triggerAssignedTripAlert(trip);
    });
    socket.on('trip:offer_cancelled', () => {
      stopTripRingtone();
      setIncomingOffer(null);
    });
    socket.on('driver:locked', (info: any) => {
      stopTripRingtone();
      setIncomingOffer(null);
      Alert.alert(
        'Tạm khóa quyền nhận đơn',
        `Bạn bị khóa nhận đơn ${info.lockMinutes} phút (${info.reason || 'bỏ qua đơn'}).`,
      );
      refreshMe();
    });
    socket.on('driver:wallet_low', (info: any) => {
      Alert.alert(
        'Số dư ví dưới mức tối thiểu',
        `Số dư hiện tại ${fmtMoney(info.balance)} (< ${fmtMoney(info.minWalletBalance)}). Vui lòng nạp thêm tiền để nhận đơn mới.`,
      );
      refreshMe();
    });
    socket.on('trip:status', (trip: any) => {
      if (trip?.status === 'CANCELLED') {
        stopTripRingtone();
        setAssignedAlert(null);
        setActiveTrip(null);
        Alert.alert('Chuyến đã bị hủy', trip.cancelReason || 'Khách hàng hoặc Admin đã hủy chuyến.');
        driverApi('/trips/driver-history').then(setHistory).catch(() => undefined);
      } else if (trip?.id) {
        const isBrandNewAccepted =
          trip.status === 'ACCEPTED' &&
          trip.id !== activeTripIdRef.current &&
          alertedAssignedTripIdRef.current !== trip.id;
        setActiveTrip(trip);
        if (isBrandNewAccepted) {
          triggerAssignedTripAlert(trip);
        }
      }
    });
    socket.on('app:update_available', () => {
      setUpdateCheckSignal((n) => n + 1);
    });
    socket.on('broadcast:retracted', (info: { broadcastId?: string }) => {
      if (!info?.broadcastId) return;
      setNotifications((prev) => prev.filter((n) => n?.data?.broadcastId !== info.broadcastId));
      setPopupNotif((cur: any) => (cur?.data?.broadcastId === info.broadcastId ? null : cur));
    });
    socket.on('notification:new', (notif: any) => {
      setNotifications((prev) => (prev.some((x) => x.id === notif?.id) ? prev : [notif, ...prev]));
      if (notif?.title) {
        setToastBanner({ title: notif.title, body: notif.body || '' });
        const isTripNotif =
          notif.title.includes('đơn') || notif.title.includes('chuyến') || notif.data?.tripId;
        if (!isTripNotif) {
          playShortChime();
          showLocalTripNotification({
            title: notif.title,
            body: notif.body || '',
            data: notif.data || {},
          });
        }
        if (notif?.data?.kind === 'BROADCAST' && notif?.data?.showPopup) {
          shownPopupIdsRef.current.add(notif.id);
          setPopupNotif(notif);
        }
      }
    });

    const appSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        syncActiveTripAndOffer(true);
        driverApi('/notifications')
          .then((list) => {
            setNotifications(list || []);
            maybeShowPendingPopup(list || []);
          })
          .catch(() => undefined);
      }
    });

    loadAll();
    return () => {
      stopTripRingtone();
      appSub.remove();
      unsubNotif?.();
      socket.disconnect();
    };
  }, [driver?.id]);

  // Safety-net polling mỗi 6 giây khi tài xế ACTIVE chưa có chuyến để không bao giờ lỡ đơn gán hoặc offer mới nếu mạng di động đổi sóng
  useEffect(() => {
    if (!driver?.id || driver.status !== 'ACTIVE' || activeTrip?.id) return;
    const poller = setInterval(() => {
      syncActiveTripAndOffer(true);
    }, 6000);
    return () => clearInterval(poller);
  }, [driver?.id, driver?.status, activeTrip?.id]);

  useEffect(() => {
    if (!toastBanner) return;
    const t = setTimeout(() => setToastBanner(null), 6000);
    return () => clearTimeout(t);
  }, [toastBanner]);

  useEffect(() => {
    if (!incomingOffer) return;
    if (countdown <= 0) {
      stopTripRingtone();
      setIncomingOffer(null);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [incomingOffer, countdown]);

  useEffect(() => {
    const updateLock = () => {
      if (!driver?.lockedUntil) return setLockRemainSec(0);
      const diff = Math.max(0, Math.ceil((new Date(driver.lockedUntil).getTime() - Date.now()) / 1000));
      setLockRemainSec(diff);
    };
    updateLock();
    const timer = setInterval(updateLock, 1000);
    return () => clearInterval(timer);
  }, [driver?.lockedUntil]);

  const appendLocalTrackPoint = (coord: { lat: number; lng: number }) => {
    setActiveTrip((prev: any) => {
      if (!prev || prev.status !== 'IN_PROGRESS') return prev;
      const pts = (prev.actualRoutePolyline || '')
        .split(';')
        .map((s: string) => s.trim())
        .filter(Boolean);
      if (pts.length === 0 && prev.pickupLat != null && prev.pickupLng != null) {
        pts.push(`${Number(prev.pickupLat).toFixed(6)},${Number(prev.pickupLng).toFixed(6)}`);
      }
      const nextStr = `${coord.lat.toFixed(6)},${coord.lng.toFixed(6)}`;
      if (pts[pts.length - 1] === nextStr) return prev;
      pts.push(nextStr);
      return { ...prev, actualRoutePolyline: pts.join(';') };
    });
  };

  const pushCoordToServer = async (coord: { lat: number; lng: number }, source: 'REAL_GPS' | 'LAST_KNOWN' | 'FALLBACK') => {
    setDriverLoc(coord);
    setGpsSource(source);
    appendLocalTrackPoint(coord);
    try {
      await driverApi('/driver/location', {
        method: 'POST',
        body: JSON.stringify(coord),
      });
    } catch {
      // ignore transient network blip
    }
  };

  const pushLocationNow = async () => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status === 'granted') {
        const fresh = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);
        if (fresh) {
          await pushCoordToServer(
            { lat: fresh.coords.latitude, lng: fresh.coords.longitude },
            'REAL_GPS',
          );
          return;
        }
        const last = await Location.getLastKnownPositionAsync();
        if (last) {
          await pushCoordToServer(
            { lat: last.coords.latitude, lng: last.coords.longitude },
            'LAST_KNOWN',
          );
          return;
        }
      }
      const fallback =
        driver?.lat != null && driver?.lng != null
          ? { lat: driver.lat, lng: driver.lng }
          : { lat: 21.5931, lng: 105.8442 };
      await pushCoordToServer(fallback, 'FALLBACK');
    } catch {
      // ignore
    }
  };

  // Theo dõi GPS thật liên tục khi tài xế trực tuyến HOẶC đang thực hiện chuyến đi
  useEffect(() => {
    if (!driver?.isOnline && !activeTrip?.id) return;
    let subscription: Location.LocationSubscription | null = null;
    let lastSentAt = 0;

    pushLocationNow();

    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status !== 'granted') return;
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 3000,
            distanceInterval: 8,
          },
          (loc) => {
            const coord = { lat: loc.coords.latitude, lng: loc.coords.longitude };
            setDriverLoc(coord);
            setGpsSource('REAL_GPS');
            appendLocalTrackPoint(coord);
            const now = Date.now();
            if (now - lastSentAt >= 3500) {
              lastSentAt = now;
              driverApi('/driver/location', {
                method: 'POST',
                body: JSON.stringify(coord),
              }).catch(() => undefined);
            }
          },
        );
      } catch {
        // fallback handled by interval
      }
    })();

    const heartbeat = setInterval(pushLocationNow, 15000);
    return () => {
      subscription?.remove();
      clearInterval(heartbeat);
    };
  }, [driver?.isOnline, activeTrip?.id]);

  const toggleOnline = async (val: boolean) => {
    try {
      if (val) Location.requestForegroundPermissionsAsync().catch(() => undefined);
      const updated = await driverApi('/driver/online', {
        method: 'PATCH',
        body: JSON.stringify({ isOnline: val }),
      });
      setDriver((prev: any) => ({ ...prev, isOnline: updated.isOnline }));
      if (val) pushLocationNow();
    } catch (e: any) {
      Alert.alert('Không thể bật trực tuyến', e.message);
    }
  };

  const acceptOffer = async () => {
    if (!incomingOffer) return;
    stopTripRingtone();
    try {
      const trip = await driverApi(`/trips/offers/${incomingOffer.offerId}/accept`, { method: 'POST' });
      alertedAssignedTripIdRef.current = trip.id;
      setIncomingOffer(null);
      setActiveTrip(trip);
      setTab('home');
    } catch (e: any) {
      Alert.alert('Không nhận được đơn', e.message);
      setIncomingOffer(null);
    }
  };

  const rejectOffer = async () => {
    if (!incomingOffer) return;
    stopTripRingtone();
    try {
      await driverApi(`/trips/offers/${incomingOffer.offerId}/reject`, { method: 'POST' });
      setIncomingOffer(null);
      refreshMe();
    } catch (e: any) {
      Alert.alert('Lỗi', e.message);
      setIncomingOffer(null);
    }
  };

  const acknowledgeAssignedTrip = () => {
    stopTripRingtone();
    setAssignedAlert(null);
    setTab('home');
  };

  const handleTestRingtone = async () => {
    await playShortChime();
    await showLocalTripNotification({
      title: '🔔 Kiểm tra chuông báo đơn NOW Thái Nguyên',
      body: 'Chuông báo & thông báo trên thanh trạng thái đã sẵn sàng nhận đơn mới!',
      data: { kind: 'TEST' },
    });
    setToastBanner({
      title: '🔔 Đã phát chuông & gửi thông báo thử nghiệm',
      body: 'Nếu bạn nghe tiếng chuông và thấy banner trên máy là đã hoạt động tốt.',
    });
  };

  const handleLogout = async () => {
    stopTripRingtone();
    await setDriverToken(null);
    setDriver(null);
    setActiveTrip(null);
    setIncomingOffer(null);
    setAssignedAlert(null);
    initialSyncedRef.current = false;
  };

  const fmtLock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  if (booting) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!driver) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.darkBg }} edges={['bottom']}>
        <StatusBar style="light" />
        <DriverLoginScreen
          initialServerUrl={serverUrl}
          onLoggedIn={async (token, u) => {
            await setDriverToken(token);
            setDriver(u);
            if (u?.status === 'PENDING') setTab('profile');
          }}
        />
        <AppUpdateModal apiBase={serverUrl} refreshSignal={updateCheckSignal} />
      </SafeAreaView>
    );
  }

  const walletBalance = driver.wallet?.balance ?? walletData?.wallet?.balance ?? 0;
  const minBal = driver.config?.minWalletBalance ?? 100000;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Top Status Bar — NOW Thái Nguyên */}
      <View style={styles.topHeader}>
        <View style={styles.row}>
          <Image source={require('./assets/icon.png')} style={styles.brandMiniLogo} />
          <View>
            <Text style={styles.headerName}>{driver.name || driver.phone}</Text>
            <Text style={styles.headerSub}>NOW TN · Ví {fmtMoney(walletBalance)}</Text>
          </View>
        </View>
        <View style={[styles.onlinePill, driver.isOnline && styles.onlinePillOn]}>
          <Text style={[styles.onlineTxt, driver.isOnline && { color: COLORS.successDark }]}>
            {driver.isOnline ? '● Trực tuyến' : 'Ngoại tuyến'}
          </Text>
          <Switch
            value={Boolean(driver.isOnline)}
            onValueChange={toggleOnline}
            trackColor={{ false: '#CBD5E1', true: '#A7F3D0' }}
            thumbColor={driver.isOnline ? COLORS.successDark : '#F8FAFC'}
          />
        </View>
      </View>

      {toastBanner && (
        <TouchableOpacity
          activeOpacity={0.9}
          style={styles.toastBanner}
          onPress={() => {
            setToastBanner(null);
            setTab('home');
          }}
        >
          <Ionicons name="notifications" size={20} color="#fff" />
          <View style={{ flex: 1 }}>
            <Text style={styles.toastTitle} numberOfLines={1}>
              {toastBanner.title}
            </Text>
            {toastBanner.body ? (
              <Text style={styles.toastBody} numberOfLines={2}>
                {toastBanner.body}
              </Text>
            ) : null}
          </View>
          <Ionicons name="close" size={18} color="rgba(255,255,255,0.85)" />
        </TouchableOpacity>
      )}

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {tab === 'home' && (
          <View style={activeTrip ? undefined : styles.homePad}>
            {lockRemainSec > 0 && (
              <View style={styles.lockCard}>
                <Ionicons name="lock-closed" size={26} color={COLORS.danger} />
                <Text style={styles.lockTitle}>Đang tạm khóa quyền nhận đơn</Text>
                <Text style={styles.lockTimer}>{fmtLock(lockRemainSec)}</Text>
                <Text style={styles.lockSub}>Hết thời gian khóa, hệ thống sẽ tự động mở lại.</Text>
              </View>
            )}

            {driver.status !== 'ACTIVE' && (
              <View style={styles.warnCard}>
                <Text style={styles.warnTxt}>
                  {driver.status === 'PENDING'
                    ? '⏳ Hồ sơ đang chờ Admin duyệt. Vui lòng bổ sung CCCD & GPLX trong mục Hồ sơ.'
                    : '🚫 Tài khoản đang bị Admin khóa.'}
                </Text>
                {driver.status === 'PENDING' && (
                  <TouchableOpacity style={styles.warnBtn} onPress={() => setTab('profile')}>
                    <Text style={styles.btnTxt}>Hoàn thiện hồ sơ</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {incomingOffer && (
              <View style={styles.offerCard}>
                <LinearGradient colors={GRADIENTS.offer} style={styles.offerHead}>
                  <View style={styles.row}>
                    <Ionicons name="notifications-circle" size={24} color="#FDE047" />
                    <Text style={styles.offerHeadTxt}>ĐƠN LÁI HỘ NOW MỚI</Text>
                  </View>
                  <View style={styles.countdownPill}>
                    <Text style={styles.countdownTxt}>{countdown}s</Text>
                  </View>
                </LinearGradient>
                <View style={styles.offerBody}>
                  {incomingOffer.dispatchRing > 1 ? (
                    <View style={styles.ringBadge}>
                      <Text style={styles.ringBadgeTxt}>
                        📡 Điều phối mở rộng · Vòng {incomingOffer.dispatchRing} (bán kính {incomingOffer.dispatchRadiusKm} km)
                      </Text>
                    </View>
                  ) : null}
                  <Text style={styles.bold}>📍 Đón: {incomingOffer.pickupAddress}</Text>
                  <Text style={styles.sub}>Khoảng cách tới điểm đón: {incomingOffer.distanceToPickupKm} km</Text>
                  {incomingOffer.dropoffAddress ? (
                    <Text style={styles.info}>🏁 Trả: {incomingOffer.dropoffAddress}</Text>
                  ) : null}
                  {incomingOffer.isBookingForOther ? (
                    <View style={styles.proxyOfferBox}>
                      <Text style={styles.proxyOfferTxt}>
                        👤 ĐẶT HỘ · Liên hệ: {incomingOffer.passengerName || 'Khách'} ({incomingOffer.passengerPhone})
                      </Text>
                    </View>
                  ) : null}
                  {incomingOffer.note ? (
                    <Text style={styles.sub}>📝 Ghi chú: {incomingOffer.note}</Text>
                  ) : null}
                  {incomingOffer.estimatedPrice != null ? (
                    <Text style={styles.offerPrice}>
                      {fmtMoney(incomingOffer.estimatedPrice)} ({incomingOffer.distanceKm ?? '—'} km)
                    </Text>
                  ) : null}
                  <Text style={styles.tiny}>
                    Lưu ý: Từ chối hoặc để hết thời gian đếm ngược sẽ bị khóa quyền nhận đơn.
                  </Text>
                  <View style={styles.row}>
                    <TouchableOpacity style={[styles.acceptBtn, { flex: 1 }]} onPress={acceptOffer}>
                      <Text style={styles.btnTxt}>NHẬN ĐƠN</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.rejectBtn, { flex: 1 }]} onPress={rejectOffer}>
                      <Text style={styles.btnTxt}>TỪ CHỐI</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

            {activeTrip ? (
              <ActiveTripDriverView
                trip={activeTrip}
                driverLoc={driverLoc}
                gpsSource={gpsSource}
                hotline={driver.config?.hotline || '0973521456'}
                onTripUpdated={setActiveTrip}
                onRefreshGps={pushLocationNow}
                onTripCompleted={(res) => {
                  setActiveTrip(null);
                  setCompletedSummary(res);
                  loadAll();
                }}
              />
            ) : (
              !incomingOffer && (
                <>
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setTab('wallet')}>
                    <LinearGradient
                      colors={walletBalance < minBal ? ['#7F1D1D', '#B91C1C'] : GRADIENTS.wallet}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.miniWallet}
                    >
                      <View>
                        <Text style={styles.miniWalletCap}>SỐ DƯ VÍ KÝ QUỸ NOW</Text>
                        <Text style={styles.miniWalletVal}>{fmtMoney(walletBalance)}</Text>
                      </View>
                      <View style={styles.miniWalletCta}>
                        <Text style={styles.btnTxt}>Xem ví ›</Text>
                      </View>
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={styles.statusCard}>
                    <View
                      style={[
                        styles.radarBadge,
                        driver.isOnline && { backgroundColor: COLORS.successSoft },
                      ]}
                    >
                      <Ionicons
                        name={driver.isOnline ? 'radio' : 'moon-outline'}
                        size={30}
                        color={driver.isOnline ? COLORS.successDark : COLORS.textMuted}
                      />
                    </View>
                    <Text style={styles.statusTitle}>
                      {driver.isOnline ? 'Đang trực tuyến – Sẵn sàng nhận đơn' : 'Bạn đang Ngoại tuyến'}
                    </Text>
                    <Text style={styles.statusSub}>
                      {driver.isOnline
                        ? `Hệ thống NOW Thái Nguyên tự động quét mở rộng đa vòng (${driver.config?.radiusStepsKm || '3,6,10'} km) quanh vị trí thật của bạn.`
                        : 'Bật công tắc Trực tuyến ở góc trên bên phải để bắt đầu nhận chuyến lái xe hộ.'}
                    </Text>
                    <TouchableOpacity style={styles.testBellBtn} onPress={handleTestRingtone}>
                      <Ionicons name="notifications-outline" size={16} color={COLORS.primary} />
                      <Text style={styles.testBellTxt}>Thử chuông & thông báo nhận đơn</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )
            )}
          </View>
        )}

        {tab === 'wallet' && (
          <WalletView
            walletData={walletData}
            onRefresh={() => driverApi('/driver/wallet').then(setWalletData).catch(() => undefined)}
          />
        )}

        {tab === 'fee' && (
          <MaintenanceFeeView
            driver={driver}
            bankInfo={walletData?.bankInfo || driver.config?.bankInfo || ''}
            paymentIntents={walletData?.paymentIntents || []}
            onRefresh={() => driverApi('/driver/wallet').then(setWalletData).catch(() => undefined)}
          />
        )}

        {tab === 'history' && (
          <DriverHistoryAndNotifsView
            trips={history}
            notifications={notifications}
            onMarkRead={markNotifRead}
            onMarkAllRead={async () => {
              await driverApi('/notifications/read-all', { method: 'POST' });
              const list = await driverApi('/notifications');
              setNotifications(list || []);
            }}
          />
        )}

        {tab === 'profile' && (
          <DriverProfileView
            driver={driver}
            onUpdated={(d) => setDriver((prev: any) => ({ ...prev, ...d }))}
            onLogout={handleLogout}
          />
        )}
      </ScrollView>

      {/* Floating Red-White Bottom Tab Dock */}
      <View style={styles.dockWrap}>
        <View style={styles.dock}>
          {(
            [
              { id: 'home', label: 'NHẬN ĐƠN', icon: 'car-sport', iconOff: 'car-sport-outline' },
              { id: 'wallet', label: 'VÍ TIỀN', icon: 'wallet', iconOff: 'wallet-outline' },
              { id: 'fee', label: 'PHÍ THÁNG', icon: 'calendar', iconOff: 'calendar-outline' },
              { id: 'history', label: 'HOẠT ĐỘNG', icon: 'receipt', iconOff: 'receipt-outline' },
              { id: 'profile', label: 'HỒ SƠ', icon: 'person', iconOff: 'person-outline' },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.dockItem, active && styles.dockItemActive]}
                onPress={() => {
                  setTab(item.id);
                  if (item.id === 'wallet' || item.id === 'fee')
                    driverApi('/driver/wallet').then(setWalletData).catch(() => undefined);
                  if (item.id === 'history') loadAll();
                }}
              >
                <Ionicons
                  name={(active ? item.icon : item.iconOff) as any}
                  size={20}
                  color={active ? COLORS.primary : COLORS.textMuted}
                />
                <Text style={[styles.dockLabel, active && styles.dockLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Global High-Priority Modal: ĐƠN LÁI HỘ MỚI (nổi lên trên mọi tab + chuông lặp) */}
      <Modal visible={Boolean(incomingOffer)} transparent animationType="slide">
        <View style={styles.alertModalOverlay}>
          {incomingOffer && (
            <View style={styles.offerCard}>
              <LinearGradient colors={GRADIENTS.offer} style={styles.offerHead}>
                <View style={styles.row}>
                  <Ionicons name="notifications-circle" size={26} color="#FDE047" />
                  <View>
                    <Text style={styles.offerHeadTxt}>ĐƠN LÁI HỘ NOW MỚI</Text>
                    <Text style={{ color: '#FEF08A', fontSize: 11, fontWeight: '700' }}>
                      Bấm NHẬN ĐƠN NGAY để đi đón khách
                    </Text>
                  </View>
                </View>
                <View style={styles.countdownPill}>
                  <Text style={styles.countdownTxt}>{countdown}s</Text>
                </View>
              </LinearGradient>
              <View style={styles.offerBody}>
                {incomingOffer.dispatchRing > 1 ? (
                  <View style={styles.ringBadge}>
                    <Text style={styles.ringBadgeTxt}>
                      📡 Điều phối mở rộng · Vòng {incomingOffer.dispatchRing} (bán kính {incomingOffer.dispatchRadiusKm} km)
                    </Text>
                  </View>
                ) : null}
                <Text style={styles.bold}>📍 Đón: {incomingOffer.pickupAddress}</Text>
                <Text style={styles.sub}>Khoảng cách tới điểm đón: {incomingOffer.distanceToPickupKm} km</Text>
                {incomingOffer.dropoffAddress ? (
                  <Text style={styles.info}>🏁 Trả: {incomingOffer.dropoffAddress}</Text>
                ) : null}
                {incomingOffer.isBookingForOther ? (
                  <View style={styles.proxyOfferBox}>
                    <Text style={styles.proxyOfferTxt}>
                      👤 ĐẶT HỘ · Liên hệ: {incomingOffer.passengerName || 'Khách'} ({incomingOffer.passengerPhone})
                    </Text>
                  </View>
                ) : null}
                {incomingOffer.note ? <Text style={styles.sub}>📝 Ghi chú: {incomingOffer.note}</Text> : null}
                {incomingOffer.estimatedPrice != null ? (
                  <Text style={styles.offerPrice}>
                    {fmtMoney(incomingOffer.estimatedPrice)} ({incomingOffer.distanceKm ?? '—'} km)
                  </Text>
                ) : null}
                <Text style={styles.tiny}>
                  Lưu ý: Từ chối hoặc để hết giờ đếm ngược sẽ bị tạm khóa quyền nhận đơn.
                </Text>
                <View style={styles.row}>
                  <TouchableOpacity style={[styles.acceptBtn, { flex: 1.5 }]} onPress={acceptOffer}>
                    <Text style={styles.btnTxt}>NHẬN ĐƠN NGAY ✓</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.rejectBtn, { flex: 1 }]} onPress={rejectOffer}>
                    <Text style={styles.btnTxt}>TỪ CHỐI</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity style={styles.muteBtn} onPress={stopTripRingtone}>
                  <Ionicons name="volume-mute-outline" size={15} color={COLORS.textMuted} />
                  <Text style={styles.tiny}>Tạm tắt chuông</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Global High-Priority Modal: TỔNG ĐÀI GÁN CHUYẾN MỚI (nổi lên trên mọi tab + chuông lặp) */}
      <Modal visible={Boolean(assignedAlert)} transparent animationType="slide">
        <View style={styles.alertModalOverlay}>
          {assignedAlert && (
            <View style={styles.offerCard}>
              <LinearGradient colors={GRADIENTS.offer} style={styles.offerHead}>
                <View style={styles.row}>
                  <Ionicons name="megaphone" size={24} color="#FDE047" />
                  <View>
                    <Text style={styles.offerHeadTxt}>TỔNG ĐÀI GÁN CHUYẾN MỚI</Text>
                    <Text style={{ color: '#FEF08A', fontSize: 11, fontWeight: '700' }}>
                      Mã chuyến: {assignedAlert.code}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
              <View style={styles.offerBody}>
                <Text style={styles.bold}>📍 Đón: {assignedAlert.pickupAddress}</Text>
                {assignedAlert.dropoffAddress ? (
                  <Text style={styles.info}>🏁 Trả: {assignedAlert.dropoffAddress}</Text>
                ) : null}
                {assignedAlert.isBookingForOther ? (
                  <View style={styles.proxyOfferBox}>
                    <Text style={styles.proxyOfferTxt}>
                      👤 ĐẶT HỘ · Liên hệ: {assignedAlert.passengerName || 'Khách'} ({assignedAlert.passengerPhone})
                    </Text>
                  </View>
                ) : assignedAlert.customer ? (
                  <Text style={styles.sub}>
                    📞 Khách hàng: {assignedAlert.customer.name || 'Khách NOW'} ({assignedAlert.customer.phone})
                  </Text>
                ) : null}
                {assignedAlert.note ? <Text style={styles.sub}>📝 Ghi chú: {assignedAlert.note}</Text> : null}
                {assignedAlert.estimatedPrice != null ? (
                  <Text style={styles.offerPrice}>
                    {fmtMoney(assignedAlert.estimatedPrice)} ({assignedAlert.distanceKm ?? '—'} km)
                  </Text>
                ) : null}
                <TouchableOpacity style={styles.acceptBtn} onPress={acknowledgeAssignedTrip}>
                  <Text style={styles.btnTxt}>NHẬN CHUYẾN & ĐI ĐÓN NGAY  →</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* Completed Trip Financial Receipt Modal */}
      <Modal visible={Boolean(completedSummary)} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Ionicons name="checkmark-circle" size={48} color={COLORS.successDark} style={{ alignSelf: 'center' }} />
            <Text style={styles.modalTitle}>Hoàn thành chuyến {completedSummary?.code}</Text>
            <Text style={[styles.sub, { textAlign: 'center' }]}>
              Quãng đường: {completedSummary?.distanceKm ?? 0} km · Khung giờ{' '}
              {completedSummary?.timeSlot === 'NIGHT' ? 'Ban đêm' : 'Ban ngày'}
            </Text>
            <View style={styles.summaryBox}>
              <Text style={styles.sub}>Thu trực tiếp từ khách hàng</Text>
              <Text style={styles.bigPrice}>{fmtMoney(completedSummary?.finalPrice)}</Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.info}>Chiết khấu hệ thống đã trừ ví:</Text>
              <Text style={[styles.bold, { color: COLORS.danger }]}>
                -{fmtMoney(completedSummary?.commissionAmount)}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.info}>Thực nhận tài xế (sau CK):</Text>
              <Text style={[styles.bold, { color: COLORS.successDark }]}>
                {fmtMoney(
                  completedSummary?.pricingBreakdown?.driverNetIncome ??
                    ((completedSummary?.finalPrice ?? 0) - (completedSummary?.commissionAmount ?? 0)),
                )}
              </Text>
            </View>
            <View style={styles.rowBetween}>
              <Text style={styles.info}>Số dư ví ký quỹ còn lại:</Text>
              <Text style={[styles.bold, { color: COLORS.text }]}>
                {fmtMoney(completedSummary?.driverNewBalance)}
              </Text>
            </View>
            {completedSummary?.walletLowWarning && (
              <View style={styles.warnCard}>
                <Text style={styles.warnTxt}>
                  ⚠️ Số dư ví đã xuống dưới mức tối thiểu. Vui lòng nạp thêm để bật trực tuyến nhận đơn mới.
                </Text>
              </View>
            )}
            <TouchableOpacity activeOpacity={0.88} onPress={() => setCompletedSummary(null)}>
              <LinearGradient colors={GRADIENTS.brand} style={styles.closeBtn}>
                <Text style={styles.btnTxt}>Đóng & Tiếp tục</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <BroadcastAnnouncementModal
        notification={!incomingOffer && !assignedAlert ? popupNotif : null}
        onDismiss={dismissPopupNotif}
      />
      <AppUpdateModal apiBase={serverUrl} refreshSignal={updateCheckSignal} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <DriverAppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.bg },
  container: { flex: 1, backgroundColor: COLORS.bg },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#FEE2E2',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brandMiniLogo: { width: 38, height: 38, borderRadius: 11 },
  headerName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  headerSub: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },
  onlinePill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F1F5F9', paddingLeft: 10, paddingRight: 4, paddingVertical: 2, borderRadius: 20 },
  onlinePillOn: { backgroundColor: COLORS.successSoft },
  onlineTxt: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted },
  scroll: { paddingBottom: 94 },
  homePad: { padding: 16, gap: 14 },
  miniWallet: { borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...SHADOW.card },
  miniWalletCap: { color: 'rgba(255,255,255,0.88)', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  miniWalletVal: { color: '#fff', fontSize: 22, fontWeight: '900', marginTop: 2 },
  miniWalletCta: { backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12 },
  statusCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 24, alignItems: 'center', gap: 10, ...SHADOW.card },
  radarBadge: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 16, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  statusSub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },
  lockCard: { backgroundColor: COLORS.dangerSoft, borderWidth: 1, borderColor: '#FECACA', borderRadius: 18, padding: 16, alignItems: 'center', gap: 4 },
  lockTitle: { fontWeight: '800', color: '#991B1B', fontSize: 14 },
  lockTimer: { fontWeight: '900', color: COLORS.danger, fontSize: 30 },
  lockSub: { fontSize: 11, color: '#7F1D1D', textAlign: 'center' },
  warnCard: { backgroundColor: COLORS.warningSoft, borderRadius: 16, padding: 14, gap: 8, borderWidth: 1, borderColor: '#FCD34D' },
  warnTxt: { fontSize: 12, color: '#92400E', fontWeight: '700' },
  warnBtn: { backgroundColor: '#D97706', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, alignSelf: 'flex-start' },
  offerCard: { backgroundColor: '#FFFFFF', borderRadius: 22, overflow: 'hidden', borderWidth: 1.5, borderColor: '#FECACA', ...SHADOW.dock },
  offerHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  offerHeadTxt: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  countdownPill: { backgroundColor: '#FFFFFF', paddingHorizontal: 14, paddingVertical: 5, borderRadius: 20 },
  countdownTxt: { color: COLORS.primary, fontWeight: '900', fontSize: 16 },
  offerBody: { padding: 16, gap: 9 },
  ringBadge: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9 },
  ringBadgeTxt: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },
  proxyOfferBox: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#F59E0B', padding: 8, borderRadius: 10 },
  proxyOfferTxt: { fontSize: 12, fontWeight: '800', color: '#92400E' },
  offerPrice: { fontSize: 20, fontWeight: '900', color: COLORS.primary },
  acceptBtn: { backgroundColor: COLORS.successDark, padding: 14, borderRadius: 14, alignItems: 'center' },
  rejectBtn: { backgroundColor: COLORS.danger, padding: 14, borderRadius: 14, alignItems: 'center' },
  closeBtn: { padding: 14, borderRadius: 14, alignItems: 'center' },
  btnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
  bold: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  info: { fontSize: 13, color: '#334155' },
  sub: { fontSize: 12, color: COLORS.textMuted },
  tiny: { fontSize: 11, color: COLORS.textLight },
  dockWrap: { position: 'absolute', left: 12, right: 12, bottom: 12 },
  dock: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderRadius: 24, paddingVertical: 7, paddingHorizontal: 4, borderWidth: 1, borderColor: '#FEE2E2', ...SHADOW.dock },
  dockItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, borderRadius: 18, gap: 2 },
  dockItemActive: { backgroundColor: COLORS.primarySoft },
  dockLabel: { fontSize: 8.5, fontWeight: '700', color: COLORS.textMuted },
  dockLabelActive: { color: COLORS.primary, fontWeight: '900' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20 },
  alertModalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.78)', justifyContent: 'center', padding: 16 },
  toastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: COLORS.primaryDark,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  toastTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  toastBody: { color: 'rgba(255,255,255,0.92)', fontSize: 11, marginTop: 1 },
  testBellBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  testBellTxt: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  muteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingTop: 4 },
  modalCard: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 20, gap: 11 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  summaryBox: { backgroundColor: COLORS.primarySoft, borderWidth: 1, borderColor: '#FECACA', padding: 14, borderRadius: 14, alignItems: 'center' },
  bigPrice: { fontSize: 28, fontWeight: '900', color: COLORS.primary },
});
