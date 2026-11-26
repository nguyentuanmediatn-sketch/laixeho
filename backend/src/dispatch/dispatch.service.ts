import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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
        key: {
          in: ['radius_km', 'radius_steps_km', 'offer_timeout_sec', 'lock_minutes', 'min_wallet_balance'],
        },
      },
    });
    const map = new Map(rows.map((r) => [r.key, r.value]));
    const baseRadius = parseFloat(map.get('radius_km') ?? '3');
    const rawSteps = (map.get('radius_steps_km') ?? `${baseRadius},6,10`)
      .split(',')
      .map((s) => parseFloat(s.trim()))
      .filter((n) => Number.isFinite(n) && n >= 0.5 && n <= 50);
    const radiusSteps = Array.from(new Set(rawSteps.length > 0 ? rawSteps : [baseRadius, Math.min(50, baseRadius * 2)])).sort(
      (a, b) => a - b,
    );
    return {
      radiusKm: radiusSteps[0],
      radiusSteps,
      offerTimeoutSec: parseInt(map.get('offer_timeout_sec') ?? '30', 10),
      lockMinutes: parseInt(map.get('lock_minutes') ?? '30', 10),
      minWalletBalance: parseInt(map.get('min_wallet_balance') ?? '100000', 10),
    };
  }

  /**
   * Điều phối mở rộng đa vòng (VD: 3km -> 6km -> 10km):
   * Ưu tiên tài xế gần nhất đủ điều kiện ở vòng trong, hết tài xế tự động mở rộng vòng ngoài.
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

    const now = new Date();
    const staleCutoff = new Date(now.getTime() - 15 * 60 * 1000);

    let chosen: { driverId: string; distanceKm: number } | undefined;
    let matchedRingIndex = 0;
    let matchedRadiusKm = cfg.radiusSteps[0];

    for (let ringIdx = 0; ringIdx < cfg.radiusSteps.length; ringIdx++) {
      const ringRadius = cfg.radiusSteps[ringIdx];
      if (ringIdx > 0) {
        this.realtime.emitToCustomer(trip.customerId, 'trip:dispatch_ring', {
          tripId: trip.id,
          ring: ringIdx + 1,
          radiusKm: ringRadius,
        });
        this.realtime.emitToAdmin('trip:dispatch_ring', {
          tripId: trip.id,
          tripCode: trip.code,
          ring: ringIdx + 1,
          radiusKm: ringRadius,
        });
      }

      let geoCandidates = await this.redis.geoRadiusDrivers(
        trip.pickupLng,
        trip.pickupLat,
        ringRadius,
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
          .filter((d) => d.distanceKm <= ringRadius)
          .sort((a, b) => a.distanceKm - b.distanceKm);
      }

      const candidateIds = geoCandidates
        .filter((c) => !excludedIds.has(c.driverId))
        .map((c) => c.driverId);

      if (candidateIds.length === 0) continue;

      const eligibleDrivers = await this.prisma.driver.findMany({
        where: {
          id: { in: candidateIds },
          status: DriverStatus.ACTIVE,
          isOnline: true,
          locationAt: { gte: staleCutoff },
          OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
          wallet: { balance: { gte: cfg.minWalletBalance } },
          trips: {
            none: {
              status: { in: [TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS] },
            },
          },
          dispatchOffers: {
            none: {
              result: OfferResult.PENDING,
              expiresAt: { gt: now },
            },
          },
        },
        select: { id: true },
      });

      const eligibleSet = new Set(eligibleDrivers.map((d) => d.id));
      const found = geoCandidates.find((c) => !excludedIds.has(c.driverId) && eligibleSet.has(c.driverId));
      if (found) {
        chosen = found;
        matchedRingIndex = ringIdx + 1;
        matchedRadiusKm = ringRadius;
        break;
      }
    }

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
      dropoffLat: trip.dropoffLat,
      dropoffLng: trip.dropoffLng,
      distanceKm: trip.distanceKm,
      estimatedPrice: trip.estimatedPrice,
      isBookingForOther: trip.isBookingForOther,
      passengerName: trip.passengerName,
      passengerPhone: trip.passengerPhone,
      note: trip.note,
      distanceToPickupKm: offer.distanceToPickupKm,
      dispatchRing: matchedRingIndex,
      dispatchRadiusKm: matchedRadiusKm,
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

  async cancelPendingOffersForTrip(tripId: string) {
    const pendingOffers = await this.prisma.dispatchOffer.findMany({
      where: { tripId, result: OfferResult.PENDING },
    });
    for (const offer of pendingOffers) {
      this.clearOfferTimer(offer.id);
      this.realtime.emitToDriver(offer.driverId, 'trip:offer_cancelled', {
        offerId: offer.id,
        tripId,
      });
    }
    if (pendingOffers.length > 0) {
      await this.prisma.dispatchOffer.updateMany({
        where: { tripId, result: OfferResult.PENDING },
        data: { result: OfferResult.TIMEOUT, expiresAt: new Date() },
      });
    }
  }

  async handleOfferTimeout(offerId: string) {
    this.timers.delete(offerId);
    const offer = await this.prisma.dispatchOffer.findUnique({
      where: { id: offerId },
      include: { trip: { select: { status: true } } },
    });
    if (!offer || offer.result !== OfferResult.PENDING) return;

    if (offer.trip.status !== TripStatus.SEARCHING) {
      await this.prisma.dispatchOffer.update({
        where: { id: offer.id },
        data: { result: OfferResult.TIMEOUT },
      });
      return;
    }

    await this.rejectAndLockDriver(offer.id, offer.driverId, offer.tripId, OfferResult.TIMEOUT);
  }

  /**
   * Recovery sweep mỗi 15 giây: xử lý offer hết hạn và đơn kẹt SEARCHING không có offer
   */
  @Cron('*/15 * * * * *')
  async recoverExpiredOffers() {
    const now = new Date();
    const expired = await this.prisma.dispatchOffer.findMany({
      where: {
        result: OfferResult.PENDING,
        expiresAt: { lte: now },
      },
      select: { id: true },
      take: 20,
    });
    for (const o of expired) {
      await this.handleOfferTimeout(o.id).catch((err) =>
        this.logger.error(`Recover expired offer ${o.id} failed: ${err.message}`),
      );
    }

    const stuckTrips = await this.prisma.trip.findMany({
      where: {
        status: TripStatus.SEARCHING,
        orderedAt: { lte: new Date(now.getTime() - 20_000) },
        dispatchOffers: { none: { result: OfferResult.PENDING } },
      },
      select: { id: true },
      take: 10,
    });
    for (const t of stuckTrips) {
      await this.dispatchNextDriver(t.id).catch((err) =>
        this.logger.error(`Recover stuck trip ${t.id} failed: ${err.message}`),
      );
    }
  }

  /**
   * Tự động đưa tài xế mất tín hiệu GPS quá 20 phút về Ngoại tuyến (tránh tài xế "ma" làm chậm điều phối)
   */
  @Cron('0 */5 * * * *')
  async cleanupStaleOnlineDrivers() {
    const cutoff = new Date(Date.now() - 20 * 60 * 1000);
    const staleDrivers = await this.prisma.driver.findMany({
      where: {
        isOnline: true,
        OR: [{ locationAt: null }, { locationAt: { lt: cutoff } }],
        trips: {
          none: { status: { in: [TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS] } },
        },
      },
      select: { id: true },
    });
    if (staleDrivers.length === 0) return;
    const ids = staleDrivers.map((d) => d.id);
    await this.prisma.driver.updateMany({ where: { id: { in: ids } }, data: { isOnline: false } });
    for (const id of ids) {
      await this.redis.geoRemoveDriver(id);
    }
    this.logger.log(`Auto-offlined ${ids.length} stale driver(s) with no GPS heartbeat > 20m`);
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

    const updated = await this.prisma.dispatchOffer.updateMany({
      where: { id: offerId, result: OfferResult.PENDING },
      data: { result },
    });
    if (updated.count === 0) return;

    await this.prisma.$transaction([
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
      reason: result === 'TIMEOUT' ? 'Hết thời gian xác nhận đơn' : 'Từ chối đơn',
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
    const res = await this.prisma.trip.updateMany({
      where: { id: tripId, status: TripStatus.SEARCHING },
      data: { status: TripStatus.NO_DRIVER },
    });
    if (res.count === 0) return;

    const fullTrip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        driver: { select: { id: true, name: true, phone: true, avatarUrl: true, lat: true, lng: true } },
        media: true,
      },
    });
    if (fullTrip) {
      this.realtime.emitToCustomer(customerId, 'trip:status', fullTrip);
      this.realtime.emitToTrip(tripId, 'trip:status', fullTrip);
    }
    this.realtime.emitToAdmin('trip:no_driver', { tripId, tripCode, trip: fullTrip });
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
