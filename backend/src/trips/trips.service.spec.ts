import { BadRequestException } from '@nestjs/common';
import { MediaType, TripStatus } from '@prisma/client';
import { TripsService } from './trips.service';

describe('TripsService', () => {
  const mockPrisma: any = {
    trip: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    tripMedia: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    wallet: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    walletTransaction: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockMap: any = {
    getShortestCarRoute: jest.fn().mockResolvedValue({
      distanceKm: 12,
      durationMin: 25,
      routePolyline: 'poly',
    }),
  };

  const mockPricing: any = {
    getPricingConfig: jest.fn().mockResolvedValue({
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
    }),
    calculatePrice: jest.fn().mockReturnValue({
      distanceKm: 12,
      timeSlot: 'DAY',
      price: 220000,
      commissionAmount: 44000,
    }),
  };

  const mockDispatch: any = {
    dispatchNextDriver: jest.fn().mockResolvedValue(undefined),
    clearOfferTimer: jest.fn(),
  };

  const mockRealtime: any = {
    emitToCustomer: jest.fn(),
    emitToTrip: jest.fn(),
    emitToDriver: jest.fn(),
  };

  const mockNotif: any = {
    sendToUser: jest.fn().mockResolvedValue(undefined),
  };

  let service: TripsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TripsService(
      mockPrisma,
      mockMap,
      mockPricing,
      mockDispatch,
      mockRealtime,
      mockNotif,
    );
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

  it('blocks customer from cancelling trip once IN_PROGRESS', async () => {
    mockPrisma.trip.findUnique.mockResolvedValue({
      id: 't1',
      customerId: 'c1',
      status: TripStatus.IN_PROGRESS,
    });

    await expect(service.cancelTrip('t1', 'CUSTOMER', 'c1')).rejects.toThrow(BadRequestException);
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
});
