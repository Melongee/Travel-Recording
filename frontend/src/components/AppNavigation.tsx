import {Compass,Grid2X2,Image,MapPin,Settings} from 'lucide-react';

interface Props {
  view:string;
  photoCount:number;
  unclassifiedCount:number;
  placeCount:number;
  onHome:()=>void;
  onNavigate:(path:string)=>void;
}

export default function AppNavigation({view,photoCount,unclassifiedCount,placeCount,onHome,onNavigate}:Props) {
  const items=[
    {key:'photos',label:'全部照片',Icon:Grid2X2,count:photoCount},
    {key:'uncategorized',label:'未分类照片',Icon:Image,count:unclassifiedCount},
    {key:'places',label:'旅行地点',Icon:Compass,count:placeCount},
  ];
  return <header className="app-navigation">
    <button type="button" className="app-brand" aria-label="旅迹，返回旅行地图" aria-current={view==='map'?'page':undefined} onClick={onHome}>
      <span className="app-brand-symbol"><MapPin size={25}/></span><span><strong>旅迹<span>.</span></strong><small>FOOTPRINTS</small></span>
    </button>
    <nav className="app-nav" aria-label="主要导航">{items.map(({key,label,Icon,count})=>{
      const active=view===key||key==='places'&&view==='place';
      return <button type="button" key={key} className="app-nav-item" aria-current={active?'page':undefined} onClick={()=>onNavigate(`/${key}`)}><Icon className="app-nav-icon" size={17}/><span>{label}</span><small>{count}</small></button>;
    })}</nav>
    <button type="button" className="app-settings" aria-label="设置与数据" title="设置与数据" aria-current={view==='settings'?'page':undefined} onClick={()=>onNavigate('/settings')}><Settings size={21}/></button>
  </header>;
}
