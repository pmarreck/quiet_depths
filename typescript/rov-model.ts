import type * as Three from './vendor/three.module.js';
import {cableGland} from './rov-flight.ts';

type Triple = [number,number,number];

// The camera faces local -Z. Dimensions are in the same meters as the tether.
export function makeRov(T:typeof Three):Three.Group {
  const vehicle=new T.Group();
  vehicle.name='Inspection ROV';
  const paint=(color:number)=>new T.MeshStandardMaterial({color,metalness:.2,roughness:.65});
  const yellow=paint(0xffbb25),frame=paint(0x596365),housing=paint(0x24323b);
  const lamp=new T.MeshBasicMaterial({color:0xffedb8,toneMapped:false});
  const box=new T.BoxGeometry(1,1,1),sphere=new T.SphereGeometry(1,16,10);
  const duct=new T.TorusGeometry(.25,.065,8,18);
  function part(name:string,shape:Three.BufferGeometry,material:Three.Material,at:Triple,size:Triple=[1,1,1]) {
    const mesh=new T.Mesh(shape,material);
    mesh.name=name;mesh.position.set(...at);mesh.scale.set(...size);vehicle.add(mesh);
    return mesh;
  }
  part('Pressure housing',sphere,housing,[0,0,0],[.43,.38,1.03]);
  part('Camera port',sphere,paint(0x364f62),[0,0,-.96],[.24,.22,.16]);
  for(const side of [-1,1]){
    const x=side*.73;
    part('Buoyancy float',sphere,yellow,[x,.4,0],[.26,.26,1.15]);
    part('Skid',box,frame,[x,-.55,0],[.12,.11,2.3]);
    for(const z of [-.78,.78])part('Frame upright',box,frame,[x,-.09,z],[.08,.88,.08]);
    part('Thruster duct',duct,housing,[x,-.03,.68]);
    part('Propeller',box,frame,[x,-.03,.70],[.36,.09,.05]);
    part('Headlamp',sphere,lamp,[x,.35,-.97],[.16,.15,.13]);
  }
  for(const z of [-.78,.78])part('Crossrail',box,frame,[0,-.53,z],[1.52,.1,.1]);
  part('Cable gland',sphere,yellow,[cableGland.side,-cableGland.down,-cableGland.forward],[.13,.13,.17]);
  return vehicle;
}
