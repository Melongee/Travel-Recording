import {useQuery} from '@tanstack/react-query';
import {api} from '../api';
export interface GeographyState { configured:boolean;offline:boolean;provider:string;message:string }
export default function GeographyPanel(){
  const status=useQuery({queryKey:['geography'],queryFn:()=>api<GeographyState>('/geography/status')});
  return <section className="settings-card data-location"><h2>在线地图与地名搜索</h2><p>{status.data?.message||status.error?.message||'正在检查地图配置…'}</p>
    <p>默认使用本地基础地图。只有点击“在线地图”或“搜索地名”时才请求天地图；照片文件不会发送给地图服务。</p>
    <p>需要天地图“服务端”Key。配置方式见项目 config/application-local.properties.example；复制为 application-local.properties，填写 Key 后重启。此文件不进入 Git 或相册备份。</p>
    <p>在线坐标按旅行地图用途近似对齐，并保留供应商原始坐标和来源。基础省界仍为交互示意，正式地图内容尚待核验。</p>
  </section>;
}
