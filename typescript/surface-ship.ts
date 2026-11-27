import type * as Three from './vendor/three.module.js';
import {surfaceHull,type HullClass} from './surface-hull.ts';

type Triple=[number,number,number];
type Class=Exclude<HullClass,'carrier'|'launch'>;
const classes={merchant:true,escort:true,fishing:true} satisfies Record<Class,true>;
// Vessels this module can build; a new hull class must be added above.
export const isShipClass=(kind:string):kind is Class=>Object.hasOwn(classes,kind);
export function surfaceShip(T:typeof Three,kind:Class):Three.Group{
  const root=new T.Group(),body=new T.Group(),lights=new T.Group();root.add(body,lights);
  root.userData.body=body;root.userData.lights=lights;
  root.scale.setScalar(kind==='fishing'?.38:kind==='escort'?.78:1);
  const paint=(color:number)=>new T.MeshStandardMaterial({color,roughness:.8,metalness:.12});
  const steel=paint(kind==='escort'?0x78878a:0x747d75),cream=paint(kind==='escort'?0x89979a:0xcfc8a7);
  const glass=paint(0x243c46),charcoal=paint(0x343b3a),timber=paint(0x906e4e),ocher=paint(0xad7442);
  function part(name:string,geometry:Three.BufferGeometry,material:Three.Material,xyz:Triple){
    const m=new T.Mesh(geometry,material);m.name=name;m.position.set(...xyz);body.add(m);return m;
  }
  function box(name:string,size:Triple,xyz:Triple,material:Three.Material){return part(name,new T.BoxGeometry(...size),material,xyz);}
  function spar(name:string,a:Triple,b:Triple,radius:number,material:Three.Material){
    const [x,y,z]=a,dx=b[0]-x,dy=b[1]-y,dz=b[2]-z,length=Math.hypot(dx,dy,dz);
    const m=part(name,new T.CylinderGeometry(radius*.76,radius,length,7),material,[x+dx/2,y+dy/2,z+dz/2]);
    m.rotation.set(Math.atan2(dz,dy),0,-Math.asin(dx/length));return m;
  }
  const hull=part('hull',surfaceHull(T,kind),new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.83,metalness:.15}),[0,0,0]);
  root.userData.hull=hull;
  // Clip the forward corners of the bridge to give it angled wheelhouse windows.
  function house(name:string,w:number,length:number,y:number,h:number,z:number,material:Three.Material){
    const outline=[[-.72,-1],[.72,-1],[1,-.61],[1,1],[-1,1],[-1,-.61]];
    const shape=new T.Shape(outline.map(([x,v])=>new T.Vector2(x*w/2,-v*length/2)));
    return part(name,new T.ExtrudeGeometry(shape,{depth:h,bevelEnabled:false}).rotateX(-Math.PI/2),material,[0,y,z]);
  }
  const z=kind==='merchant'?33:kind==='escort'?-14:-20,w=kind==='merchant'?18:kind==='escort'?13.6:16.5;
  const y=kind==='merchant'?16:kind==='escort'?13.2:12.8;
  house('deckhouse',w+1.6,kind==='merchant'?30:23,kind==='escort'?6.4:7,y-(kind==='escort'?6.4:7),z,steel);
  house('wheelhouse',w,14,y,3,z-2,cream);
  house('bridge glazing',w+.15,14.1,y+2.95,2.1,z-2,glass);
  house('bridge roof',w+1.3,15.3,y+5,.8,z-2,cream);
  for(const x of [-.22,0,.22])box('window mullion',[.25,2.2,.3],[x*w,y+4,z-9.05],cream);
  for(const side of [-1,1])for(const zz of [0,3.5])box('window mullion',[.25,2.2,.28],[side*w*.5,y+4,z+zz],cream);
  const mastZ=kind==='merchant'?-15:z+3,mastY=kind==='merchant'?39:kind==='escort'?39:32;
  root.userData.mast=spar('signal mast',[0,kind==='merchant'?8:y+5,mastZ],[0,mastY,mastZ+1],.56,steel);
  spar('yardarm',[-6,mastY-4,mastZ+1],[6,mastY-4,mastZ+1],.24,steel);
  root.userData.signalAt=[2,mastY-5,mastZ+1];root.userData.flagAt=[0,mastY-1,mastZ+1];root.userData.bridgeAt=[w/2,y+4,z];
  const stackZ=kind==='merchant'?48:kind==='escort'?9:-6;
  spar('funnel',[0,8,stackZ],[0,y+12,stackZ+2],kind==='escort'?3.3:2.4,kind==='escort'?steel:ocher);
  spar('funnel cap',[0,y+10,stackZ+1.8],[0,y+13,stackZ+2.1],kind==='escort'?2.65:1.95,charcoal);
  // Short forecastle rails and mooring fittings make the rake of the stem
  // readable from deck level. Follow each class's actual sheer and breadth.
  const rail=kind==='merchant'?[[.12,11.7,-64],[5.1,10.1,-53],[9.5,8.9,-40]]:kind==='escort'?[[.1,10.8,-64],[2.4,8.9,-53],[4.9,7.5,-40]]:[[.1,12.7,-58],[7.2,10,-48],[11.5,8.2,-36]];
  for(const side of [-1,1]){
    const top:Triple[]=rail.map(([x,h,z])=>[side*x,h+1.1,z]);
    for(const [i,[x,h,z]] of top.entries()){
      spar('rail stanchion',[x,h-1.35,z],[x,h,z],.12,cream);
      if(i)spar('forecastle handrail',top[i-1],top[i],.13,cream);
    }
    const x=side*(kind==='escort'?2.5:4),z=kind==='fishing'?-39:-44,h=kind==='fishing'?9:kind==='escort'?8.5:9.7;
    spar('mooring bollard',[x,h-.7,z],[x,h+.8,z],.46,charcoal);
  }
  if(kind==='merchant'){
    for(const hz of [-41,-21,1]){
      box('hatch coaming',[14.4,1.7,15.6],[0,9.3,hz],charcoal);
      box('cargo hatch',[14,1.15,15.1],[0,10.65,hz],timber);
      for(const seam of [-3.8,0,3.8])box('hatch batten',[14.1,.17,.24],[0,11.28,hz+seam],steel);
    }
    for(const side of [-1,1]){
      const tip:Triple=[side*5.3,20,mastZ+side*18];
      spar('cargo derrick',[side*.65,13,mastZ],tip,.48,ocher);
      spar('topping lift',[0,mastY-2,mastZ+1],tip,.13,charcoal);
    }
  }else if(kind==='escort'){
    house('after deckhouse',12,21,6.5,5.2,24,steel);
    house('forward turret',6.1,7.4,8.1,3.6,-40,steel);
    spar('barrel',[0,10.5,-42],[0,11.8,-51],.39,charcoal);
    box('radar array',[7.4,2,.55],[0,mastY+.9,mastZ+1],charcoal);
  }else{
    for(const side of [-1,1]){
      spar('trawl gantry leg',[side*10.3,7.4,30],[side*7,21,35],.78,ocher);
      spar('gantry brace',[side*10,7.7,41],[side*7,20,35],.5,ocher);
    }
    spar('trawl gantry beam',[-7.3,21,35],[7.3,21,35],.83,ocher);
    spar('net drum',[-4,10,14],[4,10,14],2.6,steel);
    box('fish hold',[11,1.3,9],[0,7.9,1],timber);
  }
  return root;
}
