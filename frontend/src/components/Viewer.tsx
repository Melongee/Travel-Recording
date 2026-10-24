import {useEffect,useRef,useState} from 'react';
import {ChevronLeft,ChevronRight,Info,X,ZoomIn,ZoomOut,Maximize2,Copy,Tag,FolderOpen} from 'lucide-react';
import ViewerFilmstrip from '../ViewerFilmstrip';
import {PhotoImage} from './PhotoGrid';
import type {Photo,Overview} from '../model';
import {api} from '../api';
import usePhotoViewport from '../usePhotoViewport';
import {useQueryClient} from '@tanstack/react-query';
import RelocatePhoto from './RelocatePhoto';
export default function Viewer({photos,id,total,title,overview,onSelect,onClose,onClassify,onClassifyHere,classifyLabel,loadMore,hasMore,loadingMore}: {photos:Photo[];id:string;total:number;title:string;overview:Overview;onSelect:(id:string)=>void;onClose:()=>void;onClassify?:()=>void;onClassifyHere?:()=>void;classifyLabel?:string;loadMore:()=>Promise<unknown>;hasMore:boolean;loadingMore:boolean}) {
  const [info,setInfo]=useState(()=>window.matchMedia('(min-width: 761px)').matches),[error,setError]=useState(''); const ref=useRef<HTMLDivElement>(null),pendingIndex=useRef<number|null>(null);
  const qc=useQueryClient(),[relocating,setRelocating]=useState(false);
  const viewport=usePhotoViewport(id),{zoom,x,y}=viewport.transform;
  const index=photos.findIndex(p=>p.id===id), photo=photos[index];
  const [opening,setOpening]=useState(false),[revealResult,setRevealResult]=useState<{id:string;message:string;failed:boolean}|null>(null);
  const reveal=async()=>{setOpening(true);setRevealResult(null);try{const result=await api<{message:string}>(`/photos/${id}/reveal`,{});setRevealResult({id,message:result.message,failed:false});}catch(e){setRevealResult({id,message:(e as Error).message,failed:true});}finally{setOpening(false);}};
  const select=(next:string)=>onSelect(next);
  const step=async(delta:number)=>{
    if(index+delta>=photos.length&&hasMore){pendingIndex.current=index+delta;try{await loadMore();}catch(e){pendingIndex.current=null;setError((e as Error).message);}return;}
    select(photos[(index+delta+photos.length)%photos.length].id);
  };
  useEffect(()=>{if(index>=photos.length-5&&hasMore&&!loadingMore)void loadMore().catch(e=>setError(String(e)));},[index,photos.length,hasMore,loadingMore]);
  useEffect(()=>{if(pendingIndex.current!==null&&photos[pendingIndex.current]){const next=photos[pendingIndex.current].id;pendingIndex.current=null;select(next);}},[photos]);
  useEffect(()=>{
    const old=document.body.style.overflow; document.body.style.overflow='hidden';
    const key=(e:KeyboardEvent)=>{if(document.querySelector('.modal-backdrop'))return;if(e.key==='Escape')onClose();if(e.key==='ArrowLeft'){e.preventDefault();void step(-1);}if(e.key==='ArrowRight'){e.preventDefault();void step(1);}};
    document.addEventListener('keydown',key); return()=>{document.body.style.overflow=old;document.removeEventListener('keydown',key);};
  },[id,photos,hasMore]);
  if(!photo)return null;
  return <div className="viewer" ref={ref} role="dialog" aria-modal="true" aria-label="照片查看器">
    <header className="viewer-top"><div><span>{photo.fileName}<small>{index+1} / {total} · {title}</small></span></div><div>
      <button className="viewer-icon" aria-label="缩小" disabled={zoom<=.5} onClick={()=>viewport.zoomBy(-.25)}><ZoomOut size={18}/></button><span className="viewer-scale">{Math.round(zoom*100)}%</span><button className="viewer-icon" aria-label="放大" disabled={zoom>=4} onClick={()=>viewport.zoomBy(.25)}><ZoomIn size={18}/></button>
      <button className="viewer-icon" aria-label="全屏" onClick={()=>{void(document.fullscreenElement?document.exitFullscreen():ref.current!.requestFullscreen()).catch(()=>setError('浏览器未允许全屏'));}}><Maximize2 size={18}/></button>
      <button className="viewer-icon" aria-label="照片信息" onClick={()=>setInfo(!info)}><Info size={18}/></button><button className="viewer-icon" aria-label="关闭查看器" onClick={onClose}><X size={21}/></button>
    </div></header><div className="viewer-body"><div className="viewer-stage"><div className={`viewer-image-area ${viewport.canPan?'can-pan':''} ${viewport.dragging?'is-dragging':''}`} ref={viewport.areaRef}
      onPointerDown={viewport.pointerDown} onPointerMove={viewport.pointerMove} onPointerUp={viewport.endDrag} onPointerCancel={viewport.endDrag} onLostPointerCapture={viewport.endDrag} onDragStart={event=>event.preventDefault()}>
      <div className="real-preview" ref={viewport.imageRef} style={{transform:`translate(${x}px,${y}px) scale(${zoom})`}}><PhotoImage photo={photo} preview/></div></div>
      {!photo.available&&<button className="button secondary viewer-relocate" onClick={()=>setRelocating(true)}><FolderOpen size={15}/>重新定位此照片</button>}
      <button className="viewer-arrow previous" aria-label="上一张" onClick={()=>void step(-1)}><ChevronLeft/></button><button className="viewer-arrow next" aria-label="下一张" disabled={loadingMore&&index===photos.length-1} onClick={()=>void step(1)}><ChevronRight/></button>
      <div className="viewer-bottom"><div className="viewer-bottom-meta"><span className="viewer-collection"><span className="viewer-collection-name">{title}</span><small>{index+1} / {total}</small></span>{hasMore&&<button className="text-button" disabled={loadingMore} onClick={()=>void loadMore().catch(e=>setError(String(e)))}>加载后续缩略图</button>}</div>
      <ViewerFilmstrip photos={photos} activeId={id} onSelect={select} renderThumbnail={p=><PhotoImage photo={p}/>}/>
    </div></div>{info&&<aside className="photo-info"><h2>照片信息</h2><div className="info-group"><label>原始文件名</label><p>{photo.fileName}</p><label>图像尺寸</label><p>{photo.width} × {photo.height}</p><label>拍摄时间</label><p>{photo.takenAt?.replace('T',' ')||'未知（排序使用文件时间）'}</p><label>旅行地点</label><p>{overview.places.find(p=>p.id===photo.placeId)?.name||'未分类'}</p><label>照片类别</label><div className="info-tags">{photo.categoryIds.map(c=><span key={c}>{overview.categories.find(x=>x.id===c)?.name}</span>)}</div></div>
      {onClassifyHere&&<button className="button primary" onClick={onClassifyHere}><Tag size={15}/>在该地点归类</button>}{onClassify&&<button className={`button ${onClassifyHere?'secondary':'primary'}`} onClick={onClassify}><Tag size={15}/>{classifyLabel||'调整地点与类别'}</button>}<div className="info-path"><label>原始文件路径</label><code>{photo.path}</code><button className="text-button" onClick={()=>{void navigator.clipboard.writeText(photo.path).catch(()=>setError('复制失败，请选择路径文字复制'));}}><Copy size={13}/>复制路径</button><button className="button secondary reveal-file" disabled={opening} onClick={()=>void reveal()}><FolderOpen size={15}/>{opening?'正在打开…':'打开所在文件夹'}</button>{revealResult?.id===id&&<p className={revealResult.failed?'form-error':'muted-note'} role={revealResult.failed?'alert':'status'}>{revealResult.message}</p>}</div>{photo.error&&<p role="alert">{photo.error}</p>}{error&&<p role="alert">{error}</p>}
    </aside>}</div>{relocating&&<RelocatePhoto photo={photo} onClose={()=>setRelocating(false)} onSaved={async()=>{await Promise.all([qc.invalidateQueries({queryKey:['overview']}),qc.invalidateQueries({queryKey:['photos']}),qc.invalidateQueries({queryKey:['place-photo-candidates']})]);}}/>}</div>;
}
