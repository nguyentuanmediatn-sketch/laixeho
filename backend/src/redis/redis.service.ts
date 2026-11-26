import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private readonly memoryStore = new Map<string, { value: string; expiresAt?: number }>();
  private readonly memoryGeo = new Map<string, { lat: number; lng: number }>();

  constructor(private readonly config: ConfigService) {
    if (this.config.get<string>('SKIP_REDIS_CONNECT') !== 'true') {
      const host = this.config.get<string>('REDIS_HOST', 'localhost');
      const port = Number(this.config.get<string>('REDIS_PORT', '6379'));
      this.client = new Redis({
        host,
        port,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy: (times) => (times <= 2 ? Math.min(times * 500, 1500) : null),
      });
      this.client.on('error', (err) => {
        this.logger.warn(`Redis unavailable, using in-memory fallback (${err.message})`);
      });
    }
  }

  async onModuleInit() {
    if (!this.client) return;
    try {
      await this.client.connect();
      this.logger.log('Connected to Redis');
    } catch {
      this.logger.warn('Redis server not reachable; running with in-memory fallback');
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
    this.memoryGeo.set(driverId, { lat, lng });
    if (this.client?.status === 'ready') {
      await this.client.geoadd('drivers:online', lng, lat, driverId);
    }
  }

  async geoRemoveDriver(driverId: string): Promise<void> {
    this.memoryGeo.delete(driverId);
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

    const candidates: Array<{ driverId: string; distanceKm: number }> = [];
    for (const [driverId, pos] of this.memoryGeo.entries()) {
      const dist = this.haversineKm(lat, lng, pos.lat, pos.lng);
      if (dist <= radiusKm) {
        candidates.push({ driverId, distanceKm: dist });
      }
    }
    return candidates.sort((a, b) => a.distanceKm - b.distanceKm);
  }

  private haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
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

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit().catch(() => undefined);
    }
  }
}
