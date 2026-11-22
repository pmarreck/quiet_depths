type Point = [number,number,number];
// One indexed mesh for the whole school to instance. The snout faces local -Z.
export function schoolFishShape() {
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  function vertex(point: Point, color: Point) {
    positions.push(...point); colors.push(...color); return positions.length/3-1;
  }
  const back: Point=[.09,.24,.26], flank: Point=[.43,.63,.60], belly: Point=[.70,.77,.66];
  const sections = [[-.82,.018,.045],[-.70,.135,.19],[-.48,.22,.31],[-.13,.26,.34],[.17,.21,.28],[.42,.13,.18],[.62,.05,.07],[.71,.028,.052]];
  const sides=12;
  for(const [z,w,h] of sections)for(let j=0;j<sides;j++){
    const angle=j*Math.PI*2/sides, up=Math.sin(angle);
    const color=up>.45?back:up<-.4?belly:flank;
    vertex([Math.cos(angle)*w,up*h,z],color);
  }
  for(let i=1;i<sections.length;i++)for(let j=0;j<sides;j++){
    const a=(i-1)*sides+j,b=(i-1)*sides+(j+1)%sides;
    indices.push(a,b,a+sides,b,b+sides,a+sides);
  }
  const last=(sections.length-1)*sides;
  for(let j=1;j<sides-1;j++)indices.push(0,j+1,j,last,last+j,last+j+1);
  function triangle(a:Point,b:Point,c:Point,color:Point) {
    indices.push(vertex(a,color),vertex(b,color),vertex(c,color));
  }
  // The two lobes share a root but leave a distinct notch in the trailing edge.
  for(const side of [-1,1]){
    triangle([0,.055*side,.62],[0,.32*side,1.02],[0,.045*side,.85],back);
    triangle([0,.055*side,.62],[0,.045*side,.85],[0,0,.71],flank);
    triangle([.20*side,-.03,-.35],[.31*side,-.18,-.03],[.18*side,-.09,-.11],back);
    const eye:Point=[side*.204,.07,-.54];
    for(const [radius,offset,tone] of [[.056,.001,[.66,.70,.44]],[.036,.003,[.012,.023,.025]]] as const){
      const center:Point=[eye[0]+side*offset,eye[1],eye[2]];
      const rim=(a:number):Point=>[center[0],center[1]+radius*Math.sin(a),center[2]+radius*Math.cos(a)];
      for(let j=0;j<8;j++)triangle(center,rim(j*Math.PI/4),rim((j+1)*Math.PI/4),[...tone]);
    }
    const gill:Point=[side*.233,.015,-.395], edge:Point=[side*.235,.015,-.379];
    triangle([side*.204,.13,-.44],gill,edge,back);
    triangle(gill,[side*.185,-.17,-.45],edge,back);
  }
  triangle([0,.30,-.27],[0,.50,-.17],[0,.27,.18],back);
  triangle([0,-.22,.14],[0,-.33,.23],[0,-.13,.43],flank);
  return {positions,colors,indices};
}
