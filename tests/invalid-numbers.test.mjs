import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reportInvalidNumber, collectInvalidNumbers, warnOnInvalidNumber, setInvalidNumberReporter, throwOnInvalidNumber} from '../src/invalid-numbers.js';

test('an invalid number throws by default, so a test or script that meets one fails', () => {
  assert.throws(() => reportInvalidNumber('hurt', NaN), /Invalid number in hurt: NaN/);
});

test('collecting gathers reports, returns the result, and restores throwing even when the work throws', () => {
  const {result, reports} = collectInvalidNumbers(() => { reportInvalidNumber('hurt', Infinity); reportInvalidNumber('damageDrone', NaN); return 7; });
  assert.equal(result, 7);
  assert.deepStrictEqual(reports, [{where: 'hurt', value: Infinity}, {where: 'damageDrone', value: NaN}]);
  assert.throws(() => collectInvalidNumbers(() => { throw new Error('work failed'); }), /work failed/);
  assert.throws(() => reportInvalidNumber('hurt', -Infinity), /Invalid number/);
});

test('in play an invalid number is logged with its stack, and play goes on', () => {
  const warned = [], original = console.warn, previous = setInvalidNumberReporter(warnOnInvalidNumber);
  console.warn = (...args) => warned.push(args);
  try { reportInvalidNumber('emitSound power', -1); } finally { console.warn = original; setInvalidNumberReporter(previous); }
  assert.equal(warned.length, 1);
  assert.ok(warned[0][0] instanceof Error && /invalid number in emitSound power: -1/.test(warned[0][0].message) && warned[0][0].stack);
  assert.equal(previous, throwOnInvalidNumber);
});

// The game must warn rather than throw, from its first statement on.
test('the game installs the warning reporter before anything else runs', () => {
  const lines = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8').split('\n');
  const statements = lines.filter(l => l.trim() && !l.startsWith('//') && !l.startsWith('import '));
  assert.equal(statements[0], 'setInvalidNumberReporter(warnOnInvalidNumber);');
});
