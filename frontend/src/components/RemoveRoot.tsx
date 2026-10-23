import {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import type {Root} from '../model';
import {api} from '../api';
import Modal from './Modal';
type Impact={rootId:string;path:string;deleteCount:number;unclassifiedCount:number;classifiedCount:number;excludedCount:number;retainedCount:number;token:string};
export default function RemoveRoot({root,onClose,onRemoved}:{root:Root;onClose:()=>void;onRemoved:()=>Promise<void>}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  const preview=useQuery({queryKey:['root-removal',root.id],queryFn:()=>api<Impact>(`/roots/${root.id}/removal`),retry:false,staleTime:0,gcTime:0});
  const impact=preview.data;
  const remove=async()=>{
    if(!impact)return;
    setBusy(true);setError('');
    try{await api(`/roots/${root.id}`,{token:impact.token},'DELETE');await onRemoved();onClose();}
    catch(e){setError((e as Error).message);await preview.refetch();}finally{setBusy(false);}
  };
  return <Modal title="移除照片目录" description="取消挂载，并删除不再由其他挂载目录覆盖的照片索引。" onClose={()=>{if(!busy)onClose();}}>
    <code className="confirm-root-path">{root.path}</code>
    {preview.isPending?<p className="muted-note" role="status">正在计算移除影响…</p>:preview.isError?<div role="alert"><p className="form-error">{preview.error.message}</p><button className="button secondary" onClick={()=>void preview.refetch()}>重新读取影响</button></div>:impact&&<>
      <div className="inline-notice">将删除 {impact.deleteCount} 张照片的索引及地点、类别关联：未分类 {impact.unclassifiedCount} 张，已归类 {impact.classifiedCount} 张，已排除 {impact.excludedCount} 张。这些照片将从全部、未分类、地点/类别相册和已排除列表中消失，相关数量和封面同步更新。</div>
      {impact.retainedCount>0&&<p className="muted-note">另外 {impact.retainedCount} 张仍由其他有效挂载目录覆盖，将保留索引、归类和排除状态。如需一并移除，请同时检查其他重叠挂载目录。</p>}
      <p className="muted-note">电脑中的文件夹和原始照片保持不动；地点和类别本身保留。移除后不会再扫描此目录；以后重新挂载并扫描，将重新建立已删除的索引，原归类和排除记录不会自动恢复。</p>
    </>}
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="button secondary" disabled={busy} onClick={onClose}>取消</button><button className="button danger-action" disabled={busy||preview.isFetching||preview.isError||!impact} onClick={()=>void remove()}>{busy?'正在移除…':'确认移除目录'}</button></div>
  </Modal>;
}
