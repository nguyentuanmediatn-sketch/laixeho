import React, { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

interface Coord {
  lat: number;
  lng: number;
}

interface OsmMapViewProps {
  pickup: Coord;
  dropoff?: Coord | null;
  driver?: Coord | null;
  polyline?: string | null;
  actualPolyline?: string | null;
  height?: number;
  interactive?: boolean;
  hintText?: string;
  onSelectPickup?: (lat: number, lng: number) => void;
}

const LEAFLET_HTML = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>
  html, body, #map { margin: 0; padding: 0; width: 100%; height: 100%; }
  .hint { position: fixed; bottom: 8px; left: 8px; background: rgba(15,23,42,0.82); color: #fff; padding: 4px 9px; border-radius: 7px; font: 600 11px sans-serif; z-index: 999; pointer-events: none; }
</style>
</head>
<body>
<div id="map"></div>
<div id="hint" class="hint" style="display:none">Chạm bản đồ để chọn vị trí</div>
<script>
  var map = L.map('map', { zoomControl: true }).setView([21.5931, 105.8442], 15);
  L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc' }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var interactive = false;

  map.on('click', function(e) {
    if (!interactive) return;
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'pick',
      lat: Number(e.latlng.lat.toFixed(6)),
      lng: Number(e.latlng.lng.toFixed(6))
    }));
  });

  function parsePts(str) {
    if (!str) return [];
    return str.split(';').map(function(p){
      var a = p.split(',').map(Number);
      return (a.length === 2 && isFinite(a[0]) && isFinite(a[1])) ? a : null;
    }).filter(Boolean);
  }

  window.updateMap = function(state) {
    interactive = Boolean(state.interactive);
    var hintEl = document.getElementById('hint');
    hintEl.style.display = interactive ? 'block' : 'none';
    if (state.hintText) hintEl.textContent = state.hintText;

    layer.clearLayers();
    var bounds = [];

    if (state.pickup) {
      L.circleMarker([state.pickup.lat, state.pickup.lng], {
        radius: 9, fillColor: '#16a34a', color: '#fff', weight: 3, fillOpacity: 1
      }).bindTooltip('Đón', { permanent: true, direction: 'top' }).addTo(layer);
      bounds.push([state.pickup.lat, state.pickup.lng]);
    }
    if (state.dropoff) {
      L.circleMarker([state.dropoff.lat, state.dropoff.lng], {
        radius: 9, fillColor: '#E51922', color: '#fff', weight: 3, fillOpacity: 1
      }).bindTooltip('Trả', { permanent: true, direction: 'top' }).addTo(layer);
      bounds.push([state.dropoff.lat, state.dropoff.lng]);
    }

    var planned = parsePts(state.polyline);
    var actual = parsePts(state.actualPolyline);
    if (planned.length >= 2) {
      L.polyline(planned, {
        color: actual.length >= 2 ? '#64748B' : '#E51922',
        weight: actual.length >= 2 ? 3.5 : 4.5,
        dashArray: actual.length >= 2 ? '8, 7' : null,
        opacity: actual.length >= 2 ? 0.72 : 0.92
      }).addTo(layer);
      planned.forEach(function(pt){ bounds.push(pt); });
    }
    if (actual.length >= 2) {
      L.polyline(actual, { color: '#E51922', weight: 5, opacity: 0.96 }).addTo(layer);
      actual.forEach(function(pt){ bounds.push(pt); });
    }

    if (state.driver && state.driver.lat != null && state.driver.lng != null) {
      L.circleMarker([state.driver.lat, state.driver.lng], {
        radius: 10, fillColor: '#1D4ED8', color: '#fff', weight: 3, fillOpacity: 1
      }).bindTooltip('Tài xế NOW', { permanent: true, direction: 'bottom' }).addTo(layer);
      bounds.push([state.driver.lat, state.driver.lng]);
    }

    if (bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 16 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    }
  };
</script>
</body>
</html>`;

export function OsmMapView({
  pickup,
  dropoff,
  driver,
  polyline,
  actualPolyline,
  height = 240,
  interactive = false,
  hintText,
  onSelectPickup,
}: OsmMapViewProps) {
  const webRef = useRef<WebView | null>(null);
  const readyRef = useRef(false);

  const payload = useMemo(
    () => ({
      pickup,
      dropoff: dropoff || null,
      driver: driver || null,
      polyline: polyline || null,
      actualPolyline: actualPolyline || null,
      interactive,
      hintText: hintText || 'Chạm bản đồ để chỉnh điểm đón',
    }),
    [
      pickup.lat,
      pickup.lng,
      dropoff?.lat,
      dropoff?.lng,
      driver?.lat,
      driver?.lng,
      polyline,
      actualPolyline,
      interactive,
      hintText,
    ],
  );

  const syncMap = () => {
    if (!readyRef.current || !webRef.current) return;
    webRef.current.injectJavaScript(`window.updateMap(${JSON.stringify(payload)}); true;`);
  };

  useEffect(() => {
    syncMap();
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
          syncMap();
        }}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'pick' && onSelectPickup) {
              onSelectPickup(msg.lat, msg.lng);
            }
          } catch {
            // ignore
          }
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
