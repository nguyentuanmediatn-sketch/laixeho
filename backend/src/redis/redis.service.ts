import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly memoryStore = new Map<string, { value: string; expiresAt?: number }>();

  constructor(private readonly config: ConfigService) {
    if (process.env.SKIP_REDIS_CONNECT !== 'true') {
      const host = this.config.get<string>('REDIS_HOST', 'localhost');
      const port = this.config.get<number>('REDIS_PORT', 6379);
      this.client = new Redis({ host, port, lazyConnect: true, maxRetriesPerRequest: 2 });
      this.client.on('error', (err) => {
        this.logger.warn(`Redis connection warning: ${err.message}`);
      });
    }
  }

  async get(key: string): Promise<string | null> {
    if (this.client?.status === 'ready') {
      return this.client.get(key);
    }
    const item = this.memoryStore.get(key);
    if (!item) return null;
    if (item.expiresAt && Date.now() > item.expiresAt) {
      this.memoryStore.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.client?.status === 'ready') {
      if (ttlSeconds) {
        await this.client.set(key, value, 'EX', ttlSeconds);
      } else {
        await this.client.set(key, value);
      }
      return;
    }
    this.memoryStore.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
    });
  }

  async del(key: string): Promise<void> {
    if (this.client?.status === 'ready') {
      await this.client.del(key);
      return;
    }
    this.memoryStore.delete(key);
  }

  async geoAddDriver(driverId: string, lng: number, lat: number): Promise<void> {
    if (this.client?.status === 'ready') {
      await this.client.geoadd('drivers:online', lng, lat, driverId);
    }
  }

  async geoRemoveDriver(driverId: string): Promise<void> {
    if (this.client?.status === 'ready') {
      await this.client.zrem('drivers:online', driverId);
    }
  }

  async geoRadiusDrivers(
    lng: number,
    lat: number,
    radiusKm: number,
  ): Promise<Array<{ driverId: string; distanceKm: number }>> {
    if (this.client?.status === 'ready') {
      const results = (await this.client.geosearch(
        'drivers:online',
        'FROMLONLAT',
        lng,
        lat,
        'BYRADIUS',
        radiusKm,
        'km',
        'ASC',
        'WITHDIST',
      )) as Array<[string, string]>;
      return results.map(([driverId, dist]) => ({
        driverId,
        distanceKm: parseFloat(dist),
      }));
    }
    return [];
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }
}
