import {useEffect,useRef,useState} from 'react';
import type {RefObject} from 'react';
import L from 'leaflet';
import type {Feature,FeatureCollection,MultiPolygon,Polygon} from 'geojson';

export type CityFeature=Feature<Polygon|MultiPolygon,{name:string;adcode:string;provinceCode:string}>;
type CityCollection=FeatureCollection<Polygon|MultiPolygon,CityFeature['properties']>;

export function useCityBoundaries(mapRef:RefObject<L.Map|null>,provinceCode:string,enabled:boolean,selected:CityFeature|null,onSelect:(city:CityFeature)=>void) {
  const [resource,setResource]=useState<{code:string;data:CityCollection}|null>(null);
  const layerRef=useRef<L.GeoJSON|null>(null),selectedCodeRef=useRef('');
  selectedCodeRef.current=selected?.properties.adcode||'';
  const style=(feature?:Feature)=>({color:feature?.properties?.adcode===selectedCodeRef.current?'#476f5d':'#7f9d8d',weight:feature?.properties?.adcode===selectedCodeRef.current?2:1,fillColor:'#a9c4ad',fillOpacity:feature?.properties?.adcode===selectedCodeRef.current ? 0.2 : 0.04});
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading'),[retryKey,setRetryKey]=useState(0);
  useEffect(()=>{
    if(!enabled||!provinceCode)return;
    const controller=new AbortController();setStatus('loading');setResource(null);
    fetch(`${import.meta.env.BASE_URL}assets/cities/${provinceCode}.geojson`,{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error('市界读取失败');return response.json() as Promise<CityCollection>;})
      .then(data=>{
        if(controller.signal.aborted)return;
        if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.some(f=>!f.properties?.name||f.properties.provinceCode!==provinceCode||!['Polygon','MultiPolygon'].includes(f.geometry?.type)))throw Error('市界格式错误');
        setResource({code:provinceCode,data});setStatus('ready');
      }).catch(error=>{if(!controller.signal.aborted)setStatus('error');});
    return()=>controller.abort();
  },[provinceCode,enabled,retryKey]);
  useEffect(()=>{
    const map=mapRef.current;
    if(!map||!enabled||!resource||resource.code!==provinceCode||status!=='ready')return;
    if(!map.getPane('city-boundaries'))map.createPane('city-boundaries').style.zIndex='2';
    const labels=L.layerGroup().addTo(map);
    const focus=(feature:CityFeature)=>{
      onSelect(feature);
    };
    const layer=L.geoJSON(resource.data,{
      pane:'city-boundaries',
      style,
      onEachFeature:(feature,path)=>{
        const city=feature as CityFeature;
        const tooltip=document.createElement('span');tooltip.textContent=city.properties.name;
        path.bindTooltip(tooltip,{sticky:true,direction:'top',className:'province-hover'});
        path.on('click',event=>{L.DomEvent.stopPropagation(event);focus(city);});
      },
    }).addTo(map);
    layerRef.current=layer;
    layer.eachLayer(path=>{
      const polygon=path as L.Polygon&{feature:CityFeature};
      const element=polygon.getElement();if(!element)return;
      element.setAttribute('role','button');element.setAttribute('tabindex','0');
      element.setAttribute('aria-label',`${polygon.feature.properties.name}，缩放至市界`);
      element.addEventListener('keydown',event=>{const key=(event as KeyboardEvent).key;if(key==='Enter'||key===' '){event.preventDefault();event.stopPropagation();focus(polygon.feature);}});
    });
    const drawLabels=()=>{
      labels.clearLayers();const occupied:L.Point[]=[];
      layer.eachLayer(path=>{
        const polygon=path as L.Polygon&{feature:CityFeature};const center=polygon.getCenter();
        if(!map.getBounds().contains(center))return;
        const point=map.latLngToLayerPoint(center);
        if(occupied.some(other=>Math.abs(other.x-point.x)<68&&Math.abs(other.y-point.y)<22))return;
        occupied.push(point);
        // Text is inserted through textContent, never interpreted as HTML.
        const text=document.createElement('span');text.textContent=polygon.feature.properties.name;
        L.marker(center,{interactive:false,keyboard:false,zIndexOffset:-1000,icon:L.divIcon({className:'city-map-label',html:text,iconSize:[120,20],iconAnchor:[60,10]})}).addTo(labels);
      });
    };
    const closeTooltips=()=>layer.eachLayer(path=>path.closeTooltip());
    drawLabels();map.on('moveend zoomend',drawLabels);map.on('movestart',closeTooltips);
    return()=>{map.off('moveend zoomend',drawLabels);map.off('movestart',closeTooltips);map.removeLayer(labels);map.removeLayer(layer);if(layerRef.current===layer)layerRef.current=null;};
  },[mapRef,resource,provinceCode,enabled,status,onSelect]);
  useEffect(()=>{layerRef.current?.setStyle(style);},[selected]);
  return {status,empty:resource?.code===provinceCode&&resource.data.features.length===0,retry:()=>setRetryKey(key=>key+1)};
}
