interface Point {clientX:number;clientY:number}
interface Pair {x:number;y:number;span:number}
export interface ZoomGesture {x:number;y:number;factor:number;scroll:number;kind:'pinch'|'scroll'}
function pair(a:Point,b:Point):Pair{
  return {x:(a.clientX+b.clientX)/2,y:(a.clientY+b.clientY)/2,span:Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY)};
}
export class TwoFingerMotion {
  private previous:Pair;
  private kind:ZoomGesture['kind']|null=null;
  constructor(a:Point,b:Point){this.previous=pair(a,b);}
  move(a:Point,b:Point):ZoomGesture|null{
    const next=pair(a,b),prior=this.previous,dy=next.y-prior.y,spread=next.span-prior.span;
    if(!this.kind){
      if(Math.max(Math.abs(dy),Math.abs(spread))<5)return null;
      this.kind=Math.abs(spread)>Math.abs(dy)?'pinch':'scroll';
    }
    this.previous=next;
    const factor=this.kind==='scroll'?Math.exp(-dy*.009):Math.max(2,next.span)/Math.max(2,prior.span);
    return {x:next.x,y:next.y,kind:this.kind,factor,scroll:-dy};
  }
}

// Keep the remaining finger claimed until both are lifted. A two-finger chart
// gesture must never finish as a tap-to-plot or turn a camera as it ends.
export function bindTwoFinger(surface:HTMLElement,enabled:()=>boolean,begin:()=>void,apply:(g:ZoomGesture)=>void){
  let claimed=false,motion:TwoFingerMotion|null=null;
  surface.addEventListener('touchstart',e=>{
    if(!enabled()||e.touches.length!==2||Array.from(e.touches).some(t=>!(t.target instanceof Element)||!surface.contains(t.target)||t.target.closest('button,input,select')))return;
    claimed=true;motion=new TwoFingerMotion(e.touches[0],e.touches[1]);begin();e.preventDefault();
  },{passive:false});
  surface.addEventListener('touchmove',e=>{
    if(!claimed)return;
    e.preventDefault();
    if(e.touches.length!==2||!motion||!enabled())return;
    const gesture=motion.move(e.touches[0],e.touches[1]);if(gesture)apply(gesture);
  },{passive:false});
  const end=(e:TouchEvent)=>{
    if(!claimed)return;
    if(e.touches.length<2)motion=null;
    if(!e.touches.length)claimed=false;
  };
  surface.addEventListener('touchend',end);surface.addEventListener('touchcancel',end);
  return ()=>claimed;
}
