import { BadRequestException } from '@nestjs/common';
import { PricingService, PricingConfig } from './pricing.service';
import { TimeSlot } from '@prisma/client';

describe('PricingService (Financial Precision & Validation)', () => {
  let service: PricingService;

  const defaultConfig: PricingConfig = {
    dayStart: '07:00',
    nightStart: '22:00',
    baseKm: 5,
    dayBase: 150000,
    dayPerKm: 10000,
    nightBase: 200000,
    nightPerKm: 15000,
    distanceRoundStep: 0.1,
    commissionType: 'PERCENT',
    commissionValue: 20,
  };

  beforeEach(() => {
    service = new PricingService({} as any);
  });

  describe('calculatePrice — core contract examples', () => {
    it('calculates 0 km and 4 km daytime (14:00 VN = 07:00 UTC) as base 150,000d', () => {
      const dt = new Date('2026-11-25T07:00:00Z');
      const r0 = service.calculatePrice(0, dt, defaultConfig);
      expect(r0.price).toBe(150000);
      expect(r0.extraKm).toBe(0);
      expect(r0.extraFee).toBe(0);

      const r4 = service.calculatePrice(4, dt, defaultConfig);
      expect(r4.timeSlot).toBe(TimeSlot.DAY);
      expect(r4.price).toBe(150000);
      expect(r4.commissionAmount).toBe(30000);
      expect(r4.driverNetIncome).toBe(120000);
    });

    it('calculates 12 km daytime as 220,000d and 20% commission = 44,000d', () => {
      const dt = new Date('2026-11-25T07:00:00Z');
      const res = service.calculatePrice(12, dt, defaultConfig);
      expect(res.timeSlot).toBe(TimeSlot.DAY);
      expect(res.extraKm).toBe(7);
      expect(res.extraFee).toBe(70000);
      expect(res.price).toBe(220000);
      expect(res.commissionAmount).toBe(44000);
      expect(res.driverNetIncome).toBe(176000);
    });

    it('calculates 5 km nighttime (23:00 VN = 16:00 UTC) as 200,000d', () => {
      const dt = new Date('2026-11-25T16:00:00Z');
      const res = service.calculatePrice(5, dt, defaultConfig);
      expect(res.timeSlot).toBe(TimeSlot.NIGHT);
      expect(res.price).toBe(200000);
      expect(res.commissionAmount).toBe(40000);
    });

    it('calculates 12 km nighttime as 305,000d', () => {
      const dt = new Date('2026-11-25T16:00:00Z');
      const res = service.calculatePrice(12, dt, defaultConfig);
      expect(res.timeSlot).toBe(TimeSlot.NIGHT);
      expect(res.extraKm).toBe(7);
      expect(res.extraFee).toBe(105000);
      expect(res.price).toBe(305000);
      expect(res.commissionAmount).toBe(61000);
      expect(res.driverNetIncome).toBe(244000);
    });

    it('calculates fractional extra distance cleanly without float drift (5.12 -> 5.2 km -> +2,000d day / +3,000d night)', () => {
      const dayRes = service.calculatePrice(5.12, new Date('2026-11-25T07:00:00Z'), defaultConfig);
      expect(dayRes.distanceKm).toBe(5.2);
      expect(dayRes.extraKm).toBe(0.2);
      expect(dayRes.extraFee).toBe(2000);
      expect(dayRes.price).toBe(152000);

      const nightRes = service.calculatePrice(5.12, new Date('2026-11-25T16:00:00Z'), defaultConfig);
      expect(nightRes.distanceKm).toBe(5.2);
      expect(nightRes.extraFee).toBe(3000);
      expect(nightRes.price).toBe(203000);
    });
  });

  describe('roundDistance — IEEE-754 floating-point elimination', () => {
    it('rounds up by 0.1 km step accurately on tricky IEEE-754 numbers', () => {
      expect(service.roundDistance(5.0, 0.1)).toBe(5.0);
      expect(service.roundDistance(5.001, 0.1)).toBe(5.1);
      expect(service.roundDistance(5.1, 0.1)).toBe(5.1);
      expect(service.roundDistance(5.12, 0.1)).toBe(5.2);
      expect(service.roundDistance(5.7, 0.1)).toBe(5.7);
      expect(service.roundDistance(0.3, 0.1)).toBe(0.3);
      // Famous JS float trap: 1.15 / 0.05 === 23.000000000000004
      expect(service.roundDistance(1.15, 0.05)).toBe(1.15);
      expect(service.roundDistance(6.25, 0.5)).toBe(6.5);
      expect(service.roundDistance(5.1234, 0)).toBe(5.123);
    });

    it('is idempotent when re-rounding an already rounded distance', () => {
      const first = service.roundDistance(7.23, 0.1);
      const second = service.roundDistance(first, 0.1);
      expect(first).toBe(7.3);
      expect(second).toBe(7.3);
    });

    it('rejects negative or NaN distance', () => {
      expect(() => service.roundDistance(-1, 0.1)).toThrow(BadRequestException);
      expect(() => service.roundDistance(Number.NaN, 0.1)).toThrow(BadRequestException);
    });
  });

  describe('resolveTimeSlot — exact VN (UTC+7) boundaries', () => {
    it('handles 06:59 VN -> NIGHT, 07:00 VN -> DAY, 21:59 VN -> DAY, 22:00 VN -> NIGHT, 00:00 VN -> NIGHT', () => {
      // 06:59 VN = 23:59 UTC previous day
      expect(service.resolveTimeSlot(new Date('2026-11-24T23:59:00Z'))).toBe(TimeSlot.NIGHT);
      // 07:00 VN = 00:00 UTC
      expect(service.resolveTimeSlot(new Date('2026-11-25T00:00:00Z'))).toBe(TimeSlot.DAY);
      // 21:59 VN = 14:59 UTC
      expect(service.resolveTimeSlot(new Date('2026-11-25T14:59:00Z'))).toBe(TimeSlot.DAY);
      // 22:00 VN = 15:00 UTC
      expect(service.resolveTimeSlot(new Date('2026-11-25T15:00:00Z'))).toBe(TimeSlot.NIGHT);
      // 00:00 VN = 17:00 UTC
      expect(service.resolveTimeSlot(new Date('2026-11-25T17:00:00Z'))).toBe(TimeSlot.NIGHT);
    });
  });

  describe('commission clamping', () => {
    it('supports FIXED commission type', () => {
      const dt = new Date('2026-11-25T07:00:00Z');
      const res = service.calculatePrice(12, dt, {
        ...defaultConfig,
        commissionType: 'FIXED',
        commissionValue: 35000,
      });
      expect(res.commissionAmount).toBe(35000);
      expect(res.driverNetIncome).toBe(185000);
    });

    it('clamps FIXED commission so it never exceeds total trip price', () => {
      const dt = new Date('2026-11-25T07:00:00Z');
      const res = service.calculatePrice(3, dt, {
        ...defaultConfig,
        commissionType: 'FIXED',
        commissionValue: 999000,
      });
      expect(res.price).toBe(150000);
      expect(res.commissionAmount).toBe(150000);
      expect(res.driverNetIncome).toBe(0);
    });
  });

  describe('validateSettingsPayload — guards Admin configuration against financial corruption', () => {
    const validSettings: Record<string, string> = {
      day_start: '07:00',
      night_start: '22:00',
      base_km: '5',
      day_base: '150000',
      day_per_km: '10000',
      night_base: '200000',
      night_per_km: '15000',
      distance_round_step: '0.1',
      commission_type: 'PERCENT',
      commission_value: '20',
      radius_km: '5',
      offer_timeout_sec: '30',
      lock_minutes: '30',
      min_wallet_balance: '100000',
      maintenance_fee: '200000',
      remind_days_before: '3',
    };

    it('accepts valid configuration', () => {
      expect(() => service.validateSettingsPayload(validSettings)).not.toThrow();
    });

    it('rejects invalid HH:mm format or inverted day/night bounds', () => {
      expect(() =>
        service.validateSettingsPayload({ ...validSettings, day_start: '7:00' }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.validateSettingsPayload({ ...validSettings, day_start: '22:00', night_start: '22:00' }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.validateSettingsPayload({ ...validSettings, day_start: '23:00', night_start: '22:00' }),
      ).toThrow(BadRequestException);
    });

    it('rejects commission PERCENT > 100, negative values, or NaN', () => {
      expect(() =>
        service.validateSettingsPayload({ ...validSettings, commission_type: 'PERCENT', commission_value: '105' }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.validateSettingsPayload({ ...validSettings, day_base: '-50000' }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.validateSettingsPayload({ ...validSettings, day_per_km: 'abc' }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.validateSettingsPayload({ ...validSettings, offer_timeout_sec: '5' }),
      ).toThrow(BadRequestException);
    });
  });
});
