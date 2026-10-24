// Keep the saved crop independent of browser zoom and viewport height.
export const BACKGROUND_ASPECT=16/9;
export const clamp=(value:number)=>Math.max(0,Math.min(1,value));
export function backgroundViewport(frameWidth:number,frameHeight:number,imageWidth:number,imageHeight:number,zoom:number,x:number,y:number) {
  if(frameWidth<=0||frameHeight<=0||imageWidth<=0||imageHeight<=0)return {width:0,height:0,left:0,top:0,overflowX:0,overflowY:0};
  const scale=Math.max(frameWidth/imageWidth,frameHeight/imageHeight)*zoom;
  const width=imageWidth*scale,height=imageHeight*scale,overflowX=Math.max(0,width-frameWidth),overflowY=Math.max(0,height-frameHeight);
  return {width,height,left:-overflowX*clamp(x),top:-overflowY*clamp(y),overflowX,overflowY};
}
