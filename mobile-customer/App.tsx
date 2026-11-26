import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import {
  customerApi,
  getApiBase,
  getCustomerToken,
  loadSavedSession,
  setCustomerToken,
} from './src/api';
import { COLORS, SHADOW } from './src/theme';
import { CustomerLoginScreen } from './src/components/login-screen';
import { BookingView } from './src/components/booking-view';
import { ActiveTripView } from './src/components/active-trip-view';
import { HistoryTab, NotificationsTab, ProfileTab } from './src/components/history-profile-view';

type Tab = 'book' | 'history' | 'notifications' | 'profile';

function CustomerAppContent() {
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [serverUrl, setServerUrl] = useState(getApiBase());

  const [tab, setTab] = useState<Tab>('book');
  const [activeTrip, setActiveTrip] = useState<any>(null);
  const [dispatchRingInfo, setDispatchRingInfo] = useState<{ ring: number; radiusKm: number } | null>(null);
  const [publicConfig, setPublicConfig] = useState<{ publicTrackBaseUrl: string; hotline: string }>({
    publicTrackBaseUrl: 'https://now.tuannv.site',
    hotline: '0973521456',
  });
  const [history, setHistory] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const session = await loadSavedSession();
        setServerUrl(session.apiBase);
        if (session.token) {
          const me = await customerApi('/auth/me');
          if (me) setUser(me);
        }
      } catch {
        await setCustomerToken(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const loadInitialData = async () => {
    try {
      const [active, hist, notifs, pubCfg] = await Promise.all([
        customerApi('/trips/active'),
        customerApi('/trips/my-history'),
        customerApi('/notifications'),
        customerApi('/trips/config').catch(() => null),
      ]);
      if (active) setActiveTrip(active);
      setHistory(hist || []);
      setNotifications(notifs || []);
      if (pubCfg?.publicTrackBaseUrl) setPublicConfig(pubCfg);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (!user) return;
    const token = getCustomerToken();
    if (!token) return;

    const socket = io(`${getApiBase()}/ws`, { auth: { token } });
    socketRef.current = socket;

    socket.on('trip:status', (trip: any) => {
      setActiveTrip((prev: any) => (trip?.id ? trip : prev));
      if (trip?.status && trip.status !== 'SEARCHING') {
        setDispatchRingInfo(null);
      }
      if (['COMPLETED', 'CANCELLED', 'NO_DRIVER'].includes(trip?.status)) {
        customerApi('/trips/my-history').then(setHistory).catch(() => undefined);
      }
    });
    socket.on('trip:dispatch_ring', (info: { tripId?: string; ring: number; radiusKm: number }) => {
      if (info?.ring && info?.radiusKm) {
        setDispatchRingInfo({ ring: info.ring, radiusKm: info.radiusKm });
      }
    });
    socket.on('trip:dropoff_updated', (trip: any) => {
      if (trip?.id) setActiveTrip(trip);
    });
    socket.on('driver:location', (loc: { lat: number; lng: number; actualRoutePolyline?: string }) => {
      setActiveTrip((prev: any) =>
        prev
          ? {
              ...prev,
              driver: { ...(prev.driver || {}), lat: loc.lat, lng: loc.lng },
              ...(loc.actualRoutePolyline ? { actualRoutePolyline: loc.actualRoutePolyline } : {}),
            }
          : prev,
      );
    });
    socket.on('notification:new', (notif: any) => {
      setNotifications((prev) => [notif, ...prev]);
    });

    loadInitialData();
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    if (activeTrip?.id && socketRef.current) {
      socketRef.current.emit('trip:join', { tripId: activeTrip.id });
    }
  }, [activeTrip?.id]);

  const handleLogout = async () => {
    await setCustomerToken(null);
    setUser(null);
    setActiveTrip(null);
  };

  const unreadCount = notifications.filter((n) => !n.readAt).length;

  if (booting) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.darkBg }} edges={['bottom']}>
        <StatusBar style="light" />
        <CustomerLoginScreen
          initialServerUrl={serverUrl}
          onLoggedIn={async (token, u) => {
            await setCustomerToken(token);
            setUser(u);
          }}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* NOW Thái Nguyên Top Header */}
      <View style={styles.topHeader}>
        <View style={styles.greetRow}>
          <Image source={require('./assets/icon.png')} style={styles.brandMiniLogo} />
          <View>
            <Text style={styles.helloSub}>NOW Thái Nguyên · Lái Xe Hộ</Text>
            <Text style={styles.helloName}>Xin chào, {user.name || user.phone}</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.bellBtn}
          onPress={() => {
            setTab('notifications');
            customerApi('/notifications').then(setNotifications).catch(() => undefined);
          }}
        >
          <Ionicons name="notifications-outline" size={21} color={COLORS.text} />
          {unreadCount > 0 && (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeTxt}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {tab === 'book' &&
          (activeTrip ? (
            <ActiveTripView
              trip={activeTrip}
              dispatchRingInfo={dispatchRingInfo}
              publicTrackBaseUrl={publicConfig.publicTrackBaseUrl}
              hotline={publicConfig.hotline}
              onUpdated={(t) => setActiveTrip(t)}
              onResetNewTrip={() => {
                setActiveTrip(null);
                setDispatchRingInfo(null);
              }}
            />
          ) : (
            <BookingView
              onTripCreated={(t) => {
                setDispatchRingInfo(null);
                setActiveTrip(t);
                socketRef.current?.emit('trip:join', { tripId: t.id });
              }}
            />
          ))}
        {tab === 'history' && <HistoryTab history={history} />}
        {tab === 'notifications' && (
          <NotificationsTab
            items={notifications}
            onMarkAllRead={async () => {
              await customerApi('/notifications/read-all', { method: 'POST' });
              const list = await customerApi('/notifications');
              setNotifications(list);
            }}
          />
        )}
        {tab === 'profile' && (
          <ProfileTab user={user} onUpdated={setUser} onLogout={handleLogout} />
        )}
      </ScrollView>

      {/* Floating Rounded White-Red Bottom Tab Dock */}
      <View style={styles.dockWrap}>
        <View style={styles.dock}>
          {(
            [
              { id: 'book', label: 'TRANG CHỦ', icon: 'home', iconOff: 'home-outline' },
              { id: 'history', label: 'HOẠT ĐỘNG', icon: 'time', iconOff: 'time-outline' },
              { id: 'notifications', label: 'THÔNG BÁO', icon: 'notifications', iconOff: 'notifications-outline', badge: unreadCount },
              { id: 'profile', label: 'TÀI KHOẢN', icon: 'person', iconOff: 'person-outline' },
            ] as const
          ).map((item) => {
            const active = tab === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.dockItem, active && styles.dockItemActive]}
                onPress={() => {
                  setTab(item.id);
                  if (item.id === 'history') customerApi('/trips/my-history').then(setHistory).catch(() => undefined);
                  if (item.id === 'notifications') customerApi('/notifications').then(setNotifications).catch(() => undefined);
                }}
              >
                <View style={{ position: 'relative' }}>
                  <Ionicons
                    name={(active ? item.icon : item.iconOff) as any}
                    size={20}
                    color={active ? COLORS.primary : COLORS.textMuted}
                  />
                  {'badge' in item && item.badge > 0 ? <View style={styles.dotBadge} /> : null}
                </View>
                <Text style={[styles.dockLabel, active && styles.dockLabelActive]}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <CustomerAppContent />
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
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderColor: '#FEE2E2',
  },
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMiniLogo: { width: 38, height: 38, borderRadius: 11 },
  helloSub: { fontSize: 11, color: COLORS.primary, fontWeight: '800' },
  helloName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  bellBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  bellBadge: { position: 'absolute', top: 2, right: 2, minWidth: 16, height: 16, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  bellBadgeTxt: { color: '#fff', fontSize: 9, fontWeight: '900' },
  scroll: { paddingBottom: 92 },
  dockWrap: { position: 'absolute', left: 14, right: 14, bottom: 12 },
  dock: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderWidth: 1,
    borderColor: '#FEE2E2',
    ...SHADOW.dock,
  },
  dockItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 5, borderRadius: 18, gap: 2 },
  dockItemActive: { backgroundColor: COLORS.primarySoft },
  dockLabel: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted },
  dockLabelActive: { color: COLORS.primary, fontWeight: '800' },
  dotBadge: { position: 'absolute', top: -2, right: -3, width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.primary },
});
