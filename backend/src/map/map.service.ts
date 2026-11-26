import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface RouteStep {
  instruction: string;
  distanceM: number;
  name: string;
}

export interface RouteResult {
  distanceKm: number;
  durationMin: number;
  routePolyline: string;
  routeSource: 'OSRM' | 'GOONG' | 'GOOGLE' | 'FALLBACK_HAVERSINE';
  steps?: RouteStep[];
}

export interface PlaceSuggestion {
  label: string;
  address: string;
  lat: number;
  lng: number;
}

const FALLBACK_VN_PLACES: PlaceSuggestion[] = [
  { label: 'Quảng trường Võ Nguyên Giáp', address: 'Quảng trường Võ Nguyên Giáp, Trưng Vương, TP. Thái Nguyên', lat: 21.5931, lng: 105.8442 },
  { label: 'Vincom Plaza Thái Nguyên', address: '286 Lương Ngọc Quyến, Quang Trung, TP. Thái Nguyên', lat: 21.5918, lng: 105.8406 },
  { label: 'Bệnh viện Trung ương Thái Nguyên', address: '479 Lương Ngọc Quyến, Phan Đình Phùng, TP. Thái Nguyên', lat: 21.5898, lng: 105.8492 },
  { label: 'Đại học Thái Nguyên', address: 'Phường Tân Thịnh, TP. Thái Nguyên', lat: 21.5855, lng: 105.8065 },
  { label: 'Bến xe Thái Nguyên', address: 'Phường Đồng Quang, TP. Thái Nguyên', lat: 21.5762, lng: 105.8505 },
  { label: 'KCN Samsung Yên Bình', address: 'KCN Yên Bình, TP. Phổ Yên, Thái Nguyên', lat: 21.4165, lng: 105.8878 },
  { label: 'TP. Sông Công', address: 'Trung tâm TP. Sông Công, Thái Nguyên', lat: 21.4882, lng: 105.8466 },
  { label: 'Hồ Hoàn Kiếm', address: 'Hàng Trống, Hoàn Kiếm, Hà Nội', lat: 21.0285, lng: 105.8542 },
];

@Injectable()
export class MapService {
  private readonly logger = new Logger(MapService.name);
  private readonly provider: string;

  constructor(private readonly config: ConfigService) {
    this.provider = this.config.get<string>('MAP_PROVIDER', 'osm').toLowerCase();
  }

  /**
   * Tính quãng đường ô tô ngắn nhất từ điểm đón đến điểm trả.
   * Hỗ trợ osm (OSRM miễn phí) / goong / google / mock qua MAP_PROVIDER (Điều 5.5 Hợp đồng).
   */
  async getShortestCarRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteResult> {
    if (this.provider === 'goong' && this.config.get<string>('GOONG_API_KEY')) {
      return this.fetchGoongShortestRoute(originLat, originLng, destLat, destLng);
    }
    if (this.provider === 'google' && this.config.get<string>('GOOGLE_MAPS_API_KEY')) {
      return this.fetchGoogleShortestRoute(originLat, originLng, destLat, destLng);
    }
    if (this.provider === 'osm') {
      return this.fetchOsrmShortestRoute(originLat, originLng, destLat, destLng);
    }
    return this.calculateMockRoute(originLat, originLng, destLat, destLng);
  }

  private stripAccents(s: string): string {
    return s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase();
  }

  async autocomplete(query: string, lat?: number, lng?: number): Promise<PlaceSuggestion[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    if (this.provider === 'goong' && this.config.get<string>('GOONG_API_KEY')) {
      const res = await this.fetchGoongAutocomplete(q, lat, lng);
      if (res.length > 0) return res;
    }
    if (this.provider === 'google' && this.config.get<string>('GOOGLE_MAPS_API_KEY')) {
      const res = await this.fetchGoogleAutocomplete(q, lat, lng);
      if (res.length > 0) return res;
    }

    // 1. Try Photon (OSM fast autocomplete, handles accent-free Vietnamese well)
    const tryPhoton = async (searchText: string): Promise<PlaceSuggestion[]> => {
      try {
        const params = new URLSearchParams({ q: searchText, limit: '8' });
        if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
          params.set('lat', String(lat));
          params.set('lon', String(lng));
        }
        const res = await this.fetchWithTimeout(
          `https://photon.komoot.io/api/?${params.toString()}`,
          { headers: { 'User-Agent': 'LaiXeHoApp/1.0' } },
          4500,
        );
        if (!res.ok) return [];
        const data = (await res.json()) as any;
        const features = (data?.features ?? []).filter(
          (f: any) => !f.properties?.countrycode || f.properties.countrycode === 'VN',
        );
        return features.slice(0, 6).map((f: any) => {
          const p = f.properties || {};
          const parts = [p.name, p.housenumber, p.street, p.district || p.suburb, p.city || p.state].filter(Boolean);
          return {
            label: p.name || p.street || searchText,
            address: parts.join(', ') || searchText,
            lat: f.geometry.coordinates[1],
            lng: f.geometry.coordinates[0],
          };
        });
      } catch (err: any) {
        this.logger.warn(`Photon autocomplete failed: ${err.message}`);
        return [];
      }
    };

    const nearThaiNguyen =
      lat != null && lng != null && Math.abs(lat - 21.59) < 0.6 && Math.abs(lng - 105.84) < 0.6;
    const cleanInput = this.stripAccents(q);
    const hasLocalHint =
      cleanInput.includes('thai nguyen') ||
      cleanInput.includes('pho yen') ||
      cleanInput.includes('song cong') ||
      cleanInput.includes('ha noi');

    let photonHits = await tryPhoton(nearThaiNguyen && !hasLocalHint ? `${q}, Thái Nguyên` : q);
    if (photonHits.length === 0 && nearThaiNguyen && !hasLocalHint) {
      photonHits = await tryPhoton(q);
    }
    if (photonHits.length > 0) return photonHits;

    // 2. Try Nominatim
    try {
      const params = new URLSearchParams({
        q,
        format: 'json',
        countrycodes: 'vn',
        limit: '6',
        addressdetails: '1',
      });
      if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
        params.set('viewbox', `${lng - 0.25},${lat + 0.25},${lng + 0.25},${lat - 0.25}`);
      }
      const res = await this.fetchWithTimeout(
        `https://nominatim.openstreetmap.org/search?${params.toString()}`,
        {
          headers: {
            'User-Agent': 'LaiXeHoApp/1.0 (dispatch-service)',
            'Accept-Language': 'vi,en;q=0.8',
          },
        },
        4500,
      );
      if (res.ok) {
        const items = (await res.json()) as any[];
        if (Array.isArray(items) && items.length > 0) {
          return items.map((item) => ({
            label: item.name || item.display_name?.split(',')[0] || q,
            address: item.display_name || q,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
          }));
        }
      }
    } catch (err: any) {
      this.logger.warn(`Nominatim autocomplete failed: ${err.message}`);
    }

    // 3. Accent-insensitive fallback
    const cleanQ = this.stripAccents(q);
    return FALLBACK_VN_PLACES.filter(
      (p) => this.stripAccents(p.label).includes(cleanQ) || this.stripAccents(p.address).includes(cleanQ),
    ).slice(0, 6);
  }

  async reverseGeocode(lat: number, lng: number): Promise<{ address: string; lat: number; lng: number }> {
    if (this.provider === 'goong' && this.config.get<string>('GOONG_API_KEY')) {
      try {
        const apiKey = this.config.get<string>('GOONG_API_KEY');
        const res = await this.fetchWithTimeout(
          `https://rsapi.goong.io/Geocode?latlng=${lat},${lng}&api_key=${apiKey}`,
          {},
          5000,
        );
        if (res.ok) {
          const data = (await res.json()) as any;
          const formatted = data?.results?.[0]?.formatted_address;
          if (formatted) return { address: formatted, lat, lng };
        }
      } catch (err: any) {
        this.logger.warn(`Goong reverse geocode failed: ${err.message}`);
      }
    }

    try {
      const res = await this.fetchWithTimeout(
        `https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}`,
        { headers: { 'User-Agent': 'LaiXeHoApp/1.0' } },
        4500,
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        const p = data?.features?.[0]?.properties;
        if (p) {
          const parts = [p.name, p.housenumber, p.street, p.district || p.suburb, p.city || p.state].filter(Boolean);
          if (parts.length > 0) return { address: parts.join(', '), lat, lng };
        }
      }
    } catch (err: any) {
      this.logger.warn(`Photon reverse geocode failed: ${err.message}`);
    }

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
      const res = await this.fetchWithTimeout(
        url,
        {
          headers: {
            'User-Agent': 'LaiXeHoApp/1.0 (dispatch-service)',
            'Accept-Language': 'vi,en;q=0.8',
          },
        },
        5000,
      );
      if (res.ok) {
        const data = (await res.json()) as any;
        if (data?.display_name) {
          return { address: data.display_name, lat, lng };
        }
      }
    } catch (err: any) {
      this.logger.warn(`Nominatim reverse geocode failed: ${err.message}`);
    }

    return { address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng };
  }

  private formatOsrmStep(step: any): RouteStep {
    const m = step.maneuver || {};
    const name = (step.name || '').trim();
    const distM = Math.round(step.distance || 0);
    const modMap: Record<string, string> = {
      left: 'Rẽ trái',
      'sharp left': 'Rẽ ngoặt trái',
      'slight left': 'Chếch sang trái',
      right: 'Rẽ phải',
      'sharp right': 'Rẽ ngoặt phải',
      'slight right': 'Chếch sang phải',
      straight: 'Đi thẳng',
      uturn: 'Quay đầu',
    };
    let action = modMap[m.modifier] || 'Đi tiếp';
    if (m.type === 'depart') action = 'Xuất phát';
    else if (m.type === 'arrive') action = 'Đã đến điểm đích';
    else if (m.type === 'roundabout' || m.type === 'rotary') action = 'Đi vào vòng xuyến';
    else if (m.type === 'merge') action = 'Nhập làn';

    const instruction =
      m.type === 'arrive'
        ? 'Đã đến điểm đích'
        : name
          ? `${action} vào ${name}`
          : action;
    return { instruction, distanceM: distM, name };
  }

  private async fetchOsrmShortestRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteResult> {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?overview=full&geometries=geojson&alternatives=true&steps=true`;
      const res = await this.fetchWithTimeout(url, { headers: { 'User-Agent': 'LaiXeHoApp/1.0' } }, 6000);
      if (!res.ok) {
        this.logger.warn(`OSRM failed (${res.status}), falling back to haversine`);
        return this.calculateMockRoute(originLat, originLng, destLat, destLng);
      }
      const data = (await res.json()) as any;
      const routes = data?.routes ?? [];
      if (routes.length === 0) {
        return this.calculateMockRoute(originLat, originLng, destLat, destLng);
      }
      let shortest = routes[0];
      for (const r of routes) {
        if ((r.distance ?? Infinity) < (shortest.distance ?? Infinity)) {
          shortest = r;
        }
      }
      const coords: Array<[number, number]> = shortest.geometry?.coordinates ?? [];
      const polyline =
        coords.length > 0
          ? coords
              .filter((_, idx) => coords.length <= 140 || idx % Math.ceil(coords.length / 140) === 0 || idx === coords.length - 1)
              .map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
              .join(';')
          : `${originLat},${originLng};${destLat},${destLng}`;

      const rawSteps: any[] = shortest.legs?.[0]?.steps ?? [];
      const steps: RouteStep[] = rawSteps.slice(0, 15).map((s) => this.formatOsrmStep(s));

      return {
        distanceKm: Number(((shortest.distance ?? 0) / 1000).toFixed(3)),
        durationMin: Math.max(1, Math.ceil((shortest.duration ?? 0) / 60)),
        routePolyline: polyline,
        routeSource: 'OSRM',
        steps,
      };
    } catch (err: any) {
      this.logger.warn(`OSRM error (${err.message}), falling back to haversine`);
      return this.calculateMockRoute(originLat, originLng, destLat, destLng);
    }
  }

  private async fetchGoongShortestRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteResult> {
    try {
      const apiKey = this.config.get<string>('GOONG_API_KEY');
      const url = `https://rsapi.goong.io/Direction?origin=${originLat},${originLng}&destination=${destLat},${destLng}&vehicle=car&alternatives=true&api_key=${apiKey}`;
      const res = await this.fetchWithTimeout(url, {}, 6000);
      if (!res.ok) return this.calculateMockRoute(originLat, originLng, destLat, destLng);
      const data = (await res.json()) as any;
      const routes = data?.routes ?? [];
      if (routes.length === 0) return this.calculateMockRoute(originLat, originLng, destLat, destLng);

      let shortest = routes[0];
      for (const r of routes) {
        if ((r.legs?.[0]?.distance?.value ?? Infinity) < (shortest.legs?.[0]?.distance?.value ?? Infinity)) {
          shortest = r;
        }
      }
      const meters = shortest.legs?.[0]?.distance?.value ?? 0;
      const seconds = shortest.legs?.[0]?.duration?.value ?? 0;
      const encoded = shortest.overview_polyline?.points ?? '';
      return {
        distanceKm: meters / 1000,
        durationMin: Math.max(1, Math.ceil(seconds / 60)),
        routePolyline: encoded ? this.decodePolylineToPairs(encoded) : `${originLat},${originLng};${destLat},${destLng}`,
        routeSource: 'GOONG',
      };
    } catch {
      return this.calculateMockRoute(originLat, originLng, destLat, destLng);
    }
  }

  private async fetchGoogleShortestRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
  ): Promise<RouteResult> {
    try {
      const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${originLat},${originLng}&destination=${destLat},${destLng}&mode=driving&alternatives=true&key=${apiKey}`;
      const res = await this.fetchWithTimeout(url, {}, 6000);
      if (!res.ok) return this.calculateMockRoute(originLat, originLng, destLat, destLng);
      const data = (await res.json()) as any;
      const routes = data?.routes ?? [];
      if (routes.length === 0) return this.calculateMockRoute(originLat, originLng, destLat, destLng);

      let shortest = routes[0];
      for (const r of routes) {
        if ((r.legs?.[0]?.distance?.value ?? Infinity) < (shortest.legs?.[0]?.distance?.value ?? Infinity)) {
          shortest = r;
        }
      }
      const meters = shortest.legs?.[0]?.distance?.value ?? 0;
      const seconds = shortest.legs?.[0]?.duration?.value ?? 0;
      const encoded = shortest.overview_polyline?.points ?? '';
      return {
        distanceKm: meters / 1000,
        durationMin: Math.max(1, Math.ceil(seconds / 60)),
        routePolyline: encoded ? this.decodePolylineToPairs(encoded) : `${originLat},${originLng};${destLat},${destLng}`,
        routeSource: 'GOOGLE',
      };
    } catch {
      return this.calculateMockRoute(originLat, originLng, destLat, destLng);
    }
  }

  private async fetchGoongAutocomplete(query: string, lat?: number, lng?: number): Promise<PlaceSuggestion[]> {
    try {
      const apiKey = this.config.get<string>('GOONG_API_KEY');
      const loc = lat != null && lng != null ? `&location=${lat},${lng}` : '';
      const res = await this.fetchWithTimeout(
        `https://rsapi.goong.io/Place/AutoComplete?input=${encodeURIComponent(query)}${loc}&limit=5&api_key=${apiKey}`,
        {},
        5000,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      const predictions = (data?.predictions ?? []).slice(0, 5);
      const resolved = await Promise.all(
        predictions.map(async (p: any) => {
          const dRes = await this.fetchWithTimeout(
            `https://rsapi.goong.io/Place/Detail?place_id=${encodeURIComponent(p.place_id)}&api_key=${apiKey}`,
            {},
            4000,
          );
          if (!dRes.ok) return null;
          const d = (await dRes.json()) as any;
          const locObj = d?.result?.geometry?.location;
          if (!locObj) return null;
          return {
            label: p.structured_formatting?.main_text || p.description,
            address: p.description,
            lat: locObj.lat,
            lng: locObj.lng,
          };
        }),
      );
      return resolved.filter(Boolean) as PlaceSuggestion[];
    } catch {
      return [];
    }
  }

  private async fetchGoogleAutocomplete(query: string, lat?: number, lng?: number): Promise<PlaceSuggestion[]> {
    try {
      const apiKey = this.config.get<string>('GOOGLE_MAPS_API_KEY');
      const loc = lat != null && lng != null ? `&location=${lat},${lng}&radius=25000` : '';
      const res = await this.fetchWithTimeout(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}${loc}&language=vi&region=vn&key=${apiKey}`,
        {},
        5000,
      );
      if (!res.ok) return [];
      const data = (await res.json()) as any;
      return (data?.results ?? []).slice(0, 6).map((r: any) => ({
        label: r.name,
        address: r.formatted_address,
        lat: r.geometry.location.lat,
        lng: r.geometry.location.lng,
      }));
    } catch {
      return [];
    }
  }

  private decodePolylineToPairs(encoded: string): string {
    let index = 0;
    let lat = 0;
    let lng = 0;
    const points: string[] = [];
    while (index < encoded.length) {
      let b: number;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lat += result & 1 ? ~(result >> 1) : result >> 1;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      lng += result & 1 ? ~(result >> 1) : result >> 1;
      points.push(`${(lat / 1e5).toFixed(5)},${(lng / 1e5).toFixed(5)}`);
    }
    return points.join(';');
  }

  private async fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Haversine * 1.25 để ước lượng đường bộ trong chế độ mock/fallback
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
      routeSource: 'FALLBACK_HAVERSINE',
    };
  }
}
