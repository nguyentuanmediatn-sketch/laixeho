import { Module } from '@nestjs/common';
import { TripsModule } from '../trips/trips.module';
import { AdminController } from './admin.controller';

@Module({
  imports: [TripsModule],
  controllers: [AdminController],
})
export class AdminModule {}
