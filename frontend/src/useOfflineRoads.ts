import {useEffect,useState} from 'react';
import type {RefObject} from 'react';
import L from 'leaflet';
import type {FeatureCollection,LineString} from 'geojson';

type RoadCollection=FeatureCollection<LineString,{kind:'expressway'|'trunk';rank:number}>;

export function useOfflineRoads(mapRef:RefObject<L.Map|null>,provinceCode:string,enabled:boolean) {
  const scope=provinceCode||'overview';
  const [resource,setResource]=useState<{scope:string;data:RoadCollection}|null>(null);
  const [status,setStatus]=useState<'loading'|'ready'|'error'>('loading');
  const [retryKey,setRetryKey]=useState(0);
  useEffect(()=>{
    if(!enabled)return;
    const controller=new AbortController();setStatus('loading');setResource(null);
    fetch(`${import.meta.env.BASE_URL}assets/roads/${scope}.geojson`,{signal:controller.signal})
      .then(async response=>{if(!response.ok)throw Error('路网读取失败');return response.json() as Promise<RoadCollection>;})
      .then(data=>{
        if(controller.signal.aborted)return;
        if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||data.features.some(f=>f.geometry?.type!=='LineString'||!['expressway','trunk'].includes(f.properties?.kind)||!Number.isFinite(f.properties.rank)))throw Error('路网格式错误');
        setResource({scope,data});setStatus('ready');
      }).catch(()=>{if(!controller.signal.aborted)setStatus('error');});
    return()=>controller.abort();
  },[scope,enabled,retryKey]);
  useEffect(()=>{
    const map=mapRef.current;if(!map||!enabled||!resource||resource.scope!==scope||status!=='ready')return;
    if(!map.getPane('offline-roads')){const pane=map.createPane('offline-roads');pane.style.zIndex='3';pane.style.pointerEvents='none';}
    const renderer=L.canvas({pane:'offline-roads',padding:0.3});
    const group=L.layerGroup().addTo(map);
    const draw=()=>{
      group.clearLayers();const zoom=map.getZoom();
      const data:RoadCollection={type:'FeatureCollection',features:resource.data.features.filter(f=>zoom>=7||f.properties.rank<=(zoom>=5?4:3))};
      const width=zoom>=10?2.6:zoom>=6?1.8:1;
      const options={pane:'offline-roads',renderer,interactive:false,bubblingMouseEvents:false};
      L.geoJSON(data,{...options,style:f=>({color:'#fffdf6',weight:(f?.properties.kind==='expressway'?width:width*0.7)+1.2,opacity:0.85,lineCap:'round'})}).addTo(group);
      L.geoJSON(data,{...options,style:f=>({color:f?.properties.kind==='expressway'?'#d5a267':'#c5bb9b',weight:f?.properties.kind==='expressway'?width:width*0.7,opacity:0.9,lineCap:'round'})}).addTo(group);
    };
    draw();map.on('zoomend',draw);
    return()=>{map.off('zoomend',draw);map.removeLayer(group);if(map.hasLayer(renderer))map.removeLayer(renderer);};
  },[mapRef,enabled,resource,scope,status]);
  return {status:resource?.scope===scope?status:status==='error'?'error':'loading',empty:resource?.scope===scope&&resource.data.features.length===0,retry:()=>setRetryKey(key=>key+1)};
}
