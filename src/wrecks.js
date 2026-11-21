// Deform only the wreck's own meshes, so a fresh patrol still gets an intact boat.
export function damageWreck(T,model,sub){
 const hull=model.userData.hull,skin=hull.geometry.attributes.position;
 for(let i=0;i<skin.count;i++){
  const along=sub?skin.getZ(i):skin.getY(i),span=sub?32:65;
  const crush=Math.max(0,1-Math.abs(along/span+.34)*2.8);
  const buckle=crush*(.5+.5*Math.cos(along*2));
  skin.setX(i,skin.getX(i)*(1-.63*crush)+buckle*(sub?1.4:3.3));
  if(sub)skin.setY(i,skin.getY(i)*(1-.45*crush)-crush);
  else skin.setZ(i,skin.getZ(i)*(1-.5*crush));
 }
 skin.needsUpdate=true;hull.geometry.computeVertexNormals();hull.geometry.computeBoundingSphere();
 hull.material=hull.material.clone();hull.material.color.setHex(0x4f483e);hull.material.roughness=1;
 const parent=model.userData.body??model,side=sub?3.7:10.4;
 for(let i=0;i<4;i++){
  const plate=new T.Mesh(new T.BoxGeometry(.18,sub?1.4:3,sub?2:4),hull.material);
  plate.position.set(side-i*.35,i*.15,-(sub?14:28)+i*(sub?1.4:3));
  plate.rotation.set(.2*i,.25+i*.24,.4-i*.36);parent.add(plate);
 }
 if(model.userData.mast)model.userData.mast.rotation.z=.58;
 model.userData.wreck=true;
}
