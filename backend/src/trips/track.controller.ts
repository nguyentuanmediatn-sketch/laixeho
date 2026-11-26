import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { TripsService } from './trips.service';

@Controller('track')
export class TrackController {
  constructor(private readonly tripsService: TripsService) {}

  /**
   * Trang web nhẹ chia sẻ hành trình trực tiếp (người thân mở thẳng từ Zalo/SMS, không cần cài app)
   */
  @Get(':token')
  async renderLiveTrackPage(@Param('token') token: string, @Res() res: Response) {
    const trip = await this.tripsService.getSharedTrip(token);
    if (!trip) throw new NotFoundException('Liên kết hành trình không tồn tại');

    const safeToken = token.replace(/[^a-zA-Z0-9_-]/g, '');
    const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>NOW Thái Nguyên – Theo dõi hành trình ${trip.code}</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  body { margin: 0; background: #F8FAFC; color: #0F172A; display: flex; flex-direction: column; min-height: 100vh; }
  header { background: #E51922; color: #fff; padding: 14px 16px; display: flex; justify-content: space-between; align-items: center; }
  header h1 { margin: 0; font-size: 16px; font-weight: 800; }
  header span { font-size: 12px; background: rgba(255,255,255,0.2); padding: 4px 10px; border-radius: 12px; font-weight: 700; }
  #map { width: 100%; height: 55vh; min-height: 320px; }
  .card { background: #fff; margin: 12px; border-radius: 16px; padding: 14px; box-shadow: 0 4px 12px rgba(15,23,42,0.08); }
  .row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .pill { display: inline-block; background: #FEF2F2; color: #E51922; padding: 4px 10px; border-radius: 10px; font-size: 12px; font-weight: 800; }
  .label { font-size: 11px; color: #64748B; font-weight: 600; margin-top: 8px; }
  .val { font-size: 13px; font-weight: 700; color: #0F172A; }
  .call { display: inline-block; background: #10B981; color: #fff; text-decoration: none; padding: 8px 14px; border-radius: 10px; font-weight: 700; font-size: 13px; }
</style>
</head>
<body>
<header>
  <h1>NOW Thái Nguyên · Hành trình trực tiếp</h1>
  <span id="code">${trip.code}</span>
</header>
<div id="map"></div>
<div class="card">
  <div class="row">
    <span class="pill" id="status">Đang tải...</span>
    <span style="font-size:11px;color:#64748B" id="updated">Tự động cập nhật 5 giây/lần</span>
  </div>
  <div class="row" id="driverRow" style="display:none">
    <div>
      <div class="label" style="margin-top:0">Tài xế phụ trách</div>
      <div class="val" id="driverName"></div>
    </div>
    <a class="call" id="driverCall" href="#">Gọi tài xế</a>
  </div>
  <div class="label">Điểm đón</div>
  <div class="val" id="pickup"></div>
  <div class="label">Điểm trả</div>
  <div class="val" id="dropoff"></div>
</div>
<script>
  const LABELS = {
    SEARCHING: 'Đang tìm tài xế',
    ACCEPTED: 'Tài xế đang đến điểm đón',
    ARRIVED: 'Tài xế đã đến điểm đón',
    IN_PROGRESS: 'Đang trên đường đưa xe về',
    COMPLETED: 'Đã hoàn thành an toàn',
    CANCELLED: 'Chuyến đã hủy',
    NO_DRIVER: 'Chưa có tài xế'
  };
  const map = L.map('map').setView([21.5931, 105.8442], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc' }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  let fitted = false;

  function parsePts(str) {
    if (!str) return [];
    return str.split(';').map(p => p.split(',').map(Number)).filter(a => a.length === 2 && isFinite(a[0]) && isFinite(a[1]));
  }

  async function refresh() {
    try {
      const r = await fetch('/trips/share/${safeToken}');
      if (!r.ok) return;
      const t = await r.json();
      document.getElementById('status').textContent = LABELS[t.status] || t.status;
      document.getElementById('pickup').textContent = t.pickupAddress || '—';
      document.getElementById('dropoff').textContent = t.dropoffAddress || 'Chưa cố định';
      document.getElementById('updated').textContent = 'Cập nhật: ' + new Date().toLocaleTimeString('vi-VN');
      if (t.driver) {
        document.getElementById('driverRow').style.display = 'flex';
        document.getElementById('driverName').textContent = (t.driver.name || 'Tài xế NOW') + ' · ' + t.driver.phone;
        document.getElementById('driverCall').href = 'tel:' + t.driver.phone;
      }

      layer.clearLayers();
      const bounds = [];
      if (t.pickupLat != null) {
        L.circleMarker([t.pickupLat, t.pickupLng], { radius: 8, fillColor: '#16a34a', color: '#fff', weight: 3, fillOpacity: 1 })
          .bindTooltip('Đón', { permanent: true, direction: 'top' }).addTo(layer);
        bounds.push([t.pickupLat, t.pickupLng]);
      }
      if (t.dropoffLat != null) {
        L.circleMarker([t.dropoffLat, t.dropoffLng], { radius: 8, fillColor: '#E51922', color: '#fff', weight: 3, fillOpacity: 1 })
          .bindTooltip('Trả', { permanent: true, direction: 'top' }).addTo(layer);
        bounds.push([t.dropoffLat, t.dropoffLng]);
      }
      const planned = parsePts(t.routePolyline);
      const actual = parsePts(t.actualRoutePolyline);
      if (planned.length >= 2) {
        L.polyline(planned, { color: '#64748B', weight: 3.5, dashArray: '8,6', opacity: 0.7 }).addTo(layer);
        planned.forEach(p => bounds.push(p));
      }
      if (actual.length >= 2) {
        L.polyline(actual, { color: '#E51922', weight: 5, opacity: 0.95 }).addTo(layer);
        actual.forEach(p => bounds.push(p));
      }
      if (t.driver && t.driver.lat != null) {
        L.circleMarker([t.driver.lat, t.driver.lng], { radius: 10, fillColor: '#1D4ED8', color: '#fff', weight: 3, fillOpacity: 1 })
          .bindTooltip('Vị trí xe', { permanent: true, direction: 'bottom' }).addTo(layer);
        bounds.push([t.driver.lat, t.driver.lng]);
      }
      if (!fitted && bounds.length >= 2) { map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 }); fitted = true; }
      else if (!fitted && bounds.length === 1) { map.setView(bounds[0], 15); fitted = true; }
    } catch {}
  }
  refresh();
  setInterval(refresh, 5000);
</script>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(html);
  }
}
