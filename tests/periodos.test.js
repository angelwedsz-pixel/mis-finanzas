import test from 'node:test';
import assert from 'node:assert/strict';
import { payDate, periodFor, periodsBetween, shiftPeriod, addDays } from '../js/core/periods.js';

test('ejemplo del enunciado', () => {
  const p = periodFor('2026-10-20', 20);
  assert.equal(p.start, '2026-10-20'); assert.equal(p.end, '2026-11-19'); assert.equal(p.nextPayDate, '2026-11-20');
});

test('períodos con día 20', () => {
  for (const [d, s, e] of [['2026-10-19', '2026-09-20', '2026-10-19'], ['2026-11-19', '2026-10-20', '2026-11-19'],
    ['2026-01-05', '2025-12-20', '2026-01-19'], ['2026-12-31', '2026-12-20', '2027-01-19'], ['2027-02-25', '2027-02-20', '2027-03-19']]) {
    const p = periodFor(d, 20);
    assert.deepEqual([p.start, p.end], [s, e]);
    assert.ok(p.contains(d));
  }
});

test('día 31 se ajusta a meses cortos', () => {
  assert.equal(payDate(2026, 2, 31), '2026-02-28');
  assert.equal(payDate(2028, 2, 31), '2028-02-29');
  assert.equal(payDate(2026, 4, 31), '2026-04-30');
  let p = periodFor('2026-02-28', 31); assert.deepEqual([p.start, p.end], ['2026-02-28', '2026-03-30']);
  p = periodFor('2026-03-15', 31); assert.deepEqual([p.start, p.end], ['2026-02-28', '2026-03-30']);
});

test('sin huecos ni solapes (2026-2028, varios días de pago)', () => {
  for (const pd of [1, 15, 20, 28, 29, 30, 31]) {
    const ps = periodsBetween('2026-01-01', '2028-12-31', pd);
    for (let i = 1; i < ps.length; i++) assert.equal(addDays(ps[i - 1].end, 1), ps[i].start);
    for (let d = '2026-01-01'; d <= '2028-12-31'; d = addDays(d, 1)) {
      assert.equal(ps.filter((p) => p.contains(d)).length, 1, `${pd} ${d}`);
    }
  }
});

test('desplazar y días restantes', () => {
  const p = periodFor('2026-10-25', 20);
  assert.equal(shiftPeriod(p, -1, 20).start, '2026-09-20');
  assert.equal(shiftPeriod(p, 3, 20).start, '2027-01-20');
  const q = periodFor('2026-10-20', 20);
  assert.equal(q.daysLeft('2026-10-20'), 31); assert.equal(q.daysLeft('2026-11-19'), 1); assert.equal(q.daysLeft('2026-11-20'), 0);
  assert.throws(() => payDate(2026, 1, 0));
});
