// Joint positions run from the head toward the tail in body-length units.
export const whaleSpine=[
  {z:-.26, swing:0, delay:0},
  {z:-.09, swing:.095, delay:0},
  {z:.07, swing:.19, delay:.75},
  {z:.20, swing:.25, delay:1.55},
  {z:.32, swing:.26, delay:2.4}
] as const;

export function spineBlend(z:number) {
  const last=whaleSpine.length-1;
  let lower=0;
  while(lower+1<last&&z>whaleSpine[lower+1].z)lower++;
  const fraction=(z-whaleSpine[lower].z)/(whaleSpine[lower+1].z-whaleSpine[lower].z);
  return {lower,blend:Math.max(0,Math.min(1,fraction))};
}

interface Joint {rotation:{x:number;y:number}}
export function swimWhale(joints:Joint[],time:number,turn:number) {
  const phase=time*1.24+.22*Math.sin(time*.31);
  const effort=.82+.18*Math.cos(time*.26);
  const bend=Math.max(-.23,Math.min(.23,turn));
  for(const [i,{swing,delay}] of whaleSpine.entries()){
    const rotation=joints[i].rotation;
    rotation.x=effort*swing*Math.sin(phase-delay);
    rotation.y=i>0&&i<joints.length-1?bend/3:0;
  }
}
