import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { ChevronRight, Home, Layers3, MapPin, Minus, Plus, RotateCcw } from 'lucide-react';
import {PROVINCES} from './model';
import type { Photo, Place } from './model';
import 'leaflet/dist/leaflet.css';
import './map.css';
import {api} from './api';
import type {GeographyState} from './components/GeographyPanel';
import {watchTileRecovery} from './tileRecovery';
import {useCityBoundaries} from './useCityBoundaries';
import type {CityFeature} from './useCityBoundaries';
import {usePlaceMarkers} from './usePlaceMarkers';
import MapPlaceList from './components/MapPlaceList';

interface TravelMapProps {
  places: Place[];
  photos: Photo[];
  province: string;
  onProvinceChange: (province: string) => void;
  onPlaceClick: (id: string) => void;
  pickMode?: boolean;
  onPick?: (lat: number, lng: number) => void;
  selectedPoint?: { lat: number; lng: number } | null;
  compact?: boolean;
}

type ProvinceProperties = { name?: string; fullname?: string; adcode?: string | number; id?: string | number };
type ProvinceFeature = Feature<Geometry, ProvinceProperties>;
type ProvinceCollection = FeatureCollection<Geometry, ProvinceProperties>;

// 地图保持完整边界数据；全国初始视野以大陆、港澳台及海南为中心。
const nationalBounds = L.latLngBounds([[17.5, 73], [54, 135.5]]);

function provinceName(name: string): string {
  return name.replace(/特别行政区$|维吾尔自治区$|壮族自治区$|回族自治区$|自治区$|省$|市$/g, '');
}

function featureName(feature?: ProvinceFeature): string {
  return provinceName(feature?.properties?.name ?? feature?.properties?.fullname ?? '');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function getProvinceSummary(name: string, places: Place[], photos: Photo[]) {
  const provincePlaces = places.filter((place) => provinceName(place.province) === name);
  const placeIds = new Set(provincePlaces.map((place) => place.id));
  return {
    placeCount: provincePlaces.length,
    photoCount: provincePlaces.reduce((count, place) => count + place.photoCount, 0),
  };
}

function provinceTooltip(name: string, places: Place[], photos: Photo[]): string {
  const { placeCount, photoCount } = getProvinceSummary(name, places, photos);
  if (!placeCount) return escapeHtml(name);
  return `<div class="province-hover-details"><strong>${escapeHtml(name)}</strong><span>${placeCount} 个旅行地点 · ${photoCount} 张照片</span><small>点击查看省内地点</small></div>`;
}

function getProvinceBounds(feature: ProvinceFeature): L.LatLngBounds {
  const layer = L.geoJSON(feature);
  const bounds = layer.getBounds();
  // 海南附属海域不影响岛屿视野，全部边界仍留在原始图层内。
  if (featureName(feature) === '海南') return L.latLngBounds([[17.8, 108.4], [20.5, 111.4]]);
  return bounds;
}

function fitProvince(map:L.Map,feature:ProvinceFeature,compact:boolean) {
  map.stop().fitBounds(getProvinceBounds(feature),{padding:compact?[24,24]:[28,32],maxZoom:compact?6:12,animate:false});
}

export default function TravelMap(props: TravelMapProps) {
  const { places, photos, province, pickMode = false, selectedPoint = null, compact = false } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const provincesRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const labelsRef = useRef<L.LayerGroup | null>(null);
  const pickedRef = useRef<L.LayerGroup | null>(null);
  const latestRef = useRef(props);
  latestRef.current = props;
  const [data, setData] = useState<ProvinceCollection | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [pickOverview, setPickOverview] = useState(false);
  const [geography,setGeography]=useState<GeographyState|null>(null);
  const [online,setOnline]=useState(false),[onlineError,setOnlineError]=useState('');
  const onlineRef=useRef(false);onlineRef.current=online;
  const [city,setCity]=useState<CityFeature|null>(null);
  const provinceCode=PROVINCES.find(item=>item[0]===provinceName(province))?.[1]||'';
  const cityBoundaries=useCityBoundaries(mapRef,provinceCode,!pickMode&&!!province,city,setCity);
  const mappedPlaces=usePlaceMarkers(mapRef,places,province,!pickMode&&!!data,city?.properties.adcode||'',props.onPlaceClick);
  useEffect(()=>setCity(null),[province]);

  useEffect(()=>{let active=true;api<GeographyState>('/geography/status').then(value=>{if(active)setGeography(value);}).catch(()=>{if(active)setOnlineError('地图配置读取失败，基础地图仍可使用');});return()=>{active=false;};},[]);

  useEffect(() => setPickOverview(false), [province]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      minZoom: 2,
      maxZoom: 18,
      zoomSnap: 0.25,
      zoomDelta: 0.5,
      scrollWheelZoom: true,
      keyboard: true,
      doubleClickZoom: true,
    });
    mapRef.current = map;
    map.fitBounds(nationalBounds, { padding: [22, 18], animate: false });
    markersRef.current = L.layerGroup().addTo(map);
    labelsRef.current = L.layerGroup().addTo(map);
    pickedRef.current = L.layerGroup().addTo(map);
    const handleClick = (event: L.LeafletMouseEvent) => {
      if (latestRef.current.pickMode) latestRef.current.onPick?.(event.latlng.lat, event.latlng.lng);
    };
    map.on('click', handleClick);
    const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
      provincesRef.current = null;
      markersRef.current = null;
      labelsRef.current = null;
      pickedRef.current = null;
    };
  }, []);

  useEffect(()=>{
    const map=mapRef.current;if(!map||!online)return;
    // Leaflet 1.9 checks CRS.wrapLng when validating tiles, even with noWrap.
    // A wide viewport can cross 180° and otherwise request x >= 2^z. Explicit
    // bounds clip those tiles without changing the user's zoom or world-wrapping.
    const bounds=L.latLngBounds([[-85.0511287798,-180],[85.0511287798,180]]);
    const layers=['vec','cva'].map(layer=>L.tileLayer(`/api/geography/tiles/${layer}/{z}/{x}/{y}`,{minZoom:1,maxZoom:18,noWrap:true,bounds,keepBuffer:1,updateWhenIdle:true}));
    let failed=false;
    const fallback=()=>{if(!failed){failed=true;setOnline(false);setOnlineError('在线地图暂不可用，已切回基础地图；地点和照片仍可使用');}};
    const recovery=layers.map(layer=>watchTileRecovery(layer,fallback));
    const reset=()=>recovery.forEach(item=>item.reset());
    map.on('movestart',reset);
    layers.forEach(layer=>layer.addTo(map));
    return()=>{
      map.off('movestart',reset);
      recovery.forEach(item=>item.dispose());
      layers.forEach(layer=>map.removeLayer(layer));
    };
  },[online]);

  useEffect(() => {
    const controller = new AbortController();
    setLoadState('loading');
    fetch(`${import.meta.env.BASE_URL}assets/china-provinces.geojson`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('地图数据读取失败');
        return response.json();
      })
      .then((value: ProvinceCollection) => {
        if (value.type !== 'FeatureCollection' || !Array.isArray(value.features) || value.features.length === 0) {
          throw new Error('地图数据格式不正确');
        }
        setData(value);
        setLoadState('ready');
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError')) setLoadState('error');
      });
    return () => controller.abort();
  }, [retryKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    if (provincesRef.current) map.removeLayer(provincesRef.current);
    const layer = L.geoJSON(data, {
      style: (feature) => {
        const name = featureName(feature as ProvinceFeature);
        const active = provinceName(latestRef.current.province) === name;
        const visited = latestRef.current.places.some((place) => provinceName(place.province) === name);
        return { color: active ? '#7e9d8a' : '#fafbf8', weight: active ? 1.5 : 1.1, fillColor: active ? '#adc6af' : visited ? '#cedbc9' : '#e1e5d9', fillOpacity: onlineRef.current?.12:1 };
      },
      onEachFeature: (feature, featureLayer) => {
        const name = featureName(feature);
        if (!name) return;
        featureLayer.on('click', (event: L.LeafletMouseEvent) => {
          if (latestRef.current.pickMode) {
            setPickOverview(false);
            latestRef.current.onProvinceChange(name);
            latestRef.current.onPick?.(event.latlng.lat, event.latlng.lng);
            L.DomEvent.stopPropagation(event);
            return;
          }
          setCity(null);
          latestRef.current.onProvinceChange(name);
          fitProvince(map,feature,!!latestRef.current.compact);
          L.DomEvent.stopPropagation(event);
        });
        featureLayer.bindTooltip(() => {
          const current = latestRef.current;
          return current.pickMode ? escapeHtml(name) : provinceTooltip(name, current.places, current.photos);
        }, { sticky: true, direction: 'top', className: 'province-hover' });
        featureLayer.on('mouseover', () => {
          if (!latestRef.current.pickMode) (featureLayer as L.Path).setStyle({ color: '#91a98c', weight: 1.8 });
        });
        featureLayer.on('mouseout', () => layer.resetStyle(featureLayer as L.Path));
      },
    }).addTo(map);
    if(!pickMode)layer.eachLayer(item=>{
      const polygon=item as L.Polygon&{feature:ProvinceFeature};const element=polygon.getElement();if(!element)return;
      const name=featureName(polygon.feature);element.setAttribute('role','button');element.setAttribute('tabindex','0');
      element.setAttribute('aria-label',`${name}，查看省内市界和地点`);
      element.addEventListener('keydown',event=>{const key=(event as KeyboardEvent).key;if(key==='Enter'||key===' '){event.preventDefault();event.stopPropagation();setCity(null);latestRef.current.onProvinceChange(name);fitProvince(map,polygon.feature,!!latestRef.current.compact);}});
    });
    provincesRef.current = layer;
    return () => {
      map.removeLayer(layer);
      if (provincesRef.current === layer) provincesRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !data) return;
    const selected = data.features.find((feature) => featureName(feature) === provinceName(province));
    if (selected && !(pickMode && pickOverview)) {
      fitProvince(map,selected,compact);
    } else {
      map.fitBounds(nationalBounds, { padding: compact ? [24, 18] : [28, 22], animate: false });
    }
  }, [data, province, compact, pickMode, pickOverview]);

  useEffect(() => {
    provincesRef.current?.resetStyle();
  }, [data, province, places,online]);

  useEffect(() => {
    const map = mapRef.current;
    const markerGroup = markersRef.current;
    const labelGroup = labelsRef.current;
    if (!map || !data || !markerGroup || !labelGroup) return;
    const draw = () => {
      markerGroup.clearLayers();
      labelGroup.clearLayers();
      const selectedProvince = provinceName(province);
      // 全国地图只展示省份；选择省份后才展示该省的地点封面。
      const visiblePlaces = province && !(pickMode && pickOverview)
        ? places.filter((place) => provinceName(place.province) === selectedProvince)
        : [];
      for (const place of pickMode?visiblePlaces:[]) {
        const cover = place.coverSrc;
        const count = place.photoCount;
        const accessibleName = `${place.name}，${count} 张照片，打开相册`;
        const body = cover
          ? `<span class="place-photo-frame"><img src="${escapeHtml(cover)}" alt="" draggable="false" /><span class="place-pin-count">${count}</span></span>`
          : '<span class="place-empty-pin"><span></span></span>';
        const icon = L.divIcon({
          className: 'travel-place-marker',
          iconSize: [56, 68],
          iconAnchor: [28, 58],
          html: `<span class="place-marker-body">${body}<span class="place-pin-label">${escapeHtml(place.name)}</span></span>`,
        });
        const marker = L.marker([place.lat, place.lng], { icon, title: accessibleName, alt: accessibleName, keyboard: true, riseOnHover: true });
        marker.on('click', (event) => {
          L.DomEvent.stopPropagation(event);
          if (pickMode) latestRef.current.onPick?.(place.lat, place.lng);
          else latestRef.current.onPlaceClick(place.id);
        });
        marker.addTo(markerGroup);
        const element = marker.getElement();
        if (element) {
          element.setAttribute('role', 'button');
          element.setAttribute('aria-label', accessibleName);
          element.addEventListener('keydown', (event) => {
            if (event.key === ' ') { event.preventDefault(); marker.fire('click'); }
          });
        }
      }
      if (!compact) {
        const overview = !province && !pickMode;
        const footprintLabels = overview ? data.features.flatMap((feature) => {
          const name = featureName(feature);
          const summary = getProvinceSummary(name, places, photos);
          return summary.placeCount ? [{
            name,
            point: map.latLngToLayerPoint(getProvinceBounds(feature).getCenter()),
            width: name.length * 11 + 48,
          }] : [];
        }) : [];
        for (const feature of data.features) {
          const name = featureName(feature);
          if (!name) continue;
          const summary = getProvinceSummary(name, places, photos);
          const showFootprint = overview && summary.placeCount > 0;
          if (!showFootprint && ['北京', '天津', '上海', '香港', '澳门', '台湾'].includes(name)) continue;
          if (province && (name !== selectedProvince||!pickMode)) continue;
          const center = getProvinceBounds(feature).getCenter();
          if (showFootprint) {
            const width = name.length * 11 + 48;
            const accessibleName = `${name}，${summary.placeCount} 个旅行地点，${summary.photoCount} 张照片，查看省内地点`;
            const marker = L.marker(center, {
              title: accessibleName,
              alt: accessibleName,
              keyboard: true,
              riseOnHover: true,
              icon: L.divIcon({
                className: 'province-footprint-label',
                iconSize: [width, 24],
                iconAnchor: [width / 2, 12],
                html: `<span class="province-footprint"><span class="province-footprint-dot"></span><span class="province-footprint-name">${escapeHtml(name)}</span><span class="province-footprint-count">${summary.placeCount}处</span></span>`,
              }),
            });
            marker.bindTooltip(() => {
              const current = latestRef.current;
              return provinceTooltip(name, current.places, current.photos);
            }, { direction: 'top', offset: [0, -10], className: 'province-hover' });
            marker.on('click', (event) => {
              L.DomEvent.stopPropagation(event);
              latestRef.current.onProvinceChange(name);
            });
            marker.addTo(labelGroup);
            const element = marker.getElement();
            if (element) {
              element.setAttribute('role', 'button');
              element.setAttribute('aria-label', accessibleName);
              element.addEventListener('keydown', (event) => {
                if (event.key === ' ') { event.preventDefault(); marker.fire('click'); }
              });
            }
            continue;
          }
          // 给足迹标签留出文字间距，避免挤住相邻省份的名称。
          const point = map.latLngToLayerPoint(center);
          const overlapsFootprint = footprintLabels.some((label) =>
            Math.abs(label.point.x - point.x) < (label.width + name.length * 11) / 2 + 3
            && Math.abs(label.point.y - point.y) < 22);
          if (overlapsFootprint) continue;
          const nearby = visiblePlaces.some((place) => map.latLngToLayerPoint([place.lat, place.lng]).distanceTo(map.latLngToLayerPoint(center)) < 66);
          if (nearby) continue;
          L.marker(center, {
            interactive: false,
            keyboard: false,
            icon: L.divIcon({ className: 'province-map-label', iconSize: [70, 20], iconAnchor: [35, 10], html: `<span>${escapeHtml(name)}</span>` }),
          }).addTo(labelGroup);
        }
      }
    };
    draw();
    map.on('zoomend', draw);
    return () => {
      map.off('zoomend', draw);
      markerGroup.clearLayers();
      labelGroup.clearLayers();
    };
  }, [data, places, photos, province, compact, pickMode, pickOverview]);

  useEffect(() => {
    const group = pickedRef.current;
    if (!group) return;
    group.clearLayers();
    if (selectedPoint && Number.isFinite(selectedPoint.lat) && Number.isFinite(selectedPoint.lng)
      && Math.abs(selectedPoint.lat) <= 90 && Math.abs(selectedPoint.lng) <= 180) {
      L.marker([selectedPoint.lat, selectedPoint.lng], {
        icon: L.divIcon({ className: 'picked-point-marker', iconSize: [24, 24], iconAnchor: [12, 12], html: '<span></span>' }),
        title: '已选择的位置',
        zIndexOffset: 1000,
        keyboard: false,
        interactive: false,
      }).addTo(group);
      if(pickMode)mapRef.current?.panTo([selectedPoint.lat,selectedPoint.lng],{animate:false});
    }
  }, [selectedPoint?.lat,selectedPoint?.lng,data,pickMode]);

  const resetNationalView = () => {
    setCity(null);
    mapRef.current?.fitBounds(nationalBounds, { padding: compact ? [24, 18] : [28, 22], animate: false });
    // 选点时的全国视野只是导航操作，不能清空地点表单的所属省份。
    if (pickMode) setPickOverview(true);
    else props.onProvinceChange('');
  };
  const breadcrumbProvince = pickMode && pickOverview ? '' : province;
  const resetProvinceView=()=>{
    setCity(null);
    const feature=data?.features.find(item=>featureName(item)===provinceName(province));
    if(feature&&mapRef.current)fitProvince(mapRef.current,feature,compact);
  };

  return (
    <div className="travel-map-frame">
    <div className={`travel-map ${compact ? 'travel-map-compact' : ''} ${pickMode ? 'travel-map-picking' : ''}`}>
      <div ref={containerRef} className="travel-map-canvas" role="region" aria-label={pickMode ? '选择地点位置的地图' : '旅行地图，点击省份或地点浏览照片'} />
      <div className="travel-map-topline">
        <nav className="map-breadcrumb" aria-label="地图位置">
          <button type="button" onClick={resetNationalView} title="回到全国地图"><Home size={13} />中国</button>
          {breadcrumbProvince && <><ChevronRight size={12} /><button type="button" onClick={resetProvinceView} aria-label={`查看${provinceName(breadcrumbProvince)}全省`}>{provinceName(breadcrumbProvince)}</button></>}
          {!pickMode&&city&&<><ChevronRight size={12}/><span>{city.properties.name}</span></>}
        </nav>
        {!compact && <span className="map-offline-badge"><Layers3 size={12} />{online?'在线地图 · 天地图':'基础地图 · 离线可用'}</span>}
      </div>
      <div className="map-zoom-controls" aria-label="地图缩放">
        <button type="button" aria-label="放大地图" onClick={() => mapRef.current?.zoomIn()}><Plus size={17} /></button>
        <button type="button" aria-label="缩小地图" onClick={() => mapRef.current?.zoomOut()}><Minus size={17} /></button>
        <button type="button" aria-label="回到全国地图" onClick={resetNationalView}><RotateCcw size={14} /></button>
      </div>
      <div className="map-online-control"><button type="button" disabled={!geography?.configured||geography.offline} onClick={()=>{setOnlineError('');setOnline(!online);}}>{online?'切回基础地图':'在线地图'}</button>{!geography?.configured&&<span>未配置 Key · 基础地图可用</span>}</div>
      {onlineError&&<div className="map-online-error" role="status">{onlineError}</div>}
      {!pickMode&&province&&<div className="map-city-status" role="status">{cityBoundaries.status==='loading'?'正在读取本地市界…':cityBoundaries.status==='error'?<>市界未能加载，省份和地点仍可浏览。<button type="button" onClick={cityBoundaries.retry}>重试</button></>:cityBoundaries.empty?'当前资源未提供该区域的下级市界':city?'点击省份名称返回全省，或选择其他市界':'点击市界放大 · 仅用于地图浏览'}</div>}
      {!compact && <div className="map-legend"><span className="map-legend-visited" />留下回忆的省份<span className="map-legend-rest" />待出发{!province && !pickMode && places.length > 0 && <em>数字为旅行地点数</em>}</div>}
      <div className="map-source-note">{online&&<><a href="https://www.tianditu.gov.cn/" target="_blank" rel="noreferrer">© 天地图</a> · 在线底图 / </>}Natural Earth · 基础省界演示{!pickMode&&province?' · cn-atlas/CTAmap 市界示意':''}</div>
      {pickMode && loadState === 'ready' && <div className="map-pick-tip"><MapPin size={13} />点击地图，选择地点位置</div>}
      {loadState !== 'ready' && <div className="map-status" role={loadState === 'error' ? 'alert' : 'status'}>
        <MapPin size={24} />
        <strong>{loadState === 'loading' ? '正在加载离线地图' : '地图数据未能加载'}</strong>
        <span>{loadState === 'loading' ? '读取本地省份边界…' : '请检查本地地图资源，地点列表仍可继续使用。'}</span>
        {loadState === 'error' && <button type="button" onClick={() => setRetryKey((value) => value + 1)}>重新加载</button>}
      </div>}
    </div>
    {!pickMode&&<MapPlaceList places={mappedPlaces.openPlaces} onClose={mappedPlaces.closePlaces} onSelect={props.onPlaceClick}/>}
    </div>
  );
}
