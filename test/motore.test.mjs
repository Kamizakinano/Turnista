import test from 'node:test';
import assert from 'node:assert/strict';
import { genera, regoleBase, verifica, suggerimenti, oreSettimana, coperture, oreGiorno, accorcia, preferenze, assenzeSettimana } from '../motore.js';

// 25 dipendenti di esempio (nomi inventati): 5 responsabili, contratti da 40, 30 e 20 ore.
export function esempio() {
  const abil = ['frutta', 'pane', 'commissionamento', 'cassa'];
  return Array.from({ length: 25 }, (_, i) => ({
    id: 'd' + i, nome: 'Persona ' + (i + 1), resp: i < 5,
    ore: i === 23 || i === 24 ? 20 : i % 3 === 0 ? 30 : 40,
    abilita: [abil[i % 4], 'cassa'],
  }));
}

test('la settimana rispetta tutte le regole', () => {
  const dip = esempio(), r = regoleBase();
  const { piano, scoperti } = genera(dip, r);
  assert.deepEqual(scoperti, []);
  const v = verifica(piano, dip, r);
  assert.deepEqual(v.errori, []);
  for (let g = 0; g < 7; g++) {
    const c = coperture(piano[g], dip, r);
    assert.ok(c.apertura >= 4 && c.chiusura >= 4 && c.cambio >= 2 && c.respCambio, 'giorno ' + g);
  }
  for (const d of dip) assert.ok(piano.filter(x => x[d.id]).length <= 6);
});

test('lo straordinario è il minimo possibile', () => {
  const dip = esempio(), r = regoleBase();
  const { piano } = genera(dip, r);
  const v = verifica(piano, dip, r);
  console.log('straordinario', v.straordinario, 'ore per giorno', piano.map(g => oreGiorno(g, r)));
  assert.ok(v.straordinario <= 8, 'straordinario ' + v.straordinario);
});

test('le richieste vengono rispettate', () => {
  const dip = esempio(), r = regoleBase();
  const richieste = [{ dip: 'd0', giorno: 0, tipo: 'ferie' }, { dip: 'd0', giorno: 1, tipo: 'ferie' },
                     { dip: 'd6', giorno: 3, tipo: 'non disponibile', da: 840, a: 1440 }];
  const { piano } = genera(dip, r, richieste);
  assert.equal(piano[0].d0, undefined);
  assert.equal(piano[1].d0, undefined);
  assert.ok(!piano[3].d6 || piano[3].d6.fine <= 840);
  assert.deepEqual(verifica(piano, dip, r, richieste).errori, []);
});

test('la rotazione cambia fascia la settimana dopo', () => {
  const dip = esempio(), r = regoleBase();
  const s1 = genera(dip, r, [], null, 0).piano;
  const s2 = genera(dip, r, [], s1, 1).piano;
  const pref = preferenze(dip, s1);
  let cambiati = 0, totale = 0;
  for (const d of dip) {
    const prima = s1.filter(x => x[d.id]?.fascia === 'M').length > s1.filter(x => x[d.id]?.fascia === 'P').length ? 'M' : 'P';
    const dopo = s2.filter(x => x[d.id]?.fascia === 'M').length > s2.filter(x => x[d.id]?.fascia === 'P').length ? 'M' : 'P';
    totale++; if (prima !== dopo) cambiati++;
  }
  console.log('cambiano fascia', cambiati, 'su', totale);
  assert.ok(cambiati >= totale * 0.6);
  assert.deepEqual(verifica(s2, dip, r, [], s1).errori, []);
});

test('monte ore superato: i tagli rispettano apertura e chiusura', () => {
  const dip = esempio(), r = regoleBase();
  r.monteOre[2] = 80;
  const { piano } = genera(dip, r);
  const s = suggerimenti(piano, dip, r, 2);
  assert.ok(s.length > 0);
  for (const x of s) piano[2][x.id] = x.dopo;
  console.log('mercoledì dopo i tagli', oreGiorno(piano[2], r), s.map(x => x.modo));
  const c = coperture(piano[2], dip, r);
  assert.ok(c.ok);
  // prima entrano più tardi, poi escono prima
  assert.ok(s.every(x => x.modo === 'tardi') || s.findIndex(x => x.modo === 'prima') > 0);
});

test('i lenti si distribuiscono tra i turni', () => {
  const dip = esempio().map((d, i) => ({ ...d, velocita: i % 4 === 1 ? 'lento' : i % 4 === 2 ? 'veloce' : 'normale' }));
  const r = regoleBase();
  const { piano } = genera(dip, r);
  assert.deepEqual(verifica(piano, dip, r).errori, []);
  const lento = new Set(dip.filter(d => d.velocita === 'lento').map(d => d.id));
  for (let g = 0; g < 7; g++)
    for (const f of ['M', 'P']) {
      const n = Object.entries(piano[g]).filter(([id, t]) => t.fascia === f && lento.has(id)).length;
      assert.ok(n <= 2, `giorno ${g} ${f}: ${n} lenti`);
    }
});

test('malattia e maternità escludono la persona per tutto il periodo', () => {
  const assenze = [{ dip: 'd3', tipo: 'maternità', dal: '2026-10-01', al: '2027-02-28' },
                   { dip: 'd7', tipo: 'malattia', dal: '2026-10-21', al: '2026-10-23' }];
  const ric = assenzeSettimana(assenze, '2026-10-19');
  assert.equal(ric.filter(q => q.dip === 'd3').length, 7);
  assert.deepEqual(ric.filter(q => q.dip === 'd7').map(q => q.giorno), [2, 3, 4]);
  const dip = esempio(), r = regoleBase();
  const { piano } = genera(dip, r, ric);
  for (const q of ric) assert.equal(piano[q.giorno][q.dip], undefined);
  assert.deepEqual(verifica(piano, dip, r, ric).errori, []);
});

test('turno fisso: solo la domenica 06:00–14:10', () => {
  const dip = [...esempio(), { id: 'dom', nome: 'Domenica', ore: 8, resp: false, abilita: ['cassa'], soloFissi: true,
    fissi: [{ giorno: 6, inizio: 360, fine: 850 }] }];
  const r = regoleBase();
  const { piano } = genera(dip, r);
  for (let g = 0; g < 6; g++) assert.equal(piano[g].dom, undefined);
  assert.deepEqual(piano[6].dom, { fascia: 'M', inizio: 360, fine: 850, fisso: true });
  assert.equal(Object.values(piano[6]).filter(t => t.fascia === 'M').length, r.fabbisogno[6].M);
  assert.equal(suggerimenti(piano, dip, r, 6).some(s => s.id === 'dom'), false);
  assert.deepEqual(verifica(piano, dip, r).errori, []);
});
