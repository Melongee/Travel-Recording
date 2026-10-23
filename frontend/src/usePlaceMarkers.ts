import {useEffect,useRef,useState} from 'react';
import type {RefObject} from 'react';
import L from 'leaflet';
import type {Place} from './model';
import {groupPlaceMarkers} from './placeClusters';

export function usePlaceMarkers(mapRef:RefObject<L.Map|null>,places:Place[],province:string,enabled:boolean,viewKey:string,onPlaceClick:(id:string)=>void) {
  const [openIds,setOpenIds]=useState<string[]>([]);
  const actionRef=useRef(onPlaceClick);actionRef.current=onPlaceClick;
  useEffect(()=>setOpenIds([]),[province,enabled,viewKey]);
  useEffect(()=>{
    const map=mapRef.current;if(!map||!enabled||!province)return;
    const group=L.layerGroup().addTo(map),visible=places.filter(place=>place.province===province);
    const draw=()=>{
      group.clearLayers();
      const clusters=groupPlaceMarkers(visible,place=>map.latLngToLayerPoint([place.lat,place.lng]));
      for(const cluster of clusters) {
        const multiple=cluster.items.length>1,place=cluster.items[0];
        const body=document.createElement('span');body.className=multiple?'place-cluster-body':'place-marker-body';
        if(multiple) {
          const covers=document.createElement('span');covers.className='place-cluster-covers';
          for(const member of cluster.items.filter(item=>item.coverSrc).slice(0,2)) {
            const image=document.createElement('img');image.src=member.coverSrc!;image.alt='';image.draggable=false;covers.append(image);
          }
          body.append(covers);
          const count=document.createElement('strong');count.textContent=`${cluster.items.length}处`;body.append(count);
        }else {
          const frame=document.createElement('span');frame.className=place.coverSrc?'place-photo-frame':'place-empty-pin';
          if(place.coverSrc){const image=document.createElement('img');image.src=place.coverSrc;image.alt='';image.draggable=false;frame.append(image);}else frame.append(document.createElement('span'));
          if(place.coverSrc){const count=document.createElement('span');count.className='place-pin-count';count.textContent=String(place.photoCount);frame.append(count);}body.append(frame);
        }
        const name=multiple?`附近 ${cluster.items.length} 个地点，查看列表并放大`:`${place.name}，${place.photoCount} 张照片，打开相册`;
        const marker=L.marker(map.layerPointToLatLng(L.point(cluster.x,cluster.y)),{icon:L.divIcon({className:multiple?'travel-place-cluster':'travel-place-marker',html:body,iconSize:multiple?[60,54]:[56,50],iconAnchor:multiple?[30,34]:[28,46]}),title:name,alt:name,keyboard:true,riseOnHover:true});
        const tooltip=document.createElement('span');tooltip.textContent=multiple?`${cluster.items.length} 个地点 · 点击展开`:`${place.name} · ${place.photoCount} 张照片`;
        marker.bindTooltip(tooltip,{direction:'top',offset:[0,-38],className:'province-hover'});
        const activate=()=>{
          marker.closeTooltip();
          if(!multiple){actionRef.current(place.id);return;}
          setOpenIds(cluster.items.map(item=>item.id));
          const bounds=L.latLngBounds(cluster.items.map(item=>[item.lat,item.lng] as L.LatLngTuple));
          const size=map.getSize(),narrow=size.x<=760;
          // 窄图的列表在地图下方，使用完整画布；宽图仍为左下方浮层留出空间。
          const paddingTopLeft=narrow?L.point(40,110):L.point(Math.min(size.x*0.5,350),140);
          const paddingBottomRight=narrow?L.point(40,90):L.point(40,Math.min(size.y*0.5,280));
          const coincident=bounds.getNorthEast().equals(bounds.getSouthWest(),1e-8);
          const nextZoom=coincident?map.getZoom():Math.min(map.getZoom()+2,map.getBoundsZoom(bounds,false,paddingTopLeft.add(paddingBottomRight)),map.getMaxZoom());
          if(Number.isFinite(nextZoom)&&(coincident||nextZoom>map.getZoom()+0.25))map.stop().fitBounds(bounds,{paddingTopLeft,paddingBottomRight,maxZoom:nextZoom,animate:false});
        };
        marker.on('click',event=>{L.DomEvent.stopPropagation(event);activate();});marker.addTo(group);
        const element=marker.getElement();if(element){
          element.setAttribute('role','button');element.setAttribute('aria-label',name);
          element.addEventListener('keydown',event=>{if(event.key===' '){event.preventDefault();activate();}});
          element.addEventListener('focus',()=>marker.openTooltip());element.addEventListener('blur',()=>marker.closeTooltip());
        }
      }
    };
    const close=()=>setOpenIds([]);
    draw();map.on('moveend resize',draw);map.on('dragstart',close);
    return()=>{map.off('moveend resize',draw);map.off('dragstart',close);map.removeLayer(group);};
  },[mapRef,places,province,enabled,viewKey]);
  return {openPlaces:openIds.flatMap(id=>{const place=places.find(p=>p.id===id&&p.province===province);return place?[place]:[];}),closePlaces:()=>{setOpenIds([]);mapRef.current?.getContainer().focus({preventScroll:true});}};
}
