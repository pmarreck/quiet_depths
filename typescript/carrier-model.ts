import {surfaceHull,type HullKit} from './surface-hull.ts';
import {carrierSize,carrierDeck} from './carrier.ts';

// The renderer supplies its existing Three.js instance, including in offline
// builds. These are the constructors and transforms used by this artwork.
type Triple = [number, number, number];
interface Transform {x: number; y: number; z: number; set(...values: Triple): unknown}
interface ModelNode {
  name: string; position: Transform; rotation: Transform; scale: Transform;
  add(...children: ModelNode[]): unknown;
  userData: {body?: ModelNode; lights?: ModelNode; hull?: ModelNode; parked?: ModelNode};
}
interface ModelKit extends HullKit {
  Group: new() => ModelNode;
  Mesh: new(geometry: object, material: object) => ModelNode;
  Vector2: new(x: number,y: number) => object;
  Shape: new(points: object[]) => object;
  ExtrudeGeometry: new(shape: object, settings: {depth: number; bevelEnabled: boolean}) => {rotateX(angle: number): object};
  MeshStandardMaterial: new(settings: {color: number; roughness: number; metalness: number; vertexColors?: boolean}) => object;
  MeshBasicMaterial: new(settings: {color: number; toneMapped: boolean}) => object;
  SphereGeometry: new(...values: Triple) => object;
  BoxGeometry: new(...size: Triple) => object;
  ConeGeometry: new(...values: Triple) => object;
}

function plate(T: ModelKit, points: readonly (readonly [number,number])[], thickness: number){
 const shape=new T.Shape(points.map(([x,z])=>new T.Vector2(x,-z)));
 const geometry=new T.ExtrudeGeometry(shape,{depth:thickness,bevelEnabled:false});
 return geometry.rotateX(-Math.PI/2);
}
function part(T: ModelKit, group: ModelNode, geometry: object, material: object, x=0,y=0,z=0){
 const mesh=new T.Mesh(geometry,material);mesh.position.set(x,y,z);group.add(mesh);return mesh;
}
const paint=(T: ModelKit,color: number)=>new T.MeshStandardMaterial({color,roughness:.8,metalness:.12});

// Both jets face -Z, the same convention used by the deck and flight renderer.
export function periodJet(T: ModelKit, phantom: boolean){
 const jet=new T.Group(),gray=paint(T,phantom?0x89969d:0x78868b),underside=paint(T,0xb9c3bd);
 const dark=paint(T,0x323a40),glass=paint(T,0x3f6574),steel=paint(T,0x515458);
 jet.name=phantom?'F-4 Phantom II':'A-4 Skyhawk';
 const ellipsoid=(name:string,m:object,x:number,y:number,z:number,w:number,h:number,l:number)=>{
  const node=part(T,jet,new T.SphereGeometry(1,18,12),m,x,y,z);
  node.scale.set(w,h,l);node.name=name;return node;
 };
 const length=phantom?8.7:6.1;
 ellipsoid('fuselage',gray,0,0,0,phantom?1.1:.83,1,length);
 ellipsoid('radome',dark,0,.02,-length*.78,phantom?.69:.55,.62,length*.24);
 ellipsoid('canopy',glass,0,.79,-length*.33,.65,.64,phantom?2:.95);
 if(phantom)ellipsoid('canopy bow',gray,0,.82,-2.9,.66,.66,.10);
 for(const side of [-1,1]){
  const outline=phantom?[[.55,-2.2],[3.8,.8],[3.75,2.5],[1,3.4]]:[[.5,-1.75],[4.15,2.6],[3.6,3],[.5,2.4]];
  const wing=part(T,jet,plate(T,outline.map(([x,z])=>[side*x,z]),.17),gray,0,-.25,0);wing.name='main wing';
  if(phantom){
   const tip=part(T,jet,plate(T,[[0,.8],[side*2.1,2.7],[side*1.95,3.2],[0,2.5]],.12),gray,side*3.75,-.25,0);
   tip.rotation.z=side*.22;tip.name='upturned wingtip';
   ellipsoid('engine fairing',underside,side*.68,-.13,.75,.64,.78,6.4);
   ellipsoid('intake',dark,side*1.01,.02,-2.1,.37,.60,1.25);
   ellipsoid('exhaust',steel,side*.65,-.12,6.55,.49,.55,1);
   ellipsoid('nozzle',dark,side*.65,-.12,7.28,.40,.43,.30);
  }else{
   ellipsoid('intake',dark,side*.72,.14,-1.4,.28,.46,.83);
  }
  const span=phantom?2.95:1.65;
  const tail=part(T,jet,plate(T,[[0,-1.25],[side*span,.65],[side*span,1.32],[0,.70]],.12),underside,side*.25,.36,length*.72);
  tail.rotation.z=phantom?-side*.32:0;tail.name='stabilator';
 }
 if(!phantom)ellipsoid('nozzle',dark,0,0,5.35,.44,.47,.7);
 const fin=part(T,jet,plate(T,[[0,-1.75],[2.65,.72],[2.65,1.82],[0,1.15]],.14),gray,.07,.65,length*.61);
 fin.rotation.z=Math.PI/2;fin.name='swept fin';
 return jet;
}
export const carrierFighter=(T:ModelKit)=>periodJet(T,true);

export function makeCarrier(T: ModelKit){
 const root=new T.Group(),body=new T.Group(),lights=new T.Group();
 root.add(body,lights);root.userData.body=body;root.userData.lights=lights;
 const hullPaint=paint(T,0x48555b),islandPaint=paint(T,0x8a9290),deckPaint=paint(T,0x44494a),stripe=paint(T,0xc7c4ae);
 const box=(size: Triple,xyz: Triple,material: object)=>part(T,body,new T.BoxGeometry(...size),material,...xyz);
 const hull=part(T,body,surfaceHull(T,'carrier'),new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.86,metalness:.15}));
 root.userData.hull=hull;
 const hangar=[[-4,-103],[5,-103],[16,-70],[17,75],[12,98],[-12,98],[-17,77],[-17,-64]] as const;
 part(T,body,plate(T,hangar,8),hullPaint,0,7.5,0);
 const recess=paint(T,0x39474d),rail=paint(T,0xa7aaa2);
 for(const z of [-45,32,69]){
  box([.3,4.2,12],[-17.05,11.5,z],recess);
  box([4.6,.55,15],[-18,9.4,z],islandPaint);
 }

 const deckY=carrierSize.deckHeight;
 part(T,body,plate(T,carrierDeck,1.6),deckPaint,0,deckY-1.6,0).name='flight deck';
 // Two broken edge lines make the angled strip readable in the periscope.
 for(const side of [-1,1]){
  const edge=box([.45,.08,125],[-9+side*7,deckY+.04,24],stripe);edge.rotation.y=.13;
 }
 for(let i=0;i<8;i++)box([.6,.1,6],[-9+(i-3.5)*1.8,deckY+.1,-19+i*13],stripe);
 for(const x of [-12,-9,-6,-3,0,3])box([1,.09,6],[x,deckY+.1,80],stripe);
 for(const side of [-1,1])box([.6,.1,50],[side*6,deckY+.06,-72],stripe);
 for(const z of [-48,51])box([5,.8,15],[20,deckY-1,z],islandPaint);
 box([8,10,29],[15,deckY+5,4],islandPaint);
 box([10,3.5,17],[14,deckY+11,-1],islandPaint);
 box([11.6,.6,19],[14,deckY+9.8,-1],rail);
 box([10.4,1.15,14.6],[14,deckY+11.7,-2.4],recess);
 box([7.8,2.6,10.8],[14.5,deckY+13.4,-1.4],islandPaint);
 box([8.1,.95,10.2],[14.5,deckY+14,-2],recess);
 box([8.65,.45,11.7],[14.5,deckY+14.7,-1.4],rail);
 box([4,5,6],[15,deckY+14,10],hullPaint);
 box([.65,12,.65],[15,deckY+19,4],islandPaint);
 box([7,.6,1.3],[15,deckY+24,4],hullPaint);
 for(const side of [-1,1]){
  const strut=box([.33,8,.33],[15+side*.95,deckY+19,4],rail);
  strut.rotation.z=side*.24;
 }
 const radar=box([5.6,2.1,.5],[15,deckY+25.4,4],recess);radar.rotation.y=-.35;
 box([.25,4,.25],[13,deckY+17,-3],rail);
 const lamps=new T.MeshBasicMaterial({color:0xffe2ad,toneMapped:false});
 for(const z of [-62,-25,16,60])part(T,lights,new T.SphereGeometry(.6,6,4),lamps,-21,deckY+.7,z);
 const parked=new T.Group();body.add(parked);
 for(let i=0;i<3;i++){const jet=carrierFighter(T);jet.position.set(12,deckY+1.1,42+i*17);jet.rotation.y=-.18;parked.add(jet);}
 root.userData.parked=parked;
 return root;
}
