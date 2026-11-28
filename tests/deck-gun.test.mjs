import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame} from '../src/sim.js';
import {fireDeckGun} from '../src/combat.js';
import {collectInvalidNumbers} from '../src/invalid-numbers.js';

const surfaced = () => Object.assign(createGame('recon', 31), {depth: 0, targetDepth: 0, speed: 0});

test('a deck-gun aim that is not a finite number is refused and reported, never silently dropped', () => {
  for (const aim of [{bearing: NaN, elevation: 10}, {bearing: 90, elevation: Infinity}, {bearing: -Infinity, elevation: NaN}]) {
    const s = surfaced(), ammo = s.gun.ammo;
    const {result, reports} = collectInvalidNumbers(() => fireDeckGun(s, aim));
    assert.equal(result, false);
    assert.equal(s.gun.ammo, ammo, 'nothing fired');
    const expected = [['fireDeckGun bearing', aim.bearing], ['fireDeckGun elevation', aim.elevation]].filter(([, v]) => !Number.isFinite(v)).map(([where, value]) => ({where, value}));
    assert.deepStrictEqual(reports, expected);
  }
  assert.throws(() => fireDeckGun(surfaced(), {bearing: NaN, elevation: 0}), /Invalid number in fireDeckGun bearing/);
  assert.equal(fireDeckGun(surfaced(), {bearing: 90, elevation: 5}), true, 'a finite aim still fires');
});
