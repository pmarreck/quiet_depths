import {whaleSpine,spineBlend} from './whale-swim.js';

// Both swimmers face local -Z. Rings give the head, belly and tail stock
// distinct cross sections. Fins have closed, tapered edges for side lighting.
export function createSwimmer(T,whale){
 const root=new T.Group(),tail=whale?new T.Bone():new T.Group(),length=whale?14:3.8;
 root.name=whale?'Humpback whale':'Reef shark';
 // Bind in local body lengths before the root receives its world scale.
 let skeleton;
 if(whale){
  const joints=whaleSpine.map((_,i)=>i===whaleSpine.length-1?tail:new T.Bone());
  for(const [i,bone] of joints.entries()){
   bone.position.z=whaleSpine[i].z-(i?whaleSpine[i-1].z:0);
   (joints[i-1]??root).add(bone);
  }
  root.updateMatrixWorld(true);skeleton=new T.Skeleton(joints);
  root.userData.spine=joints;
 }else{tail.position.z=.32;root.add(tail);}
 function skinned(geometry,material){
  const positions=geometry.attributes.position,indices=[],weights=[];
  for(let i=0;i<positions.count;i++){
   const {lower,blend}=spineBlend(positions.getZ(i));
   indices.push(lower,lower+1,0,0);weights.push(1-blend,blend,0,0);
  }
  geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));
  geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  const mesh=new T.SkinnedMesh(geometry,material);
  mesh.bind(skeleton,new T.Matrix4());
  // Enclose the full stroke so the resting bounds never clip a diving tail.
  mesh.boundingSphere=new T.Sphere(new T.Vector3(),.7);return mesh;
 }
 const back=new T.Color(whale?0x344954:0x607d83),belly=new T.Color(whale?0xb6c1b6:0xc6d4bf);
 const skin=new T.MeshStandardMaterial({vertexColors:true,roughness:.86,side:T.DoubleSide});
 const dark=new T.MeshStandardMaterial({color:back,roughness:.78,side:T.DoubleSide});
 const pale=new T.MeshStandardMaterial({color:belly,roughness:.82,side:T.DoubleSide});
 const ink=new T.MeshStandardMaterial({color:0x202e34,roughness:.7});
 function body(parent,stations){
  const widths=new T.SplineCurve(stations.map(([z,w])=>new T.Vector2(z,w)));
  const heights=new T.SplineCurve(stations.map(([z,w,h,y])=>new T.Vector2(h,y)));
  const rings=Array.from({length:stations.length*4},(_,i)=>{
   const t=i/(stations.length*4-1),w=widths.getPoint(t),h=heights.getPoint(t);
   return [w.x,Math.max(.001,w.y),Math.max(.001,h.x),h.y];
  });
  const p=[],colors=[],idx=[],n=24;
  for(const [z,w,h,y] of rings)for(let j=0;j<n;j++){
   const a=2*Math.PI*j/n,s=Math.sin(a);
   p.push(w*Math.cos(a),y+h*s,z);
   const c=back.clone().lerp(belly,Math.max(0,Math.min(1,(-s-.04)*2.4)));colors.push(c.r,c.g,c.b);
  }
  for(let i=1;i<rings.length;i++)for(let j=0;j<n;j++){
   const a=(i-1)*n+j,b=(i-1)*n+(j+1)%n;idx.push(a,b,a+n,b,b+n,a+n);
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(idx);g.computeVertexNormals();
  parent.add(skeleton&&parent===root?skinned(g,skin):new T.Mesh(g,skin));
 }
 function fin(parent,outline,lift,mat=dark,flex=false){
  const center=[0,0,0];for(const p of outline)for(let k=0;k<3;k++)center[k]+=p[k]/outline.length;
  const points=[...outline.flat(),...center.map((v,k)=>v+lift[k]),...center.map((v,k)=>v-lift[k])],idx=[],n=outline.length;
  for(let i=0;i<n;i++)idx.push(i,(i+1)%n,n,(i+1)%n,i,n+1);
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(idx);g.computeVertexNormals();parent.add(flex?skinned(g,mat):new T.Mesh(g,mat));
 }
 function marking(points,width){
  const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));
  root.add(new T.Mesh(new T.TubeGeometry(curve,8,width,5,false),ink));
 }
 const profile=whale?
  [[-.53,.009,.008,.024],[-.49,.079,.032,.015],[-.42,.116,.064,.003],[-.28,.129,.091,-.002],[-.08,.119,.11,.002],[.10,.095,.088,.014],[.24,.053,.061,.013],[.32,.03,.039,0]]:
  [[-.53,.001,.002,-.025],[-.46,.048,.037,-.014],[-.34,.094,.084,0],[-.16,.111,.103,0],[.04,.104,.092,0],[.20,.067,.062,0],[.32,.032,.04,0]];
 body(root,profile);
 body(tail,[[0,...profile.at(-1).slice(1)],[.075,.022,.033,.001],[.14,.009,.018,.008],[.16,.003,.008,.012]]);
 // Trace markings on the skin so the jaw and throat follow the head profile.
 function skinPoint(z,angle,side,offset=.001){
  const i=profile.findIndex(p=>p[0]>=z),a=profile[Math.max(0,i-1)],b=profile[i];
  const f=(z-a[0])/(b[0]-a[0]||1),w=a[1]+(b[1]-a[1])*f,h=a[2]+(b[2]-a[2])*f,y=a[3]+(b[3]-a[3])*f;
  return [side*(w+offset)*Math.cos(angle),y+(h+offset)*Math.sin(angle),z];
 }
 for(const side of [-1,1]){
  const eye=new T.Mesh(new T.SphereGeometry(whale?.006:.009,8,6),ink);eye.position.set(...skinPoint(whale?-.28:-.34,.07,side));root.add(eye);
  const mirror=coords=>coords.map(([x,y,z])=>[side*x,y,z]);
  fin(root,mirror(whale?[[.102,-.033,-.23],[.156,-.052,-.212],[.183,-.071,-.179],[.211,-.073,-.162],[.242,-.088,-.121],[.264,-.091,-.103],[.326,-.112,-.03],[.385,-.124,.072],[.325,-.104,.044],[.236,-.078,-.009],[.163,-.055,-.085],[.109,-.038,-.122]]:
   [[.082,-.038,-.16],[.14,-.06,-.13],[.27,-.093,.08],[.17,-.069,.049],[.086,-.043,-.04]]),[0,.011,0],whale?pale:dark);
  if(whale){
   fin(tail,mirror([[0,.011,.095],[.076,.023,.092],[.137,.034,.115],[.206,.046,.159],[.234,.061,.211],[.19,.041,.193],[.154,.03,.19],[.12,.025,.18],[.084,.012,.189],[.047,.007,.18],[0,.008,.15]]),[0,.009,0]);
   marking([-.51,-.485,-.42,-.36,-.30].map((z,j)=>skinPoint(z,-.12-j*.04,side,.003)),.0024);
   for(let j=0;j<5;j++)marking([-.49,-.42,-.36,-.28,-.2].map(z=>skinPoint(z,-.53-j*.18,side,.002)),.0013);
   for(let j=0;j<5;j++){
    const bump=new T.Mesh(new T.SphereGeometry(.005+j*.0006,8,6),dark);bump.position.set(...skinPoint(-.505+j*.021,.56,side));root.add(bump);
   }
  }else{
   for(let j=0;j<5;j++)marking(mirror([[.1,.033,-.265+j*.013],[.108,0,-.27+j*.013],[.104,-.034,-.25+j*.013]]),.0022);
   fin(root,mirror([[.04,-.052,.13],[.112,-.083,.24],[.043,-.045,.19]]),[0,.006,0]);
  }
 }
 fin(root,whale?[[0,.068,.17],[0,.112,.198],[0,.125,.238],[0,.07,.227],[0,.056,.264]]:
  [[0,.09,-.105],[0,.225,-.012],[0,.236,.015],[0,.116,.028],[0,.081,.082]],[.009,0,0],dark,whale);
 if(!whale){
  fin(tail,[[0,.014,.09],[0,.198,.22],[0,.20,.244],[0,.038,.194],[0,.008,.16],[0,-.095,.201],[0,-.103,.18],[0,-.014,.1]],[.008,0,0]);
  fin(root,[[0,.046,.245],[0,.093,.295],[0,.044,.31]],[.004,0,0]);
 }
 root.scale.setScalar(length);root.userData.tail=tail;return root;
}
