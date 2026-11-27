import {DAY_SECONDS} from './patrol-calendar.ts';
import {chartDepth,shelfOutcrops} from './coast.ts';
import {hash01} from './surface-motion.ts';
import {strips,printWreck,type WreckPlates,type WreckEcho} from './sonar-strip.ts';
import {instruments,transmitterProfiles,type Instrument,type Profile} from './sonar-transmitters.ts';

// The recorder paper and its display. Which instruments transmit, and what
// they reach, is simulation state in sonar-transmitters.ts.
const shipMinute=DAY_SECONDS/(24*60);
// Painter recorder presets; the Scribbler uses its strip layout.
export const profiles = {
  survey: {range:transmitterProfiles.survey.range, width:80, height:44, rows:5},
  detail: {range:transmitterProfiles.detail.range, width:132, height:64, rows:12},
} as const;
type Pose = {x:number; y:number; depth:number; heading:number};
type Echo = {x:number; y:number; depth?:number; sinkDepth?:number; heading:number; kind:string; hull:number;settled?:boolean};
type World = Pose & {time:number; speed?:number; patrol:{seed:number}; environment:{chartSeed?:number}; ships:Echo[]; site?:Echo|null};
const radians = Math.PI/180;
const clamp = (n:number,lo:number,hi:number) => Math.min(hi,Math.max(lo,n));

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
export function sampleLine(s:World,mode:Instrument,profile:Profile,row:number,plates:WreckPlates):Uint8Array {
  const strip=strips[profile],{range,width,height}=mode==='scribbler'?strip:profiles[profile],result=new Uint8Array(width);
  const angle=s.heading*radians, sn=Math.sin(angle), cs=Math.cos(angle);
  const seed=s.environment.chartSeed;
  const altitude=Math.max(1,chartDepth(s.x,s.y,seed)-s.depth);
  const rangeSquared=range*range;
  const vertical=(.5-(row+.5)/height)*1.25;
  const objects=s.site?[...s.ships,s.site]:s.ships;
  const wrecks:WreckEcho[]=[];
  const echoes=objects.flatMap(v=>{
    const dx=v.x-s.x, dy=v.y-s.y, depth=(v.depth??0)+(v.sinkDepth??0);
    const turn=(v.heading-s.heading)*radians;
    if(mode==='scribbler'&&(v.kind==='wreck'||v.hull<=0&&v.settled)&&Object.hasOwn(plates,v.kind)){
      if(depth>=s.depth&&dx*dx+dy*dy+(depth-s.depth)**2<=rangeSquared){
        wrecks.push({plate:plates[v.kind as keyof WreckPlates],along:dx*sn+dy*cs,across:dx*cs-dy*sn,sin:Math.sin(turn),cos:Math.cos(turn)});
      }
      return [];
    }
    const halfLength=v.kind==='carrier'?120:v.kind==='wreck'?25:v.kind==='sub'?30:45;
    return [{along:dx*sn+dy*cs,across:dx*cs-dy*sn,depth:depth-s.depth,halfLength,turn,
      halfWidth:Math.max(4,halfLength*.17),height:v.kind==='carrier'?18:v.kind==='sub'?6:9}];
  });
  if(s.site){
    for(const rock of cachedOutcrops(s.site,s.patrol.seed,seed)){
      const dx=rock.x-s.x,dy=rock.y-s.y;
      echoes.push({along:dx*sn+dy*cs,across:dx*cs-dy*sn,depth:rock.depth-s.depth,turn:(rock.heading-s.heading)*radians,
        halfLength:rock.length,halfWidth:rock.width,height:rock.height});
    }
  }
  function seabedReturn(along:number,across:number){
    const x=s.x+sn*along+cs*across,y=s.y+cs*along-sn*across;
    const depth=chartDepth(x,y,seed),drop=depth-s.depth;
    if(mode==='scribbler'&&(drop<0||across*across+drop*drop>rangeSquared))return 0;
    const step=5,slope=(chartDepth(x+step*cs,y-step*sn,seed)-depth)/step;
    const ripple=Math.sin(x*.088+Math.sin(y*.051)*1.5+y*.117);
    const grain=hash01(s.patrol.seed,Math.floor(x/3)*7919+Math.floor(y/3));
    const texture=52+22*ripple+32*grain+100*clamp(slope,-.4,.4)*Math.sign(across)+13*Math.sin(depth*.31);
    if(mode==='painter')return texture;
    // Reconstruct the bottom under the keel with less contrast at steep viewing angles.
    const overhead=altitude/(altitude+Math.abs(across)*6);
    return texture+(68-texture)*.5*overhead;
  }
  for(let i=0;i<width;i++){
    const u=(i+.5)*2/width-1;
    let along=0,across=0, shade=0;
    if(mode==='scribbler'){
      // The paper measures horizontal distance from the track on both sides.
      across=strip.bands[i].center;
      shade=seabedReturn(0,across);
    }else{
      // A row samples one elevation looking out from the bow. Intersect
      // downward-looking rays with the same chart relief used by the scene.
      if(vertical<-.014){
        along=altitude/-vertical;across=u*1.2*along;
        if(along<range*1.1){
          const depth=chartDepth(s.x+sn*along+cs*across,s.y+cs*along-sn*across,seed);
          along=Math.max(0,depth-s.depth)/-vertical;across=u*1.2*along;
        }
        if(along>0&&Math.hypot(along,across)<range)shade=seabedReturn(along,across);
      }
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
        if(Math.abs(e.along)>alongRadius||e.depth<0||e.along*e.along+e.across*e.across+e.depth*e.depth>rangeSquared)continue;
        const extent=(Math.abs(Math.sin(e.turn))*e.halfLength+Math.abs(Math.cos(e.turn))*e.halfWidth)*
          Math.sqrt(1-(e.along/alongRadius)**2);
        const edge=Math.max(strip.bands[i].half,extent);
        const offset=across-e.across;
        if(Math.abs(offset)<=edge)shade=205+34*Math.cos(offset/edge);
        else{
          const pastEdge=offset*Math.sign(e.across)-edge;
          if(pastEdge>0&&pastEdge<Math.min(140,Math.abs(e.across)*e.height/Math.max(3,altitude)))shade*=.12;
        }
      }
    }
    result[i]=clamp(shade,0,255);
  }
  for(const wreck of wrecks)printWreck(result,strip,wreck,altitude);
  return result;
}

interface PaperSnapshot {
  mode:Instrument;profile:Profile;x:number;y:number;fraction:number;completedLines:number;anchor:number|null;
  pixels:number[];line:number[]|null;archive:{pixels:number[];times:number[]}[];
}
const bytes=(a:unknown,size:number):a is number[]=>Array.isArray(a)&&a.length===size&&a.every(n=>Number.isInteger(n)&&n>=0&&n<=255);
export class ImagerPaper {
  readonly pixels:Uint8Array;
  readonly width:number;
  readonly height:number;
  readonly rows:number;
  x=0;
  y=0;
  version=0;
  completedLines=0;
  // Completed lines are appended once in chunks. The live raster also holds
  // the partial line being written. Browsing never moves the write head.
  private archive:{pixels:Uint8Array;times:Float64Array}[]=[];
  private anchor:number|null=null;
  private fraction=0;
  private line?:Uint8Array;
  constructor(readonly mode:Instrument,readonly profile:Profile,private readonly plates:WreckPlates){
    const p=mode==='scribbler'?strips[profile]:profiles[profile];
    this.width=p.width;this.height=p.height;this.rows=p.rows;this.pixels=new Uint8Array(this.width*this.height);
  }
  get browsing(){return this.anchor!==null;}
  snapshot():PaperSnapshot {
    return {mode:this.mode,profile:this.profile,x:this.x,y:this.y,fraction:this.fraction,completedLines:this.completedLines,anchor:this.anchor,
      pixels:Array.from(this.pixels),line:this.line?Array.from(this.line):null,archive:this.archive.map((chunk,i)=>{
        const used=Math.min(128,this.completedLines-i*128);
        return {pixels:Array.from(chunk.pixels.subarray(0,used*this.width)),times:Array.from(chunk.times.subarray(0,used))};
      })};
  }
  static fromSnapshot(v:PaperSnapshot,plates:WreckPlates){
    const invalid=()=>new Error('Invalid sonar recording.');
    if(!v||!instruments.includes(v.mode)||!Object.hasOwn(profiles,v.profile))throw invalid();
    const paper=new ImagerPaper(v.mode,v.profile,plates),{width,height}=paper;
    if(!bytes(v.pixels,width*height)||!Number.isInteger(v.x)||v.x<0||v.x>=width||!Number.isInteger(v.y)||v.y<0||v.y>=height||
      !Number.isSafeInteger(v.completedLines)||v.completedLines<0||!Number.isFinite(v.fraction)||v.fraction<0||v.fraction>=1||
      !(v.x===0?v.line===null:bytes(v.line,width))||!Array.isArray(v.archive)||
      v.archive.length!==(v.mode==='scribbler'?Math.ceil(v.completedLines/128):0)||
      (v.mode==='scribbler'?v.y!==0:v.y!==v.completedLines%height))throw invalid();
    if(v.anchor!==null&&(v.mode!=='scribbler'||!Number.isFinite(v.anchor)||v.anchor<height-1||v.anchor>=v.completedLines))throw invalid();
    paper.archive=v.archive.map((chunk,i)=>{
      const count=Math.min(128,v.completedLines-i*128);
      if(!chunk||!bytes(chunk.pixels,width*count)||!Array.isArray(chunk.times)||chunk.times.length!==count||!chunk.times.every(Number.isFinite))throw invalid();
      const pixels=new Uint8Array(128*width),times=new Float64Array(128);
      pixels.set(chunk.pixels);times.set(chunk.times);return {pixels,times};
    });
    paper.pixels.set(v.pixels);paper.line=v.line?Uint8Array.from(v.line):undefined;
    paper.x=v.x;paper.y=v.y;paper.completedLines=v.completedLines;paper.anchor=v.anchor;paper.fraction=v.fraction;
    return paper;
  }
  get topLine(){return this.anchor===null?this.completedLines:Math.floor(this.anchor);}
  showLive(){this.anchor=null;}
  scrollRows(rows:number){
    if(this.mode!=='scribbler'||rows===0)return;
    const next=clamp((this.anchor??this.completedLines)-rows,Math.min(this.height-1,this.completedLines),this.completedLines);
    this.anchor=next===this.completedLines?null:next;
  }
  recordedAt(line:number){
    if(line<0||line>=this.completedLines)return undefined;
    return this.archive[Math.floor(line/128)].times[line%128];
  }
  visibleRow(row:number){
    if(!this.browsing)return this.pixels.subarray(row*this.width,(row+1)*this.width);
    const line=this.topLine-row,offset=(line%128)*this.width;
    return this.archive[Math.floor(line/128)].pixels.subarray(offset,offset+this.width);
  }
  clear(){
    this.archive=[];this.anchor=null;this.x=this.y=this.completedLines=this.fraction=0;
    this.line=undefined;this.pixels.fill(0);this.version++;
  }
  advance(s:World,dt:number,quality:number){
    const speed=Math.abs(s.speed??4);
    if(this.mode==='scribbler'&&speed===0)return;
    const feed=this.mode==='scribbler'?Math.min(1,speed)*(.35+.65*speed/4):1;
    this.fraction+=dt*this.rows*feed*this.width*quality;
    const count=Math.floor(this.fraction);this.fraction-=count;
    if(count>0)this.version++;
    for(let n=0;n<count;n++){
      this.line??=sampleLine(s,this.mode,this.profile,this.y,this.plates);
      this.pixels[this.y*this.width+this.x]=this.line[this.x];
      if(++this.x<this.width)continue;
      if(this.mode==='scribbler'){
        const offset=this.completedLines%128;
        if(offset===0)this.archive.push({pixels:new Uint8Array(128*this.width),times:new Float64Array(128)});
        const chunk=this.archive[this.archive.length-1];
        chunk.pixels.set(this.line,offset*this.width);
        chunk.times[offset]=s.time-dt+dt*(n+1)/count;
      }
      this.x=0;this.line=undefined;this.completedLines++;
      if(this.mode==='painter')this.y=(this.y+1)%this.height;
      else{this.pixels.copyWithin(this.width,0);this.pixels.fill(0,0,this.width);}
    }
  }
}

export class ImagerDisplay {
  private canvas=document.createElement('canvas');
  private image?:ImageData;
  private previous?:ImagerPaper;
  private version=-1;
  private completedLines=-1;
  private topLine=-1;
  private browsing=false;
  draw(ctx:CanvasRenderingContext2D,w:number,h:number,paper:ImagerPaper,writing:boolean,now:number){
    const {width,height}=paper;
    if(!this.image||width!==this.image.width||height!==this.image.height){
      this.canvas.width=width;this.canvas.height=height;this.image=new ImageData(width,height);
    }
    const moved=this.topLine!==paper.topLine||this.browsing!==paper.browsing;
    if(this.previous!==paper||moved||!paper.browsing&&this.version!==paper.version){
      const data=this.image.data;
      const rows=paper.mode==='scribbler'&&this.previous===paper&&!moved&&!paper.browsing&&this.completedLines===paper.completedLines?1:height;
      for(let row=0;row<rows;row++){
        const line=paper.visibleRow(row);
        for(let col=0;col<width;col++){
          const v=line[col],p=(row*width+col)*4;
          data[p]=12+v*.96;data[p+1]=12+v*.63;data[p+2]=9+v*.22;data[p+3]=255;
        }
      }
      this.topLine=paper.topLine;this.browsing=paper.browsing;
      this.canvas.getContext('2d')!.putImageData(this.image,0,0,0,0,width,rows);
      this.previous=paper;this.version=paper.version;this.completedLines=paper.completedLines;
    }
    ctx.fillStyle='#100f0b';ctx.fillRect(0,0,w,h);
    const margin=12,top=paper.mode==='scribbler'?68:56,bottom=27,areaW=Math.max(1,w-margin*2),areaH=Math.max(1,h-top-bottom);
    ctx.imageSmoothingEnabled=false;ctx.drawImage(this.canvas,margin,top,areaW,areaH);
    ctx.font='11px monospace';ctx.fillStyle='#dec390';ctx.textAlign='left';
    ctx.fillText(paper.mode==='scribbler'?'PORT':'PORT   /   BOW SECTOR',margin,h-8);
    ctx.textAlign='right';ctx.fillText(paper.mode==='scribbler'?'STBD':'STBD   '+profiles[paper.profile].range+' m',w-margin,h-8);
    if(paper.mode==='scribbler'){
      // Mark every recorded ship minute. Label as many as the screen can fit.
      ctx.textAlign='left';let lastLabel=-Infinity;
      for(let row=0;row<height;row++){
        const line=paper.topLine-row,at=paper.recordedAt(line);
        if(at===undefined)continue;
        const before=paper.recordedAt(line-1);
        if(row!==0&&before!==undefined&&Math.floor(at/shipMinute)===Math.floor(before/shipMinute))continue;
        const y=top+(row+.5)*areaH/height;
        ctx.fillStyle='#efd399';ctx.fillRect(margin-6,y,6,1);
        if(y-lastLabel>=14&&y+12<top+areaH){
          const label=Math.max(0,Math.round((now-at)/shipMinute))+'m ago';
          ctx.fillStyle='#17150cdd';ctx.fillRect(margin,y,ctx.measureText(label).width+5,13);
          ctx.fillStyle='#efd399';ctx.fillText(label,margin+2,y+10);lastLabel=y;
        }
      }
      ctx.textAlign='center';
      ctx.fillText('MAX '+strips[paper.profile].range+' m',w/2,h-8);
      for(const side of [-1,1]){
        const x=w/2+side*areaW/4;
        ctx.fillRect(x,h-bottom,1,4);
        ctx.fillText(strips[paper.profile].near+' m',x,h-8);
      }
    }
    if(!writing&&!paper.completedLines&&!paper.x){
      ctx.textAlign='center';ctx.fillText(paper.mode==='scribbler'?'Seafloor strip · Start scan':'Forward sweep · Start scan',w/2,top+areaH/2);
    }
    if(paper.browsing)return;
    const x=margin+(paper.x+.5)*areaW/width,y=top+(paper.y+.5)*areaH/height;
    ctx.save();ctx.shadowColor='#ffc15c';ctx.shadowBlur=writing?7:3;ctx.fillStyle=writing?'#fff6c2':'#e6c789';ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fill();ctx.restore();
  }
}
