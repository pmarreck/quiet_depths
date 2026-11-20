// Keep interactive row elements alive while telemetry changes underneath a press.
export function sonarLayout(width,height,mini=false){
 if(mini)return{cx:width/2,cy:height*.49,radius:Math.min(width*.35,height*.32),waveform:false};
 const waveform=height>=360,room=Math.max(0,height-55-40-(waveform?75:0));
 return{cx:width/2,cy:75+room/2,radius:Math.min(width*.31,room/2),waveform,waveY:height-35};
}
export const SONAR_RANGES=[1500,3000,6000];
// A passive bearing stays on its lettered spoke when the range scale changes.
export const sonarRangeFraction=(range,scale)=>range===0?.78:range<=scale?range/scale:null;
export function reconcileKeyedChildren(container,items,keyOf,create,update){
 const old=new Map([...container.children].map(node=>[node.dataset.rowKey,node])),keep=new Set();
 items.forEach((item,index)=>{const key=String(keyOf(item));let node=old.get(key);if(!node){node=create(item);node.dataset.rowKey=key;}update(node,item);keep.add(node);if(container.children[index]!==node)container.insertBefore(node,container.children[index]||null);});
 for(const node of [...container.children])if(!keep.has(node))node.remove();
}

export function contactRow(document){
 const button=document.createElement('button');button.className='contact-row';
 for(const name of ['contact-icon','contact-summary','contact-bearing']){const span=document.createElement('span');span.className=name;button.appendChild(span);}
 const summary=button.children[1];summary.appendChild(document.createElement('strong'));summary.appendChild(document.createElement('small'));return button;
}
export function updateContactRow(button,model){
 button.dataset.contact=model.id;button.classList.toggle('active',model.selected);button.setAttribute('aria-pressed',String(model.selected));
 button.children[0].textContent=model.icon;button.children[1].children[0].textContent=model.title;button.children[1].children[1].textContent=model.detail;button.children[2].textContent=model.bearing;
}
