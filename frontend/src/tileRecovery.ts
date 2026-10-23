// Retry a failed viewport once after its tile batch finishes. A transient tile error
// must not tear down both online layers while the rest of a fullscreen view loads.
export interface TileEvents {
  on(type:string, handler:()=>void):unknown;
  off(type:string, handler:()=>void):unknown;
  redraw():unknown;
}
export function watchTileRecovery(layer:TileEvents, unavailable:()=>void) {
  let failed = false, retried = false, disposed = false;
  let timer:ReturnType<typeof setTimeout> | undefined;
  const loading = () => { failed = false; };
  const error = () => { failed = true; };
  const loaded = () => {
    if (!failed || disposed) return;
    if (retried) { unavailable(); return; }
    retried = true;
    timer = setTimeout(() => { if (!disposed) layer.redraw(); }, 350);
  };
  const reset = () => { clearTimeout(timer); failed = false; retried = false; };
  layer.on('loading', loading);
  layer.on('tileerror', error);
  layer.on('load', loaded);
  return {
    reset,
    dispose:() => { disposed = true; clearTimeout(timer); layer.off('loading', loading);layer.off('tileerror', error);layer.off('load', loaded); },
  };
}
