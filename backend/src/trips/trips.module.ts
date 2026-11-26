import { Module } from '@nestjs/common';
import { MapModule } from '../map/map.module';
import { PricingModule } from '../pricing/pricing.module';
import { TripsController } from './trips.controller';
import { TrackController } from './track.controller';
import { TripsService } from './trips.service';

@Module({
  imports: [MapModule, PricingModule],
  controllers: [TripsController, TrackController],
  providers: [TripsService],
  exports: [TripsService],
})
export class TripsModule {}
