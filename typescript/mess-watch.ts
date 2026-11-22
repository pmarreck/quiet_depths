const breakfast=['eggs','morning','coffee','mess-a','mess-b'];
const dinner=['steak','chicken','ice-cream','mmm','horse','elephant'];
const coffee=['coffee','mess-a'];
export function crewPeriod(hour:number){
  if(hour>=0&&hour<6)return 'sleep';
  if(hour>=7&&hour<8)return 'breakfast';
  if(hour>=14&&hour<15)return 'coffee';
  if((hour>=12&&hour<12.55)||(hour>=18&&hour<18.55))return 'meal';
  if(hour>=19&&hour<23)return 'music';
  return hour>=23&&hour<23.25?'lights-out':null;
}
export function messLine(period:ReturnType<typeof crewPeriod>,choice:number,last?:string){
  const lines=period==='breakfast'?breakfast:period==='coffee'?coffee:period==='meal'?dinner:[];
  const pool=lines.filter(line=>line!==last);
  return pool[Math.floor(choice*pool.length)];
}
export const messClips=[...new Set([...breakfast,...dinner,...coffee,'goodnight','what-noise','hear-that'])];
