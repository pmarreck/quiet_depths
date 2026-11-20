export function addDebrief(state,text){
 const entries=state.debrief??=[];
 if(entries.at(-1)?.text===text&&state.time-entries.at(-1).time<4)return;
 entries.push({time:state.time,text});
 if(entries.length>48)entries.shift();
}

export function validDebrief(entries,time){
 return Array.isArray(entries)&&entries.length<=48&&entries.every(entry=>entry&&Number.isFinite(entry.time)&&entry.time>=0&&entry.time<=time&&typeof entry.text==='string'&&entry.text.length<=220);
}
