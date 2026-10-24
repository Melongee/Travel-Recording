import {useEffect,useRef,useState} from 'react';
import type {PointerEvent} from 'react';
import {backgroundViewport,clamp} from './backgroundViewport';
export interface Framing {opacity:number;zoom:number;x:number;y:number}
export default function BackgroundPhoto({src,framing,onMove,onReady,disabled=false}:{src:string;framing:Framing;onMove?:(x:number,y:number)=>void;onReady?:(ready:boolean)=>void;disabled?:boolean}) {
  const frame=useRef<HTMLDivElement>(null),drag=useRef<{id:number;px:number;py:number;x:number;y:number;overflowX:number;overflowY:number}|null>(null);
  const [size,setSize]=useState({width:0,height:0}),[image,setImage]=useState({src:'',width:0,height:0}),[failed,setFailed]=useState('');
  const ready=image.src===src&&image.width>0&&failed!==src;
  useEffect(()=>{onReady?.(ready);},[ready,onReady]);
  useEffect(()=>{if(!frame.current)return;const observer=new ResizeObserver(([entry])=>setSize({width:entry.contentRect.width,height:entry.contentRect.height}));observer.observe(frame.current);return()=>observer.disconnect();},[]);
  const geometry=backgroundViewport(size.width,size.height,ready?image.width:0,ready?image.height:0,framing.zoom,framing.x,framing.y);
  const stop=(event:PointerEvent<HTMLDivElement>)=>{if(drag.current?.id===event.pointerId){drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}};
  return <div ref={frame} className={`background-photo ${onMove?'is-editable':''}`} role={onMove?'group':undefined} aria-label={onMove?'拖动照片调整取景区域':undefined}
    onPointerDown={event=>{if(!onMove||disabled||!ready||!event.isPrimary||event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drag.current={id:event.pointerId,px:event.clientX,py:event.clientY,x:framing.x,y:framing.y,overflowX:geometry.overflowX,overflowY:geometry.overflowY};}}
    onPointerMove={event=>{const start=drag.current;if(!start||start.id!==event.pointerId||disabled)return;onMove?.(start.overflowX>0?clamp(start.x-(event.clientX-start.px)/start.overflowX):start.x,start.overflowY>0?clamp(start.y-(event.clientY-start.py)/start.overflowY):start.y);}}
    onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={()=>{drag.current=null;}}>
    <img key={src} src={src} alt="" draggable={false} style={{width:geometry.width,height:geometry.height,left:geometry.left,top:geometry.top,opacity:framing.opacity,visibility:ready?'visible':'hidden'}} onLoad={event=>{setImage({src,width:event.currentTarget.naturalWidth,height:event.currentTarget.naturalHeight});setFailed('');}} onError={()=>{setFailed(src);setImage({src:'',width:0,height:0});}}/>
    {onMove&&!ready&&<span className="background-load-state" role={failed===src?'alert':'status'}>{failed===src?'照片无法读取，请返回重新选图。':'正在加载照片…'}</span>}
  </div>;
}
