import type * as Three from './vendor/three.module.js';

export type HullClass='merchant'|'escort'|'fishing'|'carrier'|'launch';

interface Lines {
  halfLength:number; beam:number; draft:number; freeboard:number;
  widths:readonly number[]; flare:number; sheer:number; paint:readonly [number,number,number,number];
}
// Half-breadths at successive frames running aft from the stem. The escort has a
// long fine entrance and a transom. The merchant carries its beam farther forward.
const frames=[-1,-.94,-.82,-.62,-.32,0,.33,.62,.83,.95,1];
const lines:Record<HullClass,Lines>={
  merchant:{halfLength:65,beam:13.4,draft:8.2,freeboard:7.9,flare:.18,sheer:3.7,widths:[.012,.15,.43,.77,.96,1,1,.97,.79,.48,.16],paint:[0x303e42,0x202c30,0x804735,0x746859]},
  escort:{halfLength:65,beam:10.3,draft:6.6,freeboard:6.4,flare:.28,sheer:4.4,widths:[.012,.086,.25,.50,.81,.98,1,.95,.82,.68,.55],paint:[0x65777c,0x293537,0x764638,0x505d60]},
  fishing:{halfLength:59,beam:14.2,draft:8.4,freeboard:6.7,flare:.26,sheer:6,widths:[.015,.22,.54,.84,.98,1,.99,.94,.85,.64,.41],paint:[0x2b6669,0xddd4ac,0x874c39,0x826e50]},
  carrier:{halfLength:105,beam:16.5,draft:10.2,freeboard:8.5,flare:.25,sheer:1.4,widths:[.015,.27,.59,.88,.99,1,1,.98,.88,.70,.52],paint:[0x546269,0x29363c,0x734438,0x596568]},
  launch:{halfLength:3.05,beam:1.05,draft:.44,freeboard:.55,flare:.34,sheer:.33,widths:[.018,.21,.47,.74,.94,1,.99,.93,.81,.73,.66],paint:[0xb86a34,0xe6c995,0x814831,0xa88961]},
};
type Point=[number,number,number];
export function surfaceHull(T:typeof Three,kind:HullClass):Three.BufferGeometry{
  const l=lines[kind],geometry=new T.BufferGeometry(),positions:number[]=[],colors:number[]=[],indices:number[]=[];
  const palette=l.paint.map(hex=>new T.Color(hex));
  function vertex(point:Point,paint:number){
    positions.push(...point);const c=palette[paint];colors.push(c.r,c.g,c.b);return positions.length/3-1;
  }
  const rings=frames.map((f,i)=>{
    const bow=Math.max(0,-f),stern=Math.max(0,f),b=l.beam*l.widths[i];
    const top=l.freeboard+l.sheer*(bow**3+.38*stern**4);
    const depth=l.draft*(1-.67*bow**5-.72*stern**5);
    const inset=l.flare*(.45+.55*Math.abs(f));
    // The waterline and keel draw inward at the ends, giving the stem its rake
    // and lifting the underside into the stern.
    function point(width:number,y:number):Point{
      const rake=(-f)*Math.abs(f)**5*(top-y)/(top+depth)*l.halfLength*.075;
      return [width*b,y,f*l.halfLength+rake];
    }
    const side=[point(1,top),point(1-inset*.8,.08*l.freeboard),point(1-inset,-.10*depth),point(.91-inset,-.52*depth),
      point(.72-inset,-.84*depth),point(.40-inset*.5,-.98*depth)];
    const mirror=side.map(([x,y,z]):Point=>[-x,y,z]).reverse();
    const ring=[...side,point(0,-depth),...mirror];
    if(kind==='launch')ring.push(point(-.83,top*.96),point(-.64,.04),point(.64,.04),point(.83,top*.96));
    else ring.push(point(0,top+l.freeboard*.065));
    return ring;
  });
  const edges=rings[0].length;
  // Share vertices within each paint band. Split the waterline and the deck
  // edge so the boot stripe stays crisp through the periscope.
  const cache=new Map<number,number>();
  const skinVertex=(i:number,j:number,paint:number)=>{
    const key=(i*edges+j)*4+paint,existing=cache.get(key);if(existing!==undefined)return existing;
    const index=vertex(rings[i][j],paint);cache.set(key,index);return index;
  };
  for(let i=1;i<rings.length;i++)for(let j=0;j<edges;j++){
    const next=(j+1)%edges,side=Math.min(j,11-j),paint=j>=12?3:side===0?0:side===1?1:2;
    const a=skinVertex(i-1,j,paint),b=skinVertex(i,j,paint),c=skinVertex(i,next,paint),d=skinVertex(i-1,next,paint);
    indices.push(a,b,c,a,c,d);
  }
  for(const i of [0,rings.length-1]){
    // Separate faces give the transom a hard edge. Cap each horizontal strake
    // separately so the stripe wraps around the stern.
    const ring=rings[i];
    const face=(a:Point,b:Point,c:Point,paint:number)=>{
      const verts=[a,b,c].map(p=>vertex(p,paint));if(i===0)verts.reverse();indices.push(...verts);
    };
    for(let j=0;j<6;j++){
      const paint=j===0?0:j===1?1:2;
      face(ring[j],ring[12-j],ring[j+1],paint);
      if(j<5)face(ring[j+1],ring[12-j],ring[11-j],paint);
    }
    if(kind==='launch'){
      // The inside of the transom closes the open cockpit at both ends.
      face(ring[13],ring[16],ring[14],3);face(ring[14],ring[16],ring[15],3);
    }else face(ring[0],ring[13],ring[12],3);
  }
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
