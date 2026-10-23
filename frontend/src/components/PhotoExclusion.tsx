import {useState} from 'react';
import {api} from '../api';
import Modal from './Modal';

export default function PhotoExclusion({ids,restore,onClose,onSaved}:{ids:string[];restore:boolean;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const save=async()=>{
    setBusy(true);setError('');
    try{await api('/photos/exclusion',{photoIds:ids,excluded:!restore});await onSaved();onClose();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <Modal title={restore?'恢复到图库':'从图库排除照片'} onClose={()=>{if(!busy)onClose();}}>
    <div className="inline-notice">{restore?`将选中的 ${ids.length} 张照片恢复到图库，原有地点和类别会保留。`
      :`将选中的 ${ids.length} 张照片从全部照片、未分类、地点和类别中隐藏，后续扫描不会自动加回。`}</div>
    <p className="muted-note">原文件始终保留在电脑原处，不会删除、移动或改名。{!restore&&'可在“设置与数据 → 已排除照片”中查看并恢复。'}</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="button secondary" disabled={busy} onClick={onClose}>取消</button>
      <button className="button primary" disabled={busy} onClick={()=>void save()}>{busy?'保存中…':restore?'确认恢复':'确认排除'}</button></div>
  </Modal>;
}
