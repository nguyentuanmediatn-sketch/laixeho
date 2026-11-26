import { OfferResult, TripStatus } from '@prisma/client';
import { DispatchService } from './dispatch.service';

describe('DispatchService', () => {
  const mockPrisma: any = {
    trip: { findUnique: jest.fn(), updateMany: jest.fn() },
    dispatchOffer: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    driver: { update: jest.fn(), findMany: jest.fn() },
    driverLock: { create: jest.fn() },
    setting: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(),
  };
  const mockRedis: any = { geoRadiusDrivers: jest.fn().mockResolvedValue([]) };
  const mockRealtime: any = {
    emitToDriver: jest.fn(),
    emitToCustomer: jest.fn(),
    emitToTrip: jest.fn(),
    emitToAdmin: jest.fn(),
  };
  const mockNotif: any = { sendToUser: jest.fn().mockResolvedValue(undefined) };

  let service: DispatchService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DispatchService(mockPrisma, mockRedis, mockRealtime, mockNotif);
  });

  it('does NOT lock driver on timeout if trip was already CANCELLED', async () => {
    mockPrisma.dispatchOffer.findUnique.mockResolvedValue({
      id: 'o1',
      driverId: 'd1',
      tripId: 't1',
      result: OfferResult.PENDING,
      trip: { status: TripStatus.CANCELLED },
    });

    await service.handleOfferTimeout('o1');

    expect(mockPrisma.dispatchOffer.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { result: OfferResult.TIMEOUT },
    });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockRealtime.emitToDriver).not.toHaveBeenCalledWith('driver:locked', expect.anything());
  });

  it('expands dispatch radius across rings (3km -> 6km -> 10km) and matches driver in ring 2', async () => {
    jest.useFakeTimers();
    try {
      mockPrisma.trip.findUnique.mockResolvedValue({
        id: 't-ring',
        code: 'LXH-RING1',
        status: TripStatus.SEARCHING,
        customerId: 'c1',
        pickupAddress: 'Quảng trường Võ Nguyên Giáp',
        pickupLat: 21.5931,
        pickupLng: 105.8442,
        dropoffAddress: 'ĐH Thái Nguyên',
        dropoffLat: 21.585,
        dropoffLng: 105.806,
        distanceKm: 4.5,
        estimatedPrice: 150000,
        isBookingForOther: false,
        passengerName: null,
        passengerPhone: null,
        note: null,
      });
      mockPrisma.setting.findMany.mockResolvedValue([
        { key: 'radius_km', value: '3' },
        { key: 'radius_steps_km', value: '3,6,10' },
        { key: 'offer_timeout_sec', value: '30' },
        { key: 'min_wallet_balance', value: '100000' },
      ]);
      mockPrisma.dispatchOffer.findMany.mockResolvedValue([]);
      // Ring 1 (3km) has no driver; Ring 2 (6km) finds driver d-far at 4.8km
      mockRedis.geoRadiusDrivers
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ driverId: 'd-far', distanceKm: 4.8 }]);
      // Fallback DB query for Ring 1 also returns empty; eligibleDrivers for Ring 2 returns d-far
      mockPrisma.driver.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ id: 'd-far' }]);
      mockPrisma.dispatchOffer.create.mockResolvedValue({
        id: 'offer-ring2',
        tripId: 't-ring',
        driverId: 'd-far',
        distanceToPickupKm: 4.8,
      });

      await service.dispatchNextDriver('t-ring');

      expect(mockRedis.geoRadiusDrivers).toHaveBeenNthCalledWith(1, 105.8442, 21.5931, 3);
      expect(mockRedis.geoRadiusDrivers).toHaveBeenNthCalledWith(2, 105.8442, 21.5931, 6);
      expect(mockRealtime.emitToCustomer).toHaveBeenCalledWith('c1', 'trip:dispatch_ring', {
        tripId: 't-ring',
        ring: 2,
        radiusKm: 6,
      });
      expect(mockRealtime.emitToAdmin).toHaveBeenCalledWith('trip:dispatch_ring', {
        tripId: 't-ring',
        tripCode: 'LXH-RING1',
        ring: 2,
        radiusKm: 6,
      });
      expect(mockRealtime.emitToDriver).toHaveBeenCalledWith(
        'd-far',
        'trip:offer',
        expect.objectContaining({
          offerId: 'offer-ring2',
          dispatchRing: 2,
          dispatchRadiusKm: 6,
          distanceToPickupKm: 4.8,
        }),
      );
      service.clearOfferTimer('offer-ring2');
    } finally {
      jest.useRealTimers();
    }
  });
});
