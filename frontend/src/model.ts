export interface Photo {
  id: string; fileName: string; path: string; src: string; previewSrc: string;
  width: number; height: number; takenAt: string | null; sortAt: string;
  placeId: string | null; categoryIds: string[]; rootId: string; available: boolean;
  availability: string; error: string | null; version: string;
}
export interface Place {
  id: string; name: string; province: string; provinceCode: string; lat: number; lng: number;
  description: string; photoCount: number; excludedPhotoCount: number; coverSrc: string | null;
  coordinateSystem: string; coordinateSource: string;
}
export interface Category { id: string; placeId: string; name: string; photoCount: number }
export interface Root { id: string; path: string; enabled: boolean; status: string; lastScanAt: string | null; fileOnly?:boolean }
export interface Overview { photoCount: number; unclassifiedCount: number; excludedCount: number; places: Place[]; categories: Category[]; roots: Root[]; dataDir: string }
export interface PhotoPage { items: Photo[]; total: number; page: number; size: number }
export interface Scan { state: string; discovered: number; added: number; updated: number; unchanged: number; failed: number; missing: number; errors: string[] }
export const PROVINCES = [
  ['北京','110000'],['天津','120000'],['河北','130000'],['山西','140000'],['内蒙古','150000'],['辽宁','210000'],['吉林','220000'],['黑龙江','230000'],
  ['上海','310000'],['江苏','320000'],['浙江','330000'],['安徽','340000'],['福建','350000'],['江西','360000'],['山东','370000'],['河南','410000'],
  ['湖北','420000'],['湖南','430000'],['广东','440000'],['广西','450000'],['海南','460000'],['重庆','500000'],['四川','510000'],['贵州','520000'],
  ['云南','530000'],['西藏','540000'],['陕西','610000'],['甘肃','620000'],['青海','630000'],['宁夏','640000'],['新疆','650000'],['台湾','710000'],['香港','810000'],['澳门','820000'],
];
export const dateLabel = (photo: Photo) => photo.takenAt ? photo.takenAt.replace('T',' ') : `文件时间 ${photo.sortAt.slice(0,10)}`;
