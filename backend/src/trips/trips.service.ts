import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { MapService } from '../map/map.service';
import { PricingConfig, PricingService } from '../pricing/pricing.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../redis/redis.service';
import {
  DriverStatus,
  MediaStage,
  MediaType,
  OfferResult,
  TripStatus,
  UserType,
  WalletTxType,
} from '@prisma/client';

const TRIP_DETAIL_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true } },
  driver: { select: { id: true, name: true, phone: true, avatarUrl: true, lat: true, lng: true } },
  media: { orderBy: { takenAt: 'asc' as const } },
};

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapService: MapService,
    private readonly pricingService: PricingService,
    private readonly dispatchService: DispatchService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  private isValidCoord(lat?: number | null, lng?: number | null): boolean {
    if (lat == null || lng == null) return false;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
    if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) return false;
    return true;
  }

  private async resolveTripPricingConfig(trip: { pricingSnapshot?: any }): Promise<PricingConfig> {
    if (
      trip.pricingSnapshot &&
      typeof trip.pricingSnapshot === 'object' &&
      typeof trip.pricingSnapshot.dayBase === 'number' &&
      typeof trip.pricingSnapshot.nightBase === 'number'
    ) {
      return trip.pricingSnapshot as PricingConfig;
    }
    return this.pricingService.getPricingConfig();
  }

  async estimate(pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number) {
    if (!this.isValidCoord(pickupLat, pickupLng) || !this.isValidCoord(dropoffLat, dropoffLng)) {
      throw new BadRequestException('Tọa độ điểm đón hoặc điểm trả không hợp lệ');
    }
    const route = await this.mapService.getShortestCarRoute(
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
    );
    const config = await this.pricingService.getPricingConfig();
    const pricing = this.pricingService.calculatePrice(route.distanceKm, new Date(), config);
    return {
      ...pricing,
      durationMin: route.durationMin,
      routePolyline: route.routePolyline,
      routeSource: route.routeSource,
    };
  }

  async getActiveForCustomer(customerId: string) {
    return this.prisma.trip.findFirst({
      where: {
        customerId,
        status: {
          in: [
            TripStatus.SEARCHING,
            TripStatus.ACCEPTED,
            TripStatus.ARRIVED,
            TripStatus.IN_PROGRESS,
          ],
        },
      },
      include: TRIP_DETAIL_INCLUDE,
      orderBy: { orderedAt: 'desc' },
    });
  }

  async getActiveForDriver(driverId: string) {
    const [activeTrip, pendingOffer] = await Promise.all([
      this.prisma.trip.findFirst({
        where: {
          driverId,
          status: { in: [TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS] },
        },
        include: TRIP_DETAIL_INCLUDE,
        orderBy: { orderedAt: 'desc' },
      }),
      this.prisma.dispatchOffer.findFirst({
        where: {
          driverId,
          result: OfferResult.PENDING,
          expiresAt: { gt: new Date() },
          trip: { status: TripStatus.SEARCHING },
        },
        include: { trip: true },
        orderBy: { sentAt: 'desc' },
      }),
    ]);

    return {
      activeTrip,
      pendingOffer: pendingOffer
        ? {
            offerId: pendingOffer.id,
            tripId: pendingOffer.tripId,
            tripCode: pendingOffer.trip.code,
            pickupAddress: pendingOffer.trip.pickupAddress,
            pickupLat: pendingOffer.trip.pickupLat,
            pickupLng: pendingOffer.trip.pickupLng,
            dropoffAddress: pendingOffer.trip.dropoffAddress,
            dropoffLat: pendingOffer.trip.dropoffLat,
            dropoffLng: pendingOffer.trip.dropoffLng,
            distanceKm: pendingOffer.trip.distanceKm,
            estimatedPrice: pendingOffer.trip.estimatedPrice,
            isBookingForOther: pendingOffer.trip.isBookingForOther,
            passengerName: pendingOffer.trip.passengerName,
            passengerPhone: pendingOffer.trip.passengerPhone,
            note: pendingOffer.trip.note,
            distanceToPickupKm: pendingOffer.distanceToPickupKm,
            timeoutSec: Math.max(1, Math.ceil((pendingOffer.expiresAt.getTime() - Date.now()) / 1000)),
            expiresAt: pendingOffer.expiresAt.toISOString(),
          }
        : null,
    };
  }

  async getTripDetailForUser(tripId: string, role: 'CUSTOMER' | 'DRIVER' | 'ADMIN', userId: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: TRIP_DETAIL_INCLUDE,
    });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    if (role === 'CUSTOMER' && trip.customerId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xem chuyến đi này');
    }
    if (role === 'DRIVER' && trip.driverId !== userId) {
      throw new ForbiddenException('Bạn không có quyền xem chuyến đi này');
    }
    return trip;
  }

  async assertDriverCanUploadMedia(tripId: string, driverId: string) {
    return this.assertDriverTrip(tripId, driverId, [TripStatus.ARRIVED, TripStatus.IN_PROGRESS]);
  }

  async createTrip(params: {
    customerId: string;
    createdByAdminId?: string;
    pickupAddress: string;
    pickupLat: number;
    pickupLng: number;
    dropoffAddress?: string;
    dropoffLat?: number;
    dropoffLng?: number;
    isBookingForOther?: boolean;
    passengerName?: string;
    passengerPhone?: string;
    partnerCode?: string;
    note?: string;
  }) {
    if (!this.isValidCoord(params.pickupLat, params.pickupLng)) {
      throw new BadRequestException('Tọa độ điểm đón không hợp lệ');
    }
    if (
      (params.dropoffLat != null || params.dropoffLng != null) &&
      !this.isValidCoord(params.dropoffLat, params.dropoffLng)
    ) {
      throw new BadRequestException('Tọa độ điểm trả không hợp lệ');
    }

    const isBookingForOther = Boolean(params.isBookingForOther);
    const passengerName = params.passengerName?.trim() || null;
    const passengerPhone = params.passengerPhone?.trim() || null;
    if (isBookingForOther) {
      if (!passengerPhone || !/^[\d+\s.-]{8,16}$/.test(passengerPhone)) {
        throw new BadRequestException(
          'Khi đặt hộ cho người khác, vui lòng nhập số điện thoại liên hệ hợp lệ (8–15 chữ số)',
        );
      }
    }

    // Chặn khách đặt trùng chuyến khi đang có đơn hoạt động (chống double-tap)
    if (!params.createdByAdminId) {
      const existingActive = await this.prisma.trip.findFirst({
        where: {
          customerId: params.customerId,
          status: {
            in: [
              TripStatus.SEARCHING,
              TripStatus.ACCEPTED,
              TripStatus.ARRIVED,
              TripStatus.IN_PROGRESS,
            ],
          },
        },
        select: { code: true },
      });
      if (existingActive) {
        throw new BadRequestException(
          `Bạn đang có chuyến ${existingActive.code} chưa kết thúc. Vui lòng hoàn tất hoặc hủy trước khi đặt mới.`,
        );
      }
    }

    const now = new Date();
    const config = await this.pricingService.getPricingConfig();
    let distanceKm: number | null = null;
    let routePolyline: string | null = null;
    let routeSource: string | null = null;
    let estimatedPrice: number | null = null;
    let timeSlot = this.pricingService.resolveTimeSlot(now, config.dayStart, config.nightStart);

    if (params.dropoffLat != null && params.dropoffLng != null) {
      const route = await this.mapService.getShortestCarRoute(
        params.pickupLat,
        params.pickupLng,
        params.dropoffLat,
        params.dropoffLng,
      );
      const pricing = this.pricingService.calculatePrice(route.distanceKm, now, config);
      distanceKm = pricing.distanceKm;
      routePolyline = route.routePolyline;
      routeSource = route.routeSource;
      estimatedPrice = pricing.price;
      timeSlot = pricing.timeSlot;
    }

    let verifiedPartnerCode: string | null = null;
    if (params.partnerCode?.trim()) {
      const normalizedCode = params.partnerCode.trim().toUpperCase();
      if ((this.prisma as any).partner?.findUnique) {
        const partner = await this.prisma.partner.findUnique({ where: { code: normalizedCode } });
        if (!partner || !partner.isActive) {
          throw new BadRequestException(`Mã quán / đối tác "${normalizedCode}" không tồn tại hoặc đang tạm ngưng`);
        }
        verifiedPartnerCode = partner.code;
      } else {
        verifiedPartnerCode = normalizedCode;
      }
    }

    const code = `NOW-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const shareToken = crypto.randomBytes(8).toString('hex');
    const trip = await this.prisma.trip.create({
      data: {
        code,
        customerId: params.customerId,
        createdByAdminId: params.createdByAdminId,
        pickupAddress: params.pickupAddress,
        pickupLat: params.pickupLat,
        pickupLng: params.pickupLng,
        dropoffAddress: params.dropoffAddress,
        dropoffLat: params.dropoffLat,
        dropoffLng: params.dropoffLng,
        distanceKm,
        routePolyline,
        routeSource,
        pricingSnapshot: config as any,
        timeSlot,
        estimatedPrice,
        isBookingForOther,
        passengerName: isBookingForOther ? passengerName : null,
        passengerPhone: isBookingForOther ? passengerPhone : null,
        partnerCode: verifiedPartnerCode,
        shareToken,
        note: params.note,
        status: TripStatus.SEARCHING,
        orderedAt: now,
      },
      include: TRIP_DETAIL_INCLUDE,
    });

    this.realtime.emitToAdmin('trip:created', trip);
    this.dispatchService.dispatchNextDriver(trip.id).catch(() => undefined);
    return trip;
  }

  async redispatchTrip(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    if (trip.status !== TripStatus.NO_DRIVER) {
      throw new BadRequestException('Chỉ có thể điều phối lại đơn ở trạng thái NO_DRIVER');
    }

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: { status: TripStatus.SEARCHING },
      include: TRIP_DETAIL_INCLUDE,
    });
    this.realtime.emitToCustomer(updated.customerId, 'trip:status', updated);
    this.dispatchService.dispatchNextDriver(trip.id).catch(() => undefined);
    return updated;
  }

  async assignDriverManually(tripId: string, driverId: string, adminId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    if (trip.status !== TripStatus.NO_DRIVER && trip.status !== TripStatus.SEARCHING) {
      throw new BadRequestException('Chỉ gán tài xế thủ công cho đơn đang tìm hoặc chưa có tài xế');
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
      include: { wallet: true },
    });
    if (!driver || driver.status !== DriverStatus.ACTIVE) {
      throw new BadRequestException('Tài xế không tồn tại hoặc chưa ở trạng thái Hoạt động');
    }

    const busyTrip = await this.prisma.trip.findFirst({
      where: {
        driverId,
        status: { in: [TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS] },
      },
      select: { code: true },
    });
    if (busyTrip) {
      throw new BadRequestException(`Tài xế đang thực hiện chuyến ${busyTrip.code}`);
    }

    await this.dispatchService.cancelPendingOffersForTrip(trip.id);

    const updated = await this.prisma.$transaction(async (tx) => {
      const claim = await tx.trip.updateMany({
        where: { id: trip.id, status: { in: [TripStatus.NO_DRIVER, TripStatus.SEARCHING] } },
        data: { driverId, status: TripStatus.ACCEPTED, acceptedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Trạng thái chuyến đã thay đổi, không thể gán');
      }
      await tx.auditLog.create({
        data: {
          adminId,
          action: 'ASSIGN_DRIVER_MANUAL',
          before: { tripId: trip.id, status: trip.status, driverId: trip.driverId },
          after: { tripId: trip.id, status: TripStatus.ACCEPTED, driverId },
        },
      });
      return tx.trip.findUnique({ where: { id: trip.id }, include: TRIP_DETAIL_INCLUDE });
    });

    if (updated) {
      this.realtime.emitToCustomer(updated.customerId, 'trip:status', updated);
      this.realtime.emitToDriver(driverId, 'trip:assigned', updated);
      this.realtime.emitToDriver(driverId, 'trip:status', updated);
      this.realtime.emitToTrip(updated.id, 'trip:status', updated);
      this.realtime.emitToAdmin('trip:updated', updated);
      await Promise.all([
        this.notifications.sendToUser(
          UserType.CUSTOMER,
          updated.customerId,
          'Tổng đài đã điều phối tài xế',
          `Tài xế ${driver.name || driver.phone} đang di chuyển đến điểm đón.`,
          { tripId: updated.id },
        ),
        this.notifications.sendToUser(
          UserType.DRIVER,
          driverId,
          'Tổng đài gán chuyến mới',
          `Chuyến ${updated.code} · Đón tại: ${updated.pickupAddress}`,
          { tripId: updated.id },
        ),
      ]);
    }
    return updated;
  }

  async acceptOffer(offerId: string, driverId: string) {
    const offer = await this.prisma.dispatchOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.driverId !== driverId) {
      throw new NotFoundException('Không tìm thấy lượt gửi đơn');
    }
    if (offer.result !== OfferResult.PENDING || offer.expiresAt < new Date()) {
      throw new BadRequestException('Đơn đã hết hạn hoặc đã xử lý');
    }

    this.dispatchService.clearOfferTimer(offerId);

    const minSetting = await this.prisma.setting.findUnique({ where: { key: 'min_wallet_balance' } });
    const minWalletBalance = parseInt(minSetting?.value ?? '100000', 10);

    const updatedTrip = await this.prisma.$transaction(async (tx) => {
      const driver = await tx.driver.findUnique({
        where: { id: driverId },
        include: { wallet: true },
      });
      if (!driver || driver.status !== DriverStatus.ACTIVE) {
        throw new BadRequestException('Tài khoản tài xế không ở trạng thái hoạt động');
      }
      if (driver.lockedUntil && driver.lockedUntil > new Date()) {
        throw new BadRequestException('Bạn đang trong thời gian bị khóa nhận đơn');
      }
      if ((driver.wallet?.balance ?? 0) < minWalletBalance) {
        throw new BadRequestException(
          `Số dư ví tối thiểu phải từ ${minWalletBalance.toLocaleString('vi-VN')}đ để nhận đơn`,
        );
      }
      const ongoing = await tx.trip.findFirst({
        where: {
          driverId,
          status: { in: [TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS] },
        },
        select: { code: true },
      });
      if (ongoing) {
        throw new BadRequestException(`Bạn đang phụ trách chuyến ${ongoing.code}`);
      }

      const claim = await tx.trip.updateMany({
        where: { id: offer.tripId, status: TripStatus.SEARCHING },
        data: {
          driverId,
          status: TripStatus.ACCEPTED,
          acceptedAt: new Date(),
        },
      });
      if (claim.count === 0) {
        throw new BadRequestException('Đơn đã có tài xế khác nhận hoặc đã hủy');
      }
      await tx.dispatchOffer.update({
        where: { id: offerId },
        data: { result: OfferResult.ACCEPTED },
      });
      return tx.trip.findUnique({
        where: { id: offer.tripId },
        include: TRIP_DETAIL_INCLUDE,
      });
    });

    if (updatedTrip) {
      this.realtime.emitToCustomer(updatedTrip.customerId, 'trip:status', updatedTrip);
      this.realtime.emitToTrip(updatedTrip.id, 'trip:status', updatedTrip);
      this.realtime.emitToAdmin('trip:updated', updatedTrip);
      await this.notifications.sendToUser(
        UserType.CUSTOMER,
        updatedTrip.customerId,
        'Tài xế đã nhận đơn',
        `Tài xế ${updatedTrip.driver?.name ?? ''} đang di chuyển đến điểm đón.`,
        { tripId: updatedTrip.id },
      );
    }
    return updatedTrip;
  }

  async rejectOffer(offerId: string, driverId: string) {
    const offer = await this.prisma.dispatchOffer.findUnique({ where: { id: offerId } });
    if (!offer || offer.driverId !== driverId || offer.result !== OfferResult.PENDING) {
      throw new BadRequestException('Lượt gửi đơn không hợp lệ');
    }
    await this.dispatchService.rejectAndLockDriver(offer.id, driverId, offer.tripId, OfferResult.REJECTED);
    return { message: 'Đã từ chối đơn' };
  }

  async markArrived(tripId: string, driverId: string) {
    const trip = await this.assertDriverTrip(tripId, driverId, [TripStatus.ACCEPTED]);
    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: { status: TripStatus.ARRIVED, arrivedAt: new Date() },
      include: TRIP_DETAIL_INCLUDE,
    });
    this.notifyStatusChange(updated, 'Tài xế đã đến điểm đón', 'Vui lòng ra bàn giao xe cho tài xế.');
    return updated;
  }

  async addMedia(
    tripId: string,
    driverId: string,
    dto: {
      type: MediaType;
      stage: MediaStage;
      isPlatePhoto?: boolean;
      url: string;
      size?: number;
      durationSec?: number;
      lat?: number;
      lng?: number;
    },
  ) {
    const trip = await this.assertDriverTrip(tripId, driverId, [
      TripStatus.ARRIVED,
      TripStatus.IN_PROGRESS,
    ]);

    if (dto.stage === MediaStage.PICKUP && trip.status !== TripStatus.ARRIVED) {
      throw new BadRequestException('Chỉ tải ảnh/video nhận xe khi đang ở bước kiểm tra nhận xe');
    }
    if (dto.stage === MediaStage.DROPOFF && trip.status !== TripStatus.IN_PROGRESS) {
      throw new BadRequestException('Chỉ tải ảnh bàn giao xe khi chuyến đang chạy');
    }

    if (dto.stage === MediaStage.PICKUP) {
      const existing = await this.prisma.tripMedia.findMany({
        where: { tripId: trip.id, stage: MediaStage.PICKUP },
      });
      const imagesCount = existing.filter((m) => m.type === MediaType.IMAGE).length;
      const videosCount = existing.filter((m) => m.type === MediaType.VIDEO).length;
      if (dto.type === MediaType.IMAGE && imagesCount >= 5) {
        throw new BadRequestException('Tối đa 05 ảnh khi nhận xe');
      }
      if (dto.type === MediaType.VIDEO && videosCount >= 2) {
        throw new BadRequestException('Tối đa 02 video khi nhận xe');
      }
      if (dto.type === MediaType.VIDEO && (dto.durationSec ?? 0) > 60) {
        throw new BadRequestException('Video không được vượt quá 60 giây');
      }
    }

    const media = await this.prisma.tripMedia.create({
      data: {
        tripId: trip.id,
        type: dto.type,
        stage: dto.stage,
        isPlatePhoto: Boolean(dto.isPlatePhoto),
        url: dto.url,
        size: dto.size,
        durationSec: dto.durationSec,
        lat: dto.lat,
        lng: dto.lng,
      },
    });

    const refreshed = await this.prisma.trip.findUnique({
      where: { id: trip.id },
      include: TRIP_DETAIL_INCLUDE,
    });
    if (refreshed) {
      this.realtime.emitToCustomer(refreshed.customerId, 'trip:status', refreshed);
      this.realtime.emitToTrip(refreshed.id, 'trip:status', refreshed);
    }

    return media;
  }

  async deleteMedia(tripId: string, driverId: string, mediaId: string) {
    const trip = await this.assertDriverTrip(tripId, driverId, [
      TripStatus.ARRIVED,
      TripStatus.IN_PROGRESS,
    ]);
    const media = await this.prisma.tripMedia.findUnique({ where: { id: mediaId } });
    if (!media || media.tripId !== trip.id) {
      throw new NotFoundException('Không tìm thấy tệp ảnh/video');
    }
    if (media.stage === MediaStage.PICKUP && trip.status !== TripStatus.ARRIVED) {
      throw new BadRequestException('Không thể xóa ảnh/video nhận xe sau khi chuyến đã bắt đầu');
    }
    await this.prisma.tripMedia.delete({ where: { id: mediaId } });

    const refreshed = await this.prisma.trip.findUnique({
      where: { id: trip.id },
      include: TRIP_DETAIL_INCLUDE,
    });
    if (refreshed) {
      this.realtime.emitToCustomer(refreshed.customerId, 'trip:status', refreshed);
      this.realtime.emitToTrip(refreshed.id, 'trip:status', refreshed);
    }
    return { ok: true, trip: refreshed };
  }

  async startTrip(tripId: string, driverId: string) {
    const trip = await this.assertDriverTrip(tripId, driverId, [TripStatus.ARRIVED]);
    const media = await this.prisma.tripMedia.findMany({
      where: { tripId: trip.id, stage: MediaStage.PICKUP },
    });
    const hasPlatePhoto = media.some((m) => m.type === MediaType.IMAGE && m.isPlatePhoto);
    const hasVideo = media.some((m) => m.type === MediaType.VIDEO);

    if (!hasPlatePhoto || !hasVideo) {
      throw new BadRequestException(
        'Cần tải lên tối thiểu 01 ảnh xe kèm biển số và 01 video quay quanh xe trước khi bắt đầu chuyến',
      );
    }

    // Khởi tạo điểm đầu của tuyến đường đi thực tế (từ tọa độ điểm đón)
    const startPoint =
      trip.pickupLat != null && trip.pickupLng != null
        ? `${trip.pickupLat.toFixed(6)},${trip.pickupLng.toFixed(6)}`
        : null;
    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        status: TripStatus.IN_PROGRESS,
        startedAt: new Date(),
        ...(startPoint ? { actualRoutePolyline: trip.actualRoutePolyline || startPoint } : {}),
      },
      include: TRIP_DETAIL_INCLUDE,
    });
    this.notifyStatusChange(updated, 'Chuyến đi đã bắt đầu', 'Tài xế đã nhận xe và bắt đầu di chuyển.');
    return updated;
  }

  async updateDropoff(
    tripId: string,
    actorRole: 'CUSTOMER' | 'DRIVER' | 'ADMIN',
    actorId: string,
    dropoffAddress: string,
    dropoffLat: number,
    dropoffLng: number,
  ) {
    if (!this.isValidCoord(dropoffLat, dropoffLng)) {
      throw new BadRequestException('Tọa độ điểm trả mới không hợp lệ');
    }
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    if (actorRole === 'CUSTOMER' && trip.customerId !== actorId) {
      throw new ForbiddenException('Bạn không có quyền cập nhật chuyến này');
    }
    if (actorRole === 'DRIVER' && trip.driverId !== actorId) {
      throw new ForbiddenException('Bạn không phụ trách chuyến này');
    }
    if (trip.status === TripStatus.COMPLETED || trip.status === TripStatus.CANCELLED) {
      throw new BadRequestException('Không thể đổi điểm trả cho chuyến đã kết thúc');
    }

    const route = await this.mapService.getShortestCarRoute(
      trip.pickupLat,
      trip.pickupLng,
      dropoffLat,
      dropoffLng,
    );
    // Dùng bảng giá đóng băng tại thời điểm đặt đơn (Điều 2.3 Hợp đồng)
    const config = await this.resolveTripPricingConfig(trip);
    const pricing = this.pricingService.calculatePrice(route.distanceKm, trip.orderedAt, config);

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        dropoffAddress,
        dropoffLat,
        dropoffLng,
        distanceKm: pricing.distanceKm,
        routePolyline: route.routePolyline,
        routeSource: route.routeSource,
        estimatedPrice: pricing.price,
      },
      include: TRIP_DETAIL_INCLUDE,
    });
    this.realtime.emitToTrip(trip.id, 'trip:dropoff_updated', updated);
    this.realtime.emitToCustomer(trip.customerId, 'trip:status', updated);
    this.realtime.emitToAdmin('trip:updated', updated);
    if (trip.driverId) {
      this.realtime.emitToDriver(trip.driverId, 'trip:status', updated);
      if (actorRole !== 'DRIVER') {
        await this.notifications.sendToUser(
          UserType.DRIVER,
          trip.driverId,
          'Khách đổi điểm trả',
          `Điểm trả mới: ${dropoffAddress} (${pricing.distanceKm} km · ${pricing.price.toLocaleString('vi-VN')}đ)`,
          { tripId: trip.id },
        );
      }
    }
    if (actorRole === 'DRIVER') {
      await this.notifications.sendToUser(
        UserType.CUSTOMER,
        trip.customerId,
        'Đã cập nhật điểm trả',
        `Điểm trả: ${dropoffAddress} (${pricing.distanceKm} km · ${pricing.price.toLocaleString('vi-VN')}đ)`,
        { tripId: trip.id },
      );
    }
    return updated;
  }

  async completeTrip(tripId: string, driverId: string, actualDropoffLat?: number, actualDropoffLng?: number) {
    const trip = await this.assertDriverTrip(tripId, driverId, [TripStatus.IN_PROGRESS]);
    const dropoffMedia = await this.prisma.tripMedia.count({
      where: { tripId: trip.id, stage: MediaStage.DROPOFF, type: MediaType.IMAGE },
    });
    if (dropoffMedia < 1) {
      throw new BadRequestException('Cần chụp tối thiểu 01 ảnh xác nhận bàn giao xe tại điểm trả');
    }

    const config = await this.resolveTripPricingConfig(trip);
    let rawDistance: number;
    let routePolyline = trip.routePolyline;
    let routeSource = trip.routeSource;
    let dropoffLat = trip.dropoffLat;
    let dropoffLng = trip.dropoffLng;
    let dropoffAddress = trip.dropoffAddress;

    if (trip.dropoffLat != null && trip.dropoffLng != null && trip.distanceKm != null) {
      // Giữ nguyên quãng đường đã đo bằng bản đồ khi điểm trả không đổi (tránh lệch giá do mạng/OSRM thay đổi)
      rawDistance = trip.distanceKm;
    } else if (trip.dropoffLat != null && trip.dropoffLng != null) {
      const route = await this.mapService.getShortestCarRoute(
        trip.pickupLat,
        trip.pickupLng,
        trip.dropoffLat,
        trip.dropoffLng,
      );
      rawDistance = route.distanceKm;
      routePolyline = route.routePolyline;
      routeSource = route.routeSource;
    } else if (this.isValidCoord(actualDropoffLat, actualDropoffLng)) {
      dropoffLat = actualDropoffLat!;
      dropoffLng = actualDropoffLng!;
      const [route, rev] = await Promise.all([
        this.mapService.getShortestCarRoute(
          trip.pickupLat,
          trip.pickupLng,
          dropoffLat,
          dropoffLng,
        ),
        this.mapService.reverseGeocode(dropoffLat, dropoffLng),
      ]);
      rawDistance = route.distanceKm;
      routePolyline = route.routePolyline;
      routeSource = route.routeSource;
      dropoffAddress = dropoffAddress || rev.address;
    } else {
      throw new BadRequestException(
        'Chuyến chưa có điểm trả. Vui lòng bật GPS hoặc chọn điểm trả trước khi hoàn thành chuyến.',
      );
    }

    const pricing = this.pricingService.calculatePrice(rawDistance, trip.orderedAt, config);
    const minSetting = await this.prisma.setting.findUnique({ where: { key: 'min_wallet_balance' } });
    const minWalletBalance = parseInt(minSetting?.value ?? '100000', 10);

    let partnerCommission: number | null = null;
    if (trip.partnerCode && (this.prisma as any).partner?.findUnique) {
      const partner = await this.prisma.partner.findUnique({ where: { code: trip.partnerCode } });
      if (partner && partner.isActive) {
        partnerCommission = partner.commissionPerTrip;
      }
    }

    // Giao dịch nguyên tử khóa hàng (FOR UPDATE) chống trừ chiết khấu trùng & chống Lost Update ví
    const result = await this.prisma.$transaction(async (tx) => {
      if (typeof (tx as any).$queryRaw === 'function') {
        const lockedTrips = await (tx as any).$queryRaw<Array<{ id: string; status: string; driver_id: string }>>`
          SELECT id, status::text, driver_id FROM trips WHERE id = ${trip.id} FOR UPDATE
        `;
        const row = lockedTrips?.[0];
        if (!row || row.driver_id !== driverId || row.status !== TripStatus.IN_PROGRESS) {
          throw new BadRequestException('Chuyến đã được hoàn thành hoặc trạng thái không hợp lệ');
        }
      }

      if ((tx as any).walletTransaction?.findFirst) {
        const existingCommission = await tx.walletTransaction.findFirst({
          where: { tripId: trip.id, type: WalletTxType.COMMISSION },
          select: { id: true },
        });
        if (existingCommission) {
          throw new BadRequestException('Chiết khấu cho chuyến đi này đã được khấu trừ trước đó');
        }
      }

      const updatedTrip = await tx.trip.update({
        where: { id: trip.id },
        data: {
          dropoffAddress,
          dropoffLat,
          dropoffLng,
          distanceKm: pricing.distanceKm,
          routePolyline,
          routeSource,
          finalPrice: pricing.price,
          commissionAmount: pricing.commissionAmount,
          ...(partnerCommission != null ? { partnerCommission } : {}),
          status: TripStatus.COMPLETED,
          completedAt: new Date(),
        },
        include: TRIP_DETAIL_INCLUDE,
      });

      let walletId: string;
      let currentBalance: number;
      if (typeof (tx as any).$queryRaw === 'function') {
        const lockedWallets = await (tx as any).$queryRaw<Array<{ id: string; balance: number }>>`
          SELECT id, balance FROM wallets WHERE driver_id = ${driverId} FOR UPDATE
        `;
        if (!lockedWallets?.[0]) throw new NotFoundException('Không tìm thấy ví tài xế');
        walletId = lockedWallets[0].id;
        currentBalance = Number(lockedWallets[0].balance);
      } else {
        const wallet = await tx.wallet.findUnique({ where: { driverId } });
        if (!wallet) throw new NotFoundException('Không tìm thấy ví tài xế');
        walletId = wallet.id;
        currentBalance = wallet.balance;
      }

      const newBalance = currentBalance - pricing.commissionAmount;
      await tx.wallet.update({
        where: { id: walletId },
        data: { balance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          walletId,
          type: WalletTxType.COMMISSION,
          amount: -pricing.commissionAmount,
          balanceAfter: newBalance,
          tripId: trip.id,
          note: `Chiết khấu chuyến ${trip.code} (${pricing.distanceKm} km, ${pricing.timeSlot === 'DAY' ? 'Ngày' : 'Đêm'})`,
        },
      });

      const lowBalance = newBalance < minWalletBalance;
      if (lowBalance) {
        await tx.driver.update({
          where: { id: driverId },
          data: { isOnline: false },
        });
      }

      return { updatedTrip, newBalance, lowBalance };
    });

    if (result.lowBalance) {
      await this.redis.geoRemoveDriver(driverId);
      this.realtime.emitToDriver(driverId, 'driver:wallet_low', {
        balance: result.newBalance,
        minWalletBalance,
      });
      await this.notifications.sendToUser(
        UserType.DRIVER,
        driverId,
        'Số dư ví dưới mức tối thiểu',
        `Số dư hiện tại ${result.newBalance.toLocaleString('vi-VN')}đ (< ${minWalletBalance.toLocaleString('vi-VN')}đ). Bạn đã tạm ngừng nhận đơn mới, vui lòng nạp thêm tiền vào ví.`,
      );
    }

    this.notifyStatusChange(
      result.updatedTrip,
      'Chuyến đi đã hoàn thành',
      `Tổng tiền thanh toán: ${pricing.price.toLocaleString('vi-VN')}đ (${pricing.distanceKm} km)`,
    );

    await this.notifications.sendToUser(
      UserType.DRIVER,
      driverId,
      'Đã trừ chiết khấu chuyến',
      `Chuyến ${trip.code}: thu khách ${pricing.price.toLocaleString('vi-VN')}đ · chiết khấu -${pricing.commissionAmount.toLocaleString('vi-VN')}đ · số dư ví: ${result.newBalance.toLocaleString('vi-VN')}đ`,
    );

    return {
      ...result.updatedTrip,
      pricingBreakdown: pricing,
      driverNewBalance: result.newBalance,
      walletLowWarning: result.lowBalance,
    };
  }

  async cancelTrip(tripId: string, actorRole: 'CUSTOMER' | 'ADMIN', actorId: string, reason?: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến');

    if (actorRole === 'CUSTOMER') {
      if (trip.customerId !== actorId) throw new ForbiddenException();
      if (
        trip.status === TripStatus.IN_PROGRESS ||
        trip.status === TripStatus.COMPLETED ||
        trip.status === TripStatus.CANCELLED
      ) {
        throw new BadRequestException('Khách hàng chỉ có thể hủy trước khi tài xế nhận xe');
      }
    } else {
      if (trip.status === TripStatus.COMPLETED || trip.status === TripStatus.CANCELLED) {
        throw new BadRequestException('Chuyến đã kết thúc');
      }
    }

    await this.dispatchService.cancelPendingOffersForTrip(trip.id);

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        status: TripStatus.CANCELLED,
        cancelledBy: actorRole,
        cancelReason: reason ?? null,
      },
      include: TRIP_DETAIL_INCLUDE,
    });

    this.realtime.emitToCustomer(updated.customerId, 'trip:status', updated);
    this.realtime.emitToTrip(trip.id, 'trip:status', updated);
    this.realtime.emitToAdmin('trip:updated', updated);

    const suspiciousCancel =
      trip.status === TripStatus.ARRIVED ||
      (trip.status === TripStatus.ACCEPTED &&
        trip.acceptedAt != null &&
        Date.now() - trip.acceptedAt.getTime() > 3 * 60 * 1000);
    if (suspiciousCancel && actorRole === 'CUSTOMER') {
      this.realtime.emitToAdmin('trip:suspicious_cancel', {
        tripId: updated.id,
        tripCode: updated.code,
        statusBefore: trip.status,
        reason: reason ?? null,
      });
    }

    if (trip.driverId) {
      this.realtime.emitToDriver(trip.driverId, 'trip:status', updated);
      await this.notifications.sendToUser(
        UserType.DRIVER,
        trip.driverId,
        'Chuyến đã bị hủy',
        `Chuyến ${trip.code} đã hủy bởi ${actorRole === 'CUSTOMER' ? 'khách hàng' : 'Admin'}${reason ? `: ${reason}` : ''}.`,
      );
    }
    return updated;
  }

  async getSharedTrip(shareToken: string) {
    const trip = await this.prisma.trip.findUnique({
      where: { shareToken },
      select: {
        id: true,
        code: true,
        status: true,
        pickupAddress: true,
        pickupLat: true,
        pickupLng: true,
        dropoffAddress: true,
        dropoffLat: true,
        dropoffLng: true,
        distanceKm: true,
        routePolyline: true,
        actualRoutePolyline: true,
        orderedAt: true,
        startedAt: true,
        completedAt: true,
        driver: { select: { name: true, phone: true, lat: true, lng: true } },
      },
    });
    if (!trip) throw new NotFoundException('Không tìm thấy liên kết chia sẻ hành trình');
    return trip;
  }

  async triggerSos(
    tripId: string,
    role: 'CUSTOMER' | 'DRIVER',
    userId: string,
    lat?: number,
    lng?: number,
    note?: string,
  ) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: TRIP_DETAIL_INCLUDE,
    });
    if (!trip) throw new NotFoundException('Không tìm thấy chuyến đi');
    if (role === 'CUSTOMER' && trip.customerId !== userId) throw new ForbiddenException();
    if (role === 'DRIVER' && trip.driverId !== userId) throw new ForbiddenException();

    const reporterName = role === 'CUSTOMER' ? trip.customer?.name : trip.driver?.name;
    const reporterPhone = role === 'CUSTOMER' ? trip.customer?.phone : trip.driver?.phone;
    const resolvedLat = this.isValidCoord(lat, lng) ? lat : trip.driver?.lat ?? trip.pickupLat;
    const resolvedLng = this.isValidCoord(lat, lng) ? lng : trip.driver?.lng ?? trip.pickupLng;

    const alert = await this.prisma.sosAlert.create({
      data: {
        tripId: trip.id,
        reporterRole: role,
        reporterId: userId,
        reporterName: reporterName || null,
        reporterPhone: reporterPhone || null,
        lat: resolvedLat,
        lng: resolvedLng,
        note: note?.trim() || 'Yêu cầu hỗ trợ khẩn cấp SOS',
        status: 'OPEN',
      },
      include: {
        trip: { select: { id: true, code: true, pickupAddress: true, dropoffAddress: true, status: true } },
      },
    });

    const hotlineRow = await this.prisma.setting.findUnique({ where: { key: 'hotline' } });
    const hotline = hotlineRow?.value || '0973521456';

    this.realtime.emitToAdmin('sos:alert', alert);
    return { alert, hotline, emergencyNumber: '113' };
  }

  private async assertDriverTrip(tripId: string, driverId: string, allowedStatuses: TripStatus[]) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.driverId !== driverId) {
      throw new ForbiddenException('Bạn không phụ trách chuyến này');
    }
    if (!allowedStatuses.includes(trip.status)) {
      throw new BadRequestException(`Trạng thái chuyến (${trip.status}) không hợp lệ cho thao tác này`);
    }
    return trip;
  }

  private notifyStatusChange(trip: any, title: string, body: string) {
    this.realtime.emitToCustomer(trip.customerId, 'trip:status', trip);
    if (trip.driverId) this.realtime.emitToDriver(trip.driverId, 'trip:status', trip);
    this.realtime.emitToTrip(trip.id, 'trip:status', trip);
    this.realtime.emitToAdmin('trip:updated', trip);
    this.notifications.sendToUser(UserType.CUSTOMER, trip.customerId, title, body, {
      tripId: trip.id,
      status: trip.status,
    });
  }
}
