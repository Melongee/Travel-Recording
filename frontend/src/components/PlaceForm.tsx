import {useEffect, useId, useState} from 'react';
import type {FormEvent, KeyboardEvent} from 'react';
import {useQuery} from '@tanstack/react-query';
import {MapPin} from 'lucide-react';
import type {Overview, Place} from '../model';
import {PROVINCES} from '../model';
import {api} from '../api';
import TravelMap from '../TravelMap';
import Modal from './Modal';
import type {GeographyState} from './GeographyPanel';

type Source = {provider:string; coordinateSystem:string; lat:number; lng:number; poiId:string; adaptation:string};
type Candidate = {name:string; address:string; province:string; provinceCode:string; lat:number; lng:number; source:Source};

export default function PlaceForm({place, province, overview, onClose, onSaved}: {
  place?:Place; province:string; overview:Overview; onClose:()=>void; onSaved:()=>Promise<void>;
}) {
  const [name, setName] = useState(place?.name || '');
  const [region, setRegion] = useState(place?.province || province || '');
  const [lat, setLat] = useState(place?.lat ?? 36.9), [lng, setLng] = useState(place?.lng ?? 100.18);
  const [description, setDescription] = useState(place?.description || '');
  const [source, setSource] = useState<Source | undefined>(() => {
    try { return place?.coordinateSource && place.coordinateSource !== 'manual' ? JSON.parse(place.coordinateSource) : undefined; }
    catch { return undefined; }
  });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false), [composing, setComposing] = useState(false);
  const [debounced, setDebounced] = useState(''), [active, setActive] = useState(-1);
  const [selectionNote, setSelectionNote] = useState('');
  const listId = useId();
  const keyword = name.trim();
  const geo = useQuery({queryKey:['geography'], queryFn:()=>api<GeographyState>('/geography/status')});
  const online = !!geo.data?.configured && !geo.data.offline;
  useEffect(() => {
    if (!open || composing) return;
    const timer = window.setTimeout(() => setDebounced(keyword), 450);
    return () => window.clearTimeout(timer);
  }, [keyword, open, composing]);
  const ready = open && online && !composing && keyword.length >= 2 && debounced === keyword;
  const search = useQuery({
    queryKey:['place-search', debounced], enabled:ready, retry:false, staleTime:30_000, refetchOnWindowFocus:false,
    queryFn:({signal})=>api<Candidate[]>(`/geography/search?${new URLSearchParams({q:debounced})}`, undefined, 'GET', signal),
  });
  // Never display an older query's candidates while the next keyword is debouncing.
  const candidates = ready ? search.data || [] : [];
  const choose = (candidate:Candidate) => {
    setName(candidate.name.slice(0, 60)); setLat(candidate.lat); setLng(candidate.lng); setSource(candidate.source);
    const matched = PROVINCES.find(p=>p[1] === candidate.provinceCode);
    setRegion(matched?.[0] || ''); setOpen(false); setActive(-1);
    setSelectionNote(matched ? `已匹配${matched[0]}，可在地图上继续调整位置。` : '此结果缺少省份信息，请手动选择所属省份。');
  };
  const keyboard = (event:KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing || composing || !open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (candidates.length) setActive(index=>event.key === 'ArrowDown' ? (index + 1) % candidates.length : (index <= 0 ? candidates.length : index) - 1);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (candidates[active]) choose(candidates[active]);
    }
  };
  const submit = async (event:FormEvent) => {
    event.preventDefault(); setError('');
    const matched = PROVINCES.find(p=>p[0] === region);
    if (!matched) { setError('请选择搜索结果以匹配省份，或手动选择所属省份。'); return; }
    setBusy(true);
    try {
      await api(place ? `/places/${place.id}` : '/places', {name:name.trim(), province:region, provinceCode:matched[1], lat, lng, description, source}, place ? 'PATCH' : 'POST');
      await onSaved(); onClose();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return <Modal title={place ? '编辑旅行地点' : '收藏新的旅行地点'}
    description="输入地点名称，自动搜索全国候选；选择结果后匹配省份和位置。离线可手动选省份与位置。" onClose={onClose} wide>
    <form onSubmit={event=>void submit(event)}>
      <div className="form-row">
        <label className="form-field grow">地点名称<input aria-label="地点名称" role="combobox" autoComplete="off"
          aria-autocomplete="list" aria-expanded={candidates.length > 0} aria-controls={candidates.length ? listId : undefined}
          aria-activedescendant={candidates[active] ? `${listId}-${active}` : undefined}
          required value={name} maxLength={60} placeholder="例如：青海湖" onKeyDown={keyboard}
          onCompositionStart={()=>setComposing(true)} onCompositionEnd={()=>setComposing(false)}
          onChange={event=>{setName(event.target.value);setOpen(true);setActive(-1);setSelectionNote('');}}/></label>
        <label className="form-field region-field">所属省份<select aria-label="所属省份" required value={region}
          onChange={event=>{setRegion(event.target.value);setSelectionNote('');}}>
          <option value="">自动匹配 / 手动选择</option>{PROVINCES.map(p=><option key={p[1]}>{p[0]}</option>)}
        </select></label>
      </div>
      <div className="place-autocomplete">
        <p className="place-search-status" role="status">{!geo.data ? geo.error?.message || '正在读取地图配置…'
          : !online ? geo.data.message
          : selectionNote || (open && keyword.length >= 2 ? (!ready || search.isFetching ? '正在搜索天地图…'
            : search.isError ? '搜索暂不可用，可重试或手动定位。'
            : search.isSuccess && !candidates.length ? '没有找到结果，可换一个地名或手动定位。' : '选择最匹配的结果，自动填写省份与坐标。')
            : '天地图 · 输入至少 2 个字后自动联网搜索，照片不会发送给地图服务。')}</p>
        {ready && search.isError && <div className="form-error" role="alert">{search.error.message}
          <button className="text-button" type="button" onClick={()=>void search.refetch()}>重试搜索</button></div>}
        {!!candidates.length && <div className="search-candidates place-search-results" id={listId} role="listbox" aria-label="地点搜索结果">
          {candidates.map((candidate,index)=><button id={`${listId}-${index}`} role="option" aria-selected={active === index}
            key={`${candidate.source.poiId}-${index}`} type="button" onClick={()=>choose(candidate)}>
            <MapPin size={14}/><span><strong>{candidate.name}</strong><small>{[candidate.province || '省份待确认',candidate.address].filter(Boolean).join(' · ')}</small></span>
          </button>)}
        </div>}
      </div>
      <label className="form-field">地点描述<textarea value={description} maxLength={500} onChange={e=>setDescription(e.target.value)} rows={2}/></label>
      <div className="form-map"><TravelMap places={overview.places} photos={[]} province={region} onProvinceChange={setRegion}
        onPlaceClick={()=>{}} compact pickMode selectedPoint={{lat,lng}} onPick={(lat,lng)=>{setSource(undefined);setLat(Number(lat.toFixed(6)));setLng(Number(lng.toFixed(6)));}}/></div>
      <div className="coordinate-row"><span><MapPin size={12}/>{source ? '天地图 CGCS2000 · WGS84 近似显示' : 'WGS84 · 手动位置'}</span>
        <label>经度<input aria-label="经度" type="number" required min={-180} max={180} step="any" value={lng} onChange={e=>{setSource(undefined);setLng(Number(e.target.value));}}/></label>
        <label>纬度<input aria-label="纬度" type="number" required min={-90} max={90} step="any" value={lat} onChange={e=>{setSource(undefined);setLat(Number(e.target.value));}}/></label>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>取消</button>
        <button type="submit" className="button primary" disabled={busy}>{busy ? '保存中…' : '保存地点'}</button></div>
    </form>
  </Modal>;
}
