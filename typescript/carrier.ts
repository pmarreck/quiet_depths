// Fictional patrol balance and silhouette proportions, in game units.
export const carrierId = 'solstice';
export const carrierSize = {halfLength: 108, halfBeam: 16, deckHeight: 17} as const;
export const carrierDeck = [
  [-12,-108],[13,-108],[22,-84],[22,74],[15,102],[-16,102],
  [-28,77],[-33,5],[-34,-42],[-25,-66],[-18,-67],
] as const;

export function carrierGroup(x: number, y: number, heading: number, speed: number, extraEscort: boolean, fighterRoll: number) {
  const ship = (id: string, name: string, kind: 'carrier' | 'escort', dx: number, dy: number) => ({
    id,name,kind,x:x+dx,y:y+dy,heading,speed,military:true,hull:100,alert:0,attack:0,
    flood:0,disabled:false,sinkDepth:0,
  });
  const group = [
    {...ship(carrierId,'Fleet carrier Solstice','carrier',0,0),directHits:0,fighterCount:1+Math.floor(fighterRoll*3)},
    ship('kestrel','Kestrel','escort',-460,210),
    ship('gull','Gull','escort',320,-530),
  ];
  if(extraEscort)group.push(ship('petrel','Petrel','escort',510,380));
  return group;
}

interface Carrier {directHits: number; hull: number; flood: number; disabled: boolean; speed: number}
export function registerCarrierHit(ship: Carrier) {
  ship.directHits++;
  // The first hit is survivable. Two open a permanent flood. Further hits
  // remove remaining buoyancy and increase its loss per simulation second.
  ship.hull = Math.max(1, ship.hull - (ship.directHits <= 2 ? 30 : 10));
  ship.flood = Math.max(ship.flood, ship.directHits * 2);
  if(ship.directHits >= 2){ship.disabled=true;ship.speed=0;}
}

export function incidentalHull(ship: {kind?: string; hull?: number; directHits?: number}, damage: number) {
  const floor = ship.kind === 'carrier' && (ship.directHits ?? 0) < 2 ? 1 : 0;
  return Math.max(floor, (ship.hull ?? 100) - damage);
}

export function advanceCarrierFlood(ship: Carrier, dt: number) {
  if (ship.directHits >= 2) ship.hull = Math.max(0, ship.hull - dt * (ship.directHits - 1));
}

export function validCarrier(ship: Carrier & {fighterCount: number}) {
  return Number.isInteger(ship.fighterCount) && ship.fighterCount >= 1 && ship.fighterCount <= 3 &&
    Number.isFinite(ship.flood) && ship.flood >= 0 && (ship.directHits < 2 || ship.flood > 0) &&
    Number.isSafeInteger(ship.directHits) && ship.directHits >= 0 &&
    ship.hull >= 0 && ship.hull <= 100 && (ship.hull > 0 || ship.directHits >= 2);
}
