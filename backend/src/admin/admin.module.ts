import { Module } from '@nestjs/common';
import { MaintenanceModule } from '../maintenance/maintenance.module';
import { PricingModule } from '../pricing/pricing.module';
import { TripsModule } from '../trips/trips.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [TripsModule, MaintenanceModule, PricingModule],
  controllers: [AdminController],
})
export class AdminModule {}
