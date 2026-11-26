import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TimeSlot } from '@prisma/client';

export interface PricingConfig {
  dayStart: string;
  nightStart: string;
  baseKm: number;
  dayBase: number;
  dayPerKm: number;
  nightBase: number;
  nightPerKm: number;
  distanceRoundStep: number;
  commissionType: 'PERCENT' | 'FIXED';
  commissionValue: number;
}

export interface PriceEstimateResult {
  rawDistanceKm: number;
  distanceKm: number;
  baseKm: number;
  extraKm: number;
  basePrice: number;
  perKmPrice: number;
  extraFee: number;
  timeSlot: TimeSlot;
  price: number;
  commissionType: 'PERCENT' | 'FIXED';
  commissionValue: number;
  commissionAmount: number;
  driverNetIncome: number;
}

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPricingConfig(): Promise<PricingConfig> {
    const rows = await this.prisma.setting.findMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return this.parsePricingConfigFromMap(map);
  }

  parsePricingConfigFromMap(map: Map<string, string>): PricingConfig {
    const commissionTypeRaw = (map.get('commission_type') ?? 'PERCENT').toUpperCase();
    const commissionType: 'PERCENT' | 'FIXED' =
      commissionTypeRaw === 'FIXED' ? 'FIXED' : 'PERCENT';

    const baseKm = Number(map.get('base_km') ?? '5');
    const dayBase = Number(map.get('day_base') ?? '150000');
    const dayPerKm = Number(map.get('day_per_km') ?? '10000');
    const nightBase = Number(map.get('night_base') ?? '200000');
    const nightPerKm = Number(map.get('night_per_km') ?? '15000');
    const distanceRoundStep = Number(map.get('distance_round_step') ?? '0.1');
    const commissionValue = Number(map.get('commission_value') ?? '20');

    return {
      dayStart: TIME_RE.test(map.get('day_start') ?? '') ? map.get('day_start')! : '07:00',
      nightStart: TIME_RE.test(map.get('night_start') ?? '') ? map.get('night_start')! : '22:00',
      baseKm: Number.isFinite(baseKm) && baseKm >= 0 ? baseKm : 5,
      dayBase: Number.isFinite(dayBase) && dayBase >= 0 ? Math.round(dayBase) : 150000,
      dayPerKm: Number.isFinite(dayPerKm) && dayPerKm >= 0 ? Math.round(dayPerKm) : 10000,
      nightBase: Number.isFinite(nightBase) && nightBase >= 0 ? Math.round(nightBase) : 200000,
      nightPerKm: Number.isFinite(nightPerKm) && nightPerKm >= 0 ? Math.round(nightPerKm) : 15000,
      distanceRoundStep:
        Number.isFinite(distanceRoundStep) && distanceRoundStep >= 0 ? distanceRoundStep : 0.1,
      commissionType,
      commissionValue: Number.isFinite(commissionValue) && commissionValue >= 0 ? commissionValue : 20,
    };
  }

  /**
   * Kiểm tra chặt toàn bộ tham số cấu hình trước khi Admin lưu vào DB (tránh sai lệch tài chính)
   */
  validateSettingsPayload(merged: Record<string, string>) {
    const dayStart = merged.day_start ?? '07:00';
    const nightStart = merged.night_start ?? '22:00';
    if (!TIME_RE.test(dayStart) || !TIME_RE.test(nightStart)) {
      throw new BadRequestException('Khung giờ phải đúng định dạng HH:mm (ví dụ 07:00 và 22:00)');
    }
    const [dh, dm] = dayStart.split(':').map(Number);
    const [nh, nm] = nightStart.split(':').map(Number);
    if (dh * 60 + dm >= nh * 60 + nm) {
      throw new BadRequestException('Giờ bắt đầu ban ngày phải nhỏ hơn giờ bắt đầu ban đêm');
    }

    const assertNum = (key: string, label: string, min: number, max: number, integer = false) => {
      if (merged[key] === undefined) return;
      const v = Number(merged[key]);
      if (!Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) {
        throw new BadRequestException(
          `${label} (${key}) không hợp lệ: phải là ${integer ? 'số nguyên' : 'số'} trong khoảng ${min}–${max}`,
        );
      }
    };

    assertNum('base_km', 'Mốc km mở cửa', 0, 100);
    assertNum('day_base', 'Giá mở cửa ban ngày', 0, 50_000_000, true);
    assertNum('day_per_km', 'Đơn giá/km ban ngày', 0, 5_000_000, true);
    assertNum('night_base', 'Giá mở cửa ban đêm', 0, 50_000_000, true);
    assertNum('night_per_km', 'Đơn giá/km ban đêm', 0, 5_000_000, true);
    assertNum('distance_round_step', 'Bước làm tròn km', 0, 5);
    assertNum('radius_km', 'Bán kính tìm tài xế', 0.5, 50);
    if (merged.radius_steps_km !== undefined && merged.radius_steps_km.trim() !== '') {
      const steps = merged.radius_steps_km.split(',').map((s) => Number(s.trim()));
      if (
        steps.length === 0 ||
        steps.length > 5 ||
        steps.some((n) => !Number.isFinite(n) || n < 0.5 || n > 50)
      ) {
        throw new BadRequestException(
          'Các vòng bán kính mở rộng (radius_steps_km) phải là danh sách 1–5 số km từ 0.5 đến 50, cách nhau bởi dấu phẩy (VD: 3,6,10)',
        );
      }
    }
    assertNum('offer_timeout_sec', 'Thời gian chờ xác nhận đơn', 10, 180, true);
    assertNum('lock_minutes', 'Thời gian khóa nhận đơn', 0, 1440, true);
    assertNum('min_wallet_balance', 'Số dư ví tối thiểu', 0, 100_000_000, true);
    assertNum('maintenance_fee', 'Phí duy trì hàng tháng', 0, 50_000_000, true);
    assertNum('remind_days_before', 'Số ngày nhắc phí trước hạn', 0, 30, true);

    const cType = (merged.commission_type ?? 'PERCENT').toUpperCase();
    if (cType !== 'PERCENT' && cType !== 'FIXED') {
      throw new BadRequestException('Loại chiết khấu chỉ nhận PERCENT hoặc FIXED');
    }
    const cVal = Number(merged.commission_value ?? '20');
    if (!Number.isFinite(cVal) || cVal < 0) {
      throw new BadRequestException('Giá trị chiết khấu không được âm');
    }
    if (cType === 'PERCENT' && cVal > 100) {
      throw new BadRequestException('Chiết khấu theo phần trăm (%) phải nằm trong khoảng 0 – 100%');
    }
    if (cType === 'FIXED' && (!Number.isInteger(cVal) || cVal > 50_000_000)) {
      throw new BadRequestException('Chiết khấu cố định phải là số nguyên VNĐ hợp lệ');
    }
  }

  /**
   * Làm tròn quãng đường lên theo bước dùng số nguyên mét để triệt tiêu sai số dấu phẩy động IEEE-754
   */
  roundDistance(rawKm: number, step = 0.1): number {
    if (!Number.isFinite(rawKm) || rawKm < 0) {
      throw new BadRequestException('Quãng đường không hợp lệ');
    }
    if (step <= 0) return Math.round(rawKm * 1000) / 1000;
    const rawMeters = Math.round(rawKm * 1000);
    const stepMeters = Math.round(step * 1000);
    if (stepMeters <= 0) return rawMeters / 1000;
    const roundedMeters = Math.ceil(rawMeters / stepMeters) * stepMeters;
    return roundedMeters / 1000;
  }

  /**
   * Xác định khung giờ ngày / đêm theo giờ Việt Nam (UTC+7)
   * [dayStart, nightStart) -> DAY, ngược lại -> NIGHT
   */
  resolveTimeSlot(date: Date, dayStart = '07:00', nightStart = '22:00'): TimeSlot {
    const vnMinutes = ((date.getUTCHours() + 7) % 24) * 60 + date.getUTCMinutes();
    const [dh, dm] = dayStart.split(':').map(Number);
    const [nh, nm] = nightStart.split(':').map(Number);
    const dayStartMin = dh * 60 + dm;
    const nightStartMin = nh * 60 + nm;

    if (vnMinutes >= dayStartMin && vnMinutes < nightStartMin) {
      return TimeSlot.DAY;
    }
    return TimeSlot.NIGHT;
  }

  /**
   * Tính giá chuyến và chiết khấu chính xác tuyệt đối theo công thức Phụ lục 02 Điều 2.2 - 2.3
   */
  calculatePrice(
    rawDistanceKm: number,
    orderedAt: Date,
    config: PricingConfig,
  ): PriceEstimateResult {
    const distanceKm = this.roundDistance(rawDistanceKm, config.distanceRoundStep);
    const timeSlot = this.resolveTimeSlot(orderedAt, config.dayStart, config.nightStart);

    const basePrice = Math.round(timeSlot === TimeSlot.DAY ? config.dayBase : config.nightBase);
    const perKmPrice = Math.round(timeSlot === TimeSlot.DAY ? config.dayPerKm : config.nightPerKm);

    const distMeters = Math.round(distanceKm * 1000);
    const baseMeters = Math.round(config.baseKm * 1000);
    const extraMeters = Math.max(0, distMeters - baseMeters);
    const extraKm = extraMeters / 1000;
    const extraFee = Math.round((extraMeters * perKmPrice) / 1000);
    const price = basePrice + extraFee;

    const rawCommission =
      config.commissionType === 'PERCENT'
        ? Math.round((price * config.commissionValue) / 100)
        : Math.round(config.commissionValue);
    // Bảo vệ an toàn tài chính: chiết khấu không âm và không vượt quá tổng tiền chuyến
    const commissionAmount = Math.max(0, Math.min(price, rawCommission));
    const driverNetIncome = price - commissionAmount;

    return {
      rawDistanceKm: Math.round(rawDistanceKm * 1000) / 1000,
      distanceKm,
      baseKm: config.baseKm,
      extraKm,
      basePrice,
      perKmPrice,
      extraFee,
      timeSlot,
      price,
      commissionType: config.commissionType,
      commissionValue: config.commissionValue,
      commissionAmount,
      driverNetIncome,
    };
  }
}
