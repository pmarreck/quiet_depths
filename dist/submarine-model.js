import {SUB_DESIGN as D} from './hull-design.js';
// Three is injected so the same mesh can be checked without a browser/WebGL.
export function createSubmarine(T){
 const root=new T.Group(),bodyMat=new T.MeshStandardMaterial({color:D.hullColor,roughness:.64,metalness:.3}),trim=new T.MeshStandardMaterial({color:0x18272c,roughness:.72,metalness:.25});
 const box=(parent,size,pos,mat=bodyMat)=>{const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.position.set(...pos);parent.add(m);return m;};
 const hull=new T.Mesh(new T.LatheGeometry(D.stations.map(p=>new T.Vector2(p.radius,p.z)),48),bodyMat);hull.geometry.rotateX(Math.PI/2);root.add(hull);root.userData.hull=hull;
 box(root,[3.8,.3,34],[0,4.9,-1],trim);
 const sail=new T.Mesh(new T.CapsuleGeometry(2.1,7,5,16),bodyMat);sail.scale.set(1,1,2.5);sail.position.set(0,7,-5);root.add(sail);box(root,[6.4,.18,12.5],[0,11.5,-5],trim);
 const mast=new T.Group();box(mast,[.16,6,.16],[0,14,-7],trim);box(mast,[.4,.3,.2],[.12,17,-7],trim);root.add(mast);root.userData.mast=mast;
 box(root,[.18,4,.18],[1,13,-2],trim);box(root,[.12,3,.12],[-1,12,-4],trim);
 for(const [key,y,z,span,chord] of [['foreplanes',7,-5,5.4,2.7],['aftplanes',0,27,4.8,3.3]]){
  const pivot=new T.Group();pivot.position.set(0,y,z);for(const side of [-1,1]){const fin=box(pivot,[span,.22,chord],[side*(span/2+1.8),0,0]);fin.rotation.y=side*.16;}root.add(pivot);root.userData[key]=pivot;
 }
 const rudder=new T.Group();rudder.position.set(0,0,28.5);box(rudder,[.27,8.5,3.1],[0,0,0]);root.add(rudder);root.userData.rudder=rudder;
 for(const z of [-17,-7,6,16]){const r=D.stations.reduce((best,p)=>Math.abs(p.z-z)<Math.abs(best.z-z)?p:best,D.stations[0]).radius;const seam=new T.Mesh(new T.TorusGeometry(r+.015,.025,4,40),trim);seam.position.z=z;root.add(seam);}
 for(const side of [-1,1])for(let z=-14;z<17;z+=2.8)box(root,[.08,.18,1.3],[side*3.6,3.35,z],trim);
 for(const y of [-5.02,5.05]){const hatch=new T.Mesh(new T.CylinderGeometry(1,1,.18,16),bodyMat);if(y<0){const hinge=new T.Group();hinge.position.set(-1,y,0);hatch.position.x=1;hinge.add(hatch);root.add(hinge);root.userData.rescueHatch=hinge;}else{hatch.position.set(0,y,-17);root.add(hatch);}}
 const shaft=new T.Mesh(new T.CylinderGeometry(D.shaftRadius,D.shaftRadius,3.2,12),bodyMat);shaft.rotation.x=Math.PI/2;shaft.position.z=32.8;root.add(shaft);
 const prop=new T.Group();prop.position.z=D.propellerZ;const hub=new T.Mesh(new T.SphereGeometry(.38,12,8),bodyMat);hub.scale.z=1.6;prop.add(hub);
 const bladeShape=new T.Shape();bladeShape.moveTo(.24,-.12);bladeShape.bezierCurveTo(.7,-.4,1.4,-.55,1.85,-.18);bladeShape.bezierCurveTo(2,.2,1.55,.6,1.1,.58);bladeShape.quadraticCurveTo(.52,.4,.24,.14);
 const bladeGeometry=new T.ExtrudeGeometry(bladeShape,{depth:.07,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:1,steps:1,curveSegments:10});
 for(let i=0;i<D.propellerBlades;i++){const pivot=new T.Group();pivot.rotation.z=i*2*Math.PI/D.propellerBlades;const blade=new T.Mesh(bladeGeometry,bodyMat);blade.rotation.y=.38;pivot.add(blade);prop.add(pivot);}root.add(prop);root.userData.prop=prop;
 // Exposed dual-purpose mount retained on this fictional experimental refit.
 const turret=new T.Group();turret.position.set(0,5.15,-16);const pedestal=new T.Mesh(new T.CylinderGeometry(.7,.9,.8,12),trim);pedestal.position.y=.4;turret.add(pedestal);
 const elevation=new T.Group();elevation.position.y=.85;box(elevation,[.8,.9,.5],[0,0,0],trim);const barrel=new T.Mesh(new T.CylinderGeometry(.085,.14,3.6,10),bodyMat);barrel.rotation.x=Math.PI/2;barrel.position.z=-1.6;elevation.add(barrel);box(elevation,[1.5,1.1,.15],[0,0,-.5],trim);turret.add(elevation);root.add(turret);root.userData.gun=turret;root.userData.gunElevation=elevation;
 return root;
}
