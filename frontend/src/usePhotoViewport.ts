import {useLayoutEffect,useRef,useState} from 'react';
import type {PointerEvent as ReactPointerEvent} from 'react';

type Transform={zoom:number;x:number;y:number};
type Drag={id:number;startX:number;startY:number;x:number;y:number};

export default function usePhotoViewport(photoId:string) {
  const areaRef=useRef<HTMLDivElement>(null),imageRef=useRef<HTMLDivElement>(null);
  const current=useRef<Transform>({zoom:1,x:0,y:0}),drag=useRef<Drag|null>(null);
  const size=useRef({width:0,height:0,imageWidth:0,imageHeight:0});
  const [transform,setTransform]=useState(current.current),[dragging,setDragging]=useState(false),[canPan,setCanPan]=useState(false);
  const apply=(next:Transform)=>{
    const s=size.current;
    const maxX=Math.max(0,(s.imageWidth*next.zoom-s.width)/2),maxY=Math.max(0,(s.imageHeight*next.zoom-s.height)/2);
    const bounded={zoom:next.zoom,x:Math.max(-maxX,Math.min(maxX,next.x)),y:Math.max(-maxY,Math.min(maxY,next.y))};
    const before=current.current;current.current=bounded;
    if(before.zoom!==bounded.zoom||before.x!==bounded.x||before.y!==bounded.y)setTransform(bounded);
    setCanPan(maxX>0||maxY>0);
  };
  const measure=()=>{
    const area=areaRef.current,image=imageRef.current?.querySelector('img');
    size.current={width:area?.clientWidth||0,height:area?.clientHeight||0,
      imageWidth:image?.complete?image.offsetWidth:0,imageHeight:image?.complete?image.offsetHeight:0};
    apply(current.current);
  };
  const endDrag=()=>{
    const pointer=drag.current;drag.current=null;setDragging(false);
    if(pointer&&areaRef.current?.hasPointerCapture(pointer.id))areaRef.current.releasePointerCapture(pointer.id);
  };
  const zoomTo=(value:number,anchorX=0,anchorY=0)=>{
    measure();endDrag();
    const before=current.current,zoom=Math.max(.5,Math.min(4,value));
    const ratio=zoom/before.zoom;
    apply({zoom,x:anchorX-(anchorX-before.x)*ratio,y:anchorY-(anchorY-before.y)*ratio});
  };
  useLayoutEffect(()=>{
    const area=areaRef.current,content=imageRef.current;
    if(!area||!content)return;
    apply({zoom:1,x:0,y:0});endDrag();
    const observer=new ResizeObserver(measure);
    const loaded=()=>{const image=content.querySelector('img');if(image)observer.observe(image);measure();};
    observer.observe(area);loaded();
    content.addEventListener('load',loaded,true);
    const wheel=(event:WheelEvent)=>{
      event.preventDefault();
      if(!event.deltaY)return;
      const rect=area.getBoundingClientRect();
      const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?area.clientHeight:1);
      zoomTo(current.current.zoom*Math.exp(-delta*.002),event.clientX-rect.left-rect.width/2,event.clientY-rect.top-rect.height/2);
    };
    area.addEventListener('wheel',wheel,{passive:false});
    return()=>{observer.disconnect();content.removeEventListener('load',loaded,true);area.removeEventListener('wheel',wheel);endDrag();};
  },[photoId]);
  const pointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0||!event.isPrimary)return;
    measure();
    const s=size.current,t=current.current;
    if(s.imageWidth*t.zoom<=s.width&&s.imageHeight*t.zoom<=s.height)return;
    event.preventDefault();
    drag.current={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:t.x,y:t.y};
    event.currentTarget.setPointerCapture(event.pointerId);setDragging(true);
  };
  const pointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const start=drag.current;if(!start||start.id!==event.pointerId)return;
    apply({...current.current,x:start.x+event.clientX-start.startX,y:start.y+event.clientY-start.startY});
  };
  return {areaRef,imageRef,transform,dragging,canPan,pointerDown,pointerMove,endDrag,
    zoomBy:(amount:number)=>zoomTo(current.current.zoom+amount)};
}
