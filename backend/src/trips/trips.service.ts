import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MapService } from '../map/map.service';
import { PricingService } from '../pricing/pricing.service';
import { DispatchService } from '../dispatch/dispatch.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import {
  MediaStage,
  MediaType,
  OfferResult,
  TripStatus,
  UserType,
  WalletTxType,
} from '@prisma/client';

@Injectable()
export class TripsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mapService: MapService,
    private readonly pricingService: PricingService,
    private readonly dispatchService: DispatchService,
    private readonly realtime: RealtimeGateway,
    private readonly notifications: NotificationsService,
  ) {}

  async estimate(pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number) {
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
    };
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
    note?: string;
  }) {
    const now = new Date();
    const config = await this.pricingService.getPricingConfig();
    let distanceKm: number | null = null;
    let routePolyline: string | null = null;
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
      estimatedPrice = pricing.price;
      timeSlot = pricing.timeSlot;
    }

    const code = `LXH-${Date.now().toString().slice(-6)}`;
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
        timeSlot,
        estimatedPrice,
        note: params.note,
        status: TripStatus.SEARCHING,
        orderedAt: now,
      },
    });

    // Bắt đầu điều phối bất đồng bộ
    this.dispatchService.dispatchNextDriver(trip.id).catch(() => undefined);
    return trip;
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

    const updatedTrip = await this.prisma.$transaction(async (tx) => {
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
        include: {
          driver: { select: { id: true, name: true, phone: true, avatarUrl: true, lat: true, lng: true } },
        },
      });
    });

    if (updatedTrip) {
      this.realtime.emitToCustomer(updatedTrip.customerId, 'trip:status', updatedTrip);
      this.realtime.emitToTrip(updatedTrip.id, 'trip:status', updatedTrip);
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

    return this.prisma.tripMedia.create({
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

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: { status: TripStatus.IN_PROGRESS, startedAt: new Date() },
    });
    this.notifyStatusChange(updated, 'Chuyến đi đã bắt đầu', 'Tài xế đã nhận xe và bắt đầu di chuyển.');
    return updated;
  }

  async updateDropoff(
    tripId: string,
    customerId: string,
    dropoffAddress: string,
    dropoffLat: number,
    dropoffLng: number,
  ) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip || trip.customerId !== customerId) {
      throw new NotFoundException('Không tìm thấy chuyến đi');
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
    const config = await this.pricingService.getPricingConfig();
    const pricing = this.pricingService.calculatePrice(route.distanceKm, trip.orderedAt, config);

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        dropoffAddress,
        dropoffLat,
        dropoffLng,
        distanceKm: pricing.distanceKm,
        routePolyline: route.routePolyline,
        estimatedPrice: pricing.price,
      },
    });
    this.realtime.emitToTrip(trip.id, 'trip:dropoff_updated', updated);
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

    const config = await this.pricingService.getPricingConfig();
    let finalDistance = trip.distanceKm ?? 0;

    if (trip.dropoffLat != null && trip.dropoffLng != null) {
      const route = await this.mapService.getShortestCarRoute(
        trip.pickupLat,
        trip.pickupLng,
        trip.dropoffLat,
        trip.dropoffLng,
      );
      finalDistance = route.distanceKm;
    } else if (actualDropoffLat != null && actualDropoffLng != null) {
      const route = await this.mapService.getShortestCarRoute(
        trip.pickupLat,
        trip.pickupLng,
        actualDropoffLat,
        actualDropoffLng,
      );
      finalDistance = route.distanceKm;
    }

    const pricing = this.pricingService.calculatePrice(finalDistance, trip.orderedAt, config);

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedTrip = await tx.trip.update({
        where: { id: trip.id },
        data: {
          distanceKm: pricing.distanceKm,
          finalPrice: pricing.price,
          commissionAmount: pricing.commissionAmount,
          status: TripStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      const wallet = await tx.wallet.findUnique({ where: { driverId } });
      if (!wallet) throw new NotFoundException('Không tìm thấy ví tài xế');

      const newBalance = wallet.balance - pricing.commissionAmount;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: WalletTxType.COMMISSION,
          amount: -pricing.commissionAmount,
          balanceAfter: newBalance,
          tripId: trip.id,
          note: `Chiết khấu chuyến ${trip.code}`,
        },
      });

      return { updatedTrip, newBalance };
    });

    this.notifyStatusChange(
      result.updatedTrip,
      'Chuyến đi đã hoàn thành',
      `Tổng tiền thanh toán: ${pricing.price.toLocaleString('vi-VN')}đ`,
    );

    await this.notifications.sendToUser(
      UserType.DRIVER,
      driverId,
      'Đã trừ chiết khấu chuyến',
      `Chuyến ${trip.code}: trừ ${pricing.commissionAmount.toLocaleString('vi-VN')}đ. Số dư ví: ${result.newBalance.toLocaleString('vi-VN')}đ`,
    );

    return result.updatedTrip;
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

    const updated = await this.prisma.trip.update({
      where: { id: trip.id },
      data: {
        status: TripStatus.CANCELLED,
        cancelledBy: actorRole,
        cancelReason: reason ?? null,
      },
    });

    this.realtime.emitToTrip(trip.id, 'trip:status', updated);
    if (trip.driverId) {
      this.realtime.emitToDriver(trip.driverId, 'trip:status', updated);
      await this.notifications.sendToUser(
        UserType.DRIVER,
        trip.driverId,
        'Chuyến đã bị hủy',
        `Chuyến ${trip.code} đã hủy bởi ${actorRole === 'CUSTOMER' ? 'khách hàng' : 'Admin'}.`,
      );
    }
    return updated;
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
    this.realtime.emitToTrip(trip.id, 'trip:status', trip);
    this.notifications.sendToUser(UserType.CUSTOMER, trip.customerId, title, body, {
      tripId: trip.id,
      status: trip.status,
    });
  }
}
