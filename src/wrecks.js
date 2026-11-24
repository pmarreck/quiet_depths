export function poseSurveyWreck(model,headingRadians){
 model.scale.setScalar(.5);
 model.rotation.set(.04,-headingRadians,.18,'YXZ');
}

// Deform only the wreck's own meshes, so a fresh patrol still gets an intact boat.
export function damageWreck(T,model,sub){
 const hull=model.userData.hull,skin=hull.geometry.attributes.position;
 hull.geometry.computeBoundingBox();
 const bounds=hull.geometry.boundingBox,span=(bounds.max.z-bounds.min.z)/2;
 for(let i=0;i<skin.count;i++){
  const along=skin.getZ(i);
  const crush=Math.max(0,1-Math.abs(along/span+.34)*2.8);
  const buckle=crush*(.5+.5*Math.cos(along*2));
  skin.setX(i,skin.getX(i)*(1-.63*crush)+buckle*(sub?1.4:3.3));
  skin.setY(i,skin.getY(i)*(1-.45*crush)-crush*(sub?1:2));
 }
 skin.needsUpdate=true;hull.geometry.computeBoundingBox();hull.geometry.computeVertexNormals();hull.geometry.computeBoundingSphere();
 if(!sub){
  for(const fitting of model.userData.body.children){
   if(fitting===hull)continue;
   const crush=Math.max(0,1-Math.abs(fitting.position.z/span+.34)*2.8);
   fitting.position.y=fitting.position.y*(1-.45*crush)-2*crush;
   fitting.position.x*=1-.63*crush;fitting.rotation.z+=.13*crush;
  }
 }
 hull.material=hull.material.clone();hull.material.color.setHex(sub?0x4f483e:0xc4a289);hull.material.roughness=1;
 const parent=model.userData.body??model,side=sub?3.7:10.4;
 const tornSteel=hull.material.clone();tornSteel.vertexColors=false;tornSteel.color.setHex(0x54483d);
 for(let i=0;i<4;i++){
  const plate=new T.Mesh(new T.BoxGeometry(.18,sub?1.4:3,sub?2:4),tornSteel);
  plate.position.set(side-i*.35,i*.15,-(sub?14:28)+i*(sub?1.4:3));
  plate.rotation.set(.2*i,.25+i*.24,.4-i*.36);parent.add(plate);
 }
 if(model.userData.mast)model.userData.mast.rotation.z=.58;
 model.userData.wreck=true;
}
