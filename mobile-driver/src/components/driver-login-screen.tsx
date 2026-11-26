import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, GRADIENTS, SHADOW } from '../theme';
import { driverApi, setApiBase } from '../api';

export function DriverLoginScreen({
  initialServerUrl,
  onLoggedIn,
}: {
  initialServerUrl: string;
  onLoggedIn: (accessToken: string, user: any) => void;
}) {
  const [phone, setPhone] = useState('0900000002');
  const [otp, setOtp] = useState('123456');
  const [otpSent, setOtpSent] = useState(false);
  const [agreed, setAgreed] = useState(true);
  const [resendSec, setResendSec] = useState(0);
  const [loading, setLoading] = useState(false);
  const [showServerCfg, setShowServerCfg] = useState(false);
  const [serverUrl, setServerUrl] = useState(initialServerUrl);

  useEffect(() => {
    if (resendSec <= 0) return;
    const t = setTimeout(() => setResendSec((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendSec]);

  const requestOtp = async () => {
    if (!agreed) {
      return Alert.alert('Điều khoản đối tác', 'Vui lòng đồng ý với quy chế hoạt động tài xế NOW Thái Nguyên.');
    }
    setLoading(true);
    try {
      await setApiBase(serverUrl);
      const res = await driverApi('/auth/otp/request', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), userType: 'DRIVER' }),
      });
      if (res.devOtp) setOtp(res.devOtp);
      setOtpSent(true);
      setResendSec(60);
    } catch (e: any) {
      Alert.alert('Lỗi gửi OTP', e.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    setLoading(true);
    try {
      await setApiBase(serverUrl);
      const res = await driverApi('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: phone.trim(), otp: otp.trim(), userType: 'DRIVER' }),
      });
      onLoggedIn(res.accessToken, res.user);
    } catch (e: any) {
      Alert.alert('Lỗi xác nhận OTP', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={GRADIENTS.hero} style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.heroHeader}>
            <View style={styles.logoFrame}>
              <Image source={require('../../assets/icon.png')} style={styles.logoImg} />
            </View>
            <Text style={styles.welcome}>Đối Tác Tài Xế</Text>
            <Text style={styles.brandAccent}>NOW Thái Nguyên</Text>
            <Text style={styles.heroSub}>
              Nhận đơn bán kính 3–5 km · Quản lý ví ký quỹ & thu nhập minh bạch từng chuyến
            </Text>
          </View>

          <View style={styles.whiteCard}>
            <View style={styles.cardHeader}>
              <View style={styles.iconWrap}>
                <Ionicons name="shield-checkmark" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>
                  {otpSent ? 'Xác thực OTP Tài xế' : 'Đăng nhập / Đăng ký Tài xế'}
                </Text>
                <Text style={styles.cardSub}>
                  {otpSent ? `Mã 6 số gửi tới ${phone}` : 'Nhập số điện thoại để bắt đầu nhận đơn'}
                </Text>
              </View>
            </View>

            <Text style={styles.fieldLabel}>Số điện thoại</Text>
            <View style={styles.phoneBox}>
              <View style={styles.countryPill}>
                <Text style={styles.countryTxt}>🇻🇳 +84</Text>
              </View>
              <TextInput
                style={styles.phoneInput}
                value={phone}
                onChangeText={setPhone}
                editable={!otpSent}
                keyboardType="phone-pad"
                placeholder="0900 000 002"
                placeholderTextColor="#94A3B8"
              />
              {otpSent && (
                <TouchableOpacity onPress={() => setOtpSent(false)}>
                  <Text style={styles.editLink}>Sửa</Text>
                </TouchableOpacity>
              )}
            </View>

            {otpSent && (
              <>
                <Text style={styles.fieldLabel}>Mã OTP (6 số)</Text>
                <View style={styles.phoneBox}>
                  <Ionicons name="key-outline" size={18} color={COLORS.primary} />
                  <TextInput
                    style={[styles.phoneInput, { letterSpacing: 6, fontWeight: '800', fontSize: 18 }]}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="number-pad"
                    maxLength={6}
                    placeholder="123456"
                    placeholderTextColor="#94A3B8"
                  />
                  {resendSec > 0 ? (
                    <Text style={styles.resendTimer}>{resendSec}s</Text>
                  ) : (
                    <TouchableOpacity onPress={requestOtp}>
                      <Text style={styles.editLink}>Gửi lại</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={otpSent ? verifyOtp : requestOtp}
              disabled={loading}
              style={{ marginTop: 6 }}
            >
              <LinearGradient
                colors={GRADIENTS.brand}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.ctaBtn, loading && { opacity: 0.7 }]}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.ctaTxt}>
                    {otpSent ? 'Xác nhận & Vào ca' : 'Gửi mã OTP'}
                  </Text>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.termsRow} onPress={() => setAgreed((v) => !v)}>
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Ionicons name="checkmark" size={14} color={COLORS.primary} />}
            </View>
            <Text style={styles.termsTxt}>
              Tôi đồng ý tuân thủ quy chế nhận đơn, kiểm tra xe bằng ảnh/video & chính sách chiết khấu của NOW Thái Nguyên.
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => setShowServerCfg((v) => !v)} style={styles.cfgBtn}>
            <Ionicons name="settings-outline" size={14} color="rgba(255,255,255,0.75)" />
            <Text style={styles.cfgTxt}>Server: {serverUrl}</Text>
          </TouchableOpacity>
          {showServerCfg && (
            <View style={styles.cfgBox}>
              <TextInput
                style={styles.cfgInput}
                value={serverUrl}
                onChangeText={setServerUrl}
                autoCapitalize="none"
                placeholder="http://127.0.0.1:3005"
                placeholderTextColor="rgba(255,255,255,0.6)"
              />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20, gap: 18 },
  heroHeader: { alignItems: 'flex-start', gap: 4, marginBottom: 4 },
  logoFrame: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    padding: 4,
    marginBottom: 10,
    ...SHADOW.dock,
  },
  logoImg: { width: '100%', height: '100%', borderRadius: 18 },
  welcome: { fontSize: 22, fontWeight: '700', color: 'rgba(255,255,255,0.92)' },
  brandAccent: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', marginTop: -2, letterSpacing: -0.5 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.88)', lineHeight: 19, marginTop: 2 },
  whiteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    gap: 12,
    ...SHADOW.dock,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 2 },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { color: COLORS.text, fontSize: 15, fontWeight: '800' },
  cardSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 1 },
  fieldLabel: { color: '#334155', fontSize: 12, fontWeight: '700' },
  phoneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  countryPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  countryTxt: { fontSize: 13, fontWeight: '700', color: '#0F172A' },
  phoneInput: { flex: 1, fontSize: 16, fontWeight: '700', color: '#0F172A', paddingVertical: 2 },
  editLink: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  resendTimer: { color: '#64748B', fontWeight: '700', fontSize: 12 },
  ctaBtn: { paddingVertical: 15, borderRadius: 14, alignItems: 'center' },
  ctaTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  termsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#FFFFFF', borderColor: '#FFFFFF' },
  termsTxt: { flex: 1, fontSize: 12, color: 'rgba(255,255,255,0.92)', lineHeight: 18 },
  cfgBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  cfgTxt: { color: 'rgba(255,255,255,0.75)', fontSize: 11 },
  cfgBox: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 8 },
  cfgInput: { color: '#FFFFFF', fontSize: 13, paddingHorizontal: 8, paddingVertical: 6 },
});
