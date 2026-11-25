import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';
import { DriverStatus, TripStatus } from '@prisma/client';
import { Auth } from '../auth/auth.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { StorageService } from '../storage/storage.service';

class UpdateProfileDto {
  @IsString() name: string;
  @IsOptional() @IsString() avatarUrl?: string;
  @IsOptional() @IsArray() idCardUrls?: string[];
  @IsOptional() @IsArray() licenseUrls?: string[];
}

class UpdateLocationDto {
  @IsNumber() lat: number;
  @IsNumber() lng: number;
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
    return this.prisma.driver.findUnique({
      where: { id: req.user.sub },
      include: {
        wallet: true,
        maintenanceFees: { orderBy: { dueDate: 'desc' }, take: 3 },
      },
    });
  }

  @Post('profile/presign')
  presignDoc(@Req() req: any, @Body() body: { ext: string; contentType: string }) {
    return this.storage.createPresignedUpload(
      `drivers/${req.user.sub}`,
      body.ext || 'jpg',
      body.contentType || 'image/jpeg',
    );
  }

  @Patch('profile')
  updateProfile(@Req() req: any, @Body() dto: UpdateProfileDto) {
    return this.prisma.driver.update({
      where: { id: req.user.sub },
      data: {
        name: dto.name,
        ...(dto.avatarUrl ? { avatarUrl: dto.avatarUrl } : {}),
        ...(dto.idCardUrls ? { idCardUrls: dto.idCardUrls } : {}),
        ...(dto.licenseUrls ? { licenseUrls: dto.licenseUrls } : {}),
      },
    });
  }

  @Patch('online')
  async toggleOnline(@Req() req: any, @Body() body: { isOnline: boolean }) {
    const driver = await this.prisma.driver.findUnique({
      where: { id: req.user.sub },
      include: { wallet: true },
    });
    if (!driver) throw new BadRequestException('Không tìm thấy tài xế');

    if (body.isOnline) {
      if (driver.status !== DriverStatus.ACTIVE) {
        throw new BadRequestException('Tài khoản chưa được duyệt hoặc đang bị khóa');
      }
      if (driver.lockedUntil && driver.lockedUntil > new Date()) {
        throw new BadRequestException(
          `Bạn đang bị khóa nhận đơn đến ${driver.lockedUntil.toISOString()}`,
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
    } else {
      await this.redis.geoRemoveDriver(driver.id);
    }

    return this.prisma.driver.update({
      where: { id: driver.id },
      data: { isOnline: Boolean(body.isOnline) },
    });
  }

  @Post('location')
  async updateLocation(@Req() req: any, @Body() dto: UpdateLocationDto) {
    const driverId = req.user.sub;
    await this.redis.geoAddDriver(driverId, dto.lng, dto.lat);
    await this.prisma.driver.update({
      where: { id: driverId },
      data: { lat: dto.lat, lng: dto.lng, locationAt: new Date() },
    });

    const activeTrip = await this.prisma.trip.findFirst({
      where: {
        driverId,
        status: { in: [TripStatus.ACCEPTED, TripStatus.ARRIVED, TripStatus.IN_PROGRESS] },
      },
      select: { id: true },
    });
    if (activeTrip) {
      this.realtime.emitToTrip(activeTrip.id, 'driver:location', {
        tripId: activeTrip.id,
        lat: dto.lat,
        lng: dto.lng,
      });
    }
    return { ok: true };
  }

  @Get('wallet')
  async getWallet(@Req() req: any) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { driverId: req.user.sub },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 50 },
      },
    });
    const bankSetting = await this.prisma.setting.findUnique({ where: { key: 'bank_info' } });
    return {
      wallet,
      bankInfo: bankSetting?.value ?? '',
    };
  }
}
