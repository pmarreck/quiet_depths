// The watch remembers a critical battery at exactly 10% until it rises above it.
export type BatteryWarning = 0 | 1 | 2;
export interface WatchWarnings {bottom:boolean;battery:BatteryWarning}
export const bottomThreshold=20;
export function batteryWarning(charge:number,previous:BatteryWarning=0):BatteryWarning{
 if(charge<10||charge===10&&previous===2)return 2;
 return charge<20?1:0;
}
export function watchWarnings(clearance:number,charge:number,previous?:WatchWarnings):WatchWarnings{
 const bottom=clearance<bottomThreshold,battery=batteryWarning(charge,previous?.battery);
 return previous&&previous.bottom===bottom&&previous.battery===battery?previous:{bottom,battery};
}
export function validWarnings(w:WatchWarnings){
 return !!w&&typeof w.bottom==='boolean'&&[0,1,2].includes(w.battery);
}
export const bottomCall='Depth warning · Less than 20 m below the keel.';
export const batteryCall=(level:1|2)=>level===2?'Critical battery · Reserve at or below 10%.':'Low battery · Less than 20% charge.';
