import {useState} from 'react';
import type {Root} from '../model';
import {api} from '../api';
import Modal from './Modal';
export default function ConfirmRoot({root,onSaved}:{root:Root;onSaved:()=>Promise<void>}) {
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const confirm=async()=>{
    setBusy(true);setError('');
    try {await api(`/roots/${root.id}/confirm`,{});if(!root.fileOnly)await api('/scans',{});await onSaved();setOpen(false);}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <><button className="button secondary" onClick={()=>setOpen(true)}>{root.fileOnly?'确认照片访问':'确认目录访问'}</button>{open&&<Modal title={root.fileOnly?'确认备份中的单张照片':'确认备份中的照片目录'} description={root.fileOnly?'只恢复此照片的只读访问，不扫描父目录。':'确认后允许本机服务只读访问此目录及其子目录，并开始扫描以重建缩略图。'} onClose={()=>{if(!busy)setOpen(false);}}>
    <code className="confirm-root-path">{root.path}</code><p className="form-note">目录中的原图不会被改动。文件暂时找不到时，地点和类别仍会保留。</p>{error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="button secondary" disabled={busy} onClick={()=>setOpen(false)}>取消</button><button className="button primary" disabled={busy} onClick={()=>void confirm()}>{busy?'正在确认…':root.fileOnly?'确认此照片访问':'确认并重建缩略图'}</button></div>
  </Modal>}</>;
}
