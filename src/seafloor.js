import {bottom,clamp} from './mechanics.js';

export const FLOOR_WIDTH=16000,FLOOR_SEGMENTS=140;

// Three's PlaneGeometry splits each cell along its bottom-left to top-right diagonal.
// x and north are simulation coordinates. Slope Z increases toward world-space south.
export function floorSurface(x,north){
 const cell=FLOOR_WIDTH/FLOOR_SEGMENTS,half=FLOOR_WIDTH/2;
 const col=clamp(Math.floor((x+half)/cell),0,FLOOR_SEGMENTS-1);
 const row=clamp(Math.floor((half-north)/cell),0,FLOOR_SEGMENTS-1);
 const west=col*cell-half,top=half-row*cell,u=(x-west)/cell,v=(top-north)/cell;
 const b=-bottom(west,top-cell),d=-bottom(west+cell,top);
 if(u+v<=1){
  const a=-bottom(west,top);
  return {height:a+(d-a)*u+(b-a)*v,slopeX:(d-a)/cell,slopeZ:(b-a)/cell};
 }
 const c=-bottom(west+cell,top-cell);
 return {height:c+(c-b)*(u-1)+(c-d)*(v-1),slopeX:(c-b)/cell,slopeZ:(c-d)/cell};
}
