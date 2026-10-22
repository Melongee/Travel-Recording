import {useEffect,useId,useRef} from 'react';
import type {ReactNode} from 'react';
import {X} from 'lucide-react';
export default function Modal({title,description,children,onClose,wide=false}: {title:string;description?:string;children:ReactNode;onClose:()=>void;wide?:boolean}) {
  const heading=useId(), ref=useRef<HTMLDivElement>(null), closeRef=useRef(onClose); closeRef.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null, overflow=document.body.style.overflow;
    document.body.style.overflow='hidden'; ref.current?.querySelector<HTMLElement>('input,select,button')?.focus();
    const keyboard=(event:KeyboardEvent)=>{
      const dialogs=document.querySelectorAll('[role="dialog"]'); if(dialogs[dialogs.length-1]!==ref.current)return;
      if(event.key==='Escape'){event.preventDefault();closeRef.current();}
      if(event.key==='Tab') {
        const nodes=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea, a[href]')||[]);
        const first=nodes[0],last=nodes[nodes.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    document.addEventListener('keydown',keyboard); return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus();};
  },[]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div className={`modal ${wide?'modal-wide':''}`} ref={ref} role="dialog" aria-modal="true" aria-labelledby={heading}>
    <div className="modal-heading"><div><h2 id={heading}>{title}</h2>{description&&<p>{description}</p>}</div><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={20}/></button></div>{children}
  </div></div>;
}
