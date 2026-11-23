import {chartDepth,shelfOutcrops} from './coast.ts';
import {hash01} from './surface-motion.ts';

export type Instrument = 'scribbler' | 'painter';
export type Profile = 'survey' | 'detail';
// Fictional instrument presets. These control the recorder and encounter rolls.
export const profiles = {
  survey: {range:1600, width:80, height:44, rows:5, exposure:.24},
  detail: {range:650, width:132, height:64, rows:12, exposure:.56},
} as const;
type Pose = {x:number; y:number; depth:number; heading:number};
type Echo = {x:number; y:number; depth?:number; sinkDepth?:number; heading:number; kind:string; hull:number};
type World = Pose & {time:number; patrol:{seed:number}; environment:{chartSeed?:number}; ships:Echo[]; site?:Echo|null};
const radians = Math.PI/180;
const clamp = (n:number,lo:number,hi:number) => Math.min(hi,Math.max(lo,n));

export function scanSector(eye:Pose, object:{x:number;y:number;depth?:number}, mode:Instrument, range:number) {
  const dx=object.x-eye.x, dy=object.y-eye.y, a=eye.heading*radians;
  const along=dx*Math.sin(a)+dy*Math.cos(a), across=dx*Math.cos(a)-dy*Math.sin(a);
  const dz=(object.depth??0)-eye.depth;
  if(Math.hypot(dx,dy,dz)>range)return false;
  return mode==='painter' ? along>0 && Math.abs(across)<along*1.2 && Math.abs(dz)<along*.65 :
    dz>=0 && Math.abs(along)<Math.max(14,Math.abs(across)*.10);
}

const rockCache=new WeakMap<Echo,{key:number;rocks:ReturnType<typeof acousticRocks>}>();
function acousticRocks(site:Echo,seed:number,chartSeed?:number){
  return shelfOutcrops(site,seed).map(rock=>({...rock,depth:chartDepth(rock.x,rock.y,chartSeed)-rock.height*.5}));
}
function cachedOutcrops(site:Echo,seed:number,chartSeed?:number){
  let entry=rockCache.get(site);
  if(!entry||entry.key!==seed){entry={key:seed,rocks:acousticRocks(site,seed,chartSeed)};rockCache.set(site,entry);}
  return entry.rocks;
}

// Coordinates are tied to the patrol chart so changes of course and speed
// change what is recorded. Old pixels are never reprojected onto the new view.
export function sampleLine(s:World,mode:Instrument,profile:Profile,row:number):Uint8Array {
  const {range,width,height}=profiles[profile], result=new Uint8Array(width);
  const angle=s.heading*radians, sn=Math.sin(angle), cs=Math.cos(angle);
  const seed=s.environment.chartSeed;
  const altitude=Math.max(1,chartDepth(s.x,s.y,seed)-s.depth);
  const vertical=(.5-(row+.5)/height)*1.25;
  const objects=s.site?[...s.ships,s.site]:s.ships;
  const echoes=objects.map(v=>{
    const dx=v.x-s.x, dy=v.y-s.y, depth=(v.depth??0)+(v.sinkDepth??0);
    const turn=(v.heading-s.heading)*radians;
    const halfLength=v.kind==='carrier'?120:v.kind==='wreck'?25:v.kind==='sub'?30:45;
    return {along:dx*sn+dy*cs,across:dx*cs-dy*sn,depth:depth-s.depth,halfLength,turn,
      halfWidth:Math.max(4,halfLength*.17),height:v.kind==='carrier'?18:v.kind==='sub'?6:9};
  });
  if(s.site){
    for(const rock of cachedOutcrops(s.site,s.patrol.seed,seed)){
      const dx=rock.x-s.x,dy=rock.y-s.y;
      echoes.push({along:dx*sn+dy*cs,across:dx*cs-dy*sn,depth:rock.depth-s.depth,turn:(rock.heading-s.heading)*radians,
        halfLength:rock.length,halfWidth:rock.width,height:rock.height});
    }
  }
  for(let i=0;i<width;i++){
    const u=(i+.5)*2/width-1;
    let along=0,across=0, shade=0;
    if(mode==='scribbler'){
      const slant=Math.abs(u)*range;
      across=Math.sign(u)*Math.sqrt(Math.max(0,slant*slant-altitude*altitude));
    }else{
      // A row samples one elevation looking out from the bow. Intersect
      // downward-looking rays with the same chart relief used by the scene.
      if(vertical<-.014){
        along=altitude/-vertical;across=u*1.2*along;
        if(along<range*1.1){
          const depth=chartDepth(s.x+sn*along+cs*across,s.y+cs*along-sn*across,seed);
          along=Math.max(0,depth-s.depth)/-vertical;across=u*1.2*along;
        }
      }
    }
    const ground=mode==='scribbler'?Math.abs(u)*range>=altitude:along>0&&Math.hypot(along,across)<range;
    if(ground){
      const x=s.x+sn*along+cs*across,y=s.y+cs*along-sn*across;
      const d=chartDepth(x,y,seed), step=5;
      const slope=(chartDepth(x+step*cs,y-step*sn,seed)-d)/step;
      const ripple=Math.sin(x*.088+Math.sin(y*.051)*1.5+y*.117);
      const grain=hash01(s.patrol.seed,Math.floor(x/3)*7919+Math.floor(y/3));
      shade=52+22*ripple+32*grain+100*clamp(slope,-.4,.4)*Math.sign(across)+13*Math.sin(d*.31);
    }
    for(const e of echoes){
      if(mode==='painter'){
        if(e.along<=0||Math.hypot(e.along,e.across,e.depth)>range)continue;
        const halfAcross=Math.abs(Math.sin(e.turn))*e.halfLength+Math.abs(Math.cos(e.turn))*e.halfWidth;
        const dx=(u*1.2*e.along-e.across)/Math.max(halfAcross,1.4*e.along/width);
        const dy=(vertical*e.along+e.depth)/Math.max(e.height,1.0*e.along/height);
        const r=dx*dx+dy*dy;
        if(r<1)shade=Math.max(shade,125+100*Math.sqrt(1-r));
      }else{
        const alongRadius=Math.abs(Math.cos(e.turn))*e.halfLength+Math.abs(Math.sin(e.turn))*e.halfWidth;
        if(Math.abs(e.along)>alongRadius||e.depth<0)continue;
        const extent=(Math.abs(Math.sin(e.turn))*e.halfLength+Math.abs(Math.cos(e.turn))*e.halfWidth)*
          Math.sqrt(1-(e.along/alongRadius)**2);
        const echoRange=Math.hypot(e.across,e.depth),slant=Math.abs(u)*range;
        if(Math.sign(u)!==Math.sign(e.across))continue;
        const edge=Math.max(range/width,extent);
        if(Math.abs(slant-echoRange)<edge)shade=205+34*Math.cos((slant-echoRange)/edge);
        else if(slant>echoRange+edge&&slant<echoRange+edge+Math.min(140,Math.abs(e.across)*e.height/Math.max(3,altitude)))shade*=.12;
      }
    }
    result[i]=clamp(shade,0,255);
  }
  return result;
}

export class ImagerPaper {
  readonly pixels:Uint8Array;
  readonly width:number;
  readonly height:number;
  x=0;
  y=0;
  version=0;
  private fraction=0;
  private line?:Uint8Array;
  constructor(readonly mode:Instrument,readonly profile:Profile){
    const p=profiles[profile];this.width=p.width;this.height=p.height;this.pixels=new Uint8Array(this.width*this.height);
    this.y=mode==='scribbler'?this.height-1:0;
  }
  advance(s:World,dt:number,quality:number){
    this.fraction+=dt*profiles[this.profile].rows*this.width*quality;
    const count=Math.floor(this.fraction);this.fraction-=count;
    if(count>0)this.version++;
    for(let n=0;n<count;n++){
      this.line??=sampleLine(s,this.mode,this.profile,this.y);
      this.pixels[this.y*this.width+this.x]=this.line[this.x];
      if(++this.x<this.width)continue;
      this.x=0;this.line=undefined;
      if(this.mode==='painter')this.y=(this.y+1)%this.height;
      else{this.pixels.copyWithin(0,this.width);this.pixels.fill(0,this.y*this.width);}
    }
  }
}

export class ImagerDisplay {
  private canvas=document.createElement('canvas');
  private image?:ImageData;
  private previous?:ImagerPaper;
  private version=-1;
  draw(ctx:CanvasRenderingContext2D,w:number,h:number,paper:ImagerPaper,writing:boolean){
    const {width,height,pixels}=paper;
    if(!this.image||width!==this.image.width||height!==this.image.height){
      this.canvas.width=width;this.canvas.height=height;this.image=new ImageData(width,height);
    }
    if(this.previous!==paper||this.version!==paper.version){
      const data=this.image.data;
      for(let i=0;i<pixels.length;i++){
        const v=pixels[i],p=i*4;
        data[p]=12+v*.96;data[p+1]=12+v*.63;data[p+2]=9+v*.22;data[p+3]=255;
      }
      this.canvas.getContext('2d')!.putImageData(this.image,0,0);
      this.previous=paper;this.version=paper.version;
    }
    ctx.fillStyle='#100f0b';ctx.fillRect(0,0,w,h);
    const margin=12,top=56,bottom=27,areaW=Math.max(1,w-margin*2),areaH=Math.max(1,h-top-bottom);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(this.canvas,margin,top,areaW,areaH);
    ctx.font='11px monospace';ctx.fillStyle='#dec390';ctx.textAlign='left';
    ctx.fillText(paper.mode==='scribbler'?'PORT':'PORT   /   BOW SECTOR',margin,h-8);
    ctx.textAlign='right';ctx.fillText('STBD   '+profiles[paper.profile].range+' m',w-margin,h-8);
    if(!writing&&paper.version===0){
      ctx.textAlign='center';ctx.fillText(paper.mode==='scribbler'?'Seafloor strip · Start scan':'Forward sweep · Start scan',w/2,top+areaH/2);
    }
    const x=margin+(paper.x+.5)*areaW/width,y=top+(paper.y+.5)*areaH/height;
    ctx.save();ctx.shadowColor='#ffc15c';ctx.shadowBlur=writing?7:3;ctx.fillStyle=writing?'#fff6c2':'#e6c789';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}
