import {useMemo,useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowLeft,Check,Search,ShieldCheck} from 'lucide-react';
import {api} from '../api';
import type {Overview,Photo,PhotoPage,Place} from '../model';
import Modal from './Modal';
import PhotoGrid,{PhotoImage} from './PhotoGrid';

export default function AddPlacePhotos({place,categoryId,overview,onClose,onSaved}:{
  place:Place;categoryId:string;overview:Overview;onClose:()=>void;onSaved:(categoryIds:string[],count:number)=>Promise<void>;
}) {
  const categories=overview.categories.filter(c=>c.placeId===place.id);
  const sourcePlaces=overview.places.filter(p=>p.id!==place.id);
  const [chosenCategories,setChosenCategories]=useState<string[]>(categories.some(c=>c.id===categoryId)?[categoryId]:[]);
  const [selected,setSelected]=useState<Map<string,Photo>>(new Map()),[query,setQuery]=useState(''),[scope,setScope]=useState('unclassified'),[sort,setSort]=useState('date-desc'),[page,setPage]=useState(0);
  const [confirming,setConfirming]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const params=new URLSearchParams({q:query.trim(),unclassified:String(scope==='unclassified'),...(scope==='unclassified'?{}:{placeId:scope}),excluded:'false',sort,page:String(page),size:'100'}).toString();
  const candidates=useQuery({queryKey:['place-photo-candidates',place.id,params],queryFn:({signal})=>api<PhotoPage>(`/photos?${params}`,undefined,'GET',signal)});
  const items=candidates.data?.items||[],total=candidates.data?.total||0,pages=Math.max(1,Math.ceil(total/100));
  const selectedIds=useMemo(()=>new Set(selected.keys()),[selected]);
  const chosen=[...selected.values()],changing=chosen.filter(p=>p.placeId&&p.placeId!==place.id).length;
  const toggle=(id:string)=>{
    const photo=items.find(p=>p.id===id);if(!photo)return;
    if(!selected.has(id)&&selected.size>=1000){setError('一次最多整理 1,000 张照片，请分批添加。');return;}
    setError('');setSelected(old=>{const next=new Map(old);next.has(id)?next.delete(id):next.set(id,photo);return next;});
  };
  const selectPage=()=>{
    const next=new Map(selected),all=items.every(p=>next.has(p.id));
    for(const photo of items)all?next.delete(photo.id):next.set(photo.id,photo);
    if(next.size>1000){setError('一次最多整理 1,000 张照片，请分批添加。');return;}
    setError('');setSelected(next);
  };
  const save=async()=>{
    setBusy(true);setError('');
    try {
      await api(`/places/${place.id}/photos`,{photoIds:[...selected.keys()],categoryIds:chosenCategories});
      await onSaved(chosenCategories,selected.size);onClose();
    }catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <Modal title={`为“${place.name}”添加照片`} description="从未分类或其他地点挑选照片；当前地点和已排除照片不出现在候选中，原文件保持原位。"
    onClose={()=>{if(!busy)onClose();}} wide className="place-photo-picker-modal">
    {confirming?<>
      <div className="place-photo-summary"><strong>已选择 {selected.size} 张照片</strong><p>目标地点：{place.name} · {place.province}</p>
        <p>添加到类别：{chosenCategories.length?categories.filter(c=>chosenCategories.includes(c.id)).map(c=>c.name).join('、'):'不额外添加类别'}</p></div>
      <div className="place-photo-preview">{chosen.slice(0,6).map(p=><div key={p.id}><PhotoImage photo={p}/><span>{p.fileName}</span></div>)}</div>
      {changing>0&&<div className="inline-notice" role="status">其中 {changing} 张照片会从其他地点移入，旧地点的类别将清除，改为本次选择的类别。</div>}
      <p className="form-note"><ShieldCheck size={14}/>只保存地点与类别关系，不上传、移动或修改原图。</p>
    </>:<>
      <div className="form-section-label">添加到当前地点的类别<span>可多选，不选则只加入地点</span></div>
      <div className="category-options place-photo-categories">{categories.length?categories.map(c=><button type="button" className={`category-option ${chosenCategories.includes(c.id)?'selected':''}`}
        key={c.id} aria-pressed={chosenCategories.includes(c.id)} onClick={()=>setChosenCategories(old=>old.includes(c.id)?old.filter(id=>id!==c.id):[...old,c.id])}>
        <span>{chosenCategories.includes(c.id)&&<Check size={13}/>}</span>{c.name}</button>):<p className="muted-note">当前地点还没有类别，可先添加照片，之后再管理类别。</p>}</div>
      <div className="place-photo-toolbar"><label className="search-field"><Search size={15}/><input aria-label="搜索可添加照片" placeholder="搜索照片、地点或类别" maxLength={200} value={query}
        onChange={e=>{setQuery(e.target.value);setPage(0);}}/></label>
        <select aria-label="候选照片范围" value={scope} onChange={e=>{setScope(e.target.value);setPage(0);}}><option value="unclassified">未分类照片</option>{sourcePlaces.map(p=><option key={p.id} value={p.id}>{p.name} · {p.province}</option>)}</select>
        <select aria-label="候选照片排序" value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="date-desc">时间 · 从新到旧</option><option value="date-asc">时间 · 从旧到新</option><option value="name">文件名称</option></select>
      </div>
      {candidates.isPending?<p className="muted-note" role="status">正在读取可添加照片…</p>:candidates.isError?<div className="place-photo-empty" role="alert"><p>照片读取失败：{candidates.error.message}</p><button className="button secondary" onClick={()=>void candidates.refetch()}>重试</button></div>:<>
        <div className="place-photo-page-meta"><span>共 {total} 张候选 · 第 {page+1} / {pages} 页</span><button className="text-button" disabled={!items.length} onClick={selectPage}>{items.length&&items.every(p=>selected.has(p.id))?'取消本页选择':'全选本页'}（最多 100 张）</button></div>
        <div className="place-photo-library">{items.length?<PhotoGrid photos={items} places={overview.places} selected={selectedIds} selecting onSelect={toggle} onOpen={()=>{}}/>
          :<div className="place-photo-empty"><p>{query.trim()?'没有符合搜索条件的照片':'当前范围没有可添加的照片'}</p><small>可调整搜索或范围；尚未扫描时，请先在设置中添加目录并扫描。</small></div>}</div>
        <div className="place-photo-pagination"><button className="text-button" disabled={page===0} onClick={()=>setPage(p=>p-1)}>上一页</button><span>翻页、搜索和切换范围会保留已选照片</span><button className="text-button" disabled={page+1>=pages} onClick={()=>setPage(p=>p+1)}>下一页</button></div>
      </>}
    </>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer place-photo-footer"><div className="place-photo-selection"><span>已选择 {selected.size} 张</span>{selected.size>0&&!confirming&&<button className="text-button" onClick={()=>{setSelected(new Map());setError('');}}>清空选择</button>}</div>
      {confirming?<><button className="text-button" disabled={busy} onClick={onClose}>取消</button><button className="button secondary" disabled={busy} onClick={()=>{setConfirming(false);setError('');}}><ArrowLeft size={14}/>返回选片</button><button className="button primary" disabled={busy} onClick={()=>void save()}>{busy?'保存中…':'确认添加'}</button></>
        :<><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!selected.size} onClick={()=>{setConfirming(true);setError('');}}>下一步</button></>}
    </div>
  </Modal>;
}
