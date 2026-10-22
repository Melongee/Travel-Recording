export interface Photo {
  id: string;
  fileName: string;
  src: string;
  width: number;
  height: number;
  takenAt: string;
  placeId: string | null;
  categoryIds: string[];
  rootId: string;
  available: boolean;
}

export interface Place {
  id: string;
  name: string;
  province: string;
  provinceCode: string;
  lat: number;
  lng: number;
  description: string;
}

export interface Category {
  id: string;
  placeId: string;
  name: string;
}

export interface Root {
  id: string;
  path: string;
  enabled: boolean;
  status: 'ready' | 'unavailable';
}

export interface DemoState {
  photos: Photo[];
  places: Place[];
  categories: Category[];
  roots: Root[];
}

export const storageKey = 'travel-recording-demo-v1';

export function createInitialState(): DemoState {
  const places: Place[] = [
    { id: 'qinghai-lake', name: '青海湖', province: '青海', provinceCode: '630000', lat: 36.9, lng: 100.18, description: '湖边的风、连绵的山，与想再见一次的蓝。' },
    { id: 'chaka', name: '茶卡盐湖', province: '青海', provinceCode: '630000', lat: 36.7, lng: 99.08, description: '把天空倒映在盐湖里，留住西北的光。' },
    { id: 'chengdu', name: '成都', province: '四川', provinceCode: '510000', lat: 30.57, lng: 104.07, description: '在街巷和茶馆里，慢慢度过一个下午。' },
    { id: 'daocheng', name: '稻城亚丁', province: '四川', provinceCode: '510000', lat: 28.44, lng: 100.35, description: '走向雪山，把高原的一片绿带回记忆。' },
    { id: 'dali', name: '大理', province: '云南', provinceCode: '530000', lat: 25.7, lng: 100.16, description: '沿着洱海骑行，日落时在古城停下来。' },
    { id: 'sayram', name: '赛里木湖', province: '新疆', provinceCode: '650000', lat: 44.59, lng: 81.16, description: '雪山下的湖泊，和一路盛放的草原。' },
  ];
  const categories = places.flatMap((place) => [
    { id: `${place.id}-landscape`, placeId: place.id, name: '自然风光' },
    { id: `${place.id}-memory`, placeId: place.id, name: '旅行随记' },
  ]);
  const roots: Root[] = [
    { id: 'root-travel', path: 'D:\\旅行照片', enabled: true, status: 'ready' },
    { id: 'root-camera', path: 'E:\\相机备份', enabled: true, status: 'ready' },
  ];
  const photos: Photo[] = Array.from({ length: 60 }, (_, index) => {
    const place = index < 42 ? places[Math.floor(index / 7)] : null;
    const imageNumber = String((index % 12) + 1).padStart(2, '0');
    const date = new Date(Date.UTC(2025, 6 + Math.floor(index / 30), (index % 28) + 1, 8 + (index % 9), 12));
    return {
      id: `photo-${String(index + 1).padStart(3, '0')}`,
      fileName: `IMG_${String(20250701 + index)}_${String(index + 1).padStart(3, '0')}.jpg`,
      src: `/assets/scene-${imageNumber}.jpg`,
      width: 1600,
      height: 1067,
      takenAt: date.toISOString(),
      placeId: place?.id ?? null,
      categoryIds: place ? [
        `${place.id}-${index % 3 === 0 ? 'memory' : 'landscape'}`,
        ...(index % 7 === 0 ? [`${place.id}-landscape`] : []),
      ].filter((id, position, all) => all.indexOf(id) === position) : [],
      rootId: index % 4 === 0 ? 'root-camera' : 'root-travel',
      available: ![6, 37, 55].includes(index),
    };
  });
  return { photos, places, categories, roots };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function hasUniqueIds(items: { id: string }[]): boolean {
  const ids = new Set<string>();
  for (const item of items) {
    if (!item || ids.has(item.id)) return false;
    ids.add(item.id);
  }
  return true;
}

// 同时检查结构与引用关系，避免导入不完整的整理数据。
export function validateState(input: unknown): input is DemoState {
  if (!isRecord(input) || !Array.isArray(input.photos) || !Array.isArray(input.places)
    || !Array.isArray(input.categories) || !Array.isArray(input.roots)) return false;

  if (!input.places.every((place: unknown) => isRecord(place)
    && isNonEmptyString(place.id) && isNonEmptyString(place.name)
    && isNonEmptyString(place.province) && isNonEmptyString(place.provinceCode)
    && isFiniteNumber(place.lat) && place.lat >= -90 && place.lat <= 90
    && isFiniteNumber(place.lng) && place.lng >= -180 && place.lng <= 180
    && typeof place.description === 'string')) return false;

  if (!input.roots.every((root: unknown) => isRecord(root)
    && isNonEmptyString(root.id) && isNonEmptyString(root.path)
    && typeof root.enabled === 'boolean'
    && (root.status === 'ready' || root.status === 'unavailable'))) return false;

  const places = input.places as Place[];
  const roots = input.roots as Root[];
  if (!hasUniqueIds(places) || !hasUniqueIds(roots)) return false;
  const placeIds = new Set(places.map((place) => place.id));
  const rootIds = new Set(roots.map((root) => root.id));

  if (!input.categories.every((category: unknown) => isRecord(category)
    && isNonEmptyString(category.id) && isNonEmptyString(category.name)
    && isNonEmptyString(category.placeId) && placeIds.has(category.placeId))) return false;

  const categories = input.categories as Category[];
  if (!hasUniqueIds(categories)) return false;
  const categoryPlaces = new Map(categories.map((category) => [category.id, category.placeId]));

  if (!input.photos.every((photo: unknown) => isRecord(photo)
    && isNonEmptyString(photo.id) && isNonEmptyString(photo.fileName)
    && typeof photo.src === 'string' && /^\/assets\/scene-(?:0[1-9]|1[0-2])\.jpg$/.test(photo.src)
    && isFiniteNumber(photo.width) && photo.width > 0
    && isFiniteNumber(photo.height) && photo.height > 0
    && isNonEmptyString(photo.takenAt) && Number.isFinite(Date.parse(photo.takenAt))
    && (photo.placeId === null || (isNonEmptyString(photo.placeId) && placeIds.has(photo.placeId)))
    && isNonEmptyString(photo.rootId) && rootIds.has(photo.rootId)
    && typeof photo.available === 'boolean' && Array.isArray(photo.categoryIds)
    && new Set(photo.categoryIds).size === photo.categoryIds.length
    && Array.from(photo.categoryIds).every((id: unknown) => isNonEmptyString(id)
      && photo.placeId !== null && categoryPlaces.get(id) === photo.placeId))) return false;

  return hasUniqueIds(input.photos as Photo[]);
}

export function classifyPhotos(
  state: DemoState,
  photoIds: string[],
  placeId: string | null,
  categoryIds: string[],
): DemoState {
  if (placeId !== null && !state.places.some((place) => place.id === placeId)) {
    throw new Error('目标地点不存在，请重新选择。');
  }
  if (placeId === null && categoryIds.length > 0) {
    throw new Error('未分类照片不能关联地点类别。');
  }
  const nextCategories = [...new Set(categoryIds)];
  for (const id of nextCategories) {
    const category = state.categories.find((item) => item.id === id);
    if (!category || category.placeId !== placeId) {
      throw new Error('所选类别不属于目标地点，请重新选择。');
    }
  }
  const selected = new Set(photoIds);
  const existingIds = new Set(state.photos.map((photo) => photo.id));
  if ([...selected].some((id) => !existingIds.has(id))) {
    throw new Error('部分照片已不存在，请刷新选择后重试。');
  }
  if (selected.size === 0) return state;
  return {
    ...state,
    photos: state.photos.map((photo) => selected.has(photo.id)
      ? { ...photo, placeId, categoryIds: [...nextCategories] }
      : photo),
  };
}

export function deletePlace(state: DemoState, id: string): DemoState {
  if (!state.places.some((place) => place.id === id)) return state;
  const removedCategories = new Set(state.categories.filter((category) => category.placeId === id).map((category) => category.id));
  return {
    ...state,
    places: state.places.filter((place) => place.id !== id),
    categories: state.categories.filter((category) => category.placeId !== id),
    photos: state.photos.map((photo) => photo.placeId === id
      ? { ...photo, placeId: null, categoryIds: [] }
      : { ...photo, categoryIds: photo.categoryIds.filter((categoryId) => !removedCategories.has(categoryId)) }),
  };
}

export function deleteCategory(state: DemoState, id: string): DemoState {
  if (!state.categories.some((category) => category.id === id)) return state;
  return {
    ...state,
    categories: state.categories.filter((category) => category.id !== id),
    photos: state.photos.map((photo) => photo.categoryIds.includes(id)
      ? { ...photo, categoryIds: photo.categoryIds.filter((categoryId) => categoryId !== id) }
      : photo),
  };
}
