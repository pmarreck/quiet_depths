import {scopeEyeHeight,scopeExtension} from './periscope.ts';
import {boatPoint,surfaceHeight,surfaceMotion} from './surface-motion.ts';
import {SUB_DESIGN as D} from './hull-design.ts';
type Sea=Parameters<typeof surfaceMotion>[1];
export interface WakeSample {x:number;y:number;heading:number;time:number;width:number;strength:number}
interface Boat {x:number;y:number;heading:number;depth:number;pitch:number;speed:number;scope:boolean;time:number;wake:WakeSample[]}
export function recordWake(s:Boat,sea:Sea){
 const last=s.wake.at(-1);
 if(last&&s.time-last.time<1)return;
 if(s.wake.length&&s.time-s.wake[0].time>26)s.wake=s.wake.filter(p=>s.time-p.time<=26);
 const speed=Math.abs(s.speed);
 if(s.depth>23||speed<.1)return;
 const hull=surfaceMotion(s,sea,s.time);
 let width=0,origin={x:s.x,y:s.y};
 function exposed(forward:number,high:number,beam:number){
  const p=boatPoint(hull,{forward,down:-high});
  const emergence=-p.depth-surfaceHeight(p.x,p.y,s.time,sea);
  const touched=beam*Math.min(1,Math.max(0,emergence)/Math.max(1,beam));
  if(touched>width){width=touched;origin=p;}
 }
 exposed(s.speed>=0?-21:21,4.5,4.5);exposed(s.speed>=0?21:-21,4.5,4.5);exposed(0,5,5);
 exposed(-D.bridgeZ,D.bridgeEye,1.4);
 if(scopeExtension(s)>0)exposed(-D.scopeZ,scopeEyeHeight(s),.32);
 if(width>0)s.wake.push({...origin,heading:s.heading,time:s.time,width:width*(.3+.7*Math.min(1,speed/12)),strength:Math.min(1,speed/10)*Math.sqrt(width/5)});
}
