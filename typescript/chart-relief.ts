import {chartDepth} from './coast.ts';

// Cache chart paper in world-aligned tiles. Panning reuses the same soundings.
const tileSize=192,spacing=6,stride=tileSize/spacing+1;
const tiles=new Map<string,HTMLCanvasElement>();
const inks=[[83,103,80],[56,89,87],[38,72,73],[27,55,59],[20,42,45]] as const;
function tile(x:number,y:number,scale:number,seed?:number){
  const key=[seed,x,y,scale].join('/');
  const existing=tiles.get(key);
  if(existing)return existing;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=tileSize;
  const ctx=canvas.getContext('2d')!,image=ctx.createImageData(tileSize,tileSize);
  const grid=new Float32Array(stride*stride);
  for(let row=0;row<stride;row++)for(let col=0;col<stride;col++)
    grid[row*stride+col]=chartDepth((x*tileSize+col*spacing)/scale,-(y*tileSize+row*spacing)/scale,seed);
  for(let py=0;py<tileSize;py++)for(let px=0;px<tileSize;px++){
    const i=Math.floor(py/spacing)*stride+Math.floor(px/spacing),u=(px%spacing+.5)/spacing,v=(py%spacing+.5)/spacing;
    const a=grid[i],b=grid[i+1],c=grid[i+stride],d=grid[i+stride+1];
    const top=a+(b-a)*u,low=c+(d-c)*u,depth=top+(low-top)*v;
    const slope=(Math.abs((b-a)*(1-v)+(d-c)*v)+Math.abs(low-top))/spacing;
    const color=inks[depth<0?0:depth<60?1:depth<120?2:depth<180?3:4];
    const line=depth<0||depth>255?Math.abs(depth):Math.abs(depth-40*Math.round(depth/40));
    const stroke=slope>.001?Math.max(0,1-line/(.65*slope)):0;
    const offset=4*(py*tileSize+px);
    for(let k=0;k<3;k++)image.data[offset+k]=color[k]+stroke*(Math.abs(depth)<4?65:25);
    image.data[offset+3]=255;
  }
  ctx.putImageData(image,0,0);
  if(tiles.size>=96)tiles.delete(tiles.keys().next().value!);
  tiles.set(key,canvas);return canvas;
}
export function chartRelief(ctx:CanvasRenderingContext2D,w:number,h:number,cx:number,cy:number,scale:number,seed?:number){
  // Quantized scale keeps a pinch or wheel gesture from rebuilding every tile at every zoom increment.
  const sampled=2**(Math.round(Math.log2(scale)*2)/2),size=tileSize*scale/sampled;
  for(let y=Math.floor(-cy/size);y<(h-cy)/size;y++)for(let x=Math.floor(-cx/size);x<(w-cx)/size;x++){
    ctx.drawImage(tile(x,y,sampled,seed),cx+x*size,cy+y*size,size+.25,size+.25);
  }
}
