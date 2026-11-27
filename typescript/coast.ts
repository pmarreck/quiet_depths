// Mirrored in elm/Sim/Coast.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
import {exp} from './sim-math.ts';
import {hash01} from './surface-motion.ts';

interface Island {x:number;y:number;length:number;width:number;cos:number;sin:number;height:number;phase:number}
function coastline(seed:number){
  let sequence=8500;
  const roll=()=>hash01(seed,sequence++);
  const phase=roll()*Math.PI*2,second=roll()*Math.PI*2;
  const islands:Island[]=[];
  for(const side of [-1,1]){
    let x=side*(9400+roll()*3800),y=(roll()-.45)*15000;
    const bearing=roll()*Math.PI*2,count=3+Math.floor(roll()*4);
    for(let i=0;i<count;i++){
      const tilt=bearing+(roll()-.5)*1.7;
      islands.push({x,y,length:950+roll()*2300,width:580+roll()*1300,cos:Math.cos(tilt),sin:Math.sin(tilt),height:260+roll()*270,phase:roll()*Math.PI*2});
      x+=side*(800+roll()*2100);y+=(1000+roll()*2300)*Math.sin(bearing)+(roll()-.5)*1500;
    }
  }
  return {phase,second,islands,mainland:11000+roll()*5500};
}
const charts=new Map<number,ReturnType<typeof coastline>>();
export function chartDepth(x:number,y:number,seed?:number){
  const reef=155*exp(-((x-1900)**2+(y-700)**2)/470000);
  const greybank=460*exp(-((x+3800)**2+(y-4000)**2)/1900000);
  const old=230+30*Math.sin(x/1100)*Math.cos(y/900)-reef-greybank;
  // Retain the surveyed inner shelf and the island airstrip. Older saves use their original chart everywhere.
  if(seed===undefined||Math.abs(x)<4500&&y<5600&&y>-4500)return old;
  let chart=charts.get(seed);
  if(!chart){
    chart=coastline(seed);
    if(charts.size===8)charts.delete(charts.keys().next().value!);
    charts.set(seed,chart);
  }
  const {phase,second,islands,mainland}=chart;
  const blend=Math.min(1,Math.max(0,(Math.abs(x)-4500)/2800,(y-5600)/2600,(-y-4500)/2600));
  const shelf=243+33*Math.sin(x/3700+Math.sin(y/5900+phase))+24*Math.cos(y/3100+x/7600+second);
  let depth=old+(shelf-old)*blend;
  if(y>mainland-5600){
    const shore=mainland+2500*Math.sin(x/5200+phase)+1300*Math.sin(x/1900+second)+440*Math.sin(x/670+phase);
    depth=Math.min(depth,(shore-y)*.12);
  }
  for(const i of islands){
    const dx=x-i.x,dy=y-i.y;
    if(Math.abs(dx)>i.length*2.5+i.width||Math.abs(dy)>i.length*2.5+i.width)continue;
    const u=(dx*i.cos+dy*i.sin)/i.length,v=(dy*i.cos-dx*i.sin)/i.width;
    const bend=v+.24*Math.sin(2.9*u+i.phase)+.08*Math.sin(5*u+i.phase);
    depth-=blend*i.height*exp(-1.3*(u*u+bend*bend));
  }
  return Math.max(-360,depth);
}

// Fixed landmarks shared by the wreck scenery and the acoustic recorders.
export function shelfOutcrops(site:{x:number;y:number},seed:number){
  return Array.from({length:12},(_,i)=>{
    const angle=hash01(seed,19800+i)*Math.PI*2,range=65+hash01(seed,19820+i)*310;
    return {x:site.x+Math.sin(angle)*range,y:site.y+Math.cos(angle)*range,
      length:8+hash01(seed,19840+i)*22,width:4+hash01(seed,19860+i)*8,
      height:3+hash01(seed,19880+i)*10,heading:angle*180/Math.PI};
  });
}
