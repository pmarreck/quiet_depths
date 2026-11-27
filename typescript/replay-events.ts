// Mirrored in elm/Sim/ReplayEvents.elm until the simulation moves to Elm: change both; tests/sim-*.test.mjs hold them equal.
// Moments worth an instant replay. The simulation announces them here, and a
// recorder listening to that patrol captures the frames around them.
type Point={x:number;y:number;depth:number};
export type ReplayEvent={kind:'ground'|'collision'|'blast'|'torpedo'|'near-miss'|'collapse'|'sinking';
  point:Point; heading?:number; target?:string; shot?:number; enemy?:boolean};
export interface ReplayListener {mark(time:number,event:ReplayEvent):void}
const listeners=new WeakMap<object,ReplayListener>();
export function listenForReplayEvents(world:object,listener:ReplayListener){listeners.set(world,listener);}
// Any patrol object can announce an event; its listener is found by identity.
export function replayEvent(s:{time:number},event:ReplayEvent){listeners.get(s)?.mark(s.time,event);}
