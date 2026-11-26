import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { MapService } from './map.service';

@Controller('map')
export class MapController {
  constructor(private readonly mapService: MapService) {}

  @Get('autocomplete')
  autocomplete(
    @Query('q') q: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    if (!q || q.trim().length < 2) return [];
    const parsedLat = lat ? parseFloat(lat) : undefined;
    const parsedLng = lng ? parseFloat(lng) : undefined;
    return this.mapService.autocomplete(q, parsedLat, parsedLng);
  }

  @Get('reverse')
  reverse(@Query('lat') lat: string, @Query('lng') lng: string) {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLng)) {
      throw new BadRequestException('Tọa độ lat/lng không hợp lệ');
    }
    return this.mapService.reverseGeocode(parsedLat, parsedLng);
  }

  @Get('route')
  route(
    @Query('fromLat') fromLat: string,
    @Query('fromLng') fromLng: string,
    @Query('toLat') toLat: string,
    @Query('toLng') toLng: string,
  ) {
    const oLat = parseFloat(fromLat);
    const oLng = parseFloat(fromLng);
    const dLat = parseFloat(toLat);
    const dLng = parseFloat(toLng);
    if (
      !Number.isFinite(oLat) ||
      !Number.isFinite(oLng) ||
      !Number.isFinite(dLat) ||
      !Number.isFinite(dLng)
    ) {
      throw new BadRequestException('Tọa độ điểm đầu/cuối không hợp lệ');
    }
    return this.mapService.getShortestCarRoute(oLat, oLng, dLat, dLng);
  }
}
