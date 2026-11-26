import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';
import { MediaStage, MediaType } from '@prisma/client';
import { Auth } from '../auth/auth.decorator';
import { TripsService } from './trips.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

class EstimateDto {
  @IsNumber() pickupLat: number;
  @IsNumber() pickupLng: number;
  @IsNumber() dropoffLat: number;
  @IsNumber() dropoffLng: number;
}

class CreateTripDto {
  @IsString() @IsNotEmpty() pickupAddress: string;
  @IsNumber() pickupLat: number;
  @IsNumber() pickupLng: number;
  @IsOptional() @IsString() dropoffAddress?: string;
  @IsOptional() @IsNumber() dropoffLat?: number;
  @IsOptional() @IsNumber() dropoffLng?: number;
  @IsOptional() @IsBoolean() isBookingForOther?: boolean;
  @IsOptional() @IsString() passengerName?: string;
  @IsOptional() @IsString() passengerPhone?: string;
  @IsOptional() @IsString() partnerCode?: string;
  @IsOptional() @IsString() note?: string;
}

class SosDto {
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
  @IsOptional() @IsString() note?: string;
}

class AddMediaDto {
  @IsEnum(MediaType) type: MediaType;
  @IsEnum(MediaStage) stage: MediaStage;
  @IsOptional() @IsBoolean() isPlatePhoto?: boolean;
  @IsString() @IsNotEmpty() url: string;
  @IsOptional() @IsNumber() size?: number;
  @IsOptional() @IsNumber() durationSec?: number;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
}

class PresignMediaDto {
  @IsOptional() @IsString() ext?: string;
  @IsOptional() @IsString() contentType?: string;
}

class UpdateDropoffDto {
  @IsString() @IsNotEmpty() dropoffAddress: string;
  @IsNumber() dropoffLat: number;
  @IsNumber() dropoffLng: number;
}

class CompleteTripDto {
  @IsOptional() @IsNumber() actualDropoffLat?: number;
  @IsOptional() @IsNumber() actualDropoffLng?: number;
}

class CancelTripDto {
  @IsOptional() @IsString() reason?: string;
}

@Controller('trips')
export class TripsController {
  constructor(
    private readonly tripsService: TripsService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  @Post('estimate')
  estimate(@Body() dto: EstimateDto) {
    return this.tripsService.estimate(dto.pickupLat, dto.pickupLng, dto.dropoffLat, dto.dropoffLng);
  }

  @Auth('CUSTOMER')
  @Post()
  create(@Req() req: any, @Body() dto: CreateTripDto) {
    return this.tripsService.createTrip({
      customerId: req.user.sub,
      ...dto,
    });
  }

  @Auth('CUSTOMER', 'DRIVER')
  @Get('active')
  getActive(@Req() req: any) {
    if (req.user.role === 'DRIVER') {
      return this.tripsService.getActiveForDriver(req.user.sub);
    }
    return this.tripsService.getActiveForCustomer(req.user.sub);
  }

  @Auth('CUSTOMER')
  @Get('my-history')
  customerHistory(@Req() req: any) {
    return this.prisma.trip.findMany({
      where: { customerId: req.user.sub },
      include: {
        driver: { select: { id: true, name: true, phone: true, avatarUrl: true } },
        media: { orderBy: { takenAt: 'asc' } },
      },
      orderBy: { orderedAt: 'desc' },
      take: 50,
    });
  }

  @Auth('DRIVER')
  @Get('driver-history')
  driverHistory(@Req() req: any) {
    return this.prisma.trip.findMany({
      where: { driverId: req.user.sub },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        media: { orderBy: { takenAt: 'asc' } },
      },
      orderBy: { orderedAt: 'desc' },
      take: 50,
    });
  }

  @Get('config')
  async getPublicConfig() {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: ['public_track_base_url', 'hotline'] } },
    });
    const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return {
      publicTrackBaseUrl: (map.public_track_base_url || 'https://tuannv.site').replace(/\/+$/, ''),
      hotline: map.hotline || '0973521456',
    };
  }

  @Get('share/:token')
  getSharedTrip(@Param('token') token: string) {
    return this.tripsService.getSharedTrip(token);
  }

  @Auth('CUSTOMER', 'DRIVER', 'ADMIN')
  @Get(':id')
  getDetail(@Req() req: any, @Param('id') id: string) {
    return this.tripsService.getTripDetailForUser(id, req.user.role, req.user.sub);
  }

  @Auth('CUSTOMER', 'DRIVER')
  @Post(':id/sos')
  triggerSos(@Req() req: any, @Param('id') id: string, @Body() body: SosDto) {
    return this.tripsService.triggerSos(id, req.user.role, req.user.sub, body?.lat, body?.lng, body?.note);
  }

  @Auth('DRIVER')
  @Post('offers/:offerId/accept')
  acceptOffer(@Req() req: any, @Param('offerId') offerId: string) {
    return this.tripsService.acceptOffer(offerId, req.user.sub);
  }

  @Auth('DRIVER')
  @Post('offers/:offerId/reject')
  rejectOffer(@Req() req: any, @Param('offerId') offerId: string) {
    return this.tripsService.rejectOffer(offerId, req.user.sub);
  }

  @Auth('DRIVER')
  @Post(':id/arrived')
  markArrived(@Req() req: any, @Param('id') id: string) {
    return this.tripsService.markArrived(id, req.user.sub);
  }

  @Auth('DRIVER')
  @Post(':id/media/presign')
  async presignMedia(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: PresignMediaDto,
  ) {
    await this.tripsService.assertDriverCanUploadMedia(id, req.user.sub);
    const origin = `${req.protocol}://${req.get('host')}`;
    return this.storage.createPresignedUpload(
      `trips/${id}`,
      body.ext || 'jpg',
      body.contentType || 'image/jpeg',
      origin,
    );
  }

  @Auth('DRIVER')
  @Post(':id/media')
  addMedia(@Req() req: any, @Param('id') id: string, @Body() dto: AddMediaDto) {
    return this.tripsService.addMedia(id, req.user.sub, dto);
  }

  @Auth('DRIVER')
  @Delete(':id/media/:mediaId')
  deleteMedia(@Req() req: any, @Param('id') id: string, @Param('mediaId') mediaId: string) {
    return this.tripsService.deleteMedia(id, req.user.sub, mediaId);
  }

  @Auth('DRIVER')
  @Post(':id/start')
  startTrip(@Req() req: any, @Param('id') id: string) {
    return this.tripsService.startTrip(id, req.user.sub);
  }

  @Auth('CUSTOMER', 'DRIVER', 'ADMIN')
  @Patch(':id/dropoff')
  updateDropoff(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: UpdateDropoffDto,
  ) {
    return this.tripsService.updateDropoff(
      id,
      req.user.role,
      req.user.sub,
      body.dropoffAddress,
      body.dropoffLat,
      body.dropoffLng,
    );
  }

  @Auth('DRIVER')
  @Post(':id/complete')
  completeTrip(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: CompleteTripDto,
  ) {
    return this.tripsService.completeTrip(id, req.user.sub, body?.actualDropoffLat, body?.actualDropoffLng);
  }

  @Auth('CUSTOMER', 'ADMIN')
  @Post(':id/cancel')
  cancelTrip(@Req() req: any, @Param('id') id: string, @Body() body: CancelTripDto) {
    return this.tripsService.cancelTrip(id, req.user.role, req.user.sub, body?.reason);
  }
}
