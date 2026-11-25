import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  routePolyline: string;
}

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);
  private readonly provider: string;

  constructor(private readonly config: ConfigService) {
    this.provider = this.config.get<string>('MAP_PROVIDER', 'mock');
  }

  /**
   * Tính quãng đường ô tô ngắn nhất từ điểm đón đến điểm trả.
   * Hỗ trợ chuyển đổi Goong / Google / Mock qua MAP_PROVIDER (Điều 5.5 Hợp đồng).
   */
  async getShortestCarRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteResult> {
    if (this.provider === 'goong') {
      return this.fetchGoongShortestRoute(originLat, originLng, destLat, destLng);
    }
    if (this.provider === 'google') {
      return this.fetchGoogleShortestRoute(originLat, originLng, destLat, destLng);
    }
    return this.calculateMockRoute(originLat, originLng, destLat, destLng);
  }

  private async fetchGoongShortestRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteResult> {
    const apiKey = this.config.get<string>('GOONG_API_KEY');
    const url = `https://rsapi.goong.io/Direction?origin=${originLat},${originLng}&destination=${destLat},${destLng}&vehicle=car&alternatives=true&api_key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`Goong API failed (${res.status}), falling back to haversine`);
      return this.calculateMockRoute(originLat, originLng, destLat, destLng);
    }
    const data = (await res.json()) as any;
    const routes = data?.routes ?? [];
    if (routes.length === 0) {
      return this.calculateMockRoute(originLat, originLng, destLat, destLng);
    }
    // Chọn lộ trình có quãng đường ngắn nhất
    let shortest = routes[0];
    for (const r of routes) {
      if ((r.legs?.[0]?.distance?.value ?? Infinity) < (shortest.legs?.[0]?.distance?.value ?? Infinity)) {
        shortest = r;
      }
    }
    const meters = shortest.legs?.[0]?.distance?.value ?? 0;
    const seconds = shortest.legs?.[0]?.duration?.value ?? 0;
    return {
      distanceKm: meters / 1000,
      durationMin: Math.ceil(seconds / 60),
      routePolyline: shortest.overview_polyline?.points ?? '',
    };
  }

  private async fetchGoogleShortestRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteResult> {
    const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&mode=driving&alternatives=true&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      this.logger.warn(`Google Directions failed (${res.status}), falling back to haversine`);
      return this.calculateMockRoute(originLat, originLng, destLat, destLng);
    }
    const data = (await res.json()) as any;
    const routes = data?.routes ?? [];
    if (routes.length === 0) {
      return this.calculateMockRoute(originLat, originLng, destLat, destLng);
    }
    let shortest = routes[0];
    for (const r of routes) {
      if ((r.legs?.[0]?.distance?.value ?? Infinity) < (shortest.legs?.[0]?.distance?.value ?? Infinity)) {
        shortest = r;
      }
    }
    const meters = shortest.legs?.[0]?.distance?.value ?? 0;
    const seconds = shortest.legs?.[0]?.duration?.value ?? 0;
    return {
      distanceKm: meters / 1000,
      durationMin: Math.ceil(seconds / 60),
      routePolyline: shortest.overview_polyline?.points ?? '',
    };
  }

  /**
   * Haversine * 1.25 để ước lượng đường bộ trong chế độ mock/dev
   */
  calculateMockRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): RouteResult {
    const R = 6371;
    const dLat = ((destLat - originLat) * Math.PI) / 180;
    const dLng = ((destLng - originLng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((originLat * Math.PI) / 180) *
        Math.cos((destLat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const straightKm = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const roadKm = Math.max(0.5, Number((straightKm * 1.25).toFixed(2)));
    return {
      distanceKm: roadKm,
      durationMin: Math.max(3, Math.ceil((roadKm / 30) * 60)),
      routePolyline: `${originLat},${originLng};${destLat},${destLng}`,
    };
  }
}
