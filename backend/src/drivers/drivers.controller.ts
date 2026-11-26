import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import * as crypto from 'crypto';
import { DriverStatus, TripStatus } from '@prisma/client';
import { Auth } from '../auth/auth.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StorageService } from '../storage/storage.service';

class UpdateProfileDto {
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) idCardUrls?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) licenseUrls?: string[];
}

class UpdateLocationDto {
  @IsNumber() lat: number;
  @IsNumber() lng: number;
}

class ToggleOnlineDto {
  @IsBoolean() isOnline: boolean;
}

class PresignDocDto {
  @IsOptional() @IsString() ext?: string;
  @IsOptional() @IsString() contentType?: string;
}

class CreatePaymentQrDto {
  @IsString() @IsNotEmpty() purpose: 'WALLET_TOPUP' | 'MAINTENANCE_FEE';
  @IsOptional() @IsInt() amount?: number;
  @IsOptional() @IsString() period?: string;
}

class SubmitPaymentProofDto {
  @IsString() @IsNotEmpty() proofImageUrl: string;
}

@Auth('DRIVER')
@Controller('driver')
export class DriversController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly realtime: RealtimeGateway,
    private readonly storage: StorageService,
  ) {}

  @Get('me')
  async getMe(@Req() req: any) {
    const [driver, settings] = await Promise.all([
      this.prisma.driver.findUnique({
        where: { id: req.user.sub },
        include: {
          wallet: true,
          maintenanceFees: { orderBy: { dueDate: 'desc' }, take: 6 },
          driverLocks: { orderBy: { lockedFrom: 'desc' }, take: 5 },
        },
      }),
      this.prisma.setting.findMany({
        where: {
          key: {
            in: [
              'min_wallet_balance',
              'maintenance_fee',
              'bank_info',
              'bank_code',
              'bank_name',
              'bank_account',
              'bank_owner',
              'hotline',
              'radius_km',
              'radius_steps_km',
            ],
          },
        },
      }),
    ]);
    const cfg = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return {
      ...driver,
      config: {
        minWalletBalance: parseInt(cfg.min_wallet_balance ?? '100000', 10),
        maintenanceFee: parseInt(cfg.maintenance_fee ?? '200000', 10),
        bankInfo: cfg.bank_info ?? 'Ngân hàng: MB Bank | STK: 0973521456 | Chủ TK: NGUYEN VAN TUAN',
        bankCode: cfg.bank_code ?? 'MB',
        bankName: cfg.bank_name ?? 'MB Bank',
        bankAccount: cfg.bank_account ?? '0973521456',
        bankOwner: cfg.bank_owner ?? 'NGUYEN VAN TUAN',
        hotline: cfg.hotline ?? '0973521456',
        radiusKm: parseFloat(cfg.radius_km ?? '3'),
        radiusStepsKm: cfg.radius_steps_km ?? '3,6,10',
      },
    };
  }

  @Post('profile/presign')
  presignDoc(@Req() req: any, @Body() body: PresignDocDto) {
    const origin = `${req.protocol}://${req.get('host')}`;
    return this.storage.createPresignedUpload(
      `drivers/${req.user.sub}`,
      body.ext || 'jpg',
      body.contentType || 'image/jpeg',
      origin,
    );
  }

  @Patch('profile')
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.prisma.driver.update({
      where: { id: req.user.sub },
      data: {
        name: dto.name.trim(),
        ...(dto.avatarUrl !== undefined ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.idCardUrls !== undefined ? { idCardUrls: dto.idCardUrls } : {}),
        ...(dto.licenseUrls !== undefined ? { licenseUrls: dto.licenseUrls } : {}),
      },
      include: { wallet: true, maintenanceFees: { orderBy: { dueDate: 'desc' }, take: 6 } },
    });
  }

  @Patch('online')
  async toggleOnline(@Req() req: any, @Body() body: ToggleOnlineDto) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: req.user.sub },
      include: { wallet: true },
    });
    if (!driver) throw new BadRequestException('Không tìm thấy tài xế');

    if (body.isOnline) {
      if (driver.status !== DriverStatus.ACTIVE) {
        throw new BadRequestException('Tài khoản chưa được Admin duyệt hoặc đang bị khóa');
      }
      if (driver.lockedUntil && driver.lockedUntil > new Date()) {
        const remainMin = Math.ceil((driver.lockedUntil.getTime() - Date.now()) / 60000);
        throw new BadRequestException(
          `Bạn đang bị khóa nhận đơn còn ${remainMin} phút (đến ${driver.lockedUntil.toLocaleTimeString('vi-VN')})`,
        );
      }
      const minSetting = await this.prisma.setting.findUnique({
        where: { key: 'min_wallet_balance' },
      });
      const minBal = parseInt(minSetting?.value ?? '100000', 10);
      if ((driver.wallet?.balance ?? 0) < minBal) {
        throw new BadRequestException(
          `Số dư ví tối thiểu phải từ ${minBal.toLocaleString('vi-VN')}đ để bật trực tuyến`,
        );
      }
      if (driver.lat != null && driver.lng != null) {
        await this.redis.geoAddDriver(driver.id, driver.lng, driver.lat);
      }
    } else {
      await this.redis.geoRemoveDriver(driver.id);
    }

    return this.prisma.driver.update({
      where: { id: driver.id },
      data: {
        isOnline: Boolean(body.isOnline),
        ...(body.isOnline && driver.lat != null && driver.lng != null ? { locationAt: new Date() } : {}),
      },
    });
  }

  @Post('location')
  async updateLocation(@Req() req: any, @Body() dto: UpdateLocationDto) {
    const driverId = req.user.sub;
    const driver = await this.prisma.driver.update({
      where: { id: driverId },
      data: { lat: dto.lat, lng: dto.lng, locationAt: new Date() },
      select: { id: true, status: true, isOnline: true },
    });

    if (driver.status === DriverStatus.ACTIVE && driver.isOnline) {
      await this.redis.geoAddDriver(driverId, dto.lng, dto.lat);
    } else {
      await this.redis.geoRemoveDriver(driverId);
    }

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        driverId,
        status: { in: [TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS] },
      },
      select: {
        id: true,
        customerId: true,
        status: true,
        pickupLat: true,
        pickupLng: true,
        actualRoutePolyline: true,
      },
    });
    if (activeTrip) {
      let actualRoutePolyline = activeTrip.actualRoutePolyline;

      // Khi chuyến đang chạy (IN_PROGRESS), lưu vết hành trình GPS thực tế để vẽ trực tiếp trên bản đồ
      if (activeTrip.status === TripStatus.IN_PROGRESS) {
        const existingPts = (actualRoutePolyline || '')
          .split(';')
          .map((s) => s.trim())
          .filter(Boolean);
        if (existingPts.length === 0) {
          existingPts.push(`${activeTrip.pickupLat.toFixed(6)},${activeTrip.pickupLng.toFixed(6)}`);
        }
        const lastPair = existingPts[existingPts.length - 1].split(',').map(Number);
        const distM =
          lastPair.length === 2 && Number.isFinite(lastPair[0]) && Number.isFinite(lastPair[1])
            ? this.haversineMeters(lastPair[0], lastPair[1], dto.lat, dto.lng)
            : 999;

        // Lọc nhiễu đứng yên (<12m) và giới hạn tối đa 2000 điểm
        if (distM >= 12 && existingPts.length < 2000) {
          existingPts.push(`${dto.lat.toFixed(6)},${dto.lng.toFixed(6)}`);
          actualRoutePolyline = existingPts.join(';');
          await this.prisma.trip.update({
            where: { id: activeTrip.id },
            data: { actualRoutePolyline },
          });
        }
      }

      const payload = {
        tripId: activeTrip.id,
        lat: dto.lat,
        lng: dto.lng,
        ...(actualRoutePolyline ? { actualRoutePolyline } : {}),
      };
      this.realtime.emitToTrip(activeTrip.id, 'driver:location', payload);
      this.realtime.emitToCustomer(activeTrip.customerId, 'driver:location', payload);
    }
    return { ok: true };
  }

  private haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
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

  @Get('wallet')
  async getWallet(@Req() req: any) {
    const [wallet, settings, paymentIntents] = await Promise.all([
      this.prisma.wallet.findUnique({
        where: { driverId: req.user.sub },
        include: {
          transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
        },
      }),
      this.prisma.setting.findMany({
        where: {
          key: {
            in: [
              'bank_info',
              'bank_code',
              'bank_name',
              'bank_account',
              'bank_owner',
              'min_wallet_balance',
              'maintenance_fee',
            ],
          },
        },
      }),
      this.prisma.paymentIntent.findMany({
        where: { driverId: req.user.sub },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
    ]);
    const cfg = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return {
      wallet,
      bankInfo: cfg.bank_info ?? 'Ngân hàng: MB Bank | STK: 0973521456 | Chủ TK: NGUYEN VAN TUAN',
      bankCode: cfg.bank_code ?? 'MB',
      bankName: cfg.bank_name ?? 'MB Bank',
      bankAccount: cfg.bank_account ?? '0973521456',
      bankOwner: cfg.bank_owner ?? 'NGUYEN VAN TUAN',
      minWalletBalance: parseInt(cfg.min_wallet_balance ?? '100000', 10),
      maintenanceFee: parseInt(cfg.maintenance_fee ?? '200000', 10),
      paymentIntents,
    };
  }

  /**
   * Tạo mã VietQR MB Bank (0973521456 - NGUYEN VAN TUAN) kèm mã giao dịch tự sinh để đối soát
   */
  @Post('payment-qr')
  async createPaymentQr(@Req() req: any, @Body() dto: CreatePaymentQrDto) {
    if (dto.purpose !== 'WALLET_TOPUP' && dto.purpose !== 'MAINTENANCE_FEE') {
      throw new BadRequestException('Loại giao dịch chỉ nhận WALLET_TOPUP hoặc MAINTENANCE_FEE');
    }

    const [driver, settings] = await Promise.all([
      this.prisma.driver.findUnique({ where: { id: req.user.sub } }),
      this.prisma.setting.findMany({
        where: {
          key: { in: ['bank_code', 'bank_name', 'bank_account', 'bank_owner', 'maintenance_fee'] },
        },
      }),
    ]);
    if (!driver) throw new BadRequestException('Không tìm thấy tài xế');

    const cfg = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const bankCode = (cfg.bank_code || 'MB').trim().toUpperCase();
    const bankAccount = (cfg.bank_account || '0973521456').trim();
    const bankOwner = (cfg.bank_owner || 'NGUYEN VAN TUAN').trim().toUpperCase();
    const maintenanceFee = parseInt(cfg.maintenance_fee ?? '200000', 10);

    const amount =
      dto.purpose === 'MAINTENANCE_FEE' ? maintenanceFee : Math.round(Number(dto.amount || 0));
    if (!Number.isInteger(amount) || amount < 10000 || amount > 100_000_000) {
      throw new BadRequestException('Số tiền giao dịch phải từ 10.000đ đến 100.000.000đ');
    }

    const now = new Date();
    const dueBase = driver.feeDueDate || now;
    const period =
      dto.purpose === 'MAINTENANCE_FEE'
        ? dto.period || `${dueBase.getFullYear()}-${String(dueBase.getMonth() + 1).padStart(2, '0')}`
        : null;
    const monthMM = period ? period.split('-')[1] || String(now.getMonth() + 1).padStart(2, '0') : '';

    const prefix = dto.purpose === 'MAINTENANCE_FEE' ? 'NOWQ' : 'NOWV';
    const txCode = `${prefix}${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

    const cleanName = this.normalizeBankText(driver.name || driver.phone).slice(0, 22);
    const transferContent =
      dto.purpose === 'MAINTENANCE_FEE'
        ? `${cleanName} quy thang ${monthMM} ${txCode}`
        : `${cleanName} nap tien vao vi ${txCode}`;

    const qrUrl = `https://img.vietqr.io/image/${encodeURIComponent(bankCode)}-${encodeURIComponent(
      bankAccount,
    )}-compact2.png?amount=${amount}&addInfo=${encodeURIComponent(transferContent)}&accountName=${encodeURIComponent(
      bankOwner,
    )}`;

    const intent = await this.prisma.paymentIntent.create({
      data: {
        txCode,
        driverId: driver.id,
        purpose: dto.purpose,
        period,
        amount,
        bankCode,
        bankAccount,
        bankOwner,
        transferContent,
        qrUrl,
        status: 'PENDING',
      },
      include: {
        driver: { select: { id: true, name: true, phone: true } },
      },
    });

    this.realtime.emitToAdmin('payment:created', intent);
    return {
      ...intent,
      bankName: cfg.bank_name || 'MB Bank',
    };
  }

  @Get('payment-qr')
  listMyPaymentQrs(@Req() req: any) {
    return this.prisma.paymentIntent.findMany({
      where: { driverId: req.user.sub },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
  }

  /**
   * Cấp URL presigned để tài xế tải ảnh biên lai chuyển khoản cho phiếu VietQR
   */
  @Post('payment-qr/:id/proof/presign')
  async presignPaymentProof(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: PresignDocDto,
  ) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id } });
    if (!intent || intent.driverId !== req.user.sub) {
      throw new NotFoundException('Không tìm thấy phiếu thanh toán QR');
    }
    if (intent.status !== 'PENDING') {
      throw new BadRequestException('Phiếu thanh toán đã được xử lý, không thể cập nhật biên lai');
    }
    const origin = `${req.protocol}://${req.get('host')}`;
    return this.storage.createPresignedUpload(
      `payment-proofs/${req.user.sub}`,
      body.ext || 'jpg',
      body.contentType || 'image/jpeg',
      origin,
    );
  }

  /**
   * Tài xế lưu ảnh biên lai chuyển khoản để Admin kiểm tra & xác nhận cộng ví / gia hạn quỹ
   */
  @Post('payment-qr/:id/proof')
  async submitPaymentProof(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: SubmitPaymentProofDto,
  ) {
    const intent = await this.prisma.paymentIntent.findUnique({ where: { id } });
    if (!intent || intent.driverId !== req.user.sub) {
      throw new NotFoundException('Không tìm thấy phiếu thanh toán QR');
    }
    if (intent.status !== 'PENDING') {
      throw new BadRequestException('Phiếu thanh toán đã được xử lý, không thể gửi lại biên lai');
    }

    const updated = await this.prisma.paymentIntent.update({
      where: { id },
      data: {
        proofImageUrl: dto.proofImageUrl.trim(),
        proofUploadedAt: new Date(),
      },
      include: {
        driver: { select: { id: true, name: true, phone: true } },
      },
    });

    this.realtime.emitToAdmin('payment:proof_uploaded', updated);
    return updated;
  }

  private normalizeBankText(raw: string): string {
    return raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .replace(/[^a-zA-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }
}
