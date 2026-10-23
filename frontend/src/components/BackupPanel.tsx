import {useRef,useState} from 'react';
import {Download,Upload,ShieldCheck} from 'lucide-react';
import {api,apiResponse} from '../api';
import type {Overview} from '../model';
import Modal from './Modal';

interface Inspection {
  token:string; roots:string[]; expiresAt:string;
  manifest:{exportedAt:string;appVersion:string;counts:{roots:number;photos:number;places:number;categories:number;links:number}};
}
export default function BackupPanel({overview,onSaved}:{overview:Overview;onSaved:()=>Promise<void>}) {
  const input=useRef<HTMLInputElement>(null);
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState(''),[inspection,setInspection]=useState<Inspection|null>(null);
  const empty=overview.photoCount===0&&overview.excludedCount===0&&overview.places.length===0&&overview.categories.length===0&&overview.roots.length===0;
  const exportBackup=async()=>{
    setBusy('export');setError('');setMessage('');
    try {
      const response=await apiResponse('/backups/export',{});
      const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=url;link.download=response.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1]||'travel-backup.zip';
      link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
      setMessage('备份已生成并开始下载。服务器也保留了一份，可在数据目录的 backups 文件夹找到。');
    } catch(e){setError((e as Error).message);}finally{setBusy('');}
  };
  const inspect=async(file?:File)=>{
    if(!file)return;setBusy('inspect');setError('');setMessage('');
    try {
      if(file.size>256*1024*1024)throw new Error('备份文件请控制在 256 MiB 以内。');
      const form=new FormData();form.append('file',file);
      setInspection(await api<Inspection>('/backups/inspect',form));
    }catch(e){setError((e as Error).message);}finally{setBusy('');if(input.current)input.current.value='';}
  };
  const restore=async()=>{
    if(!inspection)return;setBusy('restore');setError('');
    try {
      await api('/backups/restore',{token:inspection.token,confirmed:true});
      setInspection(null);await onSaved();
      setMessage('管理数据已恢复。请先确认下面的照片目录，再重建缩略图；原有地点和类别已保留。');
    }catch(e){setError((e as Error).message);}finally{setBusy('');}
  };
  return <section className="settings-card backup-panel">
    <div className="settings-card-header"><div><h2>备份与恢复</h2><p>保存目录、照片索引、地点、类别和归属关系，方便在本机恢复整理成果。</p></div><ShieldCheck size={21}/></div>
    <div className="backup-actions"><div><h3>导出管理数据</h3><p>生成 ZIP 备份，不包含原图、缩略图、日志或地图密钥。</p><button className="button primary" disabled={!!busy} onClick={()=>void exportBackup()}><Download size={15}/>{busy==='export'?'正在生成…':'导出备份'}</button></div>
    <div><h3>从备份恢复</h3><p>{empty?'选择备份后先预览内容，确认再恢复。':'当前图库已有数据。本轮只允许向空图库恢复；可用新的数据目录启动后恢复。'}</p><button className="button secondary" disabled={!!busy} onClick={()=>input.current?.click()}><Upload size={15}/>{busy==='inspect'?'正在校验…':'选择备份并预览'}</button><input ref={input} type="file" accept=".zip,application/zip" aria-label="选择备份文件" hidden onChange={e=>void inspect(e.target.files?.[0])}/></div></div>
    {message&&<p className="backup-message" role="status">{message}</p>}{error&&!inspection&&<p className="form-error backup-message" role="alert">{error}</p>}
    {inspection&&<Modal title="恢复备份预览" description="仅恢复管理信息；原始照片不会被上传、移动或覆盖。" onClose={()=>{if(!busy)setInspection(null);}}>
      <dl className="backup-summary"><dt>备份时间</dt><dd>{new Date(inspection.manifest.exportedAt).toLocaleString('zh-CN')}</dd><dt>照片记录</dt><dd>{inspection.manifest.counts.photos} 张（含已排除照片）</dd><dt>旅行地点</dt><dd>{inspection.manifest.counts.places} 个</dd><dt>照片类别</dt><dd>{inspection.manifest.counts.categories} 个</dd></dl>
      <p className="muted-note">备份中的目录（恢复后需逐个确认访问）：</p><ul className="restore-roots">{inspection.roots.map(path=><li key={path}><code>{path}</code></li>)}</ul>
      <div className="inline-notice">{empty?'恢复后会重新打开数据库。请保留备份文件；缩略图可以重建。':'当前图库不是空图库，不能执行恢复，也不会覆盖现有分类。'}</div>
      {error&&<p className="form-error" role="alert">{error}</p>}<div className="modal-footer"><button className="button secondary" disabled={busy==='restore'} onClick={()=>setInspection(null)}>取消</button><button className="button primary" disabled={!empty||!!busy} onClick={()=>void restore()}>{busy==='restore'?'正在恢复…':'确认恢复到空图库'}</button></div>
    </Modal>}
  </section>;
}
