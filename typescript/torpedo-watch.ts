// Mirrored in elm/Sim/TorpedoWatch.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
// Observations of simulated game pieces. Keep them out of the vessel contact
// list so a sonar return never becomes a selectable ship or weapon target.
type Position = {x:number; y:number; depth:number};
interface Shot extends Position {id:number; owner:string; aim?: {x:number; y:number}|null; orderedDepth:number; diverted:boolean}
interface Echo extends Position {id:number; time:number; speed:number; inboundRun:boolean}
interface Track extends Echo {arrival:number|null; fixes:number; activeAt:number; activeX:number; activeY:number; course:number|null}
interface Watch extends Position {time:number; torpedoTracks:Track[]}
export function gameEcho(boat:Position, shot:Shot, time:number, speed:number): Echo {
  // The arcade warning uses the incoming game's scripted destination. A
  // destination left behind by the boat or a diversion cancels the prediction.
  const aim=shot.aim;
  const nearBoat=shot.owner==='enemy' && !shot.diverted && aim &&
    Math.hypot(aim.x-boat.x,aim.y-boat.y)<110 && Math.abs(shot.orderedDepth-boat.depth)<45;
  return {id:shot.id,time,x:Math.round(shot.x)||0,y:Math.round(shot.y)||0,depth:Math.round(shot.depth),
    speed:Math.round(speed/.514444),inboundRun:!!nearBoat};
}

export function observeTorpedo(s:Watch, echo:Echo, active:boolean) {
  let track=s.torpedoTracks.find(t=>t.id===echo.id);
  if(!track){
    if(!active)return;
    track={...echo,fixes:1,activeAt:echo.time,activeX:echo.x,activeY:echo.y,course:null,arrival:null};
    s.torpedoTracks.push(track);return;
  }
  if(echo.time<track.time)return;
  const secondFix=active && track.fixes===1 && echo.time>track.activeAt;
  const previousX=secondFix?track.activeX:track.x;
  const previousY=secondFix?track.activeY:track.y;
  const previousAt=secondFix?track.activeAt:track.time;
  const dx=echo.x-previousX,dy=echo.y-previousY;
  if(active && echo.time>track.activeAt){
    track.fixes=2;track.activeAt=echo.time;track.activeX=echo.x;track.activeY=echo.y;
  }
  if(track.fixes===2 && (dx||dy))track.course=(Math.round(Math.atan2(dx,dy)*180/Math.PI)+360)%360;
  // Estimate the countdown from the difference between displayed fixes. An
  // arcade run can miss even after the game has reported a likely approach.
  const range=Math.hypot(echo.x-s.x,echo.y-s.y);
  const decrease=Math.hypot(previousX-s.x,previousY-s.y)-range;
  const elapsed=echo.time-previousAt;
  let arrival=track.arrival;
  if(!echo.inboundRun||track.course===null)arrival=null;
  else if(elapsed>0)arrival=decrease>1?echo.time+Math.ceil(range*elapsed/decrease):null;
  Object.assign(track,echo,{arrival});
}

export function validEcho(e:Echo,time:number){
  return e && Number.isSafeInteger(e.id) && e.id>0 && [e.x,e.y,e.depth,e.speed,e.time].every(Number.isFinite)
    && e.depth>=0 && e.speed>=0 && e.time>=0 && e.time<=time && typeof e.inboundRun==='boolean';
}
export function validTracks(tracks:Track[],time:number){
  return Array.isArray(tracks)&&tracks.length<=128&&new Set(tracks.map(t=>t?.id)).size===tracks.length&&tracks.every(t=>
    validEcho(t,time)&&(t.fixes===1||t.fixes===2)&&Number.isFinite(t.activeAt)&&t.activeAt>=0&&t.activeAt<=t.time
    && Number.isFinite(t.activeX)&&Number.isFinite(t.activeY)
    && (t.course===null||t.fixes===2&&Number.isInteger(t.course)&&t.course>=0&&t.course<360)
    && (t.arrival===null||t.fixes===2&&t.course!==null&&Number.isFinite(t.arrival)&&t.arrival>=t.time));
}
export const threats=(s:Watch)=>(s.torpedoTracks??[]).filter(t=>t.arrival!==null&&t.arrival>=s.time&&s.time-t.time<=8);
export function etaText(arrival:number, now:number, rate:number, paused:boolean){
  const seconds=Math.max(0,Math.ceil(arrival-now));
  return seconds+' patrol s ('+(paused?'paused':Math.ceil(seconds/rate)+' real s')+')';
}
