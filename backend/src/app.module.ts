import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { StorageModule } from './storage/storage.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RealtimeModule } from './realtime/realtime.module';
import { AuthModule } from './auth/auth.module';
import { MapModule } from './map/map.module';
import { PricingModule } from './pricing/pricing.module';
import { DispatchModule } from './dispatch/dispatch.module';
import { TripsModule } from './trips/trips.module';
import { DriversModule } from './drivers/drivers.module';
import { MaintenanceModule } from './maintenance/maintenance.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    StorageModule,
    NotificationsModule,
    RealtimeModule,
    AuthModule,
    MapModule,
    PricingModule,
    DispatchModule,
    TripsModule,
    DriversModule,
    MaintenanceModule,
    AdminModule,
  ],
})
export class AppModule {}
