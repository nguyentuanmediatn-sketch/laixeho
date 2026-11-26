import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Coord {
  lat: number;
  lng: number;
}

interface OsmMapPickerProps {
  pickup?: Coord | null;
  dropoff?: Coord | null;
  polyline?: string | null;
  actualPolyline?: string | null;
  height?: number;
  onMapClick?: (lat: number, lng: number) => void;
}

function parsePolyline(polyline?: string | null): [number, number][] {
  if (!polyline) return [];
  return polyline
    .split(';')
    .map((pair) => pair.split(',').map(Number))
    .filter((p) => p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) as [
    number,
    number,
  ][];
}

export function OsmMapPicker({
  pickup,
  dropoff,
  polyline,
  actualPolyline,
  height = 300,
  onMapClick,
}: OsmMapPickerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const clickHandlerRef = useRef(onMapClick);
  clickHandlerRef.current = onMapClick;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    // Mặc định trung tâm TP. Thái Nguyên (Quảng trường Võ Nguyên Giáp)
    const center: [number, number] = pickup ? [pickup.lat, pickup.lng] : [21.5931, 105.8442];
    const map = L.map(containerRef.current, { zoomControl: true }).setView(center, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      subdomains: 'abc',
      maxZoom: 19,
    }).addTo(map);
    const group = L.layerGroup().addTo(map);
    map.on('click', (e: L.LeafletMouseEvent) => {
      clickHandlerRef.current?.(
        Number(e.latlng.lat.toFixed(6)),
        Number(e.latlng.lng.toFixed(6)),
      );
    });
    mapRef.current = map;
    layerGroupRef.current = group;

    return () => {
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;
    group.clearLayers();

    const bounds: [number, number][] = [];

    if (pickup) {
      L.circleMarker([pickup.lat, pickup.lng], {
        radius: 9,
        fillColor: '#16a34a',
        color: '#ffffff',
        weight: 3,
        fillOpacity: 1,
      })
        .bindTooltip('Điểm đón', { permanent: true, direction: 'top' })
        .addTo(group);
      bounds.push([pickup.lat, pickup.lng]);
    }

    if (dropoff) {
      L.circleMarker([dropoff.lat, dropoff.lng], {
        radius: 9,
        fillColor: '#E51922',
        color: '#ffffff',
        weight: 3,
        fillOpacity: 1,
      })
        .bindTooltip('Điểm trả', { permanent: true, direction: 'top' })
        .addTo(group);
      bounds.push([dropoff.lat, dropoff.lng]);
    }

    const pts = parsePolyline(polyline);
    const actualPts = parsePolyline(actualPolyline);
    if (pts.length >= 2) {
      L.polyline(pts, {
        color: actualPts.length >= 2 ? '#2563EB' : '#E51922',
        weight: actualPts.length >= 2 ? 3.5 : 4.5,
        dashArray: actualPts.length >= 2 ? '8, 6' : undefined,
        opacity: actualPts.length >= 2 ? 0.7 : 0.9,
      }).addTo(group);
      bounds.push(...pts);
    }
    if (actualPts.length >= 2) {
      L.polyline(actualPts, { color: '#E51922', weight: 5, opacity: 0.95 }).addTo(group);
      bounds.push(...actualPts);
    }

    if (bounds.length >= 2) {
      map.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
    } else if (bounds.length === 1) {
      map.setView(bounds[0], 15);
    }
  }, [pickup?.lat, pickup?.lng, dropoff?.lat, dropoff?.lng, polyline, actualPolyline]);

  return (
    <div
      ref={containerRef}
      style={{ height }}
      className="w-full rounded-xl overflow-hidden border border-slate-200 z-0"
    />
  );
}
