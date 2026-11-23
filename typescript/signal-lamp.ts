import {hash01} from './surface-motion.ts';

const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const patterns=['.-','-...','-.-.','-..','.','..-.','--.','....','..','.---','-.-','.-..','--','-.','---','.--.','--.-','.-.','...','-','..-','...-','.--','-..-','-.--','--..','-----','.----','..---','...--','....-','.....','-....','--...','---..','----.'];
export const dotSeconds=.22;
type Span={start:number;end:number};
interface Script {marks:Span[];letters:Span[];period:number}
const scripts=new Map<string,Script>();
// ITU-R M.1677. Durations are dot units, including the seven-unit gap before a repeat.
export function morseScript(text:string):Script{
  const cached=scripts.get(text);if(cached)return cached;
  if(!/^[A-Z0-9]+(?: [A-Z0-9]+)*$/.test(text))throw Error('Unsupported lamp message');
  const marks:Span[]=[],letters:Span[]=[];let cursor=0;
  for(const ch of text){
    if(ch===' '){cursor+=4;continue;}
    const pattern=patterns[alphabet.indexOf(ch)],start=cursor;
    for(const element of pattern){
      const end=cursor+(element==='.'?1:3);
      marks.push({start:cursor,end});cursor=end+1;
    }
    letters.push({start,end:cursor-1});cursor+=2;
  }
  const result={marks,letters,period:cursor+4};if(scripts.size>=128)scripts.clear();scripts.set(text,result);
  return result;
}
type Point={x:number;y:number};
type Ship=Point & {id:string;name:string};
export interface Estimate extends Point {text:string;time:number;radius:number;sender:string;number:number}
export interface Transmission {estimate:Estimate;elapsed:number;since:number|null;copied:number;delivered:boolean;completedAt:number|null}
const compass=['N','NE','E','SE','S','SW','W','NW'];
export function makeTransmission(sender:Ship,hunter:Point,seed:number,number:number,time:number):Transmission{
  // The story supplies an imprecise sighting. The pin is the sector in the telegram, anchored to its sender at issue.
  const h=(n:number)=>hash01(seed,12000+number*6+n);
  const dx=hunter.x-sender.x+(h(1)-.5)*1200,dy=hunter.y-sender.y+(h(2)-.5)*1200;
  const sector=(Math.round(Math.atan2(dx,dy)*4/Math.PI)+8)%8,km=Math.max(1,Math.round(Math.hypot(dx,dy)/1000));
  const angle=sector*Math.PI/4;
  return {estimate:{text:'SUB '+compass[sector]+' '+km+' KM',x:sender.x+Math.sin(angle)*1000*km,y:sender.y+Math.cos(angle)*1000*km,
    radius:800+km*300,time,sender:sender.id,number},elapsed:0,since:null,copied:0,delivered:false,completedAt:null};
}
export function lampLit(m:Transmission){
  const script=morseScript(m.estimate.text),phase=(m.elapsed/dotSeconds)%script.period;
  return script.marks.some(mark=>phase>=mark.start&&phase<mark.end);
}
export function copyLamp(m:Transmission,seconds:number,inView:boolean){
  const old=m.elapsed;m.elapsed+=seconds;
  if(!inView){m.since=null;return false;}
  m.since??=old;
  if(m.delivered)return false;
  const script=morseScript(m.estimate.text);
  const from=old/dotSeconds,to=m.elapsed/dotSeconds;
  for(let repeat=Math.floor(from/script.period);repeat<=Math.floor(to/script.period);repeat++){
    const base=repeat*script.period;
    script.letters.forEach((letter,i)=>{
      if(base+letter.end>from&&base+letter.end<=to+1e-9&&(base+letter.start)*dotSeconds>=m.since!-1e-9)m.copied|=1<<i;
    });
  }
  m.delivered=m.copied===(1<<script.letters.length)-1;
  if(m.delivered)m.completedAt=m.elapsed;
  return m.delivered;
}
export function copyPercent(m:Transmission){
  const letters=morseScript(m.estimate.text).letters;
  return Math.floor(100*letters.filter((_,i)=>m.copied&(1<<i)).length/letters.length);
}
export function lampRange(e:{daylight:number;twilight:number;storm:number;rain:number;fog:number}){
  return (2300+e.twilight*1400+(1-e.daylight)*3700)*(1-.36*e.storm)*(1-.16*e.rain)*(1-.81*e.fog);
}
export const reportRadius=(p:Estimate,time:number)=>p.radius+Math.min(1500,Math.max(0,time-p.time)*1.5);
type Bearing={id:string;passiveBearing?:number;passiveAt?:number;passiveX?:number;passiveY?:number;identified:boolean;kind?:string;side?:string};
// Associate a single fresh bearing with the coarse game-chart region. Never tighten it into a measured fix.
export function matchingBearing(p:Estimate|undefined,observer:Point,time:number,contacts:readonly Bearing[]){
  if(!p)return;
  const radius=reportRadius(p,time);
  const matches=contacts.filter(c=>{
    if(c.side==='friendly'||c.identified&&c.kind!=='sub'||c.passiveAt===undefined||time-c.passiveAt>18||c.passiveBearing===undefined)return false;
    const dx=p.x-(c.passiveX??observer.x),dy=p.y-(c.passiveY??observer.y),range=Math.hypot(dx,dy);
    if(range<=radius)return false;
    const bearing=Math.atan2(dx,dy)*180/Math.PI,halfWidth=Math.asin(radius/range)*180/Math.PI+4;
    return Math.abs(((c.passiveBearing-bearing+540)%360)-180)<=halfWidth;
  });
  return matches.length===1?matches[0].id:undefined;
}
export function validEstimate(p:Estimate,time:number){
  return !!p&&[p.x,p.y,p.radius,p.time].every(Number.isFinite)&&p.radius>0&&p.time>=0&&p.time<=time&&
    Number.isSafeInteger(p.number)&&p.number>0&&typeof p.sender==='string'&&/^SUB (N|NE|E|SE|S|SW|W|NW) [1-9][0-9]{0,4} KM$/.test(p.text);
}
export function validTransmission(m:Transmission,time:number){
  return !!m&&validEstimate(m.estimate,time)&&validCopy(m,time);
}
export function validCopy(m:Transmission,time:number){
  if(!Number.isFinite(m.elapsed)||m.elapsed<0||m.elapsed>time+.001)return false;
  const full=(1<<morseScript(m.estimate.text).letters.length)-1;
  return (m.since===null||Number.isFinite(m.since)&&m.since>=0&&m.since<=m.elapsed)&&Number.isInteger(m.copied)&&m.copied>=0&&m.copied<=full&&m.delivered===(m.copied===full)&&
    (m.delivered?m.completedAt!==null&&Number.isFinite(m.completedAt)&&m.completedAt>=0&&m.completedAt<=m.elapsed:m.completedAt===null);
}

export type LampFix = Estimate & {target:string;depth:number;course:number;speed:number};
type Ally = Ship & {side?:string;kind:string;hull:number;disabled?:boolean};
type Sub = Ally & {depth:number;speed:number;heading:number};

export function alliedFix(sender:Ally,target:Sub,time:number,number:number):LampFix {
  // These are the chart coordinates actually spelled out by the lamp.
  const x=10*Math.round(target.x/10),y=10*Math.round(target.y/10);
  const depth=Math.round(target.depth),course=(Math.round(target.heading)+360)%360,speed=Math.round(target.speed);
  const text=[(x<0?'W':'E')+Math.abs(x/10),(y<0?'S':'N')+Math.abs(y/10),'D'+depth,'C'+course,'K'+speed].join(' ');
  return {sender:sender.id,target:target.id,x,y,radius:10,time,number,text,depth,course,speed};
}
export function liveTransmission(fix:LampFix):Transmission{
  return {estimate:{...fix},elapsed:0,since:null,copied:0,delivered:false,completedAt:null};
}
export function validLampFix(p:LampFix,time:number){
  return !!p&&typeof p.text==='string'&&/^[EW]\d{1,5} [NS]\d{1,5} D\d{1,3} C\d{1,3} K\d{1,2}$/.test(p.text)&&
    [p.depth,p.course,p.speed,p.x,p.y,p.time].every(Number.isFinite)&&p.time>=0&&p.time<=time&&p.course>=0&&p.course<360&&p.depth>=0&&p.speed>=0&&
    typeof p.target==='string'&&typeof p.sender==='string'&&p.radius===10&&Number.isSafeInteger(p.number)&&p.number>0;
}
