import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  ArrowDownWideNarrow, ArrowLeft, ArrowRight, Check, CheckCheck, ChevronDown,
  ChevronLeft, ChevronRight, Compass, Download, Ellipsis, ExternalLink, Folder,
  FolderOpen, Grid2X2, Heart, Image, Info, Layers, List, MapPin, MapPinned,
  Maximize2, Menu, Minus, Mountain, Pencil, Plus, RefreshCw, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, Tag, Trash2, Upload, WifiOff, X,
  ZoomIn, ZoomOut, CheckCircle2, CircleHelp, Copy, Camera, Leaf, CircleAlert,
} from 'lucide-react';
import TravelMap from './TravelMap';
import ViewerFilmstrip from './ViewerFilmstrip';
import {
  createInitialState, classifyPhotos, deletePlace, deleteCategory,
  storageKey, validateState,
} from './model';
import type { DemoState, Photo, Place } from './model';

type View = 'map' | 'photos' | 'uncategorized' | 'places' | 'settings' | 'place';
type Dialog =
  | { type: 'place'; place?: Place }
  | { type: 'classify'; ids: string[]; target?: string }
  | { type: 'categories'; placeId: string }
  | { type: 'pickPhotos'; placeId: string }
  | { type: 'root' }
  | { type: 'about' }
  | null;
type Confirmation = { title: string; body: string; action: () => void; label?: string };

const PROVINCES = [
  ['北京', '110000'], ['天津', '120000'], ['河北', '130000'], ['山西', '140000'], ['内蒙古', '150000'],
  ['辽宁', '210000'], ['吉林', '220000'], ['黑龙江', '230000'], ['上海', '310000'], ['江苏', '320000'],
  ['浙江', '330000'], ['安徽', '340000'], ['福建', '350000'], ['江西', '360000'], ['山东', '370000'],
  ['河南', '410000'], ['湖北', '420000'], ['湖南', '430000'], ['广东', '440000'], ['广西', '450000'],
  ['海南', '460000'], ['重庆', '500000'], ['四川', '510000'], ['贵州', '520000'], ['云南', '530000'],
  ['西藏', '540000'], ['陕西', '610000'], ['甘肃', '620000'], ['青海', '630000'], ['宁夏', '640000'],
  ['新疆', '650000'], ['台湾', '710000'], ['香港', '810000'], ['澳门', '820000'],
];
const CANDIDATES = [
  { name: '塔尔寺', province: '青海', provinceCode: '630000', lat: 36.487, lng: 101.568 },
  { name: '翡翠湖', province: '青海', provinceCode: '630000', lat: 37.89, lng: 95.08 },
  { name: '青海湖', province: '青海', provinceCode: '630000', lat: 36.9, lng: 100.18 },
  { name: '九寨沟', province: '四川', provinceCode: '510000', lat: 33.25, lng: 103.92 },
  { name: '丽江', province: '云南', provinceCode: '530000', lat: 26.87, lng: 100.23 },
  { name: '喀纳斯', province: '新疆', provinceCode: '650000', lat: 48.72, lng: 87.04 },
  { name: '西湖', province: '浙江', provinceCode: '330000', lat: 30.24, lng: 120.14 },
];

function hasKnownProvinces(state: DemoState): boolean {
  return state.places.every((place) => PROVINCES.some(([name, code]) => place.province === name && place.provinceCode === code));
}

function loadState(): DemoState {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (validateState(saved) && hasKnownProvinces(saved)) return saved;
  } catch { /* 无旧数据时从示例开始。 */ }
  return createInitialState();
}

const dateLabel = (date: string) => new Date(date).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
const coverFor = (state: DemoState, id: string) => state.photos.find((p) => p.placeId === id && p.available)?.src || '/assets/scene-01.jpg';
const countFor = (state: DemoState, id: string) => state.photos.filter((p) => p.placeId === id).length;

function Modal({ title, description, children, onClose, wide = false }: {
  title: string; description?: string; children: ReactNode; onClose: () => void; wide?: boolean;
}) {
  const heading = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    const keyboard = (event: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select, textarea, a[href], [tabindex="0"]') || []);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keyboard);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', keyboard);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={heading} ref={ref}>
      <div className="modal-heading"><div><h2 id={heading}>{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><X size={20} /></button></div>
      {children}
    </div>
  </div>;
}

function PhotoImage({ photo, unavailable = false }: { photo: Photo; unavailable?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (unavailable || failed) return <div className="image-unavailable"><Image size={27} strokeWidth={1.4} /><span>照片暂不可用</span><small>整理记录已保留</small></div>;
  return <img src={photo.src} alt={`旅行示例照片 ${photo.fileName}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />;
}

function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Mountain size={36} strokeWidth={1.25} /></div><h3>{title}</h3><p>{description}</p>{action}</div>;
}

export default function App() {
  const [data, setData] = useState<DemoState>(loadState);
  const [view, setView] = useState<View>('map');
  const [province, setProvince] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('date-desc');
  const [density, setDensity] = useState('comfortable');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<Dialog>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [message, setMessage] = useState('');
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [viewerInfo, setViewerInfo] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [scan, setScan] = useState<number | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scanTimer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const persistenceWarning = useRef(false);

  const toast = (text: string) => {
    clearTimeout(toastTimer.current); setMessage(text);
    toastTimer.current = setTimeout(() => setMessage(''), 4400);
  };
  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(data)); }
    catch { if (!persistenceWarning.current) { persistenceWarning.current = true; setMessage('浏览器未允许保存，当前操作仅在本次演示中保留。'); } }
  }, [data]);
  useEffect(() => () => { clearTimeout(toastTimer.current); clearInterval(scanTimer.current); }, []);

  const currentPlace = data.places.find((p) => p.id === placeId);
  const uncategorized = data.photos.filter((p) => !p.placeId).length;
  const provincesVisited = new Set(data.places.map((p) => p.province)).size;
  const isUnavailable = (photo: Photo) => !photo.available || data.roots.find((r) => r.id === photo.rootId)?.status === 'unavailable';
  const currentCategories = data.categories.filter((c) => c.placeId === placeId);
  useEffect(() => {
    if (categoryId && !data.categories.some((category) => category.id === categoryId)) setCategoryId('');
  }, [data.categories, categoryId]);

  const navigate = (next: View, id?: string) => {
    setView(next); setQuery(''); setCategoryId(''); setSelecting(false); setSelected(new Set()); setMobileNav(false);
    if (id) setPlaceId(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const visiblePhotos = useMemo(() => {
    const search = query.trim().toLowerCase();
    return data.photos.filter((photo) => {
      if (view === 'uncategorized' && photo.placeId) return false;
      if (view === 'place' && photo.placeId !== placeId) return false;
      if (view === 'place' && categoryId && !photo.categoryIds.includes(categoryId)) return false;
      if (!search) return true;
      const place = data.places.find((p) => p.id === photo.placeId);
      const categories = data.categories.filter((c) => photo.categoryIds.includes(c.id)).map((c) => c.name);
      return [photo.fileName, place?.name, place?.province, ...categories].join(' ').toLowerCase().includes(search);
    }).sort((a, b) => sort === 'name' ? a.fileName.localeCompare(b.fileName) : sort === 'date-asc' ? a.takenAt.localeCompare(b.takenAt) : b.takenAt.localeCompare(a.takenAt));
  }, [data, view, placeId, categoryId, query, sort]);
  const placesShown = data.places.filter((p) => (!province || p.province === province) && (!query || `${p.name}${p.province}${p.description}`.includes(query.trim())));
  const viewerPhoto = data.photos.find((p) => p.id === viewerId);
  const viewerList = view === 'map' || view === 'places' || view === 'settings' ? data.photos : visiblePhotos;
  const viewerIndex = viewerList.findIndex((p) => p.id === viewerId);
  const viewerCollectionName = view === 'place' && currentPlace
    ? `${currentPlace.name} · ${currentCategories.find((category) => category.id === categoryId)?.name || '全部照片'}`
    : view === 'uncategorized' ? '未分类照片' : '全部照片';
  const viewerStep = (step: number) => {
    if (!viewerList.length) return;
    const index = (Math.max(0, viewerIndex) + step + viewerList.length) % viewerList.length;
    setViewerId(viewerList[index].id); setZoom(1);
  };
  const closeViewer = () => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); setViewerId(null); setZoom(1); };
  useEffect(() => {
    if (!viewerId || dialog || confirmation) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeViewer();
      if (event.key === 'ArrowLeft') { event.preventDefault(); viewerStep(-1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); viewerStep(1); }
    };
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', key); };
  }, [viewerId, viewerIndex, dialog, confirmation, visiblePhotos]);

  const togglePhoto = (id: string) => {
    setSelected((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
    setSelecting(true);
  };
  const classify = (ids: string[], target: string | null, categories: string[]) => {
    try {
      setData(classifyPhotos(data, ids, target, categories));
      setDialog(null); setSelected(new Set()); setSelecting(false);
      if (viewerId) closeViewer();
      toast(target ? `已将 ${ids.length} 张照片归入「${data.places.find((p) => p.id === target)?.name}」` : `已将 ${ids.length} 张照片移回未分类`);
    } catch (error) { toast((error as Error).message); }
  };

  const simulateScan = () => {
    if (scan !== null) return;
    setScan(0);
    let progress = 0;
    scanTimer.current = setInterval(() => {
      progress += 9;
      if (progress >= 100) {
        clearInterval(scanTimer.current); setScan(null);
        toast(`模拟扫描完成：${data.photos.length} 张示例照片。未读取本机目录。`);
      } else setScan(progress);
    }, 140);
  };
  const exportData = () => {
    const payload = { format: 'travel-recording-demo', version: 1, exportedAt: new Date().toISOString(), data };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = '旅迹-演示整理数据.json'; link.click(); URL.revokeObjectURL(url);
    toast('演示整理数据已导出，示例图片不包含在文件中');
  };
  const importData = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 2_000_000) throw new Error('演示数据文件请控制在 2 MB 以内。');
      const parsed = JSON.parse(await file.text());
      if (parsed.format !== 'travel-recording-demo' || parsed.version !== 1 || !validateState(parsed.data) || !hasKnownProvinces(parsed.data)) throw new Error('这不是有效的旅迹演示数据文件。');
      setConfirmation({ title: '恢复演示整理数据？', body: `将用文件中的 ${parsed.data.photos.length} 张示例照片和 ${parsed.data.places.length} 个地点替换本浏览器的演示状态。不会读取或修改本机照片。`, label: '确认恢复', action: () => { setData(parsed.data); navigate('map'); toast('演示整理数据已恢复'); } });
    } catch (error) { toast((error as Error).message); }
    finally { if (importRef.current) importRef.current.value = ''; }
  };
  const reset = () => setConfirmation({ title: '重新开始这段示例旅程？', body: '会恢复最初的 60 张示例照片和 6 个地点，清除你在本浏览器中做的演示调整。可先导出演示数据保存进度。', label: '重置演示', action: () => { setData(createInitialState()); setProvince(''); navigate('map'); toast('演示数据已重置'); } });

  const PhotoGrid = ({ photos = visiblePhotos, preview = false }: { photos?: Photo[]; preview?: boolean }) => <div className={`photo-grid ${density === 'compact' ? 'compact-grid' : ''} ${preview ? 'preview-grid' : ''}`}>
    {photos.map((photo) => {
      const place = data.places.find((p) => p.id === photo.placeId);
      return <article className={`photo-card ${selected.has(photo.id) ? 'is-selected' : ''}`} key={photo.id}>
        <button className="photo-open" aria-label={selecting ? `${selected.has(photo.id) ? '取消选择' : '选择'} ${photo.fileName}` : `查看照片 ${photo.fileName}`} onClick={() => selecting ? togglePhoto(photo.id) : (setViewerId(photo.id), setZoom(1))}>
          <PhotoImage photo={photo} unavailable={isUnavailable(photo)} />
          {!isUnavailable(photo) && <span className="photo-shade" />}
          <span className="photo-location"><MapPin size={12} />{place?.name || '等待归类'}</span>
          {photo.categoryIds.length > 1 && <span className="photo-multiple"><Layers size={12} />{photo.categoryIds.length}</span>}
        </button>
        {!preview && <button className={`photo-select ${selected.has(photo.id) ? 'checked' : ''}`} aria-label={`${selected.has(photo.id) ? '取消勾选' : '勾选'} ${photo.fileName}`} aria-pressed={selected.has(photo.id)} onClick={() => togglePhoto(photo.id)}>{selected.has(photo.id) && <Check size={15} />}</button>}
        <div className="photo-caption"><span>{photo.fileName}</span><time>{dateLabel(photo.takenAt)}</time></div>
      </article>;
    })}
  </div>;

  return <div className="app-shell">
    {mobileNav && <button className="nav-scrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'nav-open' : ''}`}>
      <button className="brand" onClick={() => navigate('map')} aria-label="旅迹首页"><span className="brand-symbol"><MapPin size={26} strokeWidth={1.7} /></span><span><strong>旅迹<span className="brand-dot">.</span></strong><small>FOOTPRINTS</small></span></button>
      <div className="sidebar-section-label">我的相册</div>
      <nav className="primary-nav" aria-label="主要导航">
        <button className={view === 'map' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('map')}><MapPinned size={19} />旅行地图</button>
        <button className={view === 'photos' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('photos')}><Grid2X2 size={18} />全部照片<span className="nav-count">{data.photos.length}</span></button>
        <button className={view === 'uncategorized' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('uncategorized')}><Image size={18} />未分类照片{uncategorized > 0 && <span className="nav-count warm">{uncategorized}</span>}</button>
        <button className={view === 'places' || view === 'place' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('places')}><Compass size={19} />旅行地点<span className="nav-count">{data.places.length}</span></button>
      </nav>
      <div className="sidebar-separator" />
      <div className="sidebar-section-label">收藏的地方 <span>{provincesVisited} 个省份</span></div>
      <div className="province-nav">{[...new Set(data.places.map((p) => p.province))].map((name) => <button key={name} onClick={() => { setProvince(name); navigate('map'); }} className={view === 'map' && province === name ? 'province-link chosen' : 'province-link'}><span className={`province-dot province-${name}`} />{name}<span>{data.places.filter((p) => p.province === name).length}</span></button>)}</div>
      <div className="sidebar-bottom">
        <div className="sidebar-note"><Mountain size={31} strokeWidth={1.1} /><p>每一程，<br />都值得被记住。</p><span>下一站，会是哪里？</span></div>
        <button className={view === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => navigate('settings')}><Settings2 size={18} />设置与数据</button>
        <button className="local-badge" onClick={() => setDialog({ type: 'about' })}><span className="status-dot" /><span>个人相册 · 前端演示</span><Info size={14} /></button>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setMobileNav(true)}><Menu size={22} /></button><span className="breadcrumb">我的旅行 <ChevronRight size={12} /><span>{view === 'map' ? '旅行地图' : view === 'photos' ? '全部照片' : view === 'uncategorized' ? '未分类照片' : view === 'settings' ? '设置与数据' : currentPlace && view === 'place' ? currentPlace.name : '旅行地点'}</span></span></div><div className="topbar-actions"><span className="offline-status"><ShieldCheck size={14} />本地素材 · 离线可用</span><button className="icon-button help-button" aria-label="关于演示" onClick={() => setDialog({ type: 'about' })}><CircleHelp size={19} /></button><span className="traveler-avatar" aria-hidden="true">旅</span></div></header>

      <div className="content-wrap">
      {view === 'map' && <>
        <section className="page-heading map-heading"><div><div className="eyebrow"><span /> MY TRAVEL ATLAS</div><h1>走过的地方，都有故事<span>。</span></h1><p>让照片回到地图上，重温每一段值得收藏的旅程。</p><div className="travel-summary"><span><b>{provincesVisited}</b> 个省份</span><i /><span><b>{data.places.length}</b> 个旅行地点</span><i /><span><b>{data.photos.length}</b> 张照片</span></div></div><div className="heading-actions"><button className="button secondary" onClick={() => navigate('uncategorized')}><Image size={16} />整理照片{uncategorized > 0 && <span className="button-count">{uncategorized}</span>}</button><button className="button primary" onClick={() => setDialog({ type: 'place' })}><Plus size={17} />新增地点</button></div></section>
        <section className="map-layout">
          <div className="map-card"><TravelMap places={data.places} photos={data.photos} province={province} onProvinceChange={setProvince} onPlaceClick={(id) => navigate('place', id)} /><div className="map-card-caption"><span><span className="legend-dot" />已收藏的省份</span><span><MapPin size={12} />{province ? '点击地点，回到那段旅程' : '点击省份，查看旅行地点'}</span><button onClick={() => setDialog({ type: 'about' })}>地图为演示示意 <Info size={12} /></button></div></div>
          <aside className="places-panel"><div className="panel-title"><h2>{province ? `${province}的旅行` : '我的旅行地点'}<span>{placesShown.length}</span></h2><button className="icon-button" aria-label="新增旅行地点" onClick={() => setDialog({ type: 'place' })}><Plus size={18} /></button></div><p className="panel-description">每一个标记，都是一份独家记忆。</p><div className="places-panel-list">{placesShown.length ? placesShown.map((place) => <button className="place-row" key={place.id} onClick={() => navigate('place', place.id)}><img src={coverFor(data, place.id)} alt={`${place.name}示例封面`} /><div><strong>{place.name}</strong><span><MapPin size={11} />{place.province}<i />{countFor(data, place.id)} 张照片</span></div><ChevronRight size={16} /></button>) : <div className="mini-empty"><MapPin size={25} /><p>这里的故事还未开始</p><button className="text-button" onClick={() => setDialog({ type: 'place' })}>收藏第一个地点</button></div>}</div><button className="panel-footer" onClick={() => navigate('places')}>查看所有地点 <ArrowRight size={15} /></button></aside>
        </section>
        <section className="recent-section"><div className="section-heading"><div><h2>最近的旅行记忆 <span>RECENT MEMORIES</span></h2><p>有些风景，值得再看一遍。</p></div><button className="text-button" onClick={() => navigate('photos')}>浏览全部照片 <ArrowRight size={15} /></button></div>{data.photos.length ? <PhotoGrid photos={[...data.photos].filter((p) => p.available && p.placeId).sort((a, b) => b.takenAt.localeCompare(a.takenAt)).slice(0, 4)} preview /> : <EmptyState title="还没有旅行照片" description="可以在设置中重置示例数据，重新体验地图相册。" action={<button className="button secondary" onClick={reset}>恢复示例照片</button>} />}</section>
        <div className="page-footnote"><Leaf size={13} />照片在本地，回忆在身边。<span>示例素材仅展示交互，与标注地点无对应关系。</span></div>
      </>}

      {(view === 'photos' || view === 'uncategorized' || view === 'place') && <>
        {view === 'place' && currentPlace ? <><button className="back-link" onClick={() => navigate('map')}><ArrowLeft size={15} />返回旅行地图</button><section className="place-hero" style={{ backgroundImage: `linear-gradient(90deg,rgba(20,47,39,.88),rgba(20,47,39,.35)),url("${coverFor(data, currentPlace.id)}")` }}><div><div className="place-overline"><MapPin size={14} />{currentPlace.province} · 我的旅行地点</div><h1>{currentPlace.name}</h1><p>{currentPlace.description || '把这里的风景，放进自己的旅行记忆。'}</p><span>{countFor(data, currentPlace.id)} 张照片 <i />{currentCategories.length} 个类别</span></div><div className="place-hero-actions"><button className="button translucent" onClick={() => setDialog({ type: 'place', place: currentPlace })}><Pencil size={15} />编辑地点</button><button className="button light" onClick={() => setDialog({ type: 'pickPhotos', placeId: currentPlace.id })}><Plus size={16} />添加照片</button></div></section><div className="category-bar"><div className="category-tabs"><button className={!categoryId ? 'category-tab active' : 'category-tab'} onClick={() => setCategoryId('')}>全部照片 <span>{countFor(data, currentPlace.id)}</span></button>{currentCategories.map((c) => <button key={c.id} className={categoryId === c.id ? 'category-tab active' : 'category-tab'} onClick={() => setCategoryId(c.id)}>{c.name}<span>{data.photos.filter((p) => p.categoryIds.includes(c.id)).length}</span></button>)}</div><button className="text-button muted" onClick={() => setDialog({ type: 'categories', placeId: currentPlace.id })}><Tag size={14} />管理类别</button></div></> : <section className="page-heading"><div><div className="eyebrow">PHOTO LIBRARY</div><h1>{view === 'uncategorized' ? '给照片一个归处。' : '每一张，都是旅行的切片。'}</h1><p>{view === 'uncategorized' ? `还有 ${uncategorized} 张照片等待整理，选中它们，放回旅程中的地点。` : `共 ${data.photos.length} 张示例照片，用你喜欢的方式重新看见。`}</p></div><button className="button secondary" disabled={scan !== null} onClick={simulateScan}><RefreshCw size={16} className={scan !== null ? 'spin' : ''} />{scan !== null ? `模拟扫描 ${scan}%` : '刷新图库（模拟）'}</button></section>}
        <div className="gallery-toolbar"><label className="search-field"><Search size={16} /><input aria-label="搜索照片" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索照片、地点或类别" />{query && <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={14} /></button>}</label><div className="toolbar-right"><label className="sort-field"><ArrowDownWideNarrow size={15} /><select aria-label="照片排序" value={sort} onChange={(e) => setSort(e.target.value)}><option value="date-desc">拍摄时间 · 从新到旧</option><option value="date-asc">拍摄时间 · 从旧到新</option><option value="name">文件名称</option></select></label><button className="icon-button density-button" aria-label={density === 'comfortable' ? '切换紧凑网格' : '切换舒适网格'} onClick={() => setDensity((value) => value === 'comfortable' ? 'compact' : 'comfortable')}><Grid2X2 size={17} /></button><button className={`button ${selecting ? 'primary' : 'secondary'}`} onClick={() => { setSelecting(!selecting); setSelected(new Set()); }}><CheckCheck size={16} />{selecting ? '退出选择' : '批量选择'}</button></div></div>
        {visiblePhotos.length > 0 ? <><div className="gallery-meta"><span>{visiblePhotos.length} 张照片{query && ` · 搜索“${query}”`}</span>{selecting && <button className="text-button" onClick={() => setSelected(new Set(visiblePhotos.map((p) => p.id)))}>全选当前结果</button>}</div><PhotoGrid /><div className="gallery-end"><span />已展示全部 {visiblePhotos.length} 张照片<span /></div></> : <EmptyState title={query ? '还没有找到这张记忆' : view === 'uncategorized' ? '照片都已经有了归处' : '这里的照片，等你来收藏'} description={query ? '换一个文件名、地点或类别试试。' : view === 'uncategorized' ? '所有照片都已关联地点，去地图上看看吧。' : '你可以从已扫描的示例图库添加照片。'} action={<button className="button secondary" onClick={() => query ? setQuery('') : view === 'place' && currentPlace ? setDialog({ type: 'pickPhotos', placeId: currentPlace.id }) : navigate('map')}>{query ? '清除搜索' : view === 'place' ? '添加照片' : '回到旅行地图'}</button>} />}
      </>}

      {view === 'places' && <><section className="page-heading"><div><div className="eyebrow">PLACES I'VE BEEN</div><h1>收藏地点，也收藏当时的自己。</h1><p>{data.places.length} 个旅行地点，{provincesVisited} 个省份，还有更多故事在路上。</p></div><button className="button primary" onClick={() => setDialog({ type: 'place' })}><Plus size={17} />新增地点</button></section><div className="places-toolbar"><label className="search-field"><Search size={16} /><input aria-label="搜索地点" placeholder="寻找一个收藏的地点" value={query} onChange={(e) => setQuery(e.target.value)} /></label><div className="province-filters"><button className={!province ? 'filter-chip active' : 'filter-chip'} onClick={() => setProvince('')}>全部省份</button>{[...new Set(data.places.map((p) => p.province))].map((name) => <button className={province === name ? 'filter-chip active' : 'filter-chip'} key={name} onClick={() => setProvince(name)}>{name}</button>)}</div></div>{placesShown.length ? <div className="place-card-grid">{placesShown.map((place) => <article className="destination-card" key={place.id}><button className="destination-cover" aria-label={`打开${place.name}相册`} onClick={() => navigate('place', place.id)}><img src={coverFor(data, place.id)} alt={`${place.name}示例封面`} /><span><MapPin size={12} />{place.province}</span><strong>{place.name}</strong></button><div className="destination-info"><p>{place.description || '一段新的旅行，等你留下记忆。'}</p><div><span><Camera size={14} />{countFor(data, place.id)} 张照片</span><button className="icon-button" aria-label={`编辑${place.name}`} onClick={() => setDialog({ type: 'place', place })}><Pencil size={15} /></button></div></div></article>)}</div> : <EmptyState title="新的故事，从一个地点开始" description="在地图上收藏一个地点，再为它添加照片。" action={<button className="button primary" onClick={() => setDialog({ type: 'place' })}><Plus size={16} />新增地点</button>} />}</>}

      {view === 'settings' && <><section className="page-heading"><div><div className="eyebrow">YOUR LITTLE ARCHIVE</div><h1>安心收藏，慢慢整理。</h1><p>管理演示目录与整理数据，让这份相册保持你喜欢的样子。</p></div></section><div className="demo-notice"><Info size={18} /><p><strong>这是前端交互演示。</strong>目录扫描、文件定位和路径恢复均为模拟，不读取或修改你的本机文件。整理状态保存在当前浏览器中。</p></div><section className="settings-card"><div className="settings-card-header"><div><h2><Folder size={19} />照片目录</h2><p>示例目录，真实目录接入会在后续版本完成。</p></div><button className="button secondary" onClick={() => setDialog({ type: 'root' })}><Plus size={16} />添加示例目录</button></div><div className="root-list">{data.roots.map((root) => <div className="root-row" key={root.id}><span className="folder-symbol"><FolderOpen size={24} strokeWidth={1.4} /></span><div className="root-info"><strong>{root.path}</strong><span>{data.photos.filter((p) => p.rootId === root.id).length} 张示例照片 · {root.status === 'unavailable' ? '目录暂不可用，整理记录已保留' : root.enabled ? '已加入示例图库' : '已停止模拟扫描'}</span></div><span className={`root-status ${root.status === 'unavailable' ? 'warning' : ''}`}><span />{root.status === 'unavailable' ? '不可用' : '可访问'}</span><button className="text-button muted root-simulation" onClick={() => { setData((previous) => ({ ...previous, roots: previous.roots.map((r) => r.id === root.id ? { ...r, status: r.status === 'ready' ? 'unavailable' : 'ready' } : r) })); toast(root.status === 'ready' ? '已模拟目录断开，照片与分类记录仍然保留' : '已模拟目录恢复'); }}>{root.status === 'ready' ? '模拟断开' : '模拟恢复'}</button></div>)}</div><div className="settings-bottom"><span>扫描只演示进度，不访问磁盘。</span><button className="button secondary" disabled={scan !== null} onClick={simulateScan}><RefreshCw size={15} className={scan !== null ? 'spin' : ''} />{scan !== null ? `模拟扫描 ${scan}%` : '模拟扫描目录'}</button></div>{scan !== null && <div className="scan-progress"><span style={{ width: `${scan}%` }} /></div>}</section><section className="settings-card"><div className="settings-card-header"><div><h2><ShieldCheck size={19} />演示数据备份</h2><p>保存当前示例地点、类别和照片归属；不包含图片，不是正式版数据库备份。</p></div></div><div className="backup-actions"><div><span className="backup-symbol"><Download size={21} /></span><h3>导出演示数据</h3><p>下载一份整理状态，之后可以恢复。</p><button className="button secondary" onClick={exportData}>导出 JSON <ArrowRight size={14} /></button></div><div><span className="backup-symbol"><Upload size={21} /></span><h3>恢复演示数据</h3><p>从之前导出的演示文件恢复。</p><button className="button secondary" onClick={() => importRef.current?.click()}>选择演示文件 <ArrowRight size={14} /></button></div></div></section><section className="settings-card compact-settings"><div><h2><RefreshCw size={18} />重新体验</h2><p>随时重置到初始示例，或者看看空图库的样子。</p></div><div className="settings-inline-actions"><button className="button secondary" onClick={() => setConfirmation({ title: '体验空图库？', body: '将清空本浏览器的演示状态。随时可通过“重置演示”恢复最初示例，也可以先导出整理状态。', label: '体验空图库', action: () => { setData({ photos: [], places: [], categories: [], roots: [] }); setProvince(''); navigate('photos'); toast('已切换为空图库演示，可在设置中重置'); } })}>体验空图库</button><button className="button secondary" onClick={reset}><RefreshCw size={14} />重置演示</button></div></section><div className="settings-links"><button onClick={() => setDialog({ type: 'about' })}><Info size={14} />关于这个 Demo</button><a href="/assets/assets-sources.json" target="_blank" rel="noreferrer">图片与地图素材来源 <ExternalLink size={13} /></a></div></>}
      </div>
    </main>

    {selecting && <div className="selection-bar"><span className="selection-indicator"><Check size={17} /></span><span>已选择 <strong>{selected.size}</strong> 张照片</span><button className="text-button" onClick={() => setSelected(new Set(visiblePhotos.map((p) => p.id)))}>全选当前结果</button><div className="selection-divider" /><button className="button primary" disabled={!selected.size} onClick={() => setDialog({ type: 'classify', ids: [...selected], target: view === 'place' ? placeId || undefined : undefined })}><MapPin size={16} />归类到地点</button><button className="icon-button" aria-label="取消批量选择" onClick={() => { setSelecting(false); setSelected(new Set()); }}><X size={19} /></button></div>}
    <input ref={importRef} type="file" accept="application/json,.json" hidden aria-label="导入演示文件" onChange={(e) => void importData(e.target.files?.[0])} />
    {message && <div className="toast" role="status"><CheckCircle2 size={18} /><span>{message}</span><button aria-label="关闭提示" onClick={() => setMessage('')}><X size={15} /></button></div>}

    {viewerPhoto && <div className="viewer" role="dialog" aria-modal="true" aria-label="照片查看器" ref={viewerRef}><div className="viewer-top"><div><Camera size={19} /><span>{viewerPhoto.fileName}</span><small>{Math.max(0, viewerIndex) + 1} / {viewerList.length}</small></div><div><button className="viewer-icon" aria-label="缩小照片" disabled={zoom <= .5} onClick={() => setZoom((value) => Math.max(.5, value - .25))}><ZoomOut size={19} /></button><button className="viewer-scale" onClick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button><button className="viewer-icon" aria-label="放大照片" disabled={zoom >= 3} onClick={() => setZoom((value) => Math.min(3, value + .25))}><ZoomIn size={19} /></button><span className="viewer-divider" /><button className="viewer-icon" aria-label="全屏查看" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else if (viewerRef.current?.requestFullscreen) void viewerRef.current.requestFullscreen().catch(() => toast('当前浏览器无法开启全屏')); else toast('当前浏览器不支持全屏'); }}><Maximize2 size={18} /></button><button className={viewerInfo ? 'viewer-icon info-active' : 'viewer-icon'} aria-label="切换照片信息" onClick={() => setViewerInfo(!viewerInfo)}><Info size={19} /></button><button className="viewer-icon" aria-label="关闭照片查看器" onClick={closeViewer}><X size={23} /></button></div></div><div className="viewer-body"><div className="viewer-stage"><button className="viewer-arrow previous" aria-label="上一张照片" onClick={() => viewerStep(-1)}><ChevronLeft size={28} /></button><div className="viewer-image-area">{isUnavailable(viewerPhoto) ? <div className="viewer-missing"><Image size={54} strokeWidth={1} /><h2>这张照片暂时不在这里</h2><p>原始文件不可用，地点和类别记录仍然保留。</p><span>这里是文件缺失的示例状态</span></div> : <img src={viewerPhoto.src} alt={`旅行示例照片 ${viewerPhoto.fileName}`} style={{ transform: `scale(${zoom})` }} />}</div><button className="viewer-arrow next" aria-label="下一张照片" onClick={() => viewerStep(1)}><ChevronRight size={28} /></button><div className="viewer-bottom">
          <div className="viewer-bottom-meta">
            <span className="viewer-collection"><MapPin size={14} /><span className="viewer-collection-name">{viewerCollectionName}</span><small>{Math.max(0, viewerIndex) + 1} / {viewerList.length}</small></span>
            <span className="viewer-shortcuts">← → 切换照片 <i />Esc 退出</span>
          </div>
          <ViewerFilmstrip photos={viewerList} activeId={viewerPhoto.id} onSelect={(id) => { setViewerId(id); setZoom(1); }} renderThumbnail={(photo) => <PhotoImage photo={photo} unavailable={isUnavailable(photo)} />} />
        </div></div>{viewerInfo && <aside className="photo-info"><h2>照片信息</h2><div className="info-group"><label>拍摄日期（示例）</label><p>{dateLabel(viewerPhoto.takenAt)}</p><label>图像尺寸（示例）</label><p>{viewerPhoto.width} × {viewerPhoto.height}</p><label>所属地点</label><p>{data.places.find((p) => p.id === viewerPhoto.placeId)?.name || '未分类'}</p><label>照片类别</label><div className="info-tags">{viewerPhoto.categoryIds.length ? data.categories.filter((c) => viewerPhoto.categoryIds.includes(c.id)).map((c) => <span key={c.id}>{c.name}</span>) : <span className="no-tag">暂未设置类别</span>}</div></div><button className="button primary" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); setDialog({ type: 'classify', ids: [viewerPhoto.id], target: viewerPhoto.placeId || undefined }); }}><Tag size={15} />调整地点与类别</button><div className="info-path"><label>原始文件路径（示例）</label><code>{data.roots.find((r) => r.id === viewerPhoto.rootId)?.path}\{viewerPhoto.fileName}</code><button className="text-button" onClick={() => { const path = `${data.roots.find((r) => r.id === viewerPhoto.rootId)?.path}\\${viewerPhoto.fileName}`; void navigator.clipboard?.writeText(path).then(() => toast('示例路径已复制')).catch(() => toast('当前浏览器无法复制，可在信息中选择路径')); }}><Copy size={13} />复制路径</button><button className="button secondary" onClick={() => toast('前端演示不打开本机文件夹，正式版本将由本地服务完成。')}><FolderOpen size={15} />打开所在文件夹（模拟）</button></div><div className="viewer-demo-note"><Info size={13} />示例素材与地点无对应关系</div></aside>}</div></div>}

    {dialog?.type === 'place' && <PlaceForm place={dialog.place} province={province} data={data} onClose={() => setDialog(null)} onSave={(place) => { setData((previous) => ({ ...previous, places: dialog.place ? previous.places.map((p) => p.id === place.id ? place : p) : [...previous.places, place] })); setDialog(null); toast(dialog.place ? '地点已更新' : `已收藏「${place.name}」，现在可以为它添加照片`); }} onDelete={dialog.place ? () => { const place = dialog.place!; setConfirmation({ title: `删除「${place.name}」？`, body: `该地点的 ${countFor(data, place.id)} 张照片将回到未分类，地点下的类别会移除。所有示例照片都会保留。`, label: '删除地点', action: () => { setData((previous) => deletePlace(previous, place.id)); setDialog(null); navigate('map'); toast('地点已删除，照片已回到未分类'); } }); } : undefined} />}
    {dialog?.type === 'classify' && <ClassifyForm data={data} ids={dialog.ids} target={dialog.target} onClose={() => setDialog(null)} onSubmit={classify} onNewPlace={() => { setDialog({ type: 'place' }); }} />}
    {dialog?.type === 'categories' && <CategoryManager data={data} placeId={dialog.placeId} onClose={() => setDialog(null)} onChange={setData} onMessage={toast} />}
    {dialog?.type === 'pickPhotos' && <PhotoPicker data={data} target={dialog.placeId} onClose={() => setDialog(null)} onSubmit={(ids) => classify(ids, dialog.placeId, [])} />}
    {dialog?.type === 'root' && <RootForm onClose={() => setDialog(null)} onSave={(path) => { if (data.roots.some((r) => r.path.toLowerCase() === path.toLowerCase())) { toast('这个示例目录已经在列表中'); return; } setData((previous) => ({ ...previous, roots: [...previous.roots, { id: crypto.randomUUID(), path, enabled: true, status: 'ready' }] })); setDialog(null); toast('示例目录已添加，不会读取本机文件'); }} />}
    {dialog?.type === 'about' && <Modal title="给回忆，一张自己的地图。" description="旅迹 · 个人旅行地图相册前端 Demo" onClose={() => setDialog(null)}><div className="about-illustration"><MapPinned size={56} strokeWidth={1.1} /><span>让每一张照片，都有归处。</span></div><div className="about-copy"><p>从地图回看旅程，把散落的照片整理到地点，再用自己的类别慢慢收藏。</p><ul><li>可以新增地点、调整类别、批量整理和浏览大图。</li><li>示例状态保存在当前浏览器，可导出、恢复或重置。</li><li>不会扫描、上传或修改你的真实照片。</li></ul><p className="muted-note">示例照片与标注地点没有对应关系。基础地图仅用于交互示意，不是标准地图；详细地图和真实地点搜索尚未接入。</p><a className="text-button" href="/assets/assets-sources.json" target="_blank" rel="noreferrer">查看图片、地图来源与作者署名 <ExternalLink size={13} /></a></div><div className="modal-footer"><button className="button secondary" onClick={() => { setDialog(null); navigate('uncategorized'); }}>从整理照片开始</button><button className="button primary" onClick={() => setDialog(null)}>开始探索 <ArrowRight size={15} /></button></div></Modal>}
    {confirmation && <Modal title={confirmation.title} onClose={() => setConfirmation(null)}><p className="confirmation-body">{confirmation.body}</p><div className="modal-footer"><button className="button secondary" onClick={() => setConfirmation(null)}>取消</button><button className="button primary" onClick={() => { confirmation.action(); setConfirmation(null); }}>{confirmation.label || '确认'}</button></div></Modal>}
  </div>;
}

function PlaceForm({ place, province, data, onClose, onSave, onDelete }: { place?: Place; province: string; data: DemoState; onClose: () => void; onSave: (place: Place) => void; onDelete?: () => void }) {
  const [name, setName] = useState(place?.name || '');
  const [region, setRegion] = useState(place?.province || province || '青海');
  const [description, setDescription] = useState(place?.description || '');
  const [lat, setLat] = useState(String(place?.lat ?? 36.9));
  const [lng, setLng] = useState(String(place?.lng ?? 100.18));
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const candidates = CANDIDATES.filter((c) => name.trim() && c.name.includes(name.trim())).slice(0, 4);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('先为这个地点起一个名字吧。');
    if (!PROVINCES.some(([name]) => name === region)) return setError('请选择这个地点所属的省份。');
    if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Number(lat) < -90 || Number(lat) > 90 || Number(lng) < -180 || Number(lng) > 180 || !lat.trim() || !lng.trim()) return setError('请填写有效坐标，或在地图上点击一个位置。');
    if (data.places.some((p) => p.id !== place?.id && p.name === name.trim() && p.province === region)) return setError('这个省份已经有同名地点，可以直接进入它的相册。');
    onSave({ id: place?.id || crypto.randomUUID(), name: name.trim(), province: region, provinceCode: PROVINCES.find(([p]) => p === region)?.[1] || '', lat: Number(lat), lng: Number(lng), description: description.trim() });
  };
  return <Modal title={place ? '编辑旅行地点' : '收藏一个新的地方'} description="记下名字，在地图上为这段旅程落一个点。" onClose={onClose} wide><form onSubmit={submit}><div className="form-row"><label className="form-field grow">地点名称<input autoFocus value={name} onChange={(e) => { setName(e.target.value); setSearching(true); setError(''); }} maxLength={40} placeholder="例如：翡翠湖" /></label><label className="form-field region-field">所属省份<select value={region} onChange={(e) => setRegion(e.target.value)}>{PROVINCES.map(([p]) => <option key={p} value={p}>{p}</option>)}</select></label></div>{searching && candidates.length > 0 && <div className="search-candidates"><span>候选地点 · 示例搜索</span>{candidates.map((candidate) => <button key={candidate.name} type="button" onClick={() => { setName(candidate.name); setRegion(candidate.province); setLat(String(candidate.lat)); setLng(String(candidate.lng)); setSearching(false); }}><MapPin size={14} /><strong>{candidate.name}</strong><small>{candidate.province}</small><ArrowRight size={14} /></button>)}</div>}<div className="form-map"><TravelMap places={[]} photos={[]} province={region} onProvinceChange={setRegion} onPlaceClick={() => {}} pickMode onPick={(nextLat, nextLng) => { setLat(nextLat.toFixed(5)); setLng(nextLng.toFixed(5)); }} selectedPoint={Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null} compact /></div><div className="coordinate-row"><span><MapPin size={13} />点击地图选择位置，或手动输入坐标</span><label>经度<input aria-label="地点经度" value={lng} onChange={(e) => setLng(e.target.value)} inputMode="decimal" /></label><label>纬度<input aria-label="地点纬度" value={lat} onChange={(e) => setLat(e.target.value)} inputMode="decimal" /></label></div><label className="form-field">旅行备注<span className="optional">选填</span><textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={160} rows={2} placeholder="这里有什么，让你念念不忘？" /></label>{error && <p className="form-error" role="alert"><CircleAlert size={14} />{error}</p>}<div className="form-note"><WifiOff size={13} />使用本地基础地图与固定搜索候选，不调用在线地名服务。</div><div className="modal-footer">{onDelete && <button type="button" className="text-button danger push-left" onClick={onDelete}><Trash2 size={14} />删除地点</button>}<button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary"><Check size={16} />{place ? '保存修改' : '收藏地点'}</button></div></form></Modal>;
}

function ClassifyForm({ data, ids, target, onClose, onSubmit, onNewPlace }: { data: DemoState; ids: string[]; target?: string; onClose: () => void; onSubmit: (ids: string[], target: string | null, categoryIds: string[]) => void; onNewPlace: () => void }) {
  const [placeId, setPlaceId] = useState(target || data.places[0]?.id || '');
  const [categories, setCategories] = useState<string[]>(ids.length === 1 && data.photos.find((p) => p.id === ids[0])?.placeId === target ? data.photos.find((p) => p.id === ids[0])?.categoryIds || [] : []);
  const selectedPhotos = data.photos.filter((p) => ids.includes(p.id));
  const changingPlace = selectedPhotos.filter((p) => p.placeId && p.placeId !== placeId).length;
  return <Modal title={`整理 ${ids.length} 张照片`} description="选择照片所属的地点，也可以添加多个类别。" onClose={onClose}><div className="selected-preview">{selectedPhotos.slice(0, 5).map((p) => <img src={p.src} alt="选中的示例照片" key={p.id} />)}{ids.length > 5 && <span>+{ids.length - 5}</span>}</div><label className="form-field">旅行地点<select value={placeId} onChange={(e) => { setPlaceId(e.target.value); setCategories([]); }}><option value="">未分类（取消地点关联）</option>{data.places.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.province}</option>)}</select></label><button className="text-button new-place-link" onClick={onNewPlace}><Plus size={14} />新建地点</button>{placeId && <><div className="form-section-label">照片类别 <span>可多选，也可以不选</span></div><div className="category-options">{data.categories.filter((c) => c.placeId === placeId).map((c) => <button className={categories.includes(c.id) ? 'category-option selected' : 'category-option'} key={c.id} aria-pressed={categories.includes(c.id)} onClick={() => setCategories((previous) => previous.includes(c.id) ? previous.filter((id) => id !== c.id) : [...previous, c.id])}><span>{categories.includes(c.id) && <Check size={13} />}</span>{c.name}</button>)}{!data.categories.some((c) => c.placeId === placeId) && <p className="muted-note">这个地点还没有类别，归类后可在地点相册中添加。</p>}</div></>}{changingPlace > 0 && <div className="inline-notice"><Info size={15} /><span>{changingPlace} 张照片会更换地点，旧地点下的类别关联将清除。</span></div>}<p className="form-note"><ShieldCheck size={13} />只修改演示中的整理关系，不改动任何图片。</p><div className="modal-footer"><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" onClick={() => onSubmit(ids, placeId || null, placeId ? categories : [])}><Check size={15} />确认归类</button></div></Modal>;
}

function CategoryManager({ data, placeId, onClose, onChange, onMessage }: { data: DemoState; placeId: string; onClose: () => void; onChange: (updater: (state: DemoState) => DemoState) => void; onMessage: (message: string) => void }) {
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [removeId, setRemoveId] = useState<string | null>(null);
  const categories = data.categories.filter((c) => c.placeId === placeId);
  useEffect(() => {
    if (editing && !data.categories.some((category) => category.id === editing)) {
      setEditing(null); setName(''); setError('');
    }
  }, [data.categories, editing]);
  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return setError('请填写类别名称。');
    if (categories.some((c) => c.id !== editing && c.name === name.trim())) return setError('这个地点已经有同名类别了。');
    onChange((state) => ({ ...state, categories: editing ? state.categories.map((c) => c.id === editing ? { ...c, name: name.trim() } : c) : [...state.categories, { id: crypto.randomUUID(), placeId, name: name.trim() }] }));
    setName(''); setEditing(null); setError(''); onMessage(editing ? '类别已改名' : '新类别已创建');
  };
  return <Modal title="管理照片类别" description={`${data.places.find((p) => p.id === placeId)?.name}的类别，仅在这个地点中使用。`} onClose={onClose}><form className="inline-form" onSubmit={save}><input aria-label="类别名称" placeholder="例如：日落、同行的人" maxLength={24} value={name} onChange={(e) => { setName(e.target.value); setError(''); }} /><button className="button primary" type="submit">{editing ? '保存改名' : '添加类别'}</button>{editing && <button className="icon-button" aria-label="取消改名" type="button" onClick={() => { setEditing(null); setName(''); }}><X size={18} /></button>}</form>{error && <p className="form-error" role="alert">{error}</p>}<div className="manage-category-list">{categories.length ? categories.map((category) => <div className="manage-category" key={category.id}><span className="category-symbol"><Tag size={17} /></span><strong>{category.name}</strong><small>{data.photos.filter((p) => p.categoryIds.includes(category.id)).length} 张照片</small><button className="icon-button" aria-label={`重命名类别${category.name}`} onClick={() => { setEditing(category.id); setName(category.name); setRemoveId(null); }}><Pencil size={15} /></button><button className="icon-button danger" aria-label={`删除类别${category.name}`} onClick={() => setRemoveId(category.id)}><Trash2 size={15} /></button></div>) : <p className="muted-note">还没有类别，先添加一个自己喜欢的名字。</p>}</div>{removeId && <div className="inline-delete-confirm"><p>删除「{categories.find((c) => c.id === removeId)?.name}」？照片仍保留在当前地点。</p><button className="text-button muted" onClick={() => setRemoveId(null)}>取消</button><button className="text-button danger" onClick={() => { onChange((state) => deleteCategory(state, removeId)); setRemoveId(null); onMessage('类别已移除，照片和地点关联保留'); }}>确认删除</button></div>}<div className="modal-footer"><button className="button primary" onClick={onClose}>完成</button></div></Modal>;
}

function PhotoPicker({ data, target, onClose, onSubmit }: { data: DemoState; target: string; onClose: () => void; onSubmit: (ids: string[]) => void }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [onlyUnclassified, setOnlyUnclassified] = useState(true);
  useEffect(() => { setIds(new Set()); }, [onlyUnclassified]);
  const photos = data.photos.filter((p) => p.placeId !== target && (!onlyUnclassified || !p.placeId))
    .map((photo) => data.roots.find((root) => root.id === photo.rootId)?.status === 'unavailable' ? { ...photo, available: false } : photo);
  return <Modal title={`为${data.places.find((p) => p.id === target)?.name}添加照片`} description="从示例图库中挑选，文件不会被移动或复制。" onClose={onClose} wide><div className="picker-filter"><label><input type="checkbox" checked={onlyUnclassified} onChange={(e) => setOnlyUnclassified(e.target.checked)} />只看未分类照片</label><span>已选择 {ids.size} 张</span></div><div className="picker-grid">{photos.map((photo) => <button className={ids.has(photo.id) ? 'picker-photo selected' : 'picker-photo'} key={photo.id} aria-label={`选择待添加照片${photo.fileName}`} aria-pressed={ids.has(photo.id)} onClick={() => setIds((previous) => { const next = new Set(previous); next.has(photo.id) ? next.delete(photo.id) : next.add(photo.id); return next; })}><PhotoImage photo={photo} unavailable={!photo.available} /><span>{ids.has(photo.id) && <Check size={15} />}</span></button>)}{!photos.length && <p className="muted-note">当前没有可选照片，可以取消“只看未分类照片”。</p>}</div>{!onlyUnclassified && <div className="inline-notice"><Info size={15} />添加已归类照片会替换原地点，并清除旧类别。</div>}<div className="modal-footer"><button className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={!ids.size} onClick={() => onSubmit([...ids])}><Plus size={16} />添加 {ids.size || ''} 张照片</button></div></Modal>;
}

function RootForm({ onClose, onSave }: { onClose: () => void; onSave: (path: string) => void }) {
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  return <Modal title="添加示例照片目录" description="只用于体验目录管理，不会读取你的磁盘。" onClose={onClose}><form onSubmit={(event) => { event.preventDefault(); if (!path.trim()) return setError('请输入一个示例目录路径。'); onSave(path.trim()); }}><label className="form-field">目录路径<input autoFocus value={path} onChange={(event) => { setPath(event.target.value); setError(''); }} placeholder="例如：F:\手机旅行备份" maxLength={240} /></label><div className="inline-notice"><Folder size={16} /><span>正式版本将由本机服务读取目录；本演示只保存你输入的路径文字。</span></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="modal-footer"><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="submit" className="button primary"><Plus size={16} />添加示例目录</button></div></form></Modal>;
}
