import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import type {FormEvent} from 'react';
import {Check,MapPin,Plus,ShieldCheck,Tag,Trash2,Pencil} from 'lucide-react';
import type {Overview,Photo,Place} from '../model';
import {PROVINCES} from '../model';
import Modal from './Modal';
import TravelMap from '../TravelMap';
import {api} from '../api';
import type {GeographyState} from './GeographyPanel';

function useAction() {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const run=async(fn:()=>Promise<void>)=>{setError('');setBusy(true);try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return {error,busy,run};
}
export function RootForm({onClose,onSaved}:{onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [path,setPath]=useState(''); const {error,busy,run}=useAction();
  return <Modal title="添加照片目录" description="只读取此目录及其子目录；添加后请手动扫描。" onClose={onClose}><form onSubmit={e=>{e.preventDefault();void run(async()=>{await api('/roots',{path:path.trim()});await onSaved();onClose();});}}>
    <label className="form-field">目录路径<input aria-label="目录路径" value={path} required maxLength={1024} placeholder="例如：D:\照片\test" onChange={e=>setPath(e.target.value)}/></label>
    <p className="form-note"><ShieldCheck size={14}/>原始照片只读，索引与缓存保存到独立应用数据目录。</p>{error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="button secondary" type="button" onClick={onClose}>取消</button><button className="button primary" disabled={busy} type="submit">{busy?'正在添加…':'添加目录'}</button></div>
  </form></Modal>;
}
export function PlaceForm({place,province,overview,onClose,onSaved}:{place?:Place;province:string;overview:Overview;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [name,setName]=useState(place?.name||''),[region,setRegion]=useState(place?.province||province||'青海'),[lat,setLat]=useState(place?.lat||36.9),[lng,setLng]=useState(place?.lng||100.18),[description,setDescription]=useState(place?.description||'');
  const {error,busy,run}=useAction();
  type Source={provider:string;coordinateSystem:string;lat:number;lng:number;poiId:string;adaptation:string};
  type Candidate={name:string;address:string;province:string;provinceCode:string;lat:number;lng:number;source:Source};
  const [source,setSource]=useState<Source|undefined>(()=>{try{return place?.coordinateSource&&place.coordinateSource!=='manual'?JSON.parse(place.coordinateSource):undefined;}catch{return undefined;}}),[candidates,setCandidates]=useState<Candidate[]>([]),[searching,setSearching]=useState(false),[searchError,setSearchError]=useState(''),[searchMessage,setSearchMessage]=useState('');
  const geo=useQuery({queryKey:['geography'],queryFn:()=>api<GeographyState>('/geography/status')});
  const searchPlace=async()=>{setSearching(true);setSearchError('');setSearchMessage('');setCandidates([]);try{const result=await api<Candidate[]>(`/geography/search?${new URLSearchParams({q:name,provinceCode:PROVINCES.find(p=>p[0]===region)![1]})}`);setCandidates(result);if(!result.length)setSearchMessage('没有找到结果，可换一个地名或在地图上手动选点。');}catch(e){setSearchError((e as Error).message);}finally{setSearching(false);}};
  const submit=(e:FormEvent)=>{e.preventDefault();void run(async()=>{await api(place?`/places/${place.id}`:'/places',{name:name.trim(),province:region,provinceCode:PROVINCES.find(p=>p[0]===region)![1],lat,lng,description,source},place?'PATCH':'POST');await onSaved();onClose();});};
  return <Modal title={place?'编辑旅行地点':'收藏新的旅行地点'} description="选择省份并手动定位；配置天地图后可搜索地名。离线仍可保存手动位置。" onClose={onClose} wide><form onSubmit={submit}>
    <div className="form-row"><label className="form-field grow">地点名称<input aria-label="地点名称" required value={name} maxLength={60} onChange={e=>setName(e.target.value)} placeholder="例如：青海湖"/></label><label className="form-field region-field">所属省份<select aria-label="所属省份" value={region} onChange={e=>setRegion(e.target.value)}>{PROVINCES.map(p=><option key={p[1]}>{p[0]}</option>)}</select></label></div>
    <label className="form-field">地点描述<textarea value={description} maxLength={500} onChange={e=>setDescription(e.target.value)} rows={2}/></label>
    <div className="geography-search"><button type="button" className="button secondary" disabled={searching||!name.trim()||!geo.data?.configured||geo.data.offline} onClick={()=>void searchPlace()}>{searching?'正在搜索…':'搜索地名'}</button><span>{geo.data?.configured?'天地图 · 联网搜索':geo.data?.message||'地图配置读取中…'}</span></div>
    {searchError&&<p className="form-error" role="alert">{searchError}</p>}{searchMessage&&<p className="muted-note" role="status">{searchMessage}</p>}{candidates.length>0&&<div className="search-candidates">{candidates.map((c,i)=><button key={i} type="button" onClick={()=>{setName(c.name);setLat(c.lat);setLng(c.lng);setSource(c.source);const p=PROVINCES.find(p=>p[1]===c.provinceCode);if(p)setRegion(p[0]);setCandidates([]);}}><MapPin size={14}/><strong>{c.name}</strong><small>{c.address}</small></button>)}</div>}
    <div className="form-map"><TravelMap places={overview.places} photos={[]} province={region} onProvinceChange={setRegion} onPlaceClick={()=>{}} compact pickMode selectedPoint={{lat,lng}} onPick={(lat,lng)=>{setSource(undefined);setLat(Number(lat.toFixed(6)));setLng(Number(lng.toFixed(6)));}}/></div>
    <div className="coordinate-row"><span><MapPin size={12}/>{source?'天地图 CGCS2000 · WGS84 近似显示':'WGS84 · 手动位置'}</span><label>经度<input aria-label="经度" type="number" required min={-180} max={180} step="any" value={lng} onChange={e=>{setSource(undefined);setLng(Number(e.target.value));}}/></label><label>纬度<input aria-label="纬度" type="number" required min={-90} max={90} step="any" value={lat} onChange={e=>{setSource(undefined);setLat(Number(e.target.value));}}/></label></div>
    {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary" disabled={busy}>{busy?'保存中…':'保存地点'}</button></div>
  </form></Modal>;
}
export function ClassifyForm({photos,overview,onClose,onSaved}:{photos:Photo[];overview:Overview;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [place,setPlace]=useState(photos.length===1?photos[0].placeId||'':overview.places[0]?.id||''),[categories,setCategories]=useState<string[]>(photos.length===1?photos[0].categoryIds:[]);
  const {error,busy,run}=useAction();
  const changing=photos.filter(p=>p.placeId&&p.placeId!==place).length;
  return <Modal title={`整理 ${photos.length} 张照片`} description="每张照片属于一个地点，可选择该地点下多个类别。" onClose={onClose}>
    <div className="selected-preview">{photos.filter(p=>p.available).slice(0,5).map(p=><img key={p.id} src={p.src} alt={p.fileName}/>)}{photos.length>5&&<span>+{photos.length-5}</span>}</div>
    <label className="form-field">旅行地点<select aria-label="归类地点" value={place} onChange={e=>{setPlace(e.target.value);setCategories([]);}}><option value="">未分类（取消地点关联）</option>{overview.places.map(p=><option key={p.id} value={p.id}>{p.name} · {p.province}</option>)}</select></label>
    {place&&<><div className="form-section-label">照片类别<span>可多选</span></div><div className="category-options">{overview.categories.filter(c=>c.placeId===place).map(c=><button className={`category-option ${categories.includes(c.id)?'selected':''}`} aria-pressed={categories.includes(c.id)} key={c.id} onClick={()=>setCategories(old=>old.includes(c.id)?old.filter(id=>id!==c.id):[...old,c.id])}><span>{categories.includes(c.id)&&<Check size={13}/>}</span>{c.name}</button>)}</div></>}
    {changing>0&&<div className="inline-notice">{changing} 张照片会更换地点，旧地点类别将清除。确认后保存。</div>}<p className="form-note"><ShieldCheck size={13}/>只保存整理关系，不改动原图。</p>{error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={busy} onClick={()=>void run(async()=>{await api('/photos/classify',{photoIds:photos.map(p=>p.id),placeId:place||null,categoryIds:place?categories:[]});await onSaved();onClose();})}>{busy?'保存中…':'确认归类'}</button></div>
  </Modal>;
}
export function CategoryManager({place,overview,onClose,onSaved}:{place:Place;overview:Overview;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [name,setName]=useState(''),[editing,setEditing]=useState(''),[remove,setRemove]=useState(''); const {error,busy,run}=useAction();
  return <Modal title="管理照片类别" description={`${place.name}的类别，仅在此地点使用。`} onClose={onClose}><form className="inline-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api(editing?`/categories/${editing}`:'/categories',{placeId:place.id,name:name.trim()},editing?'PATCH':'POST');setName('');setEditing('');await onSaved();});}}>
    <input aria-label="类别名称" required maxLength={24} value={name} placeholder="例如：风景、人像" onChange={e=>setName(e.target.value)}/><button className="button primary" disabled={busy}>{editing?'保存改名':'添加类别'}</button>{editing&&<button className="text-button" type="button" onClick={()=>{setEditing('');setName('');}}>取消</button>}
  </form>{error&&<p className="form-error" role="alert">{error}</p>}<div className="manage-category-list">{overview.categories.filter(c=>c.placeId===place.id).map(c=><div className="manage-category" key={c.id}><span className="category-symbol"><Tag size={17}/></span><strong>{c.name}</strong><small>{c.photoCount} 张</small><button className="icon-button" aria-label={`重命名${c.name}`} onClick={()=>{setName(c.name);setEditing(c.id);}}><Pencil size={15}/></button><button className="icon-button danger" aria-label={`删除${c.name}`} onClick={()=>setRemove(c.id)}><Trash2 size={15}/></button></div>)}</div>
    {remove&&<div className="inline-delete-confirm"><p>删除类别只解除该类别关联，照片与地点保留。</p><button className="text-button" onClick={()=>setRemove('')}>取消</button><button className="text-button danger" disabled={busy} onClick={()=>void run(async()=>{await api(`/categories/${remove}`,{},'DELETE');setRemove('');await onSaved();})}>确认删除</button></div>}
    <div className="modal-footer"><button className="button primary" onClick={onClose}>完成</button></div>
  </Modal>;
}
