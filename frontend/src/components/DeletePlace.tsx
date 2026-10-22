import {useState} from 'react';
import type {Overview,Place} from '../model';
import {api} from '../api';
import Modal from './Modal';
export default function DeletePlace({place,overview,onClose,onDeleted}:{place:Place;overview:Overview;onClose:()=>void;onDeleted:()=>Promise<void>}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const count=overview.categories.filter(c=>c.placeId===place.id).length;
  const remove=async()=>{
    setBusy(true);setError('');
    try{await api(`/places/${place.id}`,{},'DELETE');await onDeleted();}
    catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  return <Modal title="删除旅行地点" description={`确认删除“${place.name}”？`} onClose={()=>{if(!busy)onClose();}}>
    <div className="inline-notice">此地点的 {place.photoCount} 张照片将回到未分类，{count} 个类别及其关联将一并移除。原始照片和照片索引会保留。</div>
    <p className="muted-note">删除后如需恢复地点和类别，可使用事先导出的管理数据备份。</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="button secondary" disabled={busy} onClick={onClose}>取消</button><button className="button danger-action" disabled={busy} onClick={()=>void remove()}>{busy?'正在删除…':'确认删除地点'}</button></div>
  </Modal>;
}
