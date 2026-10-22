import { describe, expect, it } from 'vitest';
import { classifyPhotos, createInitialState, deleteCategory, deletePlace, validateState } from './model';

describe('照片整理模型', () => {
  it('生成可验证的数据，包含未分类照片和不可用照片', () => {
    const state = createInitialState();
    expect(validateState(state)).toBe(true);
    expect(state.photos).toHaveLength(60);
    expect(state.photos.filter((photo) => photo.placeId === null)).toHaveLength(18);
    expect(state.photos.filter((photo) => !photo.available)).toHaveLength(3);
    expect(validateState({ ...state, photos: [...state.photos, state.photos[0]] })).toBe(false);
    expect(validateState({ ...state, categories: [{ id: 'bad', name: '无效', placeId: 'missing' }] })).toBe(false);
    expect(validateState({ ...state, photos: [{ ...state.photos[0], src: 'https://example.com/photo.jpg' }] })).toBe(false);
  });

  it('批量归类允许同地点多类别，且不修改原始数据', () => {
    const state = createInitialState();
    const ids = state.photos.slice(42, 45).map((photo) => photo.id);
    const place = state.places[0];
    const categoryIds = state.categories.filter((category) => category.placeId === place.id).map((category) => category.id);
    const result = classifyPhotos(state, ids, place.id, categoryIds);
    expect(result.photos.filter((photo) => ids.includes(photo.id)).every((photo) => photo.placeId === place.id && photo.categoryIds.length === 2)).toBe(true);
    expect(state.photos[42].placeId).toBeNull();
    expect(validateState(result)).toBe(true);
  });

  it('跨地点归类清除旧类别，取消归类后清空所有类别', () => {
    const state = createInitialState();
    const photo = state.photos[0];
    const target = state.places[2];
    const category = state.categories.find((item) => item.placeId === target.id)!;
    const result = classifyPhotos(state, [photo.id], target.id, [category.id]);
    expect(result.photos[0].categoryIds).toEqual([category.id]);
    expect(result.photos[0].placeId).toBe(target.id);
    const cleared = classifyPhotos(result, [photo.id], null, []);
    expect(cleared.photos[0]).toMatchObject({ placeId: null, categoryIds: [] });
  });

  it('删除类别和地点均保留照片及原文件信息', () => {
    const state = createInitialState();
    const category = state.categories[0];
    const withoutCategory = deleteCategory(state, category.id);
    expect(withoutCategory.photos.some((photo) => photo.categoryIds.includes(category.id))).toBe(false);
    expect(withoutCategory.photos[0].placeId).toBe(state.photos[0].placeId);
    const result = deletePlace(state, state.places[0].id);
    expect(result.photos).toHaveLength(state.photos.length);
    expect(result.photos[0]).toEqual({ ...state.photos[0], placeId: null, categoryIds: [] });
    expect(result.categories.some((item) => item.placeId === state.places[0].id)).toBe(false);
    expect(validateState(result)).toBe(true);
  });

  it('无效类别或照片会拒绝整批操作', () => {
    const state = createInitialState();
    const original = JSON.stringify(state);
    expect(() => classifyPhotos(state, ['photo-001'], state.places[0].id, [state.categories[2].id])).toThrow('不属于');
    expect(() => classifyPhotos(state, ['photo-001', 'missing'], state.places[0].id, [])).toThrow('已不存在');
    expect(() => classifyPhotos(state, ['photo-001'], null, [state.categories[0].id])).toThrow('不能关联');
    expect(JSON.stringify(state)).toBe(original);
    const invalid = { ...state, photos: [{ ...state.photos[0], categoryIds: [state.categories[2].id] }] };
    expect(validateState(invalid)).toBe(false);
  });

  it('空图库可导入保存，删除和空选择保持状态不变', () => {
    const empty = { photos: [], places: [], categories: [], roots: [] };
    expect(validateState(empty)).toBe(true);
    expect(validateState(JSON.parse(JSON.stringify(empty)))).toBe(true);
    expect(classifyPhotos(empty, [], null, [])).toBe(empty);
    expect(deletePlace(empty, 'missing')).toBe(empty);
    expect(deleteCategory(empty, 'missing')).toBe(empty);
  });

  it('依次删光地点仍完整保留照片、可用状态、路径关联与原始状态', () => {
    const state = createInitialState();
    const original = JSON.stringify(state);
    const cleared = state.places.reduce((previous, place) => deletePlace(previous, place.id), state);
    expect(cleared.places).toEqual([]);
    expect(cleared.categories).toEqual([]);
    expect(cleared.roots).toEqual(state.roots);
    expect(cleared.photos).toEqual(state.photos.map((photo) => ({ ...photo, placeId: null, categoryIds: [] })));
    expect(validateState(cleared)).toBe(true);
    expect(JSON.stringify(state)).toBe(original);
  });

  it('删类别只解除该类别，不改变其他类别和照片的地点归属', () => {
    const state = createInitialState();
    const photo = state.photos[0];
    const categoryIds = state.categories.filter((category) => category.placeId === photo.placeId).map((category) => category.id);
    const classified = classifyPhotos(state, [photo.id], photo.placeId, categoryIds);
    const result = deleteCategory(classified, categoryIds[0]);
    expect(result.photos[0]).toEqual({ ...classified.photos[0], categoryIds: [categoryIds[1]] });
    expect(result.photos.slice(7)).toEqual(classified.photos.slice(7));
    expect(validateState(result)).toBe(true);
  });

  it('恢复导出的数据有效，重复 ID、无效数值和断开的引用均拒绝', () => {
    const state = createInitialState();
    expect(validateState(JSON.parse(JSON.stringify(state)))).toBe(true);
    const invalidStates = [
      null,
      {},
      { ...state, places: [...state.places, state.places[0]] },
      { ...state, categories: [...state.categories, state.categories[0]] },
      { ...state, roots: [...state.roots, state.roots[0]] },
      { ...state, places: [{ ...state.places[0], lat: Infinity }] },
      { ...state, places: [{ ...state.places[0], lng: 181 }] },
      { ...state, photos: [{ ...state.photos[0], width: 0 }] },
      { ...state, photos: [{ ...state.photos[0], height: NaN }] },
      { ...state, photos: [{ ...state.photos[0], takenAt: '不是日期' }] },
      { ...state, photos: [{ ...state.photos[0], rootId: 'missing' }] },
      { ...state, photos: [{ ...state.photos[0], placeId: 'missing' }] },
      { ...state, photos: [{ ...state.photos[0], categoryIds: ['missing'] }] },
      { ...state, photos: [{ ...state.photos[0], categoryIds: [state.categories[0].id, state.categories[0].id] }] },
      { ...state, photos: [{ ...state.photos[0], placeId: null }] },
      { ...state, photos: new Array(1) },
      { ...state, categories: new Array(1) },
      { ...state, photos: [{ ...state.photos[0], categoryIds: new Array(1) }] },
    ];
    for (const value of invalidStates) expect(validateState(value)).toBe(false);
  });

  it('仅接受当前演示的 12 张本地素材，拒绝外链、路径穿越与变体', () => {
    const state = createInitialState();
    for (let number = 1; number <= 12; number++) {
      const src = `/assets/scene-${String(number).padStart(2, '0')}.jpg`;
      expect(validateState({ ...state, photos: [{ ...state.photos[0], src }] })).toBe(true);
    }
    for (const src of [
      'https://example.com/a.jpg', '//example.com/a.jpg', 'data:image/jpeg;base64,AAAA',
      '/assets/scene-00.jpg', '/assets/scene-13.jpg', '/assets/scene-1.jpg',
      '/assets/../scene-01.jpg', '/assets/scene-01.jpg?redirect=https://example.com',
    ]) {
      expect(validateState({ ...state, photos: [{ ...state.photos[0], src }] })).toBe(false);
    }
  });
});
