import {bottom,clamp,distance,rad,log} from './mechanics.js';
import {boatPoint} from './vehicle-status.js';

// Rounded hulls and a separate sail. Endpoints use the same forward, starboard
// and down coordinates as the visible boat.
function hullParts(body){
 const sub=body.kind==='sub'||body.kind==='wreck'||!body.kind;
 const size=body.kind==='fishing'||body.kind==='surface'?.38:body.kind==='escort'?.78:1;
 const pose={...body,depth:body.depth??3};
 const part=(a,b,r)=>({a:boatPoint(pose,a),b:boatPoint(pose,b),r});
 if(sub)return [part({forward:-27.5},{forward:27.5},5),part({forward:5,down:-4},{forward:5,down:-11},2.1)];
 return [part({forward:-52*size},{forward:52*size},12*size)];
}
const vector=(a,b)=>[a.x-b.x,a.y-b.y,a.depth-b.depth];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

function closestContact(a,b,heading){
 const u=vector(a.b,a.a),v=vector(b.b,b.a),w=vector(a.a,b.a);
 const uu=dot(u,u),vv=dot(v,v),uv=dot(u,v),uw=dot(u,w),vw=dot(v,w);
 const det=uu*vv-uv*uv;
 let t=det>1e-8?clamp((uv*vw-vv*uw)/det,0,1):0;
 const k=clamp((uv*t+vw)/vv,0,1);
 t=clamp((uv*k-uw)/uu,0,1);
 const dx=w[0]+t*u[0]-k*v[0],dy=w[1]+t*u[1]-k*v[1],dz=w[2]+t*u[2]-k*v[2];
 const d=Math.hypot(dx,dy,dz),overlap=a.r+b.r-d;
 if(overlap<=0)return null;
 const lateralGap=Math.sqrt(Math.max(0,(a.r+b.r)**2-dz*dz))-Math.hypot(dx,dy);
 return d>.0001?{nx:dx/d,ny:dy/d,nd:dz/d,overlap,lateralGap}:{nx:Math.cos(rad(heading)),ny:-Math.sin(rad(heading)),nd:0,overlap,lateralGap};
}
export function hullContact(a,b){
 if(distance(a,b)>145||Math.abs((a.depth??3)-(b.depth??3))>32)return null;
 let deepest=null;
 const other=hullParts(b);
 for(const part of hullParts(a))for(const second of other){
  const hit=closestContact(part,second,a.heading);
  if(hit&&(!deepest||hit.overlap>deepest.overlap))deepest=hit;
 }
 return deepest;
}
function weight(body,site){
 if(body===site&&body.kind!=='surface')return 0;
 if(body.kind==='merchant')return .28;
 if(body.kind==='escort')return .55;
 return body.kind==='fishing'||body.kind==='surface'?1.6:1;
}
function displace(body,amount,n,vertical){
 body.x+=amount*n.nx;body.y+=amount*n.ny;
 if(vertical)body.depth+=vertical;
}
function resolvePair(s,a,b,hurt){
 const hit=hullContact(a,b);if(!hit)return;
 const wa=weight(a,s.site),wb=weight(b,s.site),sum=wa+wb;
 // Surface traffic and grounded wrecks cannot be pushed down. Give the
 // remaining displacement to the submerged hull, or separate horizontally.
 const va=(!a.kind||a.kind==='sub')&&a!==s.site?wa:0;
 const vb=(!b.kind||b.kind==='sub')&&b!==s.site?wb:0;
 let move=hit.overlap+.015;
 let da=va?move*hit.nd*va/(va+vb):0,db=vb?-move*hit.nd*vb/(va+vb):0;
 const blocked=(body,d)=>d<0&&body.depth+d<0||d>0&&body.depth+d>keelLimit(body);
 if(!(va+vb)||blocked(a,da)||blocked(b,db)){
  const angle=rad(a.heading),len=Math.hypot(hit.nx,hit.ny);
  hit.nx=len>.001?hit.nx/len:Math.cos(angle);hit.ny=len>.001?hit.ny/len:-Math.sin(angle);
  move=hit.lateralGap+.015;da=0;db=0;
 }
 const closing=Math.hypot(Math.sin(rad(a.heading))*a.speed-Math.sin(rad(b.heading))*b.speed,Math.cos(rad(a.heading))*a.speed-Math.cos(rad(b.heading))*b.speed,(a.verticalSpeed||0)-(b.verticalSpeed||0));
 displace(a,move*wa/sum,hit,da);displace(b,-move*wb/sum,hit,db);
 const key=[a===s?'boat':a.id??'site',b===s?'boat':b.id??'site'].sort().join('/');
 if(s.time-(s.collisionHits[key]??-99)<4)return;
 s.collisionHits[key]=s.time;
 const severity=clamp(2+closing*1.1,2,36);
 for(const body of [a,b]){
  if(body===s)hurt(s,severity,b===s.site?'Hull contact with the casualty.':'Hull collision with another vessel.','planes');
  else body.hull=clamp((body.hull??100)-severity,0,100);
  if(body!==s.site){body.speed*=.45;if(body.verticalSpeed)body.verticalSpeed*=.4;}
 }
}
export function keelLimit(body){
 const sub=!body.kind||body.kind==='sub',scale=body.kind==='fishing'?.38:body.kind==='escort'?.78:1;
 const half=sub?27.5:52*scale,draft=sub?5:5*scale;
 let floor=Infinity;
 for(const forward of [-half,0,half]){
  const pose=boatPoint(body,{forward});
  floor=Math.min(floor,bottom(pose.x,pose.y)-draft+forward*Math.sin(body.pitch||0));
 }
 return floor;
}
export function resolveTraffic(s,hurt){
 const ships=s.ships.filter(v=>v.hull>0);
 if(s.site)resolvePair(s,s,s.site,hurt);
 for(let i=0;i<ships.length;i++){
  const ship=ships[i];
  if(ship.kind!=='sub'&&s.scope&&s.depth<=15&&distance(s,ship)<48&&s.systems.periscope>0){
   s.systems.periscope=0;s.scope=false;log(s,'Periscope sheared away under a vessel.','damage');
  }
  resolvePair(s,s,ship,hurt);
  if(s.site)resolvePair(s,ship,s.site,hurt);
  for(let j=0;j<i;j++)resolvePair(s,ship,ships[j],hurt);
  const floor=keelLimit(ship);
  if((ship.depth??0)>floor){
   if(ship.kind==='sub')ship.depth=Math.max(0,floor);
   if(floor<0)pushOffShoal(ship,-floor);
   if(s.time-(ship.groundedAt??-99)>5){ship.hull=Math.max(0,ship.hull-2-Math.abs(ship.speed)*.7);ship.groundedAt=s.time;}
   ship.speed*=.35;
  }
 }
}
export function pushOffShoal(body,overlap){
 const dx=(bottom(body.x+1,body.y)-bottom(body.x-1,body.y))/2;
 const dy=(bottom(body.x,body.y+1)-bottom(body.x,body.y-1))/2;
 const slope=dx*dx+dy*dy;if(slope<1e-8)return;
 const scale=Math.min((overlap+.01)/slope,30/Math.sqrt(slope));
 body.x+=dx*scale;body.y+=dy*scale;
}
