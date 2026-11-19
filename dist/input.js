// Sources, rather than keys alone, make simultaneous touch/keyboard holds safe.
export class HeldInput{
 constructor(){this.sources=new Map();this.keys=new Set();}
 press(source,key){this.sources.set(source,key);this.sync();}
 release(source){this.sources.delete(source);this.sync();}
 clear(){this.sources.clear();this.keys.clear();}
 sync(){this.keys.clear();for(const key of this.sources.values())this.keys.add(key);}
}
