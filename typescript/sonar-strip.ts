import {transmitterProfiles} from './sonar-transmitters.ts';

// The middle half of the recorder is a linear close-up. Beyond its two range
// ticks the scale compresses smoothly until it reaches the full listening range.
function strip(width:number,height:number,rows:number,near:number,range:number){
  const edge=(u:number)=>{
    const t=Math.abs(u),outer=Math.max(0,2*t-1);
    return Math.sign(u)*(2*near*t+(range-2*near)*outer*outer);
  };
  const bands=Array.from({length:width},(_,i)=>{
    const left=edge(2*i/width-1),right=edge(2*(i+1)/width-1);
    return {center:(left+right)/2,half:(right-left)/2};
  });
  return {width,height,rows,near,range,bands};
}

export const strips={survey:strip(384,112,1.75,80,transmitterProfiles.survey.range),detail:strip(512,160,3,45,transmitterProfiles.detail.range)};

interface Plate {x:number;z:number;width:number;height:number;cell:number;heightStep:number;data:Uint8Array}
export type WreckPlates=Record<'wreck'|'sub'|'merchant'|'escort'|'fishing'|'carrier',Plate>;
export interface WreckEcho {plate:Plate;along:number;across:number;sin:number;cos:number}

function reliefAt(p:Plate,x:number,z:number){
  const col=Math.floor((x-p.x)/p.cell),row=Math.floor((z-p.z)/p.cell);
  return col>=0&&col<p.width&&row>=0&&row<p.height?p.data[row*p.width+col]:0;
}

export function printWreck(line:Uint8Array,strip:typeof strips.survey,e:WreckEcho,altitude:number){
  const p=e.plate;
  const radius=Math.hypot(Math.max(-p.x,p.x+p.width*p.cell),Math.max(-p.z,p.z+p.height*p.cell));
  if(Math.abs(e.along)>radius)return;
  for(const side of [-1,1]){
    let shadowEnd=0,previous=0;
    for(let i=side<0?line.length/2-1:line.length/2;i>=0&&i<line.length;i+=side){
      const band=strip.bands[i],across=band.center,offset=across-e.across,distance=Math.abs(across);
      if(Math.abs(offset)>radius+band.half&&distance>shadowEnd)continue;
      // A distant bin can cover more than the hull's beam. Retain a return
      // when the hull lies between adjacent sample centers.
      const samples=Math.min(12,Math.max(1,Math.ceil(2*band.half/p.cell)));
      let h=0,x=0,z=0,fitting=false;
      for(let j=0;j<samples;j++){
        const dx=offset+band.half*((2*j+1)/samples-1);
        const px=dx*e.cos+e.along*e.sin,pz=e.along*e.cos-dx*e.sin;
        const relief=reliefAt(p,px,pz),sample=(relief&127)*p.heightStep;
        if(sample>h){h=sample;x=px;z=pz;fitting=relief>=128;}
      }
      if(h){
        const nearFace=reliefAt(p,x-1.25*side*e.cos,z+1.25*side*e.sin);
        const slope=h-(nearFace&127)*p.heightStep;
        const grain=5*Math.sin(x*2.2+z*1.3);
        const light=136+3.4*h+12*slope+4*(h-previous)+grain+(fitting?28:0)-(distance<shadowEnd?24:0);
        line[i]=Math.min(250,Math.max(80,light));
        shadowEnd=Math.max(shadowEnd,distance+Math.min(140,distance*h/Math.max(4,altitude-h)));
      }else if(distance<shadowEnd){line[i]*=.18;}
      previous=h;
    }
  }
}
