import {useState} from 'react';
import type {CSSProperties} from 'react';
import {useQuery,useQueryClient} from '@tanstack/react-query';
import {Check,ChevronLeft,ChevronRight,Search} from 'lucide-react';
import {api} from '../api';
import type {PhotoPage} from '../model';
import Modal from './Modal';
import BackgroundPhoto from './BackgroundPhoto';
import type {Framing} from './BackgroundPhoto';
import {BACKGROUND_ASPECT} from './backgroundViewport';

export interface BackgroundSettings extends Framing {formatVersion:1;mode:'default'|'photo'|'none';photoId:string|null}
interface BackgroundView {settings:BackgroundSettings;src:string|null;warning:string|null}
const defaults:BackgroundSettings={formatVersion:1,mode:'default',photoId:null,opacity:1,zoom:1,x:.5,y:.4};
const queryKey=['home-background'];
export function useHomeBackground(enabled:boolean) {
  const qc=useQueryClient();
  const query=useQuery({queryKey,queryFn:({signal})=>api<BackgroundView>('/appearance/home-background',undefined,'GET',signal),enabled,refetchOnWindowFocus:true,refetchInterval:enabled?10000:false});
  const save=async(settings:BackgroundSettings)=>{
    await qc.cancelQueries({queryKey});
    const value=await api<BackgroundView>('/appearance/home-background',settings,'PUT');
    await qc.cancelQueries({queryKey});qc.setQueryData(queryKey,value);
  };
  return {...query,save};
}
export function PageBackdrop({current,fallback=''}:{current?:BackgroundView;fallback?:string}) {
  const settings=current?.settings||defaults,src=settings.mode==='default'?fallback:settings.mode==='photo'?current?.src||'':'';
  return <div className="page-backdrop" style={{aspectRatio:BACKGROUND_ASPECT}} aria-hidden="true"><div className="background-surface">{src&&<BackgroundPhoto key={src} src={src} framing={settings}/>}</div></div>;
}
export default function BackgroundPicker({current,fallback,onSave,onClose}:{current:BackgroundView;fallback:string;onSave:(value:BackgroundSettings)=>Promise<void>;onClose:()=>void}) {
  const [q,setQ]=useState(''),[page,setPage]=useState(0),[draft,setDraft]=useState(current.settings),[chosenSrc,setChosenSrc]=useState(current.src||''),[step,setStep]=useState<'choose'|'preview'>('choose');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[ready,setReady]=useState(false),[failed,setFailed]=useState<Set<string>>(new Set());
  const photos=useQuery({queryKey:['background-photos',q,page],queryFn:({signal})=>api<PhotoPage>(`/photos?size=24&page=${page}&sort=date-desc&q=${encodeURIComponent(q)}`,undefined,'GET',signal),enabled:step==='choose'});
  const preview=draft.mode==='default'?fallback:draft.mode==='photo'?chosenSrc:'';
  const cancel=()=>{if(!busy)onClose();};
  const edit=()=>{setError('');setReady(false);setStep('preview');};
  const save=async()=>{
    setBusy(true);setError('');
    try{await onSave(draft);onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <Modal key={step} title={step==='choose'?'更换首页背景':'背景更换预览'} description={step==='choose'?'先选择一张图库照片，确定后调整背景效果。':'图框固定，拖动照片选择展示区域，再调整大小与透明度。'} onClose={cancel} wide className={`background-picker ${step==='preview'?'background-editor':''}`}>
    {step==='choose'?<>
      <label className="search-field"><Search size={16}/><input aria-label="搜索背景照片" placeholder="从现有图库搜索照片" value={q} onChange={event=>{setQ(event.target.value);setPage(0);}}/></label>
      <div className="background-photo-grid" aria-label="选择背景照片">
        {photos.isPending?<p role="status">正在读取图库…</p>:photos.isError?<div role="alert"><p>{photos.error.message}</p><button className="text-button" onClick={()=>void photos.refetch()}>重新读取</button></div>:photos.data?.items.length?photos.data.items.map(photo=><button key={photo.id} type="button" title={photo.fileName} aria-label={`使用 ${photo.fileName} 作为背景`} aria-pressed={draft.mode==='photo'&&draft.photoId===photo.id} disabled={!photo.available||failed.has(photo.id)} onClick={()=>{if(draft.photoId!==photo.id)setDraft({...defaults,mode:'photo',photoId:photo.id});setChosenSrc(photo.previewSrc);setError('');}}><img src={photo.src} alt={photo.fileName} loading="lazy" onError={()=>setFailed(old=>new Set([...old,photo.id]))}/>{draft.mode==='photo'&&draft.photoId===photo.id&&<span><Check size={15}/></span>}</button>):<p>没有找到可选照片，可先在图库中添加并扫描照片目录。</p>}
      </div>
      <div className="background-pagination"><button className="icon-button" aria-label="上一页背景照片" disabled={page===0||photos.isPending} onClick={()=>setPage(value=>value-1)}><ChevronLeft size={18}/></button><span>{photos.data?`共 ${photos.data.total} 张 · 第 ${page+1} 页`:'读取中'}</span><button className="icon-button" aria-label="下一页背景照片" disabled={!photos.data||(page+1)*24>=photos.data.total} onClick={()=>setPage(value=>value+1)}><ChevronRight size={18}/></button></div>
      <p className="background-note">背景仅用于地图首页。设置保存到本机 SQLite，所有浏览器共用。</p>
      <div className="modal-footer background-footer"><button className="text-button" onClick={()=>{setDraft(defaults);edit();}}>恢复默认</button><button className="text-button" onClick={()=>{setDraft({...defaults,mode:'none'});edit();}}>不使用照片</button><button className="button secondary" onClick={cancel}>取消</button><button className="button primary" disabled={draft.mode!=='photo'||!chosenSrc||failed.has(draft.photoId||'')} onClick={edit}>确定</button></div>
    </>:<>
      <div className="background-editor-frame" style={{'--background-aspect':BACKGROUND_ASPECT,aspectRatio:BACKGROUND_ASPECT} as CSSProperties}>
        <div className="background-surface">{preview&&<BackgroundPhoto key={preview} src={preview} framing={draft} onReady={setReady} disabled={busy} onMove={(x,y)=>setDraft(old=>({...old,x,y}))}/>}</div>
        <div className="background-preview-heading" aria-hidden="true"><small>MY TRAVEL ATLAS</small><strong>走过的地方，<br/>都有故事。</strong></div>
        {!preview&&<span className="background-empty-label">{draft.mode==='none'?'不使用照片背景':'当前没有可用的默认封面'}</span>}
      </div>
      <div className="background-editor-controls">
        <label><span>照片大小 <b>{Math.round(draft.zoom*100)}%</b></span><input type="range" aria-label="背景照片大小" min="100" max="400" step="1" value={Math.round(draft.zoom*100)} disabled={!preview||busy} onChange={event=>setDraft(old=>({...old,zoom:Number(event.target.value)/100}))}/></label>
        <label><span>透明度 <b>{Math.round((1-draft.opacity)*100)}%</b></span><input type="range" aria-label="背景透明度" min="0" max="100" step="1" value={Math.round((1-draft.opacity)*100)} disabled={!preview||busy} onChange={event=>setDraft(old=>({...old,opacity:1-Number(event.target.value)/100}))}/></label>
        <div className="background-position-controls"><span>微调位置</span>{[['向左',-.025,0],['向右',.025,0],['向上',0,-.025],['向下',0,.025]].map(([label,dx,dy])=><button key={label} className="text-button" disabled={!preview||busy} onClick={()=>setDraft(old=>({...old,x:Math.max(0,Math.min(1,old.x+Number(dx))),y:Math.max(0,Math.min(1,old.y+Number(dy)))}))}>{label}</button>)}<button className="text-button" disabled={busy} onClick={()=>setDraft(old=>({...old,opacity:1,zoom:1,x:.5,y:.4}))}>重置取景</button></div>
      </div>
      <p className="background-note">固定 16:9 取景，首页随页面等比缩放，保留选定区域。透明度越高，照片越淡。</p>
      {error&&<p className="form-error" role="alert">{error}</p>}
      <div className="modal-footer"><button className="text-button" disabled={busy} onClick={()=>setStep('choose')}>返回选图</button><button className="button secondary" disabled={busy} onClick={cancel}>取消</button><button className="button primary" disabled={busy||!!preview&&!ready||draft.mode==='photo'&&!preview} onClick={()=>void save()}>{busy?'正在保存…':'保存并应用'}</button></div>
    </>}
  </Modal>;
}
