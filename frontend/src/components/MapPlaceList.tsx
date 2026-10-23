import {MapPin,X} from 'lucide-react';
import type {Place} from '../model';

export default function MapPlaceList({places,onClose,onSelect}:{places:Place[];onClose:()=>void;onSelect:(id:string)=>void}) {
  if(!places.length)return null;
  return <section className="map-place-list" aria-label="聚合地点列表" onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();onClose();}}}>
    <div className="map-place-list-heading"><div><strong>附近的 {places.length} 个地点</strong><small>选择地点查看照片，也可关闭后继续缩放</small></div><button type="button" aria-label="关闭聚合地点列表" autoFocus onClick={onClose}><X size={15}/></button></div>
    <div className="map-place-list-items">{places.map(place=><button type="button" className="map-place-list-item" key={place.id} onClick={()=>onSelect(place.id)}>
      {place.coverSrc?<img src={place.coverSrc} alt=""/>:<span className="map-list-empty"><MapPin size={17}/></span>}<span><strong>{place.name}</strong><small>{place.photoCount} 张照片</small></span>
    </button>)}</div>
  </section>;
}
