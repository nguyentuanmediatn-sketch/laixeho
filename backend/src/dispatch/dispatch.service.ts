import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { DriverStatus, OfferResult, TripStatus, UserType } from '@prisma/client';

@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  private async getDispatchConfig() {
    const rows = await this.prisma.setting.findMany({
      where: {
        key: { in: ['radius_km', 'offer_timeout_sec', 'lock_minutes', 'min_wallet_balance'] },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    return {
      radiusKm: parseFloat(map.get('radius_km') ?? '5'),
      offerTimeoutSec: parseInt(map.get('offer_timeout_sec') ?? '30', 10),
      lockMinutes: parseInt(map.get('lock_minutes') ?? '30', 10),
      minWalletBalance: parseInt(map.get('min_wallet_balance') ?? '100000', 10),
    };
  }

  /**
   * Tìm tài xế gần nhất trong bán kính cấu hình và gửi offer đếm ngược
   */
  async dispatchNextDriver(tripId: string): Promise<void> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.status !== TripStatus.SEARCHING) return;

    const cfg = await this.getDispatchConfig();
    const existingOffers = await this.prisma.dispatchOffer.findMany({
      where: { tripId },
      select: { driverId: true },
    });
    const excludedIds = new Set(existingOffers.map((o) => o.driverId));

    // Lấy ứng viên từ Redis GEO; nếu Redis chưa sẵn sàng, fallback query DB
    let geoCandidates = await this.redis.geoRadiusDrivers(
      trip.pickupLng,
      trip.pickupLat,
      cfg.radiusKm,
    );

    if (geoCandidates.length === 0) {
      const onlineDrivers = await this.prisma.driver.findMany({
        where: {
          status: DriverStatus.ACTIVE,
          isOnline: true,
          lat: { not: null },
          lng: { not: null },
        },
        select: { id: true, lat: true, lng: true },
      });
      geoCandidates = onlineDrivers
        .map((d) => ({
          driverId: d.id,
          distanceKm: this.haversineKm(trip.pickupLat, trip.pickupLng, d.lat!, d.lng!),
        }))
        .filter((d) => d.distanceKm <= cfg.radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
    }

    const candidateIds = geoCandidates
      .filter((c) => !excludedIds.has(c.driverId))
      .map((c) => c.driverId);

    if (candidateIds.length === 0) {
      await this.markNoDriver(trip.id, trip.customerId, trip.code);
      return;
    }

    const now = new Date();
    const eligibleDrivers = await this.prisma.driver.findMany({
      where: {
        id: { in: candidateIds },
        status: DriverStatus.ACTIVE,
        isOnline: true,
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
        wallet: { balance: { gte: cfg.minWalletBalance } },
        trips: {
          none: {
            status: { in: [TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS] },
          },
        },
      },
      select: { id: true },
    });

    const eligibleSet = new Set(eligibleDrivers.map((d) => d.id));
    const chosen = geoCandidates.find((c) => eligibleSet.has(c.driverId));

    if (!chosen) {
      await this.markNoDriver(trip.id, trip.customerId, trip.code);
      return;
    }

    const expiresAt = new Date(Date.now() + cfg.offerTimeoutSec * 1000);
    const offer = await this.prisma.dispatchOffer.create({
      data: {
        tripId: trip.id,
        driverId: chosen.driverId,
        distanceToPickupKm: Number(chosen.distanceKm.toFixed(2)),
        expiresAt,
      },
    });

    const offerPayload = {
      offerId: offer.id,
      tripId: trip.id,
      tripCode: trip.code,
      pickupAddress: trip.pickupAddress,
      pickupLat: trip.pickupLat,
      pickupLng: trip.pickupLng,
      dropoffAddress: trip.dropoffAddress,
      distanceKm: trip.distanceKm,
      estimatedPrice: trip.estimatedPrice,
      distanceToPickupKm: offer.distanceToPickupKm,
      timeoutSec: cfg.offerTimeoutSec,
      expiresAt: expiresAt.toISOString(),
    };

    this.realtime.emitToDriver(chosen.driverId, 'trip:offer', offerPayload);
    await this.notifications.sendToUser(
      UserType.DRIVER,
      chosen.driverId,
      'Có đơn lái xe hộ mới',
      `Đón tại: ${trip.pickupAddress} (cách ${offer.distanceToPickupKm} km)`,
      offerPayload,
    );

    const timer = setTimeout(() => {
      this.handleOfferTimeout(offer.id).catch((err) =>
        this.logger.error(`Timeout handler error: ${err.message}`),
      );
    }, cfg.offerTimeoutSec * 1000);
    this.timers.set(offer.id, timer);
  }

  clearOfferTimer(offerId: string) {
    const timer = this.timers.get(offerId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(offerId);
    }
  }

  async handleOfferTimeout(offerId: string) {
    this.timers.delete(offerId);
    const offer = await this.prisma.dispatchOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.result !== OfferResult.PENDING) return;

    await this.rejectAndLockDriver(offer.id, offer.driverId, offer.tripId, OfferResult.TIMEOUT);
  }

  async rejectAndLockDriver(
    offerId: string,
    driverId: string,
    tripId: string,
    result: 'REJECTED' | 'TIMEOUT',
  ) {
    this.clearOfferTimer(offerId);
    const cfg = await this.getDispatchConfig();
    const now = new Date();
    const lockedUntil = new Date(now.getTime() + cfg.lockMinutes * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.dispatchOffer.update({
        where: { id: offerId },
        data: { result },
      }),
      this.prisma.driver.update({
        where: { id: driverId },
        data: { lockedUntil },
      }),
      this.prisma.driverLock.create({
        data: {
          driverId,
          offerId,
          lockedFrom: now,
          lockedUntil,
          reason: result === 'TIMEOUT' ? 'Hết thời gian xác nhận đơn' : 'Từ chối đơn',
        },
      }),
    ]);

    this.realtime.emitToDriver(driverId, 'driver:locked', {
      lockedUntil: lockedUntil.toISOString(),
      lockMinutes: cfg.lockMinutes,
    });

    await this.notifications.sendToUser(
      UserType.DRIVER,
      driverId,
      'Tạm khóa quyền nhận đơn',
      `Bạn bị khóa nhận đơn ${cfg.lockMinutes} phút do ${result === 'TIMEOUT' ? 'bỏ qua đơn' : 'từ chối đơn'}.`,
    );

    await this.dispatchNextDriver(tripId);
  }

  private async markNoDriver(tripId: string, customerId: string, tripCode: string) {
    await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.SEARCHING },
      data: { status: TripStatus.NO_DRIVER },
    });
    this.realtime.emitToCustomer(customerId, 'trip:status', {
      tripId,
      status: TripStatus.NO_DRIVER,
    });
    this.realtime.emitToAdmin('trip:no_driver', { tripId, tripCode });
    await this.notifications.sendToUser(
      UserType.CUSTOMER,
      customerId,
      'Chưa tìm được tài xế',
      'Hiện chưa có tài xế phù hợp gần bạn. Tổng đài sẽ hỗ trợ bạn ngay.',
      { tripId },
    );
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
