import {useState} from 'react';
import {FolderOpen} from 'lucide-react';
import {api} from '../api';
import type {Root} from '../model';
import Modal from './Modal';
interface Candidate {token:string;path:string;verified:boolean;verification:string;oldImage:string|null;newImage:string}
interface Row {photoId:string;fileName:string;oldPath:string;state:string;message:string;candidates:Candidate[]}
interface Preview {token:string;rootId:string;oldPath:string;newPath:string;total:number;matchedCount:number;ambiguousCount:number;unmatchedCount:number;availableCount:number;rows:Row[]}
export default function RelocateRoot({root,onClose,onSaved}:{root:Root;onClose:()=>void;onSaved:(restored:number,retained:number)=>Promise<void>}) {
  const [preview,setPreview]=useState<Preview|null>(null),[selected,setSelected]=useState<Record<string,string>>({}),[page,setPage]=useState(0);
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[manual,setManual]=useState(false),[inspecting,setInspecting]=useState<{row:Row;candidate:Candidate}|null>(null);
  const selectedRows=preview?.rows.flatMap(row=>{const candidate=row.candidates.find(c=>c.token===selected[row.photoId]);return candidate?[{row,candidate}]:[];})||[];
  const manualCount=selectedRows.filter(value=>!value.candidate.verified).length;
  const duplicate=new Set(selectedRows.map(value=>value.candidate.path.toLowerCase())).size!==selectedRows.length;
  const discard=(value:Preview|null)=>{if(value)void api(`/directory-relocations/${value.token}`,{},'DELETE').catch(()=>{});};
  const close=()=>{if(!busy){discard(preview);onClose();}};
  const load=async(path:string)=>{
    setBusy('check');const next=await api<Preview>(`/roots/${root.id}/relocation`,{path});discard(preview);setPreview(next);setPage(0);setManual(false);setInspecting(null);
    setSelected(Object.fromEntries(next.rows.filter(row=>row.state==='matched').map(row=>[row.photoId,row.candidates[0].token])));
  };
  const choose=async()=>{
    setBusy('choose');setError('');
    try{const result=await api<{path:string|null;cancelled:boolean}>('/roots/choose-folder',{});if(!result.cancelled&&result.path)await load(result.path);}
    catch(e){setError((e as Error).message);}finally{setBusy('');}
  };
  const recheck=async()=>{if(!preview)return;setError('');try{await load(preview.newPath);}catch(e){setError((e as Error).message);}finally{setBusy('');}};
  const save=async()=>{
    if(!preview)return;setBusy('save');setError('');
    try {
      const result=await api<{restored:number;retained:number}>('/directory-relocations/confirm',{token:preview.token,selections:selectedRows.map(({row,candidate})=>({photoId:row.photoId,candidateToken:candidate.token,confirmUnverified:manual&&!candidate.verified}))});
      await onSaved(result.restored,result.retained);onClose();
    }catch(e){setError((e as Error).message);}finally{setBusy('');}
  };
  const labels:Record<string,string>={matched:'可恢复',ambiguous:'有歧义',manual:'待人工核对',unmatched:'未匹配',available:'仍可访问'};
  return <><Modal title="整个目录重新定位" description="选择原照片目录的新位置，先核对候选，仅更新明确确认的照片路径。" onClose={close} wide className="directory-relocation-modal">
    <label className="form-section-label">原挂载目录</label><code className="confirm-root-path">{root.path}</code>
    <div className="directory-relocation-actions"><button className="button secondary" disabled={!!busy} onClick={()=>void choose()}><FolderOpen size={15}/>{busy==='choose'?'请在系统窗口选择新目录…':busy==='check'?'正在查找并核对候选…':preview?'重新选择新目录':'选择新目录'}</button>{preview&&<button className="text-button" disabled={!!busy} onClick={()=>void recheck()}>重新核对此目录</button>}</div>
    {preview&&<><code className="confirm-root-path">{preview.newPath}</code><div className="inline-notice">共 {preview.total} 条原索引：可恢复 {preview.matchedCount}，歧义/待核对 {preview.ambiguousCount}，未匹配 {preview.unmatchedCount}，原路径仍可访问 {preview.availableCount}。仅自动选中通过核对的单一候选；歧义项请明确选择，未选择的记录及分类保留。</div>
      <div className="directory-relocation-actions"><span>已选择 {selectedRows.length} 张</span><button className="text-button" disabled={!!busy} onClick={()=>setSelected(Object.fromEntries(preview.rows.filter(row=>row.state==='matched').map(row=>[row.photoId,row.candidates[0].token])))}>选择全部明确匹配</button><button className="text-button" disabled={!!busy} onClick={()=>setSelected({})}>清空选择</button></div>
      <div className="directory-relocation-list">{preview.rows.slice(page*100,(page+1)*100).map(row=>{
        const candidate=row.candidates.find(c=>c.token===selected[row.photoId]);
        return <div className="directory-relocation-row" key={row.photoId}><div><strong>{row.fileName}</strong><small>{labels[row.state]} · {row.message}</small><code title={row.oldPath}>{row.oldPath}</code></div><div>{row.candidates.length>0?<><select aria-label={`恢复候选 ${row.fileName} ${row.photoId}`} disabled={!!busy} value={selected[row.photoId]||''} onChange={e=>{setSelected(old=>({...old,[row.photoId]:e.target.value}));setManual(false);}}><option value="">不恢复此记录</option>{row.candidates.map(c=><option key={c.token} value={c.token}>{c.path}{c.verified?'':'（需人工确认）'}</option>)}</select>{candidate&&<button className="text-button" disabled={!!busy} onClick={()=>setInspecting({row,candidate})}>核对影像</button>}</>:<span className="muted-note">保留原记录</span>}</div></div>;
      })}</div>
      <div className="place-photo-pagination"><button className="text-button" disabled={!!busy||page===0} onClick={()=>setPage(p=>p-1)}>上一页</button><span>第 {page+1} / {Math.max(1,Math.ceil(preview.rows.length/100))} 页 · 翻页保留选择</span><button className="text-button" disabled={!!busy||(page+1)*100>=preview.rows.length} onClick={()=>setPage(p=>p+1)}>下一页</button></div>
      {manualCount>0&&<label className="relocation-confirm"><input type="checkbox" disabled={!!busy} checked={manual} onChange={e=>setManual(e.target.checked)}/>我已人工核对所选的 {manualCount} 张无旧缩略图照片，确认文件对应正确</label>}
      {duplicate&&<p className="form-error" role="alert">多个旧索引选择了同一个新文件，请修改选择；不会合并或覆盖记录。</p>}
    </>}
    <p className="form-note">确认后授权新目录的只读访问；只更新所选路径，保留照片 ID、地点、类别、排除状态和排序。未匹配及未选记录留在旧目录；以后手动扫描新目录时，其他照片也会正常进入索引。原图不移动或改写。</p>
    {error&&<p className="form-error" role="alert">{error}</p>}
    <div className="modal-footer"><button className="button secondary" disabled={!!busy} onClick={close}>取消</button><button className="button primary" disabled={!!busy||!selectedRows.length||duplicate||(manualCount>0&&!manual)} onClick={()=>void save()}>{busy==='save'?'保存中…':`确认恢复 ${selectedRows.length} 张`}</button></div>
  </Modal>{inspecting&&<Modal title={`核对照片：${inspecting.row.fileName}`} onClose={()=>setInspecting(null)}><div className="relocation-images"><div>{inspecting.candidate.oldImage?<img src={inspecting.candidate.oldImage} alt="旧索引影像"/>:<span>旧缩略图不可用</span>}<small>旧索引影像</small></div><div><img src={inspecting.candidate.newImage} alt="候选照片"/><small>候选照片</small></div></div><code className="confirm-root-path">{inspecting.candidate.path}</code><p className="muted-note">{inspecting.candidate.verification}</p><div className="modal-footer"><button className="button primary" onClick={()=>setInspecting(null)}>返回目录核对</button></div></Modal>}</>;
}
