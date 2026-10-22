import {useEffect,useState} from 'react';
import {Check,Image,MapPin,Layers} from 'lucide-react';
import type {Photo,Place} from '../model';
import {dateLabel} from '../model';
export function PhotoImage({photo,preview=false}: {photo:Photo;preview?:boolean}) {
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[photo.id,photo.version,photo.available]);
  if(!photo.available||failed)return <div className="image-unavailable"><Image size={27}/><span>{photo.availability==='unverified'?'目录待确认':photo.availability==='corrupt'?'图片损坏':'照片暂不可用'}</span><small>整理记录已保留</small></div>;
  return <img src={preview?photo.previewSrc:photo.src} alt={photo.fileName} loading={preview?'eager':'lazy'} decoding="async" onError={()=>setFailed(true)}/>;
}
export default function PhotoGrid({photos,places,selected,selecting,onSelect,onOpen,dense=false}: {photos:Photo[];places:Place[];selected:Set<string>;selecting:boolean;onSelect:(id:string)=>void;onOpen:(id:string)=>void;dense?:boolean}) {
  return <div className={`photo-grid ${dense?'compact-grid':''}`}>{photos.map(photo=><article className={`photo-card ${selected.has(photo.id)?'is-selected':''}`} key={photo.id}>
    <button className="photo-open" aria-label={selecting?`选择 ${photo.fileName}`:`查看照片 ${photo.fileName}`} onClick={()=>selecting?onSelect(photo.id):onOpen(photo.id)}><PhotoImage photo={photo}/><span className="photo-shade"/>
      <span className="photo-location"><MapPin size={12}/>{places.find(p=>p.id===photo.placeId)?.name||'等待归类'}</span>{photo.categoryIds.length>1&&<span className="photo-multiple"><Layers size={12}/>{photo.categoryIds.length}</span>}
    </button><button className={`photo-select ${selected.has(photo.id)?'checked':''}`} aria-label={`勾选 ${photo.fileName}`} aria-pressed={selected.has(photo.id)} onClick={()=>onSelect(photo.id)}>{selected.has(photo.id)&&<Check size={15}/>}</button>
    <div className="photo-caption"><span title={photo.fileName}>{photo.fileName}</span><time>{dateLabel(photo)}</time></div>
  </article>)}</div>;
}
