import {useEffect,useRef,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Camera,Check,ChevronLeft,ChevronRight,Search} from 'lucide-react';
import {api} from '../api';
import type {PhotoPage} from '../model';
import Modal from './Modal';

export interface BackgroundChoice {photoId:string;version:string;position:number}
type Backgrounds=Record<string,BackgroundChoice>;
const source=(choice:BackgroundChoice)=>choice.photoId?`/api/photos/${encodeURIComponent(choice.photoId)}/preview?v=${encodeURIComponent(choice.version)}`:'';

function readBackgrounds(key:string):Backgrounds {
  try {
    const value:unknown=JSON.parse(localStorage.getItem(key)||'{}');
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    return Object.fromEntries(Object.entries(value).filter(([,item])=>item&&typeof item.photoId==='string'&&typeof item.version==='string'&&typeof item.position==='number'&&Number.isFinite(item.position)&&item.position>=0&&item.position<=100));
  }catch{return {};}
}

export function usePageBackground(library:string|undefined,page:string) {
  const storageKey=`travel-recording:page-backgrounds:v1:${library||''}`;
  const [stored,setStored]=useState<{key:string;choices:Backgrounds}>(()=>({key:storageKey,choices:readBackgrounds(storageKey)}));
  useEffect(()=>{
    const update=()=>setStored({key:storageKey,choices:readBackgrounds(storageKey)});
    update();
    const changed=(event:StorageEvent)=>{if(event.key===storageKey||event.key===null)update();};
    window.addEventListener('storage',changed);return()=>window.removeEventListener('storage',changed);
  },[storageKey]);
  const choice=stored.key===storageKey?stored.choices[page]:undefined;
  const save=(value:BackgroundChoice|undefined)=>{
    const next=readBackgrounds(storageKey);
    if(value)next[page]=value;else delete next[page];
    // Only a local appearance preference is saved; no photo, library or classification is changed.
    localStorage.setItem(storageKey,JSON.stringify(next));
    setStored({key:storageKey,choices:next});
  };
  return {choice,save};
}

export function PageBackdrop({choice,fallback=''}:{choice?:BackgroundChoice;fallback?:string}) {
  const src=choice?source(choice):fallback;
  const [failed,setFailed]=useState('');
  return <div className="page-backdrop" aria-hidden="true">{src&&failed!==src&&<img key={src} src={src} alt="" style={{objectPosition:`center ${choice?.position??40}%`}} onError={()=>setFailed(src)}/>}</div>;
}

export default function BackgroundPicker({title,current,fallback,onSave,onClose}:{title:string;current?:BackgroundChoice;fallback:string;onSave:(value:BackgroundChoice|undefined)=>void;onClose:()=>void}) {
  const [q,setQ]=useState(''),[page,setPage]=useState(0),[chosen,setChosen]=useState(current),[busy,setBusy]=useState(false),[error,setError]=useState(''),[failed,setFailed]=useState<Set<string>>(new Set());
  const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  const cancel=()=>{active.current=false;onClose();};
  const photos=useQuery({queryKey:['background-photos',q,page],queryFn:({signal})=>api<PhotoPage>(`/photos?size=24&page=${page}&sort=date-desc&q=${encodeURIComponent(q)}`,undefined,'GET',signal)});
  const preview=chosen?source(chosen):fallback;
  const save=async(value:BackgroundChoice|undefined)=>{
    setBusy(true);setError('');
    try {
      const src=value?source(value):fallback;
      if(src)await new Promise<void>((resolve,reject)=>{
        const image=new window.Image();
        const done=(ok:boolean)=>{window.clearTimeout(timer);image.onload=null;image.onerror=null;ok?resolve():reject(new Error('这张照片暂时无法读取，请选择另一张照片。'));};
        const timer=window.setTimeout(()=>done(false),12000);
        image.onload=()=>done(true);image.onerror=()=>done(false);image.src=src;
      });
      if(active.current){onSave(value);onClose();}
    }catch(e){if(active.current)setError((e as Error).name==='QuotaExceededError'?'浏览器无法保存外观设置，请检查本机存储空间。':(e as Error).message);}finally{if(active.current)setBusy(false);}
  };
  return <Modal title="更换首页背景" description="选择你拍摄的照片作为旅行地图首页背景，不改变图库照片。" onClose={cancel} wide className="background-picker">
    <div className="background-preview">{preview?<img key={preview} src={preview} alt="背景效果预览" style={{objectPosition:`center ${chosen?.position??40}%`}} onError={event=>{event.currentTarget.style.visibility='hidden';}}/>:<Camera size={32}/>}<span>{title}</span></div>
    <label className="background-position">照片上下位置<input type="range" aria-label="背景照片上下位置" min="0" max="100" value={chosen?.position??40} disabled={!chosen?.photoId||busy} onChange={event=>setChosen(old=>old?{...old,position:Number(event.target.value)}:old)}/></label>
    <label className="search-field"><Search size={16}/><input aria-label="搜索背景照片" placeholder="从现有图库搜索照片" value={q} onChange={event=>{setQ(event.target.value);setPage(0);}}/></label>
    <div className="background-photo-grid" aria-label="选择背景照片">
      {photos.isPending?<p role="status">正在读取图库…</p>:photos.isError?<div role="alert"><p>{photos.error.message}</p><button className="text-button" onClick={()=>void photos.refetch()}>重新读取</button></div>:photos.data?.items.length?photos.data.items.map(photo=><button key={photo.id} type="button" title={photo.fileName} aria-label={`使用 ${photo.fileName} 作为背景`} aria-pressed={chosen?.photoId===photo.id} disabled={!photo.available||failed.has(photo.id)||busy} onClick={()=>{setChosen({photoId:photo.id,version:photo.version,position:40});setError('');}}><img src={photo.src} alt={photo.fileName} loading="lazy" onError={()=>setFailed(old=>new Set([...old,photo.id]))}/>{chosen?.photoId===photo.id&&<span><Check size={15}/></span>}</button>):<p>没有找到可选照片，可先在图库中添加并扫描照片目录。</p>}
    </div>
    <div className="background-pagination"><button className="icon-button" aria-label="上一页背景照片" disabled={page===0||photos.isPending||busy} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={18}/></button><span>{photos.data?`共 ${photos.data.total} 张 · 第 ${page+1} 页`:'读取中'}</span><button className="icon-button" aria-label="下一页背景照片" disabled={!photos.data||(page+1)*24>=photos.data.total||busy} onClick={()=>setPage(value=>value+1)}><ChevronRight size={18}/></button></div>
    <p className="background-note">背景仅用于地图首页。照片仍留在原处，设置仅保存在当前浏览器中。</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer background-footer"><button className="text-button" disabled={busy} onClick={()=>void save(undefined)}>恢复默认</button><button className="text-button" disabled={busy} onClick={()=>void save({photoId:'',version:'',position:40})}>不使用照片</button><button className="button secondary" onClick={cancel}>取消</button><button className="button primary" disabled={!chosen?.photoId||busy||failed.has(chosen.photoId)} onClick={()=>void save(chosen)}>{busy?'正在应用…':'应用到首页'}</button></div>
  </Modal>;
}
