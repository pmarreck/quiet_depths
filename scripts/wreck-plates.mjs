import * as T from '../vendor/three.module.js';
import {surfaceShip} from '../src/surface-ship.js';
import {createSubmarine} from '../src/submarine-model.js';
import {makeCarrier} from '../src/carrier-model.js';
import {damageWreck,poseSurveyWreck} from '../src/wrecks.js';
import {founderingPose} from '../src/foundering.js';

// Rasterize the top of the actual wreck once during the site build. X is
// starboard, Z is aft. The low seven bits encode height (zero is open water),
// and the high bit marks the deck fittings visible above the hull skin.
function relief(model,cell){
 model.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(model,true);
 const x=Math.floor(bounds.min.x),z=Math.floor(bounds.min.z);
 const width=Math.ceil((bounds.max.x-x)/cell),height=Math.ceil((bounds.max.z-z)/cell);
 const heightStep=Math.max(.5,(bounds.max.y-bounds.min.y)/126);
 const data=new Uint8Array(width*height);
 model.traverseVisible(mesh=>{
  if(!mesh.isMesh)return;
  const fitting=mesh===model.userData.hull?0:128;
  const pos=mesh.geometry.attributes.position,indices=mesh.geometry.index;
  const points=Array.from({length:pos.count},(_,i)=>{
   const v=new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld);
   v.x=(v.x-x)/cell-.5;v.z=(v.z-z)/cell-.5;return v;
  });
  for(let i=0,count=indices?.count??pos.count;i<count;i+=3){
   const a=points[indices?indices.getX(i):i],b=points[indices?indices.getX(i+1):i+1],c=points[indices?indices.getX(i+2):i+2];
   const bx=b.x-a.x,bz=b.z-a.z,cx=c.x-a.x,cz=c.z-a.z,area=bx*cz-bz*cx;
   if(Math.abs(area)<.000001)continue;
   const left=Math.max(0,Math.ceil(Math.min(a.x,b.x,c.x))),right=Math.min(width-1,Math.floor(Math.max(a.x,b.x,c.x)));
   const top=Math.max(0,Math.ceil(Math.min(a.z,b.z,c.z))),bottom=Math.min(height-1,Math.floor(Math.max(a.z,b.z,c.z)));
   for(let row=top;row<=bottom;row++)for(let col=left;col<=right;col++){
    const dx=col-a.x,dz=row-a.z,u=(dx*cz-dz*cx)/area,v=(bx*dz-bz*dx)/area;
    if(u<0||v<0||u+v>1)continue;
    const elevation=a.y+u*(b.y-a.y)+v*(c.y-a.y)-bounds.min.y;
    const level=1+Math.round(elevation/heightStep),index=row*width+col;
    const previous=data[index]&127;
    if(level>previous||(level===previous&&fitting))data[index]=fitting|level;
   }
  }
 });
 return {x,z,width,height,cell,heightStep,data};
}

export function makeWreckPlates(){
 const plates={};
 for(const kind of ['wreck','merchant','escort','fishing','carrier','sub']){
  const sub=kind==='sub',model=sub?createSubmarine(T):kind==='carrier'?makeCarrier(T):surfaceShip(T,kind==='wreck'?'merchant':kind);
  damageWreck(T,model,sub);
  if(model.userData.parked)model.userData.parked.visible=false;
  if(kind==='wreck')poseSurveyWreck(model,0);
  else if(sub){model.scale.set(.52,.33,.88);model.rotation.set(.06,0,1.38,'YXZ');}
  else{const {pitch,roll}=founderingPose(kind,260);model.rotation.set(pitch,0,roll,'YXZ');}
  plates[kind]=relief(model,kind==='carrier'?1:.5);
 }
 return plates;
}

export function wreckPlateModule(){
 const plates=makeWreckPlates();
 for(const plate of Object.values(plates))plate.data=Buffer.from(plate.data).toString('base64');
 return 'export const wreckPlates='+JSON.stringify(plates)+';\nfor(const p of Object.values(wreckPlates))p.data=Uint8Array.from(atob(p.data),c=>c.charCodeAt(0));\n';
}
