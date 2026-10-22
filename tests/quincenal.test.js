import test from 'node:test';
import assert from 'node:assert/strict';
import { periodFor, periodsBetween, shiftPeriod, addDays } from '../js/core/periods.js';
import { paySchedule, periodSummary, validatePaySettings, periodWords } from '../js/core/calc.js';
import { storeReal, HOY } from './helpers.js';

const Q = [15, 30];

test('quincenas del 15 y el 30', () => {
  let p = periodFor('2026-10-22', Q);
  assert.deepEqual([p.start, p.end, p.nextPayDate], ['2026-10-15', '2026-10-29', '2026-10-30']);
  p = periodFor('2026-10-30', Q);
  assert.deepEqual([p.start, p.end], ['2026-10-30', '2026-11-14']);
  p = periodFor('2026-11-03', Q);
  assert.deepEqual([p.start, p.end], ['2026-10-30', '2026-11-14']);
});

test('febrero: el 30 pasa al último día del mes', () => {
  let p = periodFor('2026-02-20', Q);
  assert.deepEqual([p.start, p.end], ['2026-02-15', '2026-02-27']);
  p = periodFor('2026-02-28', Q);
  assert.deepEqual([p.start, p.end], ['2026-02-28', '2026-03-14']);
});

test('quincenas sin huecos ni solapes todo el año', () => {
  for (const days of [[15, 30], [1, 15], [5, 20], [10, 25], [15, 31]]) {
    const ps = periodsBetween('2026-01-01', '2027-12-31', days);
    for (let i = 1; i < ps.length; i++) assert.equal(addDays(ps[i - 1].end, 1), ps[i].start, `${days}`);
    for (let d = '2026-01-01'; d <= '2027-12-31'; d = addDays(d, 1)) {
      assert.equal(ps.filter((p) => p.contains(d)).length, 1, `${days} ${d}`);
    }
    assert.ok(ps.length >= 47 && ps.length <= 49, `${days}: ${ps.length} quincenas en 2 años`);
  }
});

test('desplazar quincenas', () => {
  const p = periodFor('2026-10-22', Q);
  assert.equal(shiftPeriod(p, 1, Q).start, '2026-10-30');
  assert.equal(shiftPeriod(p, -1, Q).start, '2026-09-30');
  assert.equal(shiftPeriod(p, -2, Q).start, '2026-09-15');
});

test('configuración y validación', () => {
  assert.deepEqual(paySchedule({ frecuencia_pago: 'quincenal', dia_pago_1: '30', dia_pago_2: '15' }), [15, 30]);
  assert.equal(paySchedule({ dia_pago: '20' }), 20);
  assert.throws(() => validatePaySettings('quincenal', null, 15, 18), /10 días/);
  assert.throws(() => validatePaySettings('quincenal', null, 0, 15));
  validatePaySettings('quincenal', null, 15, 30);
  validatePaySettings('mensual', 20);
  assert.equal(periodWords({ frecuencia_pago: 'quincenal' }).one, 'quincena');
});

test('resumen por quincena: el disponible alcanza hasta el próximo pago', async () => {
  const s = await storeReal();
  await s.setSettings({ frecuencia_pago: 'quincenal', dia_pago_1: '15', dia_pago_2: '30' });
  const r = periodSummary(s.state, periodFor('2026-10-22', paySchedule(s.state.settings)), '2026-10-22');
  assert.equal(r.period.start, '2026-10-15');
  assert.equal(r.availability.daysLeft, 8);                 // del 22 al 29 de octubre
  assert.equal(r.availability.available, 1985000);
  assert.equal(r.availability.perDay, Math.floor(1985000 / 8));
  assert.equal(r.salaryReceived, 2236000);                   // el salario del 20 cae en esta quincena
});
