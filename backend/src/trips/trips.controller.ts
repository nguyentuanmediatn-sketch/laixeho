import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsBoolean, IsString } from 'class-validator';
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
  @IsString() pickupAddress: string;
  @IsNumber() pickupLat: number;
  @IsNumber() pickupLng: number;
  @IsOptional() @IsString() dropoffAddress?: string;
  @IsOptional() @IsNumber() dropoffLat?: number;
  @IsOptional() @IsNumber() dropoffLng?: number;
  @IsOptional() @IsString() note?: string;
}

class AddMediaDto {
  @IsEnum(MediaType) type: MediaType;
  @IsEnum(MediaStage) stage: MediaStage;
  @IsOptional() @IsBoolean() isPlatePhoto?: boolean;
  @IsString() url: string;
  @IsOptional() @IsNumber() size?: number;
  @IsOptional() @IsNumber() durationSec?: number;
  @IsOptional() @IsNumber() lat?: number;
  @IsOptional() @IsNumber() lng?: number;
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

  @Auth('CUSTOMER')
  @Get('my-history')
  customerHistory(@Req() req: any) {
    return this.prisma.trip.findMany({
      where: { customerId: req.user.sub },
      include: {
        driver: { select: { id: true, name: true, phone: true, avatarUrl: true } },
        media: true,
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
        media: true,
      },
      orderBy: { orderedAt: 'desc' },
      take: 50,
    });
  }

  @Auth('CUSTOMER', 'DRIVER', 'ADMIN')
  @Get(':id')
  getDetail(@Param('id') id: string) {
    return this.prisma.trip.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        driver: { select: { id: true, name: true, phone: true, avatarUrl: true, lat: true, lng: true } },
        media: true,
      },
    });
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
  presignMedia(
    @Param('id') id: string,
    @Body() body: { ext: string; contentType: string },
  ) {
    return this.storage.createPresignedUpload(`trips/${id}`, body.ext || 'jpg', body.contentType || 'image/jpeg');
  }

  @Auth('DRIVER')
  @Post(':id/media')
  addMedia(@Req() req: any, @Param('id') id: string, @Body() dto: AddMediaDto) {
    return this.tripsService.addMedia(id, req.user.sub, dto);
  }

  @Auth('DRIVER')
  @Post(':id/start')
  startTrip(@Req() req: any, @Param('id') id: string) {
    return this.tripsService.startTrip(id, req.user.sub);
  }

  @Auth('CUSTOMER')
  @Patch(':id/dropoff')
  updateDropoff(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { dropoffAddress: string; dropoffLat: number; dropoffLng: number },
  ) {
    return this.tripsService.updateDropoff(
      id,
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
    @Body() body: { actualDropoffLat?: number; actualDropoffLng?: number },
  ) {
    return this.tripsService.completeTrip(id, req.user.sub, body?.actualDropoffLat, body?.actualDropoffLng);
  }

  @Auth('CUSTOMER', 'ADMIN')
  @Post(':id/cancel')
  cancelTrip(@Req() req: any, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.tripsService.cancelTrip(id, req.user.role, req.user.sub, body?.reason);
  }
}
