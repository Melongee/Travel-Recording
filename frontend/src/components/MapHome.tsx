import type {ReactNode} from 'react';
import {Image,MapPin,Plus} from 'lucide-react';
import TravelMap from '../TravelMap';
import type {Overview} from '../model';

interface Props {
  overview:Overview;
  province:string;
  onProvinceChange:(name:string)=>void;
  onPlaceClick:(id:string)=>void;
  onCreatePlace:()=>void;
  onOrganize:()=>void;
  recent:ReactNode;
}

export default function MapHome({overview,province,onProvinceChange,onPlaceClick,onCreatePlace,onOrganize,recent}:Props) {
  const places=overview.places.filter(place=>!province||place.province===province);
  const provinceCount=new Set(overview.places.map(place=>place.province)).size;
  return <>
    <section className="atlas-scene" aria-label="我的旅行足迹">
      <div className="atlas-map"><TravelMap scenic places={overview.places} photos={[]} province={province} onProvinceChange={onProvinceChange} onPlaceClick={onPlaceClick}/></div>
      <section className="atlas-heading">
        <div className="eyebrow">MY TRAVEL ATLAS</div>
        <h1>走过的地方，<br/>都有故事。</h1>
        <div className="atlas-summary" aria-label="旅行统计">
          <span><b>{provinceCount}</b> 个省份</span>
          <span><b>{overview.places.length}</b> 个地点</span>
          <span><b>{overview.photoCount}</b> 张照片</span>
        </div>
      </section>
      <div className="atlas-actions"><button className="button secondary" onClick={onOrganize}><Image size={17}/>整理照片</button><button className="button primary" onClick={onCreatePlace}><Plus size={18}/>新增地点</button></div>
      <aside className="atlas-places" aria-label={province?`${province}的旅行地点`:'我的旅行地点'}>
        {places.length?<div className="atlas-place-items">{places.map(place=><button className="atlas-place" key={place.id} onClick={()=>onPlaceClick(place.id)} aria-label={`${place.name}，${place.photoCount} 张照片，打开相册`} title={`${place.name} · ${place.photoCount} 张照片`}>
          <span className="atlas-place-cover">{place.coverSrc?<img src={place.coverSrc} alt=""/>:<span className="atlas-empty-cover"><MapPin size={22}/></span>}<small>{place.photoCount}</small></span><strong>{place.name}</strong>
        </button>)}</div>:<div className="atlas-place-empty"><MapPin size={24}/><p>这里的故事还未开始</p><button className="text-button" onClick={onCreatePlace}>新增旅行地点</button></div>}
      </aside>
    </section>
    {recent}
  </>;
}
