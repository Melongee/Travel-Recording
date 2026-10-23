import {useState} from 'react';
import {FolderOpen,ShieldCheck} from 'lucide-react';
import type {Photo} from '../model';
import {api} from '../api';
import Modal from './Modal';
export interface RelocationPreview {token:string;photoId:string;oldPath:string;newPath:string;fileName:string;width:number;height:number;verified:boolean;verification:string;oldImage:string|null;newImage:string}
export default function RelocatePhoto({photo,onClose,onSaved}:{photo:Photo;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [preview,setPreview]=useState<RelocationPreview|null>(null),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const discard=(value:RelocationPreview|null)=>{if(value)void api(`/relocations/${value.token}`,{},'DELETE').catch(()=>{});};
  const close=()=>{if(!busy){discard(preview);onClose();}};
  const choose=async()=>{
    setBusy('choose');setError('');
    try {
      const selection=await api<{path:string|null;cancelled:boolean}>('/photos/choose-file',{});
      if(selection.cancelled||!selection.path)return;
      setBusy('check');const next=await api<RelocationPreview>(`/photos/${photo.id}/relocation`,{path:selection.path});
      discard(preview);setPreview(next);setConfirmed(false);
    }catch(e){setError((e as Error).message);}finally{setBusy('');}
  };
  const save=async()=>{
    if(!preview)return;setBusy('save');setError('');
    try{await api('/relocations/confirm',{token:preview.token,confirmUnverified:confirmed});await onSaved();onClose();}
    catch(e){setError((e as Error).message);}finally{setBusy('');}
  };
  return <Modal title="重新定位照片" description="选择同一照片的新位置，保留原照片 ID、地点、类别和排除状态。" onClose={close} wide>
    <label className="form-section-label">原路径</label><code className="confirm-root-path">{photo.path}</code>
    <button className="button secondary relocation-choose" disabled={!!busy} onClick={()=>void choose()}><FolderOpen size={16}/>{busy==='choose'?'请在系统窗口选择照片…':busy==='check'?'正在核对照片…':preview?'重新选择照片':'选择照片新位置'}</button>
    {preview&&<><div className="relocation-images"><div>{preview.oldImage?<img src={preview.oldImage} alt="旧索引缩略图"/>:<span>旧缩略图不可用</span>}<small>旧索引影像</small></div><div><img src={preview.newImage} alt="所选新位置照片"/><small>所选照片 · {preview.width} × {preview.height}</small></div></div>
      <code className="confirm-root-path">{preview.newPath}</code><p className="muted-note">{preview.verification}</p>
      {!preview.verified&&<label className="relocation-confirm"><input type="checkbox" checked={confirmed} disabled={!!busy} onChange={e=>setConfirmed(e.target.checked)}/>我已核对文件，确认这是原照片的新位置</label>}
    </>}
    <p className="form-note"><ShieldCheck size={14}/>仅更新本机索引，不移动或改写原图。未挂载位置仅授权此照片，不自动扫描父目录。</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="button secondary" disabled={!!busy} onClick={close}>取消</button><button className="button primary" disabled={!!busy||!preview||(!preview.verified&&!confirmed)} onClick={()=>void save()}>{busy==='save'?'保存中…':'确认重新关联'}</button></div>
  </Modal>;
}
