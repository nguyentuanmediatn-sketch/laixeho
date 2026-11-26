import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DriverStatus, MediaStage, MediaType, TripStatus } from '@prisma/client';
import { TripsService } from './trips.service';
import { PricingService, PricingConfig } from '../pricing/pricing.service';

describe('TripsService (Operational & Financial Safeguards)', () => {
  const realPricing = new PricingService({} as any);

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

  const mockPrisma: any = {
    trip: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    tripMedia: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    setting: {
      findUnique: jest.fn().mockResolvedValue({ key: 'min_wallet_balance', value: '100000' }),
    },
    wallet: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    walletTransaction: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    driver: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockMap: any = {
    getShortestCarRoute: jest.fn().mockResolvedValue({
      distanceKm: 12,
      durationMin: 25,
      routePolyline: '21.5942,105.8482;21.6500,105.8700',
      routeSource: 'OSRM',
    }),
    reverseGeocode: jest.fn().mockResolvedValue({
      address: 'Quảng trường Võ Nguyên Giáp, TP. Thái Nguyên',
      lat: 21.5931,
      lng: 105.8442,
    }),
  };

  const mockPricing: any = {
    getPricingConfig: jest.fn().mockResolvedValue(defaultConfig),
    resolveTimeSlot: jest.fn((d, ds, ns) => realPricing.resolveTimeSlot(d, ds, ns)),
    calculatePrice: jest.fn((dist, dt, cfg) => realPricing.calculatePrice(dist, dt, cfg)),
  };

  const mockDispatch: any = {
    dispatchNextDriver: jest.fn().mockResolvedValue(undefined),
    clearOfferTimer: jest.fn(),
    cancelPendingOffersForTrip: jest.fn().mockResolvedValue(undefined),
  };

  const mockRealtime: any = {
    emitToCustomer: jest.fn(),
    emitToTrip: jest.fn(),
    emitToDriver: jest.fn(),
    emitToAdmin: jest.fn(),
  };

  const mockNotif: any = {
    sendToUser: jest.fn().mockResolvedValue(undefined),
  };

  const mockRedis: any = {
    geoRemoveDriver: jest.fn().mockResolvedValue(undefined),
  };

  let service: TripsService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.setting.findUnique.mockResolvedValue({ key: 'min_wallet_balance', value: '100000' });
    mockPricing.getPricingConfig.mockResolvedValue(defaultConfig);
    service = new TripsService(
      mockPrisma,
      mockMap,
      mockPricing,
      mockDispatch,
      mockRealtime,
      mockNotif,
      mockRedis,
    );
  });

  it('blocks customer from creating a duplicate active trip (double-tap guard)', async () => {
    mockPrisma.trip.findFirst.mockResolvedValue({ code: 'NOW-123456-111' });

    await expect(
      service.createTrip({
        customerId: 'c1',
        pickupAddress: 'Quảng trường Võ Nguyên Giáp',
        pickupLat: 21.5931,
        pickupLng: 105.8442,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid (0, 0) coordinates on createTrip', async () => {
    await expect(
      service.createTrip({
        customerId: 'c1',
        pickupAddress: 'Null Island',
        pickupLat: 0,
        pickupLng: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('requires valid passengerPhone when isBookingForOther is true', async () => {
    await expect(
      service.createTrip({
        customerId: 'c1',
        pickupAddress: 'Quảng trường Võ Nguyên Giáp',
        pickupLat: 21.5931,
        pickupLng: 105.8442,
        isBookingForOther: true,
        passengerName: 'Anh Hùng',
        passengerPhone: '123',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('seeds actualRoutePolyline when starting trip', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      driverId: 'd1',
      pickupLat: 21.5931,
      pickupLng: 105.8442,
      status: TripStatus.ARRIVED,
    });
    mockPrisma.tripMedia.findMany.mockResolvedValue([
      { type: MediaType.IMAGE, isPlatePhoto: true },
      { type: MediaType.VIDEO, isPlatePhoto: false },
    ]);
    mockPrisma.trip.update.mockImplementation(async ({ data }: any) => ({
      id: 't1',
      customerId: 'c1',
      ...data,
    }));

    const res: any = await service.startTrip('t1', 'd1');
    expect(res.status).toBe(TripStatus.IN_PROGRESS);
    expect(res.actualRoutePolyline).toBe('21.593100,105.844200');
  });

  it('blocks starting trip if plate photo or video is missing', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      driverId: 'd1',
      status: TripStatus.ARRIVED,
    });
    mockPrisma.tripMedia.findMany.mockResolvedValue([
      { type: MediaType.IMAGE, isPlatePhoto: false },
    ]);

    await expect(service.startTrip('t1', 'd1')).rejects.toThrow(BadRequestException);
  });

  it('allows starting trip when plate photo and video exist', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      driverId: 'd1',
      status: TripStatus.ARRIVED,
    });
    mockPrisma.tripMedia.findMany.mockResolvedValue([
      { type: MediaType.IMAGE, isPlatePhoto: true },
      { type: MediaType.VIDEO, isPlatePhoto: false },
    ]);
    mockPrisma.trip.update.mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      status: TripStatus.IN_PROGRESS,
    });

    const res = await service.startTrip('t1', 'd1');
    expect(res.status).toBe(TripStatus.IN_PROGRESS);
  });

  it('allows deleting PICKUP media in ARRIVED but blocks after IN_PROGRESS', async () => {
    mockPrisma.trip.findUnique.mockResolvedValueOnce({
      id: 't1',
      customerId: 'c1',
      driverId: 'd1',
      status: TripStatus.ARRIVED,
    });
    mockPrisma.tripMedia.findUnique.mockResolvedValueOnce({
      id: 'm1',
      tripId: 't1',
      stage: MediaStage.PICKUP,
    });
    mockPrisma.tripMedia.delete.mockResolvedValueOnce({});
    mockPrisma.trip.findUnique.mockResolvedValueOnce({ id: 't1', customerId: 'c1', media: [] });

    const ok = await service.deleteMedia('t1', 'd1', 'm1');
    expect(ok.ok).toBe(true);

    mockPrisma.trip.findUnique.mockResolvedValueOnce({
      id: 't1',
      customerId: 'c1',
      driverId: 'd1',
      status: TripStatus.IN_PROGRESS,
    });
    mockPrisma.tripMedia.findUnique.mockResolvedValueOnce({
      id: 'm1',
      tripId: 't1',
      stage: MediaStage.PICKUP,
    });
    await expect(service.deleteMedia('t1', 'd1', 'm1')).rejects.toThrow(BadRequestException);
  });

  it('blocks customer from cancelling trip once IN_PROGRESS', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      status: TripStatus.IN_PROGRESS,
    });

    await expect(service.cancelTrip('t1', 'CUSTOMER', 'c1')).rejects.toThrow(BadRequestException);
  });

  it('cancels pending dispatch offers when trip is cancelled while SEARCHING', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      code: 'NOW-1',
      customerId: 'c1',
      driverId: null,
      status: TripStatus.SEARCHING,
    });
    mockPrisma.trip.update.mockResolvedValue({
      id: 't1',
      code: 'NOW-1',
      customerId: 'c1',
      status: TripStatus.CANCELLED,
    });

    const res = await service.cancelTrip('t1', 'CUSTOMER', 'c1', 'Đổi ý');
    expect(mockDispatch.cancelPendingOffersForTrip).toHaveBeenCalledWith('t1');
    expect(res.status).toBe(TripStatus.CANCELLED);
  });

  it('prevents IDOR when another customer accesses trip detail', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      driverId: 'd1',
    });

    await expect(service.getTripDetailForUser('t1', 'CUSTOMER', 'c2')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('blocks completing trip without dropoff photo', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      driverId: 'd1',
      status: TripStatus.IN_PROGRESS,
    });
    mockPrisma.tripMedia.count.mockResolvedValue(0);

    await expect(service.completeTrip('t1', 'd1')).rejects.toThrow(BadRequestException);
  });

  it('blocks completing 1-tap trip with neither preset dropoff nor valid actualDropoff GPS', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      code: 'NOW-1TAP',
      customerId: 'c1',
      driverId: 'd1',
      pickupLat: 21.5931,
      pickupLng: 105.8442,
      dropoffLat: null,
      dropoffLng: null,
      distanceKm: null,
      pricingSnapshot: defaultConfig,
      orderedAt: new Date('2026-11-25T07:00:00Z'),
      status: TripStatus.IN_PROGRESS,
    });
    mockPrisma.tripMedia.count.mockResolvedValue(1);

    await expect(service.completeTrip('t1', 'd1')).rejects.toThrow(BadRequestException);
    await expect(service.completeTrip('t1', 'd1', 0, 0)).rejects.toThrow(BadRequestException);
  });

  it('uses frozen pricingSnapshot and preserves measured distanceKm even if Admin changes live settings mid-trip', async () => {
    // Admin changed live settings to astronomical prices mid-trip
    mockPricing.getPricingConfig.mockResolvedValue({
      ...defaultConfig,
      dayBase: 999000,
      dayPerKm: 99000,
      commissionValue: 50,
    });

    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      code: 'NOW-FROZEN',
      customerId: 'c1',
      driverId: 'd1',
      pickupLat: 21.5931,
      pickupLng: 105.8442,
      dropoffLat: 21.65,
      dropoffLng: 105.87,
      dropoffAddress: 'TP. Sông Công',
      distanceKm: 12,
      pricingSnapshot: defaultConfig,
      orderedAt: new Date('2026-11-25T07:00:00Z'),
      status: TripStatus.IN_PROGRESS,
    });
    mockPrisma.tripMedia.count.mockResolvedValue(1);

    const txMock = {
      trip: {
        update: jest.fn().mockImplementation(async ({ data }) => ({
          id: 't1',
          code: 'NOW-FROZEN',
          customerId: 'c1',
          driverId: 'd1',
          ...data,
        })),
      },
      wallet: {
        findUnique: jest.fn().mockResolvedValue({ id: 'w1', balance: 500000 }),
        update: jest.fn().mockResolvedValue({}),
      },
      walletTransaction: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      driver: { update: jest.fn().mockResolvedValue({}) },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txMock));

    const res: any = await service.completeTrip('t1', 'd1');
    // Must NOT call map API again because dropoff & distanceKm already measured
    expect(mockMap.getShortestCarRoute).not.toHaveBeenCalled();
    // Must use frozen defaultConfig (12 km day -> 220,000d, commission 44,000d), NOT live 999,000d
    expect(res.finalPrice).toBe(220000);
    expect(res.commissionAmount).toBe(44000);
    expect(res.driverNewBalance).toBe(456000);
    expect(res.walletLowWarning).toBe(false);
  });

  it('blocks double commission deduction if a COMMISSION transaction already exists for tripId', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      code: 'NOW-DUP',
      customerId: 'c1',
      driverId: 'd1',
      pickupLat: 21.5931,
      pickupLng: 105.8442,
      dropoffLat: 21.65,
      dropoffLng: 105.87,
      distanceKm: 12,
      pricingSnapshot: defaultConfig,
      orderedAt: new Date('2026-11-25T07:00:00Z'),
      status: TripStatus.IN_PROGRESS,
    });
    mockPrisma.tripMedia.count.mockResolvedValue(1);

    const txMock = {
      walletTransaction: {
        findFirst: jest.fn().mockResolvedValue({ id: 'existing-tx' }),
      },
    };
    mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(txMock));

    await expect(service.completeTrip('t1', 'd1')).rejects.toThrow(BadRequestException);
  });

  it('calculates price from actualDropoff coords and auto-offlines driver if wallet drops below min', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      code: 'NOW-999',
      customerId: 'c1',
      driverId: 'd1',
      pickupLat: 21.5931,
      pickupLng: 105.8442,
      dropoffLat: null,
      dropoffLng: null,
      dropoffAddress: null,
      distanceKm: null,
      pricingSnapshot: defaultConfig,
      orderedAt: new Date('2026-11-25T07:00:00Z'),
      status: TripStatus.IN_PROGRESS,
    });
    mockPrisma.tripMedia.count.mockResolvedValue(1);
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        trip: {
          update: jest.fn().mockResolvedValue({
            id: 't1',
            code: 'NOW-999',
            customerId: 'c1',
            driverId: 'd1',
            finalPrice: 220000,
            commissionAmount: 44000,
            status: TripStatus.COMPLETED,
          }),
        },
        wallet: {
          findUnique: jest.fn().mockResolvedValue({ id: 'w1', balance: 120000 }),
          update: jest.fn().mockResolvedValue({}),
        },
        walletTransaction: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: jest.fn().mockResolvedValue({}),
        },
        driver: { update: jest.fn().mockResolvedValue({}) },
      }),
    );

    const res: any = await service.completeTrip('t1', 'd1', 21.65, 105.87);
    expect(mockMap.getShortestCarRoute).toHaveBeenCalledWith(21.5931, 105.8442, 21.65, 105.87);
    expect(res.finalPrice).toBe(220000);
    expect(res.driverNewBalance).toBe(76000);
    expect(res.walletLowWarning).toBe(true);
    expect(mockRedis.geoRemoveDriver).toHaveBeenCalledWith('d1');
  });

  it('assigns an eligible ACTIVE free driver manually from Admin for NO_DRIVER trips', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't-nodrv',
      code: 'NOW-NODRV',
      customerId: 'c1',
      driverId: null,
      status: TripStatus.NO_DRIVER,
      pickupAddress: 'Vincom Plaza Thái Nguyên',
    });
    mockPrisma.driver.findUnique.mockResolvedValue({
      id: 'd1',
      name: 'Trần Văn Tài',
      phone: '0900000002',
      status: DriverStatus.ACTIVE,
      wallet: { balance: 500000 },
    });
    mockPrisma.trip.findFirst.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (cb: any) =>
      cb({
        trip: {
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          findUnique: jest.fn().mockResolvedValue({
            id: 't-nodrv',
            code: 'NOW-NODRV',
            customerId: 'c1',
            driverId: 'd1',
            status: TripStatus.ACCEPTED,
            pickupAddress: 'Vincom Plaza Thái Nguyên',
          }),
        },
        auditLog: { create: jest.fn().mockResolvedValue({}) },
      }),
    );

    const updated: any = await service.assignDriverManually('t-nodrv', 'd1', 'admin1');
    expect(updated.status).toBe(TripStatus.ACCEPTED);
    expect(updated.driverId).toBe('d1');
    expect(mockDispatch.cancelPendingOffersForTrip).toHaveBeenCalledWith('t-nodrv');
  });
});
