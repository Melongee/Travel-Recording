import {useState} from 'react';
import {Check,Plus,ShieldCheck} from 'lucide-react';
import type {Overview,Photo,Place} from '../model';
import Modal from './Modal';
import {api} from '../api';

export type ClassificationMode='general'|'current'|'move';
export default function ClassifyForm({photos,overview,mode='general',sourcePlace,onClose,onSaved}:{
  photos:Photo[];overview:Overview;mode?:ClassificationMode;sourcePlace?:Place;onClose:()=>void;onSaved:()=>Promise<void>;
}) {
  const within=mode==='current',moving=mode==='move';
  const [place,setPlace]=useState(within?sourcePlace?.id||'':moving?'':photos.length===1?photos[0].placeId||'':overview.places[0]?.id||'');
  const [categories,setCategories]=useState<string[]>(moving?[]:photos[0]?.placeId===place?photos[0].categoryIds.filter(id=>photos.every(p=>p.categoryIds.includes(id))):[]);
  const [newNames,setNewNames]=useState<string[]>([]),[name,setName]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const available=overview.categories.filter(c=>c.placeId===place);
  const targets=overview.places.filter(p=>!moving||p.id!==sourcePlace?.id);
  const changing=photos.filter(p=>p.placeId&&p.placeId!==place).length;
  const close=()=>{if(!busy)onClose();};
  const validateName=(value:string)=>{
    const trimmed=value.trim();
    if(!trimmed||trimmed.length>24)throw new Error('类别名称需为 1～24 个字符');
    if(available.some(c=>c.name===trimmed))throw new Error('该地点已有同名类别，请选择已有类别');
    if(newNames.includes(trimmed))throw new Error('这个新类别已选中');
    return trimmed;
  };
  const stage=()=>{
    setError('');
    try{setNewNames([...newNames,validateName(name)]);setName('');}catch(e){setError((e as Error).message);}
  };
  const save=async()=>{
    setError('');
    try {
      if((within||moving)&&!place)throw new Error('请先选择目标地点');
      const names=name.trim()?[...newNames,validateName(name)]:newNames;
      if(categories.length+names.length>100)throw new Error('一次最多选择 100 个类别');
      setBusy(true);
      await api('/photos/classify',{photoIds:photos.map(p=>p.id),placeId:place||null,categoryIds:place?categories:[],newCategoryNames:place?names:[],sourcePlaceId:within?sourcePlace?.id:null});
      await onSaved();onClose();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <Modal title={within?'在该地点归类':moving?'归入其他地点和类别':`整理 ${photos.length} 张照片`}
    description={`已选择 ${photos.length} 张照片。${within?'保留当前地点，替换这些照片的类别。':'每张照片属于一个地点，可选择该地点下多个类别。'}`} onClose={close}>
    <div className="selected-preview">{photos.filter(p=>p.available).slice(0,5).map(p=><img key={p.id} src={p.src} alt={p.fileName}/>)}{photos.length>5&&<span>+{photos.length-5}</span>}</div>
    {within?<div className="form-field">旅行地点<strong className="classification-place">{sourcePlace?.name} · {sourcePlace?.province}</strong></div>:<label className="form-field">{moving?'其他旅行地点':'旅行地点'}<select aria-label="归类地点" disabled={busy} value={place} onChange={e=>{setPlace(e.target.value);setCategories([]);setNewNames([]);setName('');setError('');}}>
      {moving?<option value="" disabled>请选择其他地点</option>:<option value="">未分类（取消地点关联）</option>}{targets.map(p=><option key={p.id} value={p.id}>{p.name} · {p.province}</option>)}
    </select></label>}
    {moving&&!targets.length&&<p className="muted-note">还没有其他地点，可取消后先新建旅行地点。</p>}
    {place&&<><div className="form-section-label">照片类别<span>可多选</span></div>
      {!available.length&&!newNames.length&&<p className="muted-note">该地点还没有类别，可以直接在下方新建。</p>}
      <div className="category-options">{available.map(c=><button type="button" disabled={busy} className={`category-option ${categories.includes(c.id)?'selected':''}`} aria-pressed={categories.includes(c.id)} key={c.id} onClick={()=>setCategories(old=>old.includes(c.id)?old.filter(id=>id!==c.id):[...old,c.id])}><span>{categories.includes(c.id)&&<Check size={13}/>}</span>{c.name}</button>)}
        {newNames.map(value=><button type="button" disabled={busy} className="category-option selected" aria-label={`移除待建类别${value}`} aria-pressed="true" key={value} onClick={()=>setNewNames(old=>old.filter(n=>n!==value))}><span><Check size={13}/></span>{value}（待创建）</button>)}
      </div>
      <form className="inline-form classification-new-category" onSubmit={e=>{e.preventDefault();if(!busy)stage();}}>
        <input aria-label="新类别名称" maxLength={24} disabled={busy} value={name} placeholder="新类别名称，例如：风景、人像" onChange={e=>{setName(e.target.value);setError('');}}/>
        <button className="button secondary" disabled={busy||!name.trim()}><Plus size={14}/>新建并选中</button>
      </form><p className="muted-note">新类别在确认归类时一起保存，取消不创建。切换地点会清空待建类别。</p>
    </>}
    {within?<div className="inline-notice">确认后，原有类别将替换为本次所选类别；不选类别则清空这些照片的类别，照片仍保留在当前地点。</div>:changing>0&&(!moving||place)&&<div className="inline-notice">{place?`${changing} 张照片会更换地点，旧地点类别将清除。确认后保存。`:`${changing} 张照片会取消地点关联并清空类别。确认后保存。`}</div>}
    <p className="form-note"><ShieldCheck size={13}/>只保存整理关系，不改动原图。</p>{error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="button secondary" disabled={busy} onClick={close}>取消</button><button className="button primary" disabled={busy||!photos.length||((within||moving)&&!place)} onClick={()=>void save()}>{busy?'保存中…':'确认归类'}</button></div>
  </Modal>;
}
