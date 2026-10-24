import {useState} from 'react';
import {Plus,ShieldCheck,Tag,Trash2,Pencil,FolderOpen} from 'lucide-react';
import type {Overview,Place} from '../model';
import Modal from './Modal';
import {api} from '../api';
export {default as PlaceForm} from './PlaceForm';
export {default as ClassifyForm} from './ClassifyForm';

function useAction() {
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  const run=async(fn:()=>Promise<void>)=>{setError('');setBusy(true);try{await fn();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return {error,busy,run};
}
export function RootForm({onClose,onSaved}:{onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [path,setPath]=useState(''),[choosing,setChoosing]=useState(false); const {error,busy,run}=useAction();
  const close=()=>{if(!busy)onClose();};
  const choose=()=>void run(async()=>{setChoosing(true);try{const result=await api<{path:string|null;cancelled:boolean}>('/roots/choose-folder',{});if(!result.cancelled&&result.path)setPath(result.path);}finally{setChoosing(false);}});
  return <Modal title="添加照片目录" description="选择本机文件夹，只读取此目录及其子目录；添加后请手动扫描。" onClose={close}><form onSubmit={e=>{e.preventDefault();if(!path||busy)return;void run(async()=>{await api('/roots',{path});await onSaved();onClose();});}}>
    <button className="folder-picker button secondary" type="button" disabled={busy} onClick={choose}><FolderOpen size={22}/><span>{choosing?'请在系统窗口中选择文件夹…':path?'重新选择文件夹':'选择文件夹'}</span></button>
    {path?<div className="chosen-folder" role="status"><span>已选择目录</span><code>{path}</code></div>:<p className="muted-note">点击上方按钮，在 Windows 文件夹选择窗口中选择要挂载的照片目录。</p>}
    <p className="form-note"><ShieldCheck size={14}/>原始照片只读，索引与缓存保存到独立应用数据目录。</p>{error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="button secondary" type="button" disabled={busy} onClick={close}>取消</button><button className="button primary" disabled={busy||!path} type="submit">{busy&&!choosing?'正在添加…':'添加目录'}</button></div>
  </form></Modal>;
}
export function CategoryManager({place,overview,onClose,onSaved}:{place:Place;overview:Overview;onClose:()=>void;onSaved:()=>Promise<void>}) {
  const [name,setName]=useState(''),[editing,setEditing]=useState(''),[remove,setRemove]=useState(''); const {error,busy,run}=useAction();
  return <Modal title="管理照片类别" description={`${place.name}的类别，仅在此地点使用。`} onClose={onClose}><form className="inline-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api(editing?`/categories/${editing}`:'/categories',{placeId:place.id,name:name.trim()},editing?'PATCH':'POST');setName('');setEditing('');await onSaved();});}}>
    <input aria-label="类别名称" required maxLength={24} value={name} placeholder="例如：风景、人像" onChange={e=>setName(e.target.value)}/><button className="button primary" disabled={busy}>{editing?'保存改名':'添加类别'}</button>{editing&&<button className="text-button" type="button" onClick={()=>{setEditing('');setName('');}}>取消</button>}
  </form>{error&&<p className="form-error" role="alert">{error}</p>}<div className="manage-category-list">{overview.categories.filter(c=>c.placeId===place.id).map(c=><div className="manage-category" key={c.id}><span className="category-symbol"><Tag size={17}/></span><strong>{c.name}</strong><small>{c.photoCount} 张</small><button className="icon-button" aria-label={`重命名${c.name}`} onClick={()=>{setName(c.name);setEditing(c.id);}}><Pencil size={15}/></button><button className="icon-button danger" aria-label={`删除${c.name}`} onClick={()=>setRemove(c.id)}><Trash2 size={15}/></button></div>)}</div>
    {remove&&<div className="inline-delete-confirm"><p>删除类别只解除该类别关联，照片与地点保留。</p><button className="text-button" onClick={()=>setRemove('')}>取消</button><button className="text-button danger" disabled={busy} onClick={()=>void run(async()=>{await api(`/categories/${remove}`,{},'DELETE');setRemove('');await onSaved();})}>确认删除</button></div>}
    <div className="modal-footer"><button className="button primary" onClick={onClose}>完成</button></div>
  </Modal>;
}
