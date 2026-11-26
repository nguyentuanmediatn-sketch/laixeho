import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface Coord {
  lat: number;
  lng: number;
}

const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
  .legend {
    position: fixed; bottom: 8px; left: 8px; z-index: 999; pointer-events: none;
    background: rgba(255,255,255,0.92); padding: 4px 8px; border-radius: 8px;
    font: 600 10px sans-serif; color: #0F172A; display: flex; gap: 8px;
    box-shadow: 0 2px 6px rgba(0,0,0,0.12);
  }
  .lg-item { display: inline-flex; align-items: center; gap: 4px; }
  .lg-line { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
</style>
</head>
<body>
<div id="map"></div>
<div id="legend" class="legend" style="display:none"></div>
<script>
  var map = L.map('map', { zoomControl: true }).setView([21.5931, 105.8442], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc' }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var hasAutoFit = false;
  var lastMode = '';

  function parsePts(str) {
    if (!str) return [];
    return str.split(';').map(function(p){
      var a = p.split(',').map(Number);
      return (a.length === 2 && isFinite(a[0]) && isFinite(a[1])) ? a : null;
    }).filter(Boolean);
  }

  window.updateMap = function(state) {
    layer.clearLayers();
    var bounds = [];
    var legendItems = [];

    if (state.pickup) {
      L.circleMarker([state.pickup.lat, state.pickup.lng], {
        radius: 9, fillColor: '#16a34a', color: '#fff', weight: 3, fillOpacity: 1
      }).bindTooltip('Điểm đón', { permanent: true, direction: 'top' }).addTo(layer);
      bounds.push([state.pickup.lat, state.pickup.lng]);
    }
    if (state.dropoff) {
      L.circleMarker([state.dropoff.lat, state.dropoff.lng], {
        radius: 9, fillColor: '#E51922', color: '#fff', weight: 3, fillOpacity: 1
      }).bindTooltip('Điểm trả', { permanent: true, direction: 'top' }).addTo(layer);
      bounds.push([state.dropoff.lat, state.dropoff.lng]);
    }

    // 1. Tuyến dự kiến (Điểm đón -> Điểm trả)
    var planned = parsePts(state.polyline);
    if (planned.length >= 2) {
      var isSubtle = state.mode === 'TO_PICKUP' || state.mode === 'IN_PROGRESS';
      L.polyline(planned, {
        color: isSubtle ? '#64748B' : '#E51922',
        weight: isSubtle ? 3.5 : 4.5,
        dashArray: isSubtle ? '8, 7' : null,
        opacity: isSubtle ? 0.72 : 0.92
      }).addTo(layer);
      if (state.mode !== 'TO_PICKUP') {
        planned.forEach(function(pt){ bounds.push(pt); });
      }
      if (state.mode === 'IN_PROGRESS') {
        legendItems.push('<span class="lg-item"><span class="lg-line" style="background:#64748B"></span>Dự kiến</span>');
      }
    }

    // 2. Tuyến dẫn đường trực tiếp từ vị trí thật Tài xế -> Điểm đón / Điểm trả
    var navPts = parsePts(state.navPolyline);
    if (navPts.length >= 2) {
      L.polyline(navPts, {
        color: '#2563EB',
        weight: 5.5,
        opacity: 0.92
      }).addTo(layer);
      navPts.forEach(function(pt){ bounds.push(pt); });
      legendItems.push('<span class="lg-item"><span class="lg-line" style="background:#2563EB"></span>' + (state.mode === 'TO_PICKUP' ? 'Đường đến đón' : 'Đường tới đích') + '</span>');
    }

    // 3. Đường đi THỰC TẾ của chuyến đi (từ sau khi nhận xe & bắt đầu chạy)
    var actualPts = parsePts(state.actualPolyline);
    if (actualPts.length >= 2) {
      L.polyline(actualPts, {
        color: '#E51922',
        weight: 5.5,
        opacity: 0.98
      }).addTo(layer);
      actualPts.forEach(function(pt){ bounds.push(pt); });
      legendItems.push('<span class="lg-item"><span class="lg-line" style="background:#E51922"></span>Đường đi thực tế</span>');
    }

    // 4. Vị trí GPS thật của tài xế (halo + chấm xanh nổi bật trên cùng)
    if (state.driver && isFinite(state.driver.lat) && isFinite(state.driver.lng)) {
      L.circleMarker([state.driver.lat, state.driver.lng], {
        radius: 16, fillColor: '#2563EB', color: '#2563EB', weight: 1, fillOpacity: 0.22
      }).addTo(layer);
      L.circleMarker([state.driver.lat, state.driver.lng], {
        radius: 8, fillColor: '#1D4ED8', color: '#fff', weight: 3, fillOpacity: 1
      }).bindTooltip('Vị trí bạn', { permanent: true, direction: 'bottom' }).addTo(layer);
      bounds.push([state.driver.lat, state.driver.lng]);
    }

    var lgEl = document.getElementById('legend');
    if (legendItems.length > 0) {
      lgEl.innerHTML = legendItems.join('');
      lgEl.style.display = 'flex';
    } else {
      lgEl.style.display = 'none';
    }

    if (state.followDriver && state.driver && isFinite(state.driver.lat)) {
      map.setView([state.driver.lat, state.driver.lng], Math.max(map.getZoom(), 16));
      hasAutoFit = true;
      lastMode = state.mode || '';
      return;
    }

    if (!hasAutoFit || lastMode !== (state.mode || '') || state.forceFit) {
      if (bounds.length >= 2) {
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
        hasAutoFit = true;
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 16);
        hasAutoFit = true;
      }
      lastMode = state.mode || '';
    }
  };
</script>
</body>
</html>`;

export function DriverOsmMap({
  pickup,
  dropoff,
  driver,
  polyline,
  navPolyline,
  actualPolyline,
  mode = 'IDLE',
  followDriver = false,
  height = 220,
}: {
  pickup?: Coord | null;
  dropoff?: Coord | null;
  driver?: Coord | null;
  polyline?: string | null;
  navPolyline?: string | null;
  actualPolyline?: string | null;
  mode?: 'TO_PICKUP' | 'ARRIVED' | 'IN_PROGRESS' | 'IDLE';
  followDriver?: boolean;
  height?: number;
}) {
  const webRef = useRef<WebView | null>(null);
  const readyRef = useRef(false);

  const payload = useMemo(
    () => ({
      pickup: pickup || null,
      dropoff: dropoff || null,
      driver: driver || null,
      polyline: polyline || null,
      navPolyline: navPolyline || null,
      actualPolyline: actualPolyline || null,
      mode,
      followDriver,
    }),
    [
      pickup?.lat,
      pickup?.lng,
      dropoff?.lat,
      dropoff?.lng,
      driver?.lat,
      driver?.lng,
      polyline,
      navPolyline,
      actualPolyline,
      mode,
      followDriver,
    ],
  );

  const sync = () => {
    if (!readyRef.current || !webRef.current) return;
    webRef.current.injectJavaScript(`window.updateMap(${JSON.stringify(payload)}); true;`);
  };

  useEffect(() => {
    sync();
  }, [payload]);

  return (
    <View style={[styles.wrap, { height }]}>
      <WebView
        ref={webRef}
        originWhitelist={['*']}
        source={{ html: LEAFLET_HTML, baseUrl: 'https://laixeho.local' }}
        javaScriptEnabled
        domStorageEnabled
        scrollEnabled={false}
        onLoadEnd={() => {
          readyRef.current = true;
          sync();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F1F5F9',
  },
});
