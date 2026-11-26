import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { driverApi, fmtMoney, uploadFileWithProgress } from '../api';
import { COLORS, GRADIENTS, SHADOW } from '../theme';

const QUICK_TOPUP_AMOUNTS = [200000, 300000, 500000, 1000000];

function VietQrBox({
  qr,
  onUploaded,
  onDismiss,
}: {
  qr: any;
  onUploaded?: (updated: any) => void;
  onDismiss?: () => void;
}) {
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  const uploadReceiptUri = async (uri: string) => {
    setUploadPct(0);
    try {
      const presign = await driverApi(`/driver/payment-qr/${qr.id}/proof/presign`, {
        method: 'POST',
        body: JSON.stringify({ ext: 'jpg', contentType: 'image/jpeg' }),
      });
      await uploadFileWithProgress(presign.uploadUrl, uri, 'image/jpeg', (pct) => setUploadPct(pct));
      const updated = await driverApi(`/driver/payment-qr/${qr.id}/proof`, {
        method: 'POST',
        body: JSON.stringify({ proofImageUrl: presign.publicUrl }),
      });
      onUploaded?.(updated);
      Alert.alert(
        'Đã gửi ảnh chuyển khoản!',
        `Biên lai cho mã GD ${qr.txCode} đã gửi lên Admin. Admin kiểm tra và xác nhận cộng ví / gia hạn ngay.`,
      );
    } catch (e: any) {
      Alert.alert('Lỗi tải biên lai', e.message);
    } finally {
      setUploadPct(null);
    }
  };

  const pickFromGallery = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert('Thiếu quyền', 'Cần cấp quyền Thư viện ảnh để chọn ảnh chụp màn hình chuyển khoản.');
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
    });
    if (!res.canceled && res.assets?.[0]) {
      await uploadReceiptUri(res.assets[0].uri);
    }
  };

  const captureFromCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return Alert.alert('Thiếu quyền', 'Cần cấp quyền Camera để chụp biên lai.');
    }
    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.75,
    });
    if (!res.canceled && res.assets?.[0]) {
      await uploadReceiptUri(res.assets[0].uri);
    }
  };

  const handleChooseProofSource = () => {
    Alert.alert(
      'Tải ảnh chuyển khoản',
      'Chọn ảnh chụp màn hình giao dịch MB Bank thành công để Admin đối soát nhanh:',
      [
        { text: 'Chọn từ Thư viện ảnh', onPress: pickFromGallery },
        { text: 'Chụp ảnh trực tiếp', onPress: captureFromCamera },
        { text: 'Hủy', style: 'cancel' },
      ],
    );
  };

  return (
    <View style={styles.qrCard}>
      <View style={styles.rowBetween}>
        <View style={styles.rowIcon}>
          <Ionicons name="qr-code" size={18} color={COLORS.primary} />
          <Text style={styles.title}>Mã VietQR · {qr.txCode}</Text>
        </View>
        {onDismiss ? (
          <TouchableOpacity onPress={onDismiss}>
            <Ionicons name="close-circle" size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.qrImgWrap}>
        <Image source={{ uri: qr.qrUrl }} style={styles.qrImg} resizeMode="contain" />
      </View>

      <View style={styles.qrMetaBox}>
        <View style={styles.rowBetween}>
          <Text style={styles.sub}>Ngân hàng / STK</Text>
          <Text style={styles.bold}>
            {qr.bankName || qr.bankCode || 'MB Bank'} · {qr.bankAccount || '0973521456'}
          </Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.sub}>Chủ tài khoản</Text>
          <Text style={styles.bold}>{qr.bankOwner || 'NGUYEN VAN TUAN'}</Text>
        </View>
        <View style={styles.rowBetween}>
          <Text style={styles.sub}>Số tiền</Text>
          <Text style={[styles.bold, { color: COLORS.primary, fontSize: 15 }]}>{fmtMoney(qr.amount)}</Text>
        </View>
        <View style={styles.contentBox}>
          <Text style={styles.tiny}>Nội dung chuyển khoản (kèm mã GD tự sinh):</Text>
          <Text style={styles.contentTxt} selectable>
            {qr.transferContent}
          </Text>
        </View>
      </View>

      {/* Bước 2: Upload ảnh chụp màn hình chuyển khoản để Admin duyệt */}
      {qr.proofImageUrl ? (
        <View style={styles.proofDoneBox}>
          <View style={styles.rowBetween}>
            <View style={styles.rowIcon}>
              <Ionicons name="checkmark-circle" size={17} color={COLORS.successDark} />
              <Text style={[styles.bold, { color: COLORS.successDark }]}>Đã gửi ảnh chuyển khoản</Text>
            </View>
            {qr.status === 'PENDING' && (
              <TouchableOpacity onPress={handleChooseProofSource} disabled={uploadPct !== null}>
                <Text style={styles.replaceProofTxt}>Đổi ảnh</Text>
              </TouchableOpacity>
            )}
          </View>
          <Image source={{ uri: qr.proofImageUrl }} style={styles.proofThumb} resizeMode="cover" />
          <Text style={styles.tiny}>
            {qr.status === 'CONFIRMED'
              ? '✅ Admin đã xác nhận giao dịch này.'
              : 'Đang chờ Admin kiểm tra ảnh chuyển khoản và xác nhận.'}
          </Text>
        </View>
      ) : null}

      {uploadPct !== null && (
        <View style={styles.uploadProgBox}>
          <Text style={styles.sub}>Đang tải ảnh chuyển khoản... {uploadPct}%</Text>
          <View style={styles.uploadProgTrack}>
            <View style={[styles.uploadProgFill, { width: `${uploadPct}%` }]} />
          </View>
        </View>
      )}

      {qr.status === 'PENDING' && !qr.proofImageUrl && (
        <TouchableOpacity
          style={styles.uploadProofBtn}
          onPress={handleChooseProofSource}
          disabled={uploadPct !== null}
          activeOpacity={0.85}
        >
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={styles.qrCtaTxt}>Tải ảnh biên lai chuyển khoản lên Admin</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.qrHint}>
        Bước 1: Quét mã QR thanh toán (giữ nguyên nội dung {qr.txCode}).{'\n'}Bước 2: Tải ảnh chụp chuyển khoản thành công để Admin duyệt cộng ví / gia hạn.
      </Text>
    </View>
  );
}

export function WalletView({
  walletData,
  onRefresh,
}: {
  walletData: any;
  onRefresh: () => void;
}) {
  const balance = walletData?.wallet?.balance ?? 0;
  const minBal = walletData?.minWalletBalance ?? 100000;
  const isLow = balance < minBal;

  const [amountText, setAmountText] = useState('500000');
  const [creatingQr, setCreatingQr] = useState(false);
  const [generatedQr, setGeneratedQr] = useState<any>(null);

  const topupIntents = (walletData?.paymentIntents || []).filter(
    (p: any) => p.purpose === 'WALLET_TOPUP',
  );
  const activeQr = generatedQr || topupIntents.find((p: any) => p.status === 'PENDING') || null;

  const handleGenerateTopupQr = async () => {
    const cleanNum = parseInt(amountText.replace(/[^\d]/g, ''), 10);
    if (!cleanNum || cleanNum < 10000 || cleanNum > 100_000_000) {
      return Alert.alert('Số tiền chưa hợp lệ', 'Vui lòng nhập số tiền nạp từ 10.000đ trở lên.');
    }
    setCreatingQr(true);
    try {
      const qr = await driverApi('/driver/payment-qr', {
        method: 'POST',
        body: JSON.stringify({ purpose: 'WALLET_TOPUP', amount: cleanNum }),
      });
      setGeneratedQr(qr);
      onRefresh();
    } catch (e: any) {
      Alert.alert('Lỗi tạo mã QR', e.message);
    } finally {
      setCreatingQr(false);
    }
  };

  return (
    <View style={styles.list}>
      <Text style={styles.pageTitle}>Ví ký quỹ NOW Thái Nguyên</Text>

      <LinearGradient
        colors={isLow ? ['#991B1B', '#DC2626'] : GRADIENTS.wallet}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroWallet}
      >
        <View style={styles.rowBetween}>
          <View style={styles.walletLabelRow}>
            <Ionicons name="wallet" size={18} color="#fff" />
            <Text style={styles.heroCap}>SỐ DƯ VÍ KÝ QUỸ</Text>
          </View>
          <TouchableOpacity style={styles.refreshChip} onPress={onRefresh}>
            <Ionicons name="refresh" size={14} color="#fff" />
            <Text style={styles.refreshTxt}>Làm mới</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.heroAmount}>{fmtMoney(balance)}</Text>
        <Text style={styles.heroHint}>
          {isLow
            ? `⚠️ Dưới mức tối thiểu ${fmtMoney(minBal)} — cần nạp thêm để tiếp tục nhận đơn`
            : `Đủ điều kiện nhận đơn (tối thiểu ${fmtMoney(minBal)})`}
        </Text>
      </LinearGradient>

      {/* Tạo mã VietQR MB Bank nạp tiền vào ví */}
      <View style={styles.card}>
        <View style={styles.rowIcon}>
          <Ionicons name="qr-code-outline" size={18} color={COLORS.primary} />
          <Text style={styles.title}>Nạp tiền vào ví qua VietQR (MB Bank)</Text>
        </View>
        <Text style={styles.sub}>
          {walletData?.bankInfo || 'MB Bank · STK: 0973521456 · Chủ TK: NGUYEN VAN TUAN'}
        </Text>

        <View style={styles.quickRow}>
          {QUICK_TOPUP_AMOUNTS.map((amt) => {
            const active = parseInt(amountText.replace(/[^\d]/g, ''), 10) === amt;
            return (
              <TouchableOpacity
                key={amt}
                style={[styles.quickChip, active && styles.quickChipActive]}
                onPress={() => setAmountText(String(amt))}
              >
                <Text style={[styles.quickChipTxt, active && styles.quickChipTxtActive]}>
                  {amt >= 1000000 ? `${amt / 1000000}tr` : `${amt / 1000}k`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.amountInputRow}>
          <Text style={styles.sub}>Số tiền (VNĐ):</Text>
          <TextInput
            style={styles.amountInput}
            keyboardType="number-pad"
            value={amountText}
            onChangeText={setAmountText}
            placeholder="Nhập số tiền muốn nạp..."
          />
        </View>

        <TouchableOpacity activeOpacity={0.88} onPress={handleGenerateTopupQr} disabled={creatingQr}>
          <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.qrCtaBtn}>
            {creatingQr ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="qr-code" size={17} color="#fff" />
                <Text style={styles.qrCtaTxt}>Tạo mã QR nạp tiền vào ví</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {activeQr && (
        <VietQrBox
          qr={activeQr}
          onUploaded={(updated) => {
            setGeneratedQr(updated);
            onRefresh();
          }}
          onDismiss={generatedQr ? () => setGeneratedQr(null) : undefined}
        />
      )}

      {topupIntents.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.title}>Phiếu VietQR nạp ví gần đây</Text>
          {topupIntents.slice(0, 6).map((p: any) => (
            <TouchableOpacity
              key={p.id}
              style={styles.txRow}
              onPress={() => setGeneratedQr(p)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.bold}>
                  {p.txCode} · {fmtMoney(p.amount)}
                </Text>
                <Text style={styles.tiny} numberOfLines={1}>
                  {p.proofImageUrl ? '🧾 Đã gửi ảnh CK · ' : ''}
                  {p.transferContent}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      p.status === 'CONFIRMED'
                        ? COLORS.successSoft
                        : p.status === 'CANCELLED'
                          ? '#E2E8F0'
                          : COLORS.warningSoft,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeTxt,
                    {
                      color:
                        p.status === 'CONFIRMED'
                          ? COLORS.successDark
                          : p.status === 'CANCELLED'
                            ? COLORS.textMuted
                            : '#B45309',
                    },
                  ]}
                >
                  {p.status === 'CONFIRMED' ? 'Đã duyệt' : p.status === 'CANCELLED' ? 'Đã hủy' : 'Chờ duyệt'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.title}>Lịch sử giao dịch ví</Text>
        {!walletData?.wallet?.transactions?.length && (
          <Text style={styles.sub}>Chưa có giao dịch ví.</Text>
        )}
        {(walletData?.wallet?.transactions || []).map((tx: any) => (
          <View key={tx.id} style={styles.txRow}>
            <View
              style={[
                styles.txIcon,
                { backgroundColor: tx.amount >= 0 ? COLORS.successSoft : COLORS.dangerSoft },
              ]}
            >
              <Ionicons
                name={tx.amount >= 0 ? 'arrow-down-circle' : 'arrow-up-circle'}
                size={20}
                color={tx.amount >= 0 ? COLORS.successDark : COLORS.danger}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.bold}>
                {tx.type === 'TOPUP'
                  ? 'Nạp tiền ví'
                  : tx.type === 'COMMISSION'
                    ? 'Trừ chiết khấu'
                    : 'Admin điều chỉnh'}
              </Text>
              <Text style={styles.sub}>{tx.note}</Text>
              <Text style={styles.tiny}>{new Date(tx.createdAt).toLocaleString('vi-VN')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.bold, { color: tx.amount >= 0 ? COLORS.successDark : COLORS.danger }]}>
                {tx.amount >= 0 ? '+' : ''}
                {fmtMoney(tx.amount)}
              </Text>
              <Text style={styles.tiny}>Còn: {fmtMoney(tx.balanceAfter)}</Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function MaintenanceFeeView({
  driver,
  bankInfo,
  paymentIntents = [],
  onRefresh,
}: {
  driver: any;
  bankInfo: string;
  paymentIntents?: any[];
  onRefresh?: () => void;
}) {
  const feeAmount = driver?.config?.maintenanceFee ?? 200000;
  const dueDate = driver?.feeDueDate ? new Date(driver.feeDueDate) : null;
  const now = new Date();
  const daysLeft = dueDate ? Math.ceil((dueDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)) : null;
  const isOverdue = daysLeft !== null && daysLeft < 0;
  const isSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 3;

  const targetDate = dueDate || now;
  const periodStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
  const monthLabel = String(targetDate.getMonth() + 1).padStart(2, '0');

  const [creatingQr, setCreatingQr] = useState(false);
  const [generatedQr, setGeneratedQr] = useState<any>(null);

  const feeIntents = paymentIntents.filter((p) => p.purpose === 'MAINTENANCE_FEE');
  const activeQr = generatedQr || feeIntents.find((p) => p.status === 'PENDING') || null;

  const handleGenerateFeeQr = async () => {
    setCreatingQr(true);
    try {
      const qr = await driverApi('/driver/payment-qr', {
        method: 'POST',
        body: JSON.stringify({ purpose: 'MAINTENANCE_FEE', period: periodStr }),
      });
      setGeneratedQr(qr);
      onRefresh?.();
    } catch (e: any) {
      Alert.alert('Lỗi tạo mã QR đóng quỹ', e.message);
    } finally {
      setCreatingQr(false);
    }
  };

  return (
    <View style={styles.list}>
      <Text style={styles.pageTitle}>Đóng quỹ duy trì hàng tháng</Text>

      <LinearGradient
        colors={isOverdue ? ['#991B1B', '#DC2626'] : isSoon ? ['#D97706', '#F59E0B'] : GRADIENTS.brand}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroWallet}
      >
        <View style={styles.walletLabelRow}>
          <Ionicons name="calendar" size={18} color="#fff" />
          <Text style={styles.heroCap}>QUỸ DUY TRÌ TÀI KHOẢN</Text>
        </View>
        <Text style={styles.heroAmount}>{fmtMoney(feeAmount)} / tháng</Text>
        <Text style={styles.heroHint}>
          {!dueDate
            ? 'Chưa kích hoạt kỳ phí (sau khi Admin duyệt hồ sơ)'
            : isOverdue
              ? `⚠️ ĐÃ QUÁ HẠN ${Math.abs(daysLeft!)} ngày (Hạn: ${dueDate.toLocaleDateString('vi-VN')})`
              : isSoon
                ? `⏰ Sắp đến hạn còn ${daysLeft} ngày (${dueDate.toLocaleDateString('vi-VN')})`
                : `✅ Đang hiệu lực · Hạn tiếp theo: ${dueDate.toLocaleDateString('vi-VN')}`}
        </Text>
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.title}>Đóng quỹ tháng {monthLabel} qua VietQR (MB Bank)</Text>
        <Text style={styles.bankTxt}>
          {bankInfo || driver?.config?.bankInfo || 'MB Bank · STK: 0973521456 · Chủ TK: NGUYEN VAN TUAN'}
        </Text>
        <Text style={styles.sub}>
          Nội dung tự sinh theo chuẩn: Tên tài xế + quy thang {monthLabel} + Mã GD để Admin đối soát 1 chạm và tự động gia hạn +1 tháng.
        </Text>
        <TouchableOpacity activeOpacity={0.88} onPress={handleGenerateFeeQr} disabled={creatingQr}>
          <LinearGradient colors={GRADIENTS.brand} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.qrCtaBtn}>
            {creatingQr ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="qr-code" size={17} color="#fff" />
                <Text style={styles.qrCtaTxt}>
                  Tạo mã QR đóng quỹ tháng {monthLabel} ({fmtMoney(feeAmount)})
                </Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {activeQr && (
        <VietQrBox
          qr={activeQr}
          onUploaded={(updated) => {
            setGeneratedQr(updated);
            onRefresh?.();
          }}
          onDismiss={generatedQr ? () => setGeneratedQr(null) : undefined}
        />
      )}

      {feeIntents.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.title}>Phiếu VietQR đóng quỹ gần đây</Text>
          {feeIntents.slice(0, 6).map((p: any) => (
            <TouchableOpacity
              key={p.id}
              style={styles.txRow}
              onPress={() => setGeneratedQr(p)}
              activeOpacity={0.75}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.bold}>
                  {p.txCode} · Kỳ {p.period || monthLabel} ({fmtMoney(p.amount)})
                </Text>
                <Text style={styles.tiny} numberOfLines={1}>
                  {p.proofImageUrl ? '🧾 Đã gửi ảnh CK · ' : ''}
                  {p.transferContent}
                </Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor:
                      p.status === 'CONFIRMED'
                        ? COLORS.successSoft
                        : p.status === 'CANCELLED'
                          ? '#E2E8F0'
                          : COLORS.warningSoft,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeTxt,
                    {
                      color:
                        p.status === 'CONFIRMED'
                          ? COLORS.successDark
                          : p.status === 'CANCELLED'
                            ? COLORS.textMuted
                            : '#B45309',
                    },
                  ]}
                >
                  {p.status === 'CONFIRMED' ? 'Đã duyệt' : p.status === 'CANCELLED' ? 'Đã hủy' : 'Chờ duyệt'}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.title}>Lịch sử kỳ phí</Text>
        {!driver?.maintenanceFees?.length && <Text style={styles.sub}>Chưa có bản ghi kỳ phí.</Text>}
        {(driver?.maintenanceFees || []).map((f: any) => (
          <View key={f.id} style={styles.txRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bold}>
                Kỳ {f.period} — {fmtMoney(f.amount)}
              </Text>
              <Text style={styles.sub}>Hạn đóng: {new Date(f.dueDate).toLocaleDateString('vi-VN')}</Text>
            </View>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    f.status === 'PAID'
                      ? COLORS.successSoft
                      : f.status === 'OVERDUE'
                        ? COLORS.dangerSoft
                        : COLORS.warningSoft,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusBadgeTxt,
                  {
                    color:
                      f.status === 'PAID'
                        ? COLORS.successDark
                        : f.status === 'OVERDUE'
                          ? COLORS.danger
                          : '#B45309',
                  },
                ]}
              >
                {f.status === 'PAID' ? 'Đã đóng' : f.status === 'OVERDUE' ? 'Quá hạn' : 'Chưa đóng'}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const BROADCAST_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  PROMO: { label: '🎁 Thưởng / Ưu đãi', bg: '#FFE4E6', fg: '#BE123C' },
  UPDATE: { label: '🚀 Cập nhật', bg: '#E0E7FF', fg: '#3730A3' },
  SYSTEM: { label: '📢 Vận hành', bg: '#FEF3C7', fg: '#92400E' },
  GENERAL: { label: '🔔 Thông báo', bg: '#F1F5F9', fg: '#334155' },
};

export function DriverHistoryAndNotifsView({
  trips,
  notifications,
  onMarkRead,
  onMarkAllRead,
}: {
  trips: any[];
  notifications: any[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
}) {
  const [subTab, setSubTab] = useState<'trips' | 'notifs'>('trips');
  const unreadNotifs = notifications.filter((n) => !n.readAt).length;

  return (
    <View style={styles.list}>
      <View style={styles.rowBetween}>
        <Text style={styles.pageTitle}>Hoạt động & Thông báo</Text>
        {subTab === 'notifs' && unreadNotifs > 0 && onMarkAllRead && (
          <TouchableOpacity style={styles.markReadChip} onPress={onMarkAllRead}>
            <Text style={styles.markReadTxt}>Đọc tất cả</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.segment}>
        <TouchableOpacity
          style={[styles.segBtn, subTab === 'trips' && styles.segActive]}
          onPress={() => setSubTab('trips')}
        >
          <Text style={[styles.segTxt, subTab === 'trips' && styles.segTxtActive]}>
            Chuyến đi ({trips.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segBtn, subTab === 'notifs' && styles.segActive]}
          onPress={() => setSubTab('notifs')}
        >
          <Text style={[styles.segTxt, subTab === 'notifs' && styles.segTxtActive]}>
            Thông báo ({notifications.length}{unreadNotifs > 0 ? ` · ${unreadNotifs} mới` : ''})
          </Text>
        </TouchableOpacity>
      </View>

      {subTab === 'trips' ? (
        <View style={{ gap: 10 }}>
          {trips.length === 0 && <Text style={styles.sub}>Chưa có chuyến đi nào.</Text>}
          {trips.slice(0, 20).map((t) => {
            const net =
              t.finalPrice != null && t.commissionAmount != null
                ? t.finalPrice - t.commissionAmount
                : null;
            return (
              <View key={t.id} style={styles.card}>
                <View style={styles.rowBetween}>
                  <Text style={styles.bold}>{t.code}</Text>
                  <Text style={[styles.statusBadgeTxt, { color: COLORS.primary }]}>{t.status}</Text>
                </View>
                <Text style={styles.sub} numberOfLines={1}>
                  ● {t.pickupAddress}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  ● {t.dropoffAddress || '—'}
                </Text>
                <View style={styles.rowBetween}>
                  <Text style={styles.tiny}>
                    {new Date(t.orderedAt).toLocaleString('vi-VN')}
                    {t.distanceKm != null ? ` · ${t.distanceKm} km` : ''}
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.bold, { color: COLORS.primary }]}>
                      {fmtMoney(t.finalPrice ?? t.estimatedPrice)}
                    </Text>
                    {t.commissionAmount != null && (
                      <Text style={styles.tiny}>
                        CK: -{fmtMoney(t.commissionAmount)}
                        {net != null ? ` · Thực nhận: ${fmtMoney(net)}` : ''}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {notifications.length === 0 && <Text style={styles.sub}>Chưa có thông báo nào.</Text>}
          {notifications.slice(0, 30).map((n) => {
            const badge = n?.data?.kind === 'BROADCAST' ? BROADCAST_BADGE[n.data.category || 'GENERAL'] : null;
            const actionUrl = n?.data?.actionUrl as string | undefined;
            return (
              <TouchableOpacity
                key={n.id}
                activeOpacity={0.85}
                onPress={() => {
                  if (!n.readAt) onMarkRead?.(n.id);
                }}
                style={[styles.card, !n.readAt && styles.unreadCard]}
              >
                {badge && (
                  <View style={{ alignSelf: 'flex-start', backgroundColor: badge.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 }}>
                    <Text style={{ fontSize: 10.5, fontWeight: '800', color: badge.fg }}>{badge.label}</Text>
                  </View>
                )}
                <View style={styles.rowBetween}>
                  <Text style={[styles.bold, { flex: 1 }]}>{n.title}</Text>
                  {!n.readAt && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.sub}>{n.body}</Text>
                {actionUrl ? (
                  <TouchableOpacity
                    style={styles.actionLinkBtn}
                    onPress={() => {
                      if (!n.readAt) onMarkRead?.(n.id);
                      Linking.openURL(actionUrl).catch(() => undefined);
                    }}
                  >
                    <Ionicons name="open-outline" size={14} color="#FFFFFF" />
                    <Text style={styles.actionLinkTxt}>Xem chi tiết</Text>
                  </TouchableOpacity>
                ) : null}
                <Text style={styles.tiny}>{new Date(n.sentAt).toLocaleString('vi-VN')}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, gap: 14 },
  pageTitle: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  heroWallet: { borderRadius: 22, padding: 18, gap: 10, ...SHADOW.card },
  walletLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroCap: { color: 'rgba(255,255,255,0.9)', fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  heroAmount: { color: '#FFFFFF', fontSize: 28, fontWeight: '900' },
  heroHint: { color: 'rgba(255,255,255,0.92)', fontSize: 12, fontWeight: '600' },
  refreshChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.22)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  refreshTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  card: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, gap: 10, ...SHADOW.card },
  qrCard: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 15, gap: 10, borderWidth: 1.5, borderColor: '#FECACA', ...SHADOW.card },
  qrImgWrap: { alignItems: 'center', backgroundColor: '#FFF8F8', borderRadius: 14, padding: 10, borderWidth: 1, borderColor: '#FEE2E2' },
  qrImg: { width: 250, height: 290 },
  qrMetaBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 11, gap: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  contentBox: { backgroundColor: '#FEF2F2', borderRadius: 10, padding: 9, borderWidth: 1, borderColor: '#FECACA', marginTop: 2, gap: 2 },
  contentTxt: { fontSize: 13, fontWeight: '900', color: COLORS.primaryDark },
  qrHint: { fontSize: 11, color: COLORS.textMuted, lineHeight: 16, textAlign: 'center' },
  quickRow: { flexDirection: 'row', gap: 8 },
  quickChip: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  quickChipActive: { backgroundColor: '#FEF2F2', borderColor: COLORS.primary },
  quickChipTxt: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted },
  quickChipTxtActive: { color: COLORS.primary },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  amountInput: { flex: 1, fontSize: 16, fontWeight: '900', color: COLORS.text, textAlign: 'right', paddingVertical: 2 },
  qrCtaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 14 },
  uploadProofBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 13, borderRadius: 14, backgroundColor: COLORS.successDark },
  proofDoneBox: { backgroundColor: COLORS.successSoft, borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 14, padding: 11, gap: 8 },
  proofThumb: { width: '100%', height: 180, borderRadius: 10, backgroundColor: '#fff' },
  replaceProofTxt: { fontSize: 12, fontWeight: '800', color: COLORS.primary, textDecorationLine: 'underline' },
  uploadProgBox: { backgroundColor: COLORS.primarySoft, borderRadius: 10, padding: 9, gap: 5 },
  uploadProgTrack: { height: 6, backgroundColor: '#FECACA', borderRadius: 3, overflow: 'hidden' },
  uploadProgFill: { height: 6, backgroundColor: COLORS.primary },
  qrCtaTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  rowIcon: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  bankTxt: { fontSize: 13, fontWeight: '700', color: COLORS.text, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', padding: 10, borderRadius: 10 },
  bold: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 12, color: COLORS.textMuted },
  tiny: { fontSize: 11, color: COLORS.textLight },
  txRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderColor: '#F1F5F9', paddingTop: 10 },
  txIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusBadgeTxt: { fontSize: 11, fontWeight: '800' },
  segment: { flexDirection: 'row', backgroundColor: '#E2E8F0', padding: 4, borderRadius: 14 },
  segBtn: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  segActive: { backgroundColor: '#FFFFFF', ...SHADOW.card },
  segTxt: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  segTxtActive: { color: COLORS.primary },
  unreadCard: { borderLeftWidth: 4, borderLeftColor: COLORS.primary },
  unreadDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: COLORS.primary },
  markReadChip: { backgroundColor: COLORS.primarySoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  markReadTxt: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  actionLinkBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  actionLinkTxt: { color: '#FFFFFF', fontWeight: '800', fontSize: 12 },
});
