import {afterEach, describe, expect, it, vi} from 'vitest';
import {watchTileRecovery} from './tileRecovery';

function tileLayer() {
  const handlers = new Map<string, Set<()=>void>>();
  return {
    on(type:string, handler:()=>void) { if(!handlers.has(type)) handlers.set(type,new Set()); handlers.get(type)!.add(handler); },
    off(type:string, handler:()=>void) { handlers.get(type)?.delete(handler); },
    redraw:vi.fn(),
    emit(type:string) { handlers.get(type)?.forEach(handler=>handler()); },
  };
}
afterEach(()=>vi.useRealTimers());
describe('fullscreen tile recovery',()=>{
  it('finishes the viewport batch and retries a transient tile failure before fallback',()=>{
    vi.useFakeTimers();const layer=tileLayer(), fallback=vi.fn();watchTileRecovery(layer,fallback);
    layer.emit('loading');layer.emit('tileerror');expect(fallback).not.toHaveBeenCalled();
    layer.emit('load');vi.advanceTimersByTime(350);expect(layer.redraw).toHaveBeenCalledTimes(1);
    layer.emit('loading');layer.emit('load');expect(fallback).not.toHaveBeenCalled();
  });
  it('falls back when the retried batch still fails',()=>{
    vi.useFakeTimers();const layer=tileLayer(), fallback=vi.fn();watchTileRecovery(layer,fallback);
    layer.emit('loading');layer.emit('tileerror');layer.emit('load');vi.advanceTimersByTime(350);
    layer.emit('loading');layer.emit('tileerror');layer.emit('load');expect(fallback).toHaveBeenCalledTimes(1);
  });
  it('cancels stale retries on viewport changes and removes listeners on disposal',()=>{
    vi.useFakeTimers();const layer=tileLayer(), fallback=vi.fn(), recovery=watchTileRecovery(layer,fallback);
    layer.emit('loading');layer.emit('tileerror');layer.emit('load');recovery.reset();
    vi.advanceTimersByTime(1000);expect(layer.redraw).not.toHaveBeenCalled();
    layer.emit('loading');layer.emit('tileerror');layer.emit('load');recovery.dispose();
    vi.advanceTimersByTime(1000);layer.emit('load');expect(layer.redraw).not.toHaveBeenCalled();expect(fallback).not.toHaveBeenCalled();
  });
});
