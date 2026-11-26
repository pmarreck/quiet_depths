// Shape the source before the game's distance filter, stereo pan and master limiter.
export function shapeImpulse(type:string, time:number, duration:number, noise:AudioParam, rumble:OscillatorNode, bass:AudioParam) {
  const pitch=rumble.frequency,end=time+duration;
  if(type==='launch'||type==='splashdown'){
    const splash=type==='splashdown';
    noise.setValueAtTime(.0001,time);noise.linearRampToValueAtTime(splash?.72:.35,time+(splash?.015:.08));noise.exponentialRampToValueAtTime(.0001,end);
    rumble.type='sine';pitch.setValueAtTime(splash?155:240,time);pitch.exponentialRampToValueAtTime(splash?85:75,end);
    bass.setValueAtTime(splash?.065:.14,time);bass.exponentialRampToValueAtTime(.0001,end);return;
  }
  if(type==='blast'||type==='detonation'){
    // A sharp front and a short low-mid body carry on small speakers.
    noise.setValueAtTime(.0001,time);
    noise.linearRampToValueAtTime(1.45,time+.006);
    noise.exponentialRampToValueAtTime(.85,time+.09);
    noise.exponentialRampToValueAtTime(.4,time+.32);
    noise.exponentialRampToValueAtTime(.0001,end);
    rumble.type='triangle';
    pitch.setValueAtTime(155,time);
    pitch.exponentialRampToValueAtTime(82,time+.10);
    pitch.exponentialRampToValueAtTime(46,time+.34);
    pitch.exponentialRampToValueAtTime(27,end);
    bass.setValueAtTime(.0001,time);
    bass.linearRampToValueAtTime(.92,time+.012);
    bass.exponentialRampToValueAtTime(.61,time+.18);
    bass.exponentialRampToValueAtTime(.24,time+.55);
    bass.exponentialRampToValueAtTime(.0001,end);
    return;
  }

  const creak=type==='creak',seeker=type==='seeker'||type==='sweep',thunder=type==='thunder';
  const peak=thunder?1.2:.95;
  noise.setValueAtTime(.0001,time);
  noise.linearRampToValueAtTime(creak?.08:seeker?.015:peak,time+(thunder?.08:.008));
  noise.exponentialRampToValueAtTime(.0001,end);
  if(type==='implosion'||type==='collapse'){
    noise.setValueAtTime(.28,time+1.5);
    noise.linearRampToValueAtTime(.65,time+2);
    noise.exponentialRampToValueAtTime(.001,end);
  }
  rumble.type=creak?'triangle':'sine';
  pitch.setValueAtTime(creak?112:seeker?1480:thunder?42:type==='gunfire'?130:85,time);
  pitch.exponentialRampToValueAtTime(creak?54:seeker?1180:20,end);
  bass.setValueAtTime(peak*(seeker?.45:.35),time);
  bass.exponentialRampToValueAtTime(.0001,end);
  if(creak){
    pitch.linearRampToValueAtTime(164,time+.75);
    pitch.exponentialRampToValueAtTime(69,time+2);
    bass.setValueAtTime(.001,time);
    bass.linearRampToValueAtTime(.30,time+.8);
    bass.exponentialRampToValueAtTime(.001,end);
  }
}
