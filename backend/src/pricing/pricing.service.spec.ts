import { PricingService, PricingConfig } from './pricing.service';
import { TimeSlot } from '@prisma/client';

describe('PricingService', () => {
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

  it('calculates 4 km daytime (14:00 VN = 07:00 UTC) as 150,000d', () => {
    const dt = new Date('2026-11-25T07:00:00Z');
    const res = service.calculatePrice(4, dt, defaultConfig);
    expect(res.timeSlot).toBe(TimeSlot.DAY);
    expect(res.price).toBe(150000);
    expect(res.commissionAmount).toBe(30000);
  });

  it('calculates 12 km daytime as 220,000d and 20% commission = 44,000d', () => {
    const dt = new Date('2026-11-25T07:00:00Z');
    const res = service.calculatePrice(12, dt, defaultConfig);
    expect(res.timeSlot).toBe(TimeSlot.DAY);
    expect(res.price).toBe(220000);
    expect(res.commissionAmount).toBe(44000);
  });

  it('calculates 5 km nighttime (23:00 VN = 16:00 UTC) as 200,000d', () => {
    const dt = new Date('2026-11-25T16:00:00Z');
    const res = service.calculatePrice(5, dt, defaultConfig);
    expect(res.timeSlot).toBe(TimeSlot.NIGHT);
    expect(res.price).toBe(200000);
  });

  it('calculates 12 km nighttime as 305,000d', () => {
    const dt = new Date('2026-11-25T16:00:00Z');
    const res = service.calculatePrice(12, dt, defaultConfig);
    expect(res.timeSlot).toBe(TimeSlot.NIGHT);
    expect(res.price).toBe(305000);
  });

  it('rounds up distance to 0.1 km step', () => {
    expect(service.roundDistance(5.12, 0.1)).toBe(5.2);
    expect(service.roundDistance(5.0, 0.1)).toBe(5.0);
  });

  it('supports FIXED commission type', () => {
    const dt = new Date('2026-11-25T07:00:00Z');
    const res = service.calculatePrice(12, dt, {
      ...defaultConfig,
      commissionType: 'FIXED',
      commissionValue: 35000,
    });
    expect(res.commissionAmount).toBe(35000);
  });
});
