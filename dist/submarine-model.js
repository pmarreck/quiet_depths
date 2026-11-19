import {SUB_DESIGN as D} from './hull-design.js';
// Five fixed-pitch blades, as documented for Blueback by OMSI's National
// Register nomination. The painted finish is a deliberate game choice. This
// helical surface is an approximation, not an exact hydrodynamic blade design.
function screwBlade(T){
 const positions=[],indices=[],rows=14,columns=10;
 for(let face=0;face<2;face++)for(let i=0;i<=rows;i++)for(let j=0;j<=columns;j++){
  const t=i/rows,u=j/columns,cross=u*2-1,r=.36+(D.propellerRadius-.38)*t,skew=.28*t*t,chord=.12+.7*Math.sin(Math.PI*(.12+.88*t))**.7,offset=cross*chord/2,pitch=Math.atan(D.propellerPitch/(2*Math.PI*r));
  const tangent=offset*Math.cos(pitch),thickness=(.009+.035*(1-t)*Math.sqrt(Math.max(0,1-cross*cross)))*(face?-1:1),camber=.025*(1-cross*cross)*Math.sin(t*Math.PI);
  positions.push(r*Math.cos(skew)-tangent*Math.sin(skew),r*Math.sin(skew)+tangent*Math.cos(skew),offset*Math.sin(pitch)+thickness+camber);
 }
 const layer=(rows+1)*(columns+1),at=(face,i,j)=>face*layer+i*(columns+1)+j;
 for(let face=0;face<2;face++)for(let i=0;i<rows;i++)for(let j=0;j<columns;j++){
  const a=at(face,i,j),b=at(face,i+1,j),c=at(face,i+1,j+1),d=at(face,i,j+1);indices.push(...(face?[a,c,b,a,d,c]:[a,b,c,a,c,d]));
 }
 for(let i=0;i<rows;i++)for(const j of [0,columns]){const a=at(0,i,j),b=at(0,i+1,j),c=at(1,i+1,j),d=at(1,i,j);indices.push(a,c,b,a,d,c);}
 for(let j=0;j<columns;j++)for(const i of [0,rows]){const a=at(0,i,j),b=at(0,i,j+1),c=at(1,i,j+1),d=at(1,i,j);indices.push(a,b,c,a,c,d);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
function foil(T,span,chord,thickness,vertical=false){
 const positions=[],indices=[],n=10;
 for(let tip=0;tip<2;tip++)for(let side=0;side<2;side++)for(let i=0;i<=n;i++){
  const f=i/n,c=chord*(tip?.64:1),along=(f-.5)*c+(tip?.38:0),round=Math.sin(f*Math.PI),h=(side?-1:1)*(.012+thickness*.5*round),reach=tip*span;
  positions.push(...(vertical?[h,reach,along]:[reach,h,along]));
 }
 const at=(tip,side,i)=>tip*2*(n+1)+side*(n+1)+i;
 for(let side=0;side<2;side++)for(let i=0;i<n;i++){const a=at(0,side,i),b=at(1,side,i),c=at(1,side,i+1),d=at(0,side,i+1),reverse=vertical?side===1:side===0;indices.push(...(reverse?[a,c,b,a,d,c]:[a,b,c,a,c,d]));}
 for(const tip of [0,1])for(let i=0;i<n;i++){const a=at(tip,0,i),b=at(tip,0,i+1),c=at(tip,1,i+1),d=at(tip,1,i);indices.push(a,b,c,a,c,d);}
 for(const i of [0,n]){const a=at(0,0,i),b=at(1,0,i),c=at(1,1,i),d=at(0,1,i);indices.push(a,b,c,a,c,d);}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
// Three is injected so the same mesh can be checked without a browser/WebGL.
export function createSubmarine(T){
 const root=new T.Group(),bodyMat=new T.MeshStandardMaterial({color:D.hullColor,roughness:.78,metalness:.05}),trim=new T.MeshStandardMaterial({color:0x18272c,roughness:.8,metalness:.05});
 const box=(parent,size,pos,mat=bodyMat)=>{const m=new T.Mesh(new T.BoxGeometry(...size),mat);m.position.set(...pos);parent.add(m);return m;};
 const hull=new T.Mesh(new T.LatheGeometry(D.stations.map(p=>new T.Vector2(p.radius,p.z)),48),bodyMat);hull.geometry.rotateX(Math.PI/2);root.add(hull);root.userData.hull=hull;
 box(root,[3.8,.3,34],[0,4.9,-1],trim);
 const sail=new T.Mesh(new T.CapsuleGeometry(2.1,7,5,16),bodyMat);sail.scale.set(1,1,2.5);sail.position.set(0,7,-5);root.add(sail);box(root,[6.4,.18,12.5],[0,11.5,-5],trim);
 const mast=new T.Group();box(mast,[.16,6,.16],[0,14,-7],trim);box(mast,[.4,.3,.2],[.12,17,-7],trim);root.add(mast);root.userData.mast=mast;
 box(root,[.18,4,.18],[1,13,-2],trim);box(root,[.12,3,.12],[-1,12,-4],trim);
 for(const [key,y,z,span,chord] of [['foreplanes',7,-5,5.4,2.7],['aftplanes',0,27,4.8,3.3]]){
  const pivot=new T.Group();pivot.position.set(0,y,z);for(const side of [-1,1]){const fin=new T.Mesh(foil(T,span,chord,.22),bodyMat);fin.position.x=side*1.7;fin.scale.x=side;pivot.add(fin);}root.add(pivot);root.userData[key]=pivot;
 }
 const rudder=new T.Group();rudder.position.set(0,0,28);for(const side of [-1,1]){const fin=new T.Mesh(foil(T,3.5,3.5,.25,true),bodyMat);fin.position.y=side*.8;fin.scale.y=side;rudder.add(fin);}root.add(rudder);root.userData.rudder=rudder;
 for(const z of [-17,-7,6,16]){const r=D.stations.reduce((best,p)=>Math.abs(p.z-z)<Math.abs(best.z-z)?p:best,D.stations[0]).radius;const seam=new T.Mesh(new T.TorusGeometry(r+.015,.025,4,40),trim);seam.position.z=z;root.add(seam);}
 for(const side of [-1,1])for(let z=-14;z<17;z+=2.8)box(root,[.08,.18,1.3],[side*3.6,3.35,z],trim);
 for(const y of [-5.02,5.05]){const hatch=new T.Mesh(new T.CylinderGeometry(1,1,.18,16),bodyMat);if(y<0){const hinge=new T.Group();hinge.position.set(-1,y,0);hatch.position.x=1;hinge.add(hatch);root.add(hinge);root.userData.rescueHatch=hinge;}else{hatch.position.set(0,y,-17);root.add(hatch);}}
 const shaft=new T.Mesh(new T.CylinderGeometry(D.shaftRadius,D.shaftRadius,3.2,12),bodyMat);shaft.rotation.x=Math.PI/2;shaft.position.z=32.8;root.add(shaft);
 const prop=new T.Group();prop.position.z=D.propellerZ;const hub=new T.Mesh(new T.SphereGeometry(.38,12,8),bodyMat);hub.scale.z=1.6;prop.add(hub);
 const bladeGeometry=screwBlade(T);for(let i=0;i<D.propellerBlades;i++){const blade=new T.Mesh(bladeGeometry,bodyMat);blade.rotation.z=i*2*Math.PI/D.propellerBlades;prop.add(blade);}root.add(prop);root.userData.prop=prop;
 const tetherHatch=new T.Mesh(new T.CircleGeometry(.48,20),trim);tetherHatch.position.set(4.65,-2,0);tetherHatch.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(4.65,-2,0).normalize());root.add(tetherHatch);root.userData.tetherHatch=tetherHatch;
 // Exposed dual-purpose mount retained on this fictional experimental refit.
 const turret=new T.Group();turret.position.set(0,5.15,-16);const pedestal=new T.Mesh(new T.CylinderGeometry(.7,.9,.8,12),trim);pedestal.position.y=.4;turret.add(pedestal);
 const elevation=new T.Group();elevation.position.y=.85;box(elevation,[.8,.9,.5],[0,0,0],trim);const barrel=new T.Mesh(new T.CylinderGeometry(.085,.14,3.6,10),bodyMat);barrel.rotation.x=Math.PI/2;barrel.position.z=-1.6;elevation.add(barrel);box(elevation,[1.5,1.1,.15],[0,0,-.5],trim);turret.add(elevation);root.add(turret);root.userData.gun=turret;root.userData.gunElevation=elevation;
 return root;
}
