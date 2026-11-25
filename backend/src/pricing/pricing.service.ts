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
  distanceKm: number;
  timeSlot: TimeSlot;
  price: number;
  commissionAmount: number;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async getPricingConfig(): Promise<PricingConfig> {
    const rows = await this.prisma.setting.findMany();
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      dayStart: map.get('day_start') ?? '07:00',
      nightStart: map.get('night_start') ?? '22:00',
      baseKm: parseFloat(map.get('base_km') ?? '5'),
      dayBase: parseInt(map.get('day_base') ?? '150000', 10),
      dayPerKm: parseInt(map.get('day_per_km') ?? '10000', 10),
      nightBase: parseInt(map.get('night_base') ?? '200000', 10),
      nightPerKm: parseInt(map.get('night_per_km') ?? '15000', 10),
      distanceRoundStep: parseFloat(map.get('distance_round_step') ?? '0.1'),
      commissionType: (map.get('commission_type') as 'PERCENT' | 'FIXED') ?? 'PERCENT',
      commissionValue: parseFloat(map.get('commission_value') ?? '20'),
    };
  }

  /**
   * Làm tròn quãng đường lên theo bước (mặc định 0.1 km)
   */
  roundDistance(rawKm: number, step = 0.1): number {
    if (rawKm < 0) throw new BadRequestException('Quãng đường không hợp lệ');
    if (step <= 0) return rawKm;
    const factor = 1 / step;
    return Math.ceil(rawKm * factor - 1e-9) / factor;
  }

  /**
   * Xác định khung giờ ngày / đêm theo giờ Việt Nam (UTC+7)
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
   * Tính giá chuyến và chiết khấu theo công thức Phụ lục 02 Điều 2.2 - 2.3
   */
  calculatePrice(
    rawDistanceKm: number,
    orderedAt: Date,
    config: PricingConfig,
  ): PriceEstimateResult {
    const distanceKm = this.roundDistance(rawDistanceKm, config.distanceRoundStep);
    const timeSlot = this.resolveTimeSlot(orderedAt, config.dayStart, config.nightStart);

    const basePrice = timeSlot === TimeSlot.DAY ? config.dayBase : config.nightBase;
    const perKm = timeSlot === TimeSlot.DAY ? config.dayPerKm : config.nightPerKm;

    let price = basePrice;
    if (distanceKm > config.baseKm) {
      price += Math.round((distanceKm - config.baseKm) * perKm);
    }

    const commissionAmount =
      config.commissionType === 'PERCENT'
        ? Math.round((price * config.commissionValue) / 100)
        : Math.round(config.commissionValue);

    return {
      distanceKm,
      timeSlot,
      price,
      commissionAmount,
    };
  }
}
