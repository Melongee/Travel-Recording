import {describe,it,expect} from 'vitest';
import {BACKGROUND_ASPECT,backgroundViewport} from './backgroundViewport';
describe('background framing',()=>{
  it('fills a fixed landscape frame with either orientation and keeps every edge covered',()=>{
    for(const [w,h] of [[1200,800],[800,1200]])for(const zoom of [1,2,4])for(const pan of [0,.5,1]) {
      const r=backgroundViewport(900,500,w,h,zoom,pan,1-pan);
      expect(r.width).toBeGreaterThanOrEqual(900);expect(r.height).toBeGreaterThanOrEqual(500);
      expect(r.left).toBeLessThanOrEqual(0);expect(r.top).toBeLessThanOrEqual(0);
      expect(r.left+r.width).toBeGreaterThanOrEqual(900);expect(r.top+r.height).toBeGreaterThanOrEqual(500);
    }
  });
  it('keeps the same crop when the preview and actual frame share an aspect ratio',()=>{
    const small=backgroundViewport(600,350,1400,900,2.3,.2,.8),large=backgroundViewport(1200,700,1400,900,2.3,.2,.8);
    for(const key of ['width','height','left','top'] as const)expect(large[key]).toBeCloseTo(small[key]*2);
  });
  it('preserves the exact image region at different viewport and preview widths',()=>{
    for(const [imageWidth,imageHeight] of [[1400,900],[800,1200]])for(const zoom of [1,2.4]) {
      const reference=backgroundViewport(1200,1200/BACKGROUND_ASPECT,imageWidth,imageHeight,zoom,.18,.76);
      for(const width of [360,600,960,1600,2400]) {
        const frameHeight=width/BACKGROUND_ASPECT;
        const resized=backgroundViewport(width,frameHeight,imageWidth,imageHeight,zoom,.18,.76);
        expect(-resized.left/resized.width).toBeCloseTo(-reference.left/reference.width);
        expect(-resized.top/resized.height).toBeCloseTo(-reference.top/reference.height);
        expect(width/resized.width).toBeCloseTo(1200/reference.width);
        expect(frameHeight/resized.height).toBeCloseTo((1200/BACKGROUND_ASPECT)/reference.height);
      }
    }
  });
});
