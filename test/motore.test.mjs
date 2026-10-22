import test from 'node:test';
import assert from 'node:assert/strict';
import { genera, regoleBase, verifica, suggerimenti, oreSettimana, coperture, oreGiorno, accorcia, preferenze, assenzeSettimana, orePagate, oreMancanti, assegnaAttivita, competenzaDi } from '../motore.js';

// 25 dipendenti di esempio (nomi inventati): 5 responsabili, contratti da 40, 30 e 20 ore.
export function esempio() {
  const abil = ['frutta', 'pane', 'commissionamento', 'cassa'];
  return Array.from({ length: 25 }, (_, i) => ({
    id: 'd' + i, nome: 'Persona ' + (i + 1), resp: i < 5,
    ore: i === 23 || i === 24 ? 20 : i % 3 === 0 ? 30 : 40,
    abilita: [abil[i % 4], 'cassa', ...(i % 3 === 0 ? ['Food'] : []), ...(i % 4 === 1 ? ['Promo', 'Testate'] : []), ...(i % 5 === 2 ? ['frutta', 'pane'] : [])],
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

// Come il punto vendita reale (nomi inventati): 6 da 40 ore (responsabili), 15 da 30, 3 da 20, lenti e veloci.
function negozio() {
  return Array.from({ length: 24 }, (_, i) => ({ id: 'n' + i, nome: 'Collega ' + (i + 1),
    ore: i < 6 ? 40 : i < 21 ? 30 : 20, resp: i < 6, velocita: i % 3 === 0 ? 'lento' : i % 5 === 0 ? 'veloce' : 'normale',
    abilita: ['cassa', i % 2 ? 'pane' : 'commissionamento', ...(i % 3 === 0 ? ['Food', 'frutta'] : []), ...(i % 4 === 1 ? ['Promo', 'Testate'] : [])] }));
}
function regoleNegozio() {
  const r = regoleBase();
  r.fabbisogno = [{ M: 6, I: 0, P: 5 }, { M: 4, I: 1, P: 4 }, { M: 6, I: 0, P: 6 }, { M: 5, I: 0, P: 5 },
                  { M: 5, I: 1, P: 5 }, { M: 6, I: 1, P: 5 }, { M: 6, I: 1, P: 6 }];
  r.monteOre = [90, 72, 96, 90, 90, 100, 96];
  return r;
}

test('le persone per fascia sono esattamente quelle delle regole', () => {
  for (const [dip, r] of [[esempio(), regoleBase()], [negozio(), regoleNegozio()]]) {
    const { piano, scoperti } = genera(dip, r);
    assert.deepEqual(scoperti, []);
    for (let g = 0; g < 7; g++)
      for (const f of ['M', 'I', 'P'])
        assert.equal(Object.values(piano[g]).filter(t => t.fascia === f).length, r.fabbisogno[g][f] ?? 0, `giorno ${g} ${f}`);
    assert.deepEqual(verifica(piano, dip, r).errori, []);
  }
});

test('martedì: 4 di mattina, 1 intermedio, 4 alla chiusura', () => {
  const dip = negozio(), r = regoleNegozio();
  const { piano } = genera(dip, r);
  const c = coperture(piano[1], dip, r);
  assert.equal(c.apertura, 4);
  assert.equal(c.chiusura, 4);
});

test('i giorni si dividono in proporzione al contratto, senza superarlo', () => {
  const dip = negozio(), r = regoleNegozio();
  const { piano } = genera(dip, r);
  const quota = d => piano.filter(x => x[d.id]).length / (d.ore >= 40 ? 5 : d.ore >= 30 ? 4 : 3);
  for (const d of dip) assert.ok(piano.filter(x => x[d.id]).length <= (d.ore >= 40 ? 5 : 4), d.nome);
  const q = dip.map(quota);
  console.log('quota dei giorni da contratto', Math.min(...q).toFixed(2), '–', Math.max(...q).toFixed(2));
  assert.ok(Math.max(...q) - Math.min(...q) <= 0.5);
});

test('pausa di 10 minuti: mattina e pomeriggio 8 h 20, intermedio 7 h 50', () => {
  const r = regoleBase();
  assert.equal(Math.round(orePagate(r.fasce.M, r) * 60), 500);
  assert.equal(Math.round(orePagate(r.fasce.P, r) * 60), 500);
  assert.equal(Math.round(orePagate(r.fasce.I, r) * 60), 470);
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
  r.monteOre[2] = 80; r.accorciaDaSolo = false;
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
  assert.ok(Object.values(piano[6]).filter(t => t.fascia === 'M').length >= r.fabbisogno[6].M);
  assert.equal(suggerimenti(piano, dip, r, 6).some(s => s.id === 'dom'), false);
  assert.deepEqual(verifica(piano, dip, r).errori, []);
});

test('accorcia da solo: ogni giorno resta nel monte ore, senza scoprire i turni', () => {
  const dip = negozio(), r = regoleNegozio();
  const { piano } = genera(dip, r);
  for (let g = 0; g < 7; g++) {
    assert.ok(oreGiorno(piano[g], r) <= r.monteOre[g] + 0.01, `giorno ${g}: ${oreGiorno(piano[g], r)}`);
    assert.ok(coperture(piano[g], dip, r).ok, 'giorno ' + g);
    for (const t of Object.values(piano[g])) {
      assert.ok(t.fine - t.inizio >= r.durataMin);
      assert.ok(t.inizio >= r.fasce[t.fascia].inizio && t.fine <= r.fasce[t.fascia].fine);
    }
  }
  assert.deepEqual(verifica(piano, dip, r).errori, []);
});

test('responsabile dall\'inizio alla fine di ogni turno, anche dopo i tagli; il capo sempre 08:00–16:00', () => {
  const dip = negozio(); dip[0].ruolo = 'CF';
  const r = regoleNegozio();
  const { piano } = genera(dip, r);
  for (let g = 0; g < 7; g++) {
    for (const f of ['M', 'P'])
      assert.ok(Object.entries(piano[g]).some(([id, t]) => t.fascia === f && t.inizio === r.fasce[f].inizio &&
        t.fine === r.fasce[f].fine && dip.find(d => d.id === id).resp), `giorno ${g} ${f}`);
    const capo = piano[g][dip[0].id];
    if (capo) assert.deepEqual([capo.fascia, capo.inizio, capo.fine], ['C', 480, 960]);
    for (const f of ['M', 'I', 'P'])
      assert.equal(Object.values(piano[g]).filter(t => t.fascia === f).length, r.fabbisogno[g][f] ?? 0);
  }
  assert.equal(piano.filter(x => x[dip[0].id]).length, 5);
  assert.deepEqual(verifica(piano, dip, r).errori, []);
});

test('ore mancanti: chi è sotto contratto, senza contare i giorni di assenza', () => {
  const dip = negozio(), r = regoleNegozio();
  const ric = [0, 1, 2, 3, 4, 5, 6].map(g => ({ dip: 'n10', giorno: g, tipo: 'maternità' }));
  const { piano } = genera(dip, r, ric);
  const m = oreMancanti(piano, dip, r, ric);
  assert.ok(m.length > 0);
  assert.ok(!m.some(x => x.id === 'n10'));
  for (const x of m) assert.ok(Math.abs(x.contratto - x.fatte - x.manca) < 1e-9 && x.manca > 0);
  for (let i = 1; i < m.length; i++) assert.ok(m[i - 1].manca >= m[i].manca);
});

test('attività: in ogni turno c\'è chi sa fare ogni attività, e ognuna ha una persona', () => {
  const dip = negozio(), r = regoleNegozio();
  const { piano } = genera(dip, r);
  assert.deepEqual(verifica(piano, dip, r).errori, []);
  for (let g = 0; g < 7; g++)
    for (const f of ['M', 'P'])
      for (const a of assegnaAttivita(piano, dip, r, g, f)) {
        assert.ok(a.id, `${g} ${f} ${a.attivita} senza persona`);
        assert.equal(piano[g][a.id].fascia, f);
        const c = competenzaDi(a.attivita), d = dip.find(x => x.id === a.id);
        if (c === 'resp' || a.attivita === 'Cassa 2' && d.resp) assert.ok(d.resp);
        else if (c) assert.ok(d.abilita.some(x => x.toLowerCase() === c), `${a.attivita} a ${d.nome}`);
      }
});

test('cassa: automatica e cassa 1 agli AV; cassa 2 e 3 ai due responsabili, o cassa 2 a un terzo AV se il responsabile è uno', () => {
  const dip = negozio().map((d, i) => ({ ...d, ruolo: d.resp ? 'CM' : 'AV', abilita: d.abilita.filter(a => a !== 'cassa') }));
  const r = regoleNegozio();
  const { piano } = genera(dip, r);
  assert.deepEqual(verifica(piano, dip, r).errori, []);
  for (let g = 0; g < 7; g++)
    for (const f of ['M', 'P']) {
      const a = assegnaAttivita(piano, dip, r, g, f), di = n => dip.find(d => d.id === a.find(x => x.attivita === n)?.id);
      assert.equal(di('Cassa automatica').ruolo, 'AV');
      assert.equal(di('Cassa 1').ruolo, 'AV');
      assert.notEqual(di('Cassa automatica').id, di('Cassa 1').id);
      const resp = Object.entries(piano[g]).filter(([id, t]) => t.fascia === f && dip.find(d => d.id === id).resp).length;
      assert.ok(di('Cassa 3').resp);
      if (resp >= 2) { assert.ok(di('Cassa 2').resp); assert.notEqual(di('Cassa 2').id, di('Cassa 3').id); }
      else { assert.equal(di('Cassa 2').ruolo, 'AV'); assert.equal(new Set(['Cassa automatica', 'Cassa 1', 'Cassa 2'].map(n => di(n).id)).size, 3); }
    }
});
