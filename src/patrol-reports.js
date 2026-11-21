import {bearing,distance,log,rad} from './mechanics.js';
import {hash01} from './environment.js';
import {addDebrief} from './debrief.js';

export function report(s,id,text){
 s.reports=s.reports.filter(r=>r.id!==id&&s.time-r.time<18);
 s.reports.push({id,text,time:s.time});
 log(s,text);
}

export function recordCivilianHit(s,ship,cause){
 if(ship.neutralHitAt!==undefined)return;
 ship.neutralHitAt=s.time;
 addDebrief(s,cause);
}

export function disciplinaryFinding(s){
 const civilians=s.ships.filter(v=>!v.military&&v.neutralHitAt!==undefined);
 if(!civilians.length)return null;
 const seed=s.patrol.seed;
 return {title:hash01(seed,951)<.5?'COURT MARTIALED':'RANK DEMOTION',
  angle:(hash01(seed,952)<.5?-1:1)*(3+17*hash01(seed,953)),
  reason:'Civilian casualties. Your fire struck '+civilians.map(v=>v.name).join(', ')+'.'};
}

export function hearWreck(s,source){
 const ship=s.ships.find(v=>v.id===source.vessel);
 if(!ship||ship.wreckMark)return;
 // A single acoustic report plots an approximate site, even for an unknown hull.
 const range=distance(s,source),angle=rad(bearing(s,source)+(hash01(source.id,51)-.5)*7);
 const estimate=range*(.89+.22*hash01(source.id,52));
 ship.wreckMark={x:s.x+Math.sin(angle)*estimate,y:s.y+Math.cos(angle)*estimate,observed:false};
}
