// Turnista: il "motore" che crea i turni della settimana e controlla le regole.
// Orari in minuti dalla mezzanotte (05:00 = 300, 21:30 = 1290).

export const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const FASCE = { M: 'Mattina', I: 'Intermedio', P: 'Pomeriggio' };

export function regoleBase() {
  return {
    fasce: { M: { inizio: 300, fine: 810 }, I: { inizio: 540, fine: 1020 }, P: { inizio: 780, fine: 1290 } },
    pausa: 10, pausaSopra: 360,          // 10 min di pausa non pagata nei turni più lunghi di 6 ore
    fabbisogno: [
      { M: 5, I: 1, P: 5 }, { M: 4, I: 1, P: 4 }, { M: 6, I: 1, P: 6 }, { M: 5, I: 1, P: 5 },
      { M: 5, I: 1, P: 5 }, { M: 5, I: 1, P: 5 }, { M: 6, I: 1, P: 6 },
    ],
    monteOre: [90, 72, 96, 90, 90, 90, 96],
    minApertura: 4, minChiusura: 4,
    cambio: { da: 780, a: 810, min: 2 },  // al cambio turno almeno 2 persone, con un responsabile
    maxGiorni: 6, stacco: 660, durataMin: 240, passo: 30,
    accorciaDaSolo: true,               // dentro la fascia: si entra più tardi o si esce prima per stare nel monte ore
  };
}

export const ora = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function orePagate(t, r) {
  if (!t) return 0;
  const s = t.fine - t.inizio;
  return (s - (s > r.pausaSopra ? r.pausa : 0)) / 60;
}

// Il turno occupa questi minuti nella settimana (per lo stacco di 11 ore tra un giorno e l'altro).
const assoluto = (g, t) => ({ da: g * 1440 + t.inizio, a: g * 1440 + t.fine });

function indisponibile(richieste, id, g, t) {
  return richieste.some(q => q.dip === id && q.giorno === g &&
    (q.tipo === 'ferie' || q.tipo === 'permesso' && !q.da || (q.da ?? 0) < t.fine && (q.a ?? 1440) > t.inizio));
}

/// Ore della settimana di una persona.
export function oreSettimana(piano, id, r) {
  return piano.reduce((s, giorno) => s + orePagate(giorno[id], r), 0);
}

function rispettaStacco(piano, id, g, t, r, precedente) {
  const io = assoluto(g, t);
  const vicini = [];
  if (g > 0 && piano[g - 1][id]) vicini.push(assoluto(g - 1, piano[g - 1][id]));
  if (g < 6 && piano[g + 1][id]) vicini.push(assoluto(g + 1, piano[g + 1][id]));
  if (g === 0 && precedente?.[6]?.[id]) vicini.push(assoluto(-1, precedente[6][id]));
  return vicini.every(v => v.a + r.stacco <= io.da || io.a + r.stacco <= v.da);
}

/// Fascia preferita per la rotazione: chi la settimana prima ha fatto più mattine ora va di pomeriggio, e viceversa.
export function preferenze(dipendenti, precedente, numeroSettimana = 0) {
  const pref = {};
  dipendenti.forEach((d, i) => {
    let m = 0, p = 0;
    for (const giorno of precedente ?? []) {
      const t = giorno?.[d.id];
      if (t?.fascia === 'M') m++;
      if (t?.fascia === 'P') p++;
    }
    pref[d.id] = m > p ? 'P' : p > m ? 'M' : ((i + numeroSettimana) % 2 === 0 ? 'M' : 'P');
  });
  return pref;
}

/// Divide le persone in due squadre per la settimana (M = mattina, P = pomeriggio), così nessuno passa
/// dal pomeriggio alla mattina del giorno dopo. Si parte dalla rotazione e si equilibrano giorni e responsabili.
export function squadre(dipendenti, r, richieste = [], precedente = null, numeroSettimana = 0) {
  const pref = preferenze(dipendenti, precedente, numeroSettimana);
  const persone = dipendenti.filter(d => !d.soloFissi);
  const cap = d => Math.min(giorniPrevisti(d).max, r.maxGiorni, 7 - giorniAssente(richieste, d.id));
  const fissi = f => dipendenti.reduce((s, d) => s + (d.fissi ?? []).filter(x => fasciaDi(x, r) === f).length, 0);
  const dom = { M: r.fabbisogno.reduce((s, x) => s + (x.M ?? 0), 0) - fissi('M'), P: r.fabbisogno.reduce((s, x) => s + (x.P ?? 0), 0) - fissi('P') };
  const capDi = (f, soloResp) => persone.filter(d => pref[d.id] === f && (!soloResp || d.resp)).reduce((s, d) => s + cap(d), 0);
  const squilibrio = () => Math.abs(capDi('M') / Math.max(1, dom.M) - capDi('P') / Math.max(1, dom.P));
  // Chi non ha una settimana precedente si sposta per primo, poi anche gli altri.
  const ruotato = id => (precedente ?? []).some(g => g?.[id]);
  const altra = f => f === 'M' ? 'P' : 'M';
  for (let giro = 0; giro < persone.length; giro++) {
    // Ogni squadra deve poter avere un responsabile tutti i giorni (7 giorni di responsabile).
    const senzaResp = ['M', 'P'].find(f => capDi(f, true) < 7);
    const verso = senzaResp ?? (capDi('M') / Math.max(1, dom.M) < capDi('P') / Math.max(1, dom.P) ? 'M' : 'P');
    const prima = squilibrio();
    const candidati = persone.filter(d => pref[d.id] === altra(verso) && (senzaResp ? d.resp : !d.resp))
      .sort((a, b) => ruotato(a.id) - ruotato(b.id) || cap(a) - cap(b));
    const d = candidati.find(d => {
      pref[d.id] = verso;
      const ok = senzaResp ? capDi(altra(verso), true) >= 7 : squilibrio() < prima - 1e-9;
      if (!ok) pref[d.id] = altra(verso);
      return ok;
    });
    if (!d) break;
  }
  return pref;
}

/// Crea la settimana: esattamente le persone scritte nelle regole per ogni giorno e fascia.
export function genera(dipendenti, r, richieste = [], precedente = null, numeroSettimana = 0) {
  const piano = Array.from({ length: 7 }, () => ({}));
  const pref = squadre(dipendenti, r, richieste, precedente, numeroSettimana);
  const giorniFatti = Object.fromEntries(dipendenti.map(d => [d.id, 0]));
  const scoperti = [];

  // Turni fissi (es. solo la domenica 06:00–14:10): si mettono per primi e non si toccano.
  for (const d of dipendenti)
    for (const f of d.fissi ?? []) {
      if (indisponibile(richieste, d.id, f.giorno, f)) continue;
      piano[f.giorno][d.id] = { fascia: fasciaDi(f, r), inizio: f.inizio, fine: f.fine, fisso: true };
      giorniFatti[d.id]++;
    }

  // Prima i giorni più pieni (mercoledì e domenica), poi gli altri.
  const ordine = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => totale(r.fabbisogno[b]) - totale(r.fabbisogno[a]) || a - b);

  for (let passo = 0; passo < 2; passo++) {           // al secondo giro si può uscire dalla propria squadra
    for (const g of ordine) {
      for (const fascia of ['M', 'P', 'I']) {
        const serve = r.fabbisogno[g][fascia] ?? 0;
        while (contaFascia(piano[g], fascia) < serve) {
          const t = { fascia, inizio: r.fasce[fascia].inizio, fine: r.fasce[fascia].fine };
          const serveResp = fascia !== 'I' && !Object.entries(piano[g]).some(([id, x]) =>
            x.fascia === fascia && dipendenti.find(d => d.id === id)?.resp);
          const scelto = migliore(dipendenti, piano, g, t, r, richieste, precedente, pref, giorniFatti, passo === 1, serveResp)
            ?? (serveResp ? migliore(dipendenti, piano, g, t, r, richieste, precedente, pref, giorniFatti, passo === 1, false) : null);
          if (!scelto) break;
          piano[g][scelto.id] = t;
          giorniFatti[scelto.id]++;
        }
      }
    }
  }
  for (let g = 0; g < 7; g++)
    for (const fascia of ['M', 'I', 'P']) {
      const manca = (r.fabbisogno[g][fascia] ?? 0) - contaFascia(piano[g], fascia);
      if (manca > 0) scoperti.push({ giorno: g, fascia, manca });
    }
  if (r.accorciaDaSolo !== false)
    for (let g = 0; g < 7; g++)
      for (let giro = 0; giro < 20; giro++) {
        const s = suggerimenti(piano, dipendenti, r, g);
        if (!s.length) break;
        for (const x of s) piano[g][x.id] = x.dopo;
      }
  return { piano, scoperti };
}

// La fascia più vicina all'orario di un turno fisso.
const fasciaDi = (t, r) => ['M', 'I', 'P'].reduce((a, k) => Math.abs(r.fasce[k].inizio - t.inizio) < Math.abs(r.fasce[a].inizio - t.inizio) ? k : a, 'M');

const totale = f => (f.M ?? 0) + (f.I ?? 0) + (f.P ?? 0);
const contaFascia = (giorno, fascia) => Object.values(giorno).filter(t => t.fascia === fascia).length;

function migliore(dipendenti, piano, g, t, r, richieste, precedente, pref, giorniFatti, fuoriSquadra, serveResp) {
  let meglio = null, punti = -Infinity;
  const abilitaPresenti = new Set(Object.entries(piano[g]).filter(([, x]) => x.fascia === t.fascia)
    .flatMap(([id]) => dipendenti.find(d => d.id === id)?.abilita ?? []));
  for (const d of dipendenti) {
    if (piano[g][d.id] || d.soloFissi) continue;
    if (serveResp && !d.resp) continue;
    if (!fuoriSquadra && t.fascia !== 'I' && pref[d.id] !== t.fascia) continue;
    if (indisponibile(richieste, d.id, g, t)) continue;
    const previsti = giorniPrevisti(d);
    if (giorniFatti[d.id] >= Math.min(r.maxGiorni, previsti.max)) continue;
    if (!rispettaStacco(piano, d.id, g, t, r, precedente)) continue;
    // Prima chi è più indietro rispetto ai giorni del suo contratto: i giorni si dividono in proporzione.
    let p = -giorniFatti[d.id] / Math.max(1, previsti.min) * 40;
    if (pref[d.id] !== t.fascia && t.fascia !== 'I') p -= 50;
    if (!serveResp && d.resp) p -= 3;                         // i responsabili servono dove manca un responsabile
    p += (d.abilita ?? []).filter(a => !abilitaPresenti.has(a)).length * 2;  // varietà di mansioni nel turno
    // Velocità: i lenti si distribuiscono tra i turni, i veloci vanno dove ci sono già lenti.
    const lenti = Object.entries(piano[g]).filter(([id, x]) => x.fascia === t.fascia &&
      dipendenti.find(z => z.id === id)?.velocita === 'lento').length;
    if (d.velocita === 'lento') p -= lenti * 6;
    if (d.velocita === 'veloce') p += lenti * 3;
    if (p > punti) { punti = p; meglio = d; }
  }
  return meglio;
}

/// Giorni di lavoro per contratto: 40 ore → 5, 30 → 4, 20 → da 3 a 4; chi ha solo turni fissi fa quelli.
export function giorniPrevisti(d) {
  if (d.soloFissi) { const n = d.fissi?.length ?? 0; return { min: n, max: n }; }
  const ore = d.ore ?? 40;
  if (ore >= 40) return { min: 5, max: 5 };
  if (ore >= 30) return { min: 4, max: 4 };
  if (ore >= 20) return { min: 3, max: 4 };
  const n = Math.max(1, Math.round(ore / 8)); return { min: n, max: n };
}

// Giorni in cui la persona è assente tutto il giorno (ferie, malattia, maternità, permesso intero).
const giorniAssente = (richieste, id) => new Set(richieste.filter(q => q.dip === id && q.da == null && q.tipo !== 'non disponibile').map(q => q.giorno)).size;

/// Prova ad accorciare il turno di una persona di al massimo `minuti`, rispettando apertura, chiusura e cambio turno.
/// Prima fa entrare più tardi; solo se non si può fa uscire prima.
export function accorcia(piano, dipendenti, g, id, r, minuti) {
  const t = piano[g][id];
  if (!t || t.fisso) return null;
  const passi = Math.floor(minuti / r.passo) * r.passo;
  if (passi <= 0) return null;
  for (const modo of ['tardi', 'prima']) {
    for (let m = passi; m >= r.passo; m -= r.passo) {
      const dopo = modo === 'tardi' ? { ...t, inizio: t.inizio + m } : { ...t, fine: t.fine - m };
      if (dopo.fine - dopo.inizio < r.durataMin) continue;
      const prova = { ...piano[g], [id]: dopo };
      if (!coperture(prova, dipendenti, r).ok) continue;
      const ore = orePagate(t, r) - orePagate(dopo, r);
      if (ore <= 0) continue;
      return { giorno: g, id, prima: t, dopo, ore, modo };
    }
  }
  return null;
}

/// Apertura, chiusura e cambio turno di un giorno.
export function coperture(giorno, dipendenti, r) {
  const turni = Object.entries(giorno);
  const apertura = turni.filter(([, t]) => t.inizio <= r.fasce.M.inizio).length;
  const chiusura = turni.filter(([, t]) => t.fine >= r.fasce.P.fine).length;
  const alCambio = turni.filter(([, t]) => t.inizio <= r.cambio.da && t.fine >= r.cambio.a);
  const respCambio = alCambio.some(([id]) => dipendenti.find(d => d.id === id)?.resp);
  return {
    apertura, chiusura, cambio: alCambio.length, respCambio,
    ok: apertura >= r.minApertura && chiusura >= r.minChiusura && alCambio.length >= r.cambio.min && respCambio,
  };
}

export function oreGiorno(giorno, r) {
  return Object.values(giorno).reduce((s, t) => s + orePagate(t, r), 0);
}

/// Dove togliere ore in un giorno che supera il monte ore: prima chi è oltre il contratto, poi l'intermedio, poi gli altri.
export function suggerimenti(piano, dipendenti, r, g) {
  let troppo = oreGiorno(piano[g], r) - r.monteOre[g];
  if (troppo <= 0.01) return [];
  const prova = piano.map(x => ({ ...x }));
  const proposte = [];
  const extra = id => oreSettimana(prova, id, r) - (dipendenti.find(d => d.id === id)?.ore ?? 40);
  const ordine = Object.keys(prova[g]).sort((a, b) =>
    extra(b) - extra(a) || (prova[g][a].fascia === 'I' ? -1 : 0) - (prova[g][b].fascia === 'I' ? -1 : 0));
  for (const id of ordine) {
    if (troppo <= 0.01) break;
    const s = accorcia(prova, dipendenti, g, id, r, Math.min(Math.ceil(troppo * 60 / r.passo - 1e-6) * r.passo, 240));
    if (!s) continue;
    prova[g][id] = s.dopo;
    troppo -= s.ore;
    proposte.push(s);
  }
  return proposte;
}

/// Tutti i controlli della settimana, da mostrare con ✔ o ✖.
export function verifica(piano, dipendenti, r, richieste = [], precedente = null) {
  const errori = [], mancano = [];
  const nome = id => dipendenti.find(d => d.id === id)?.nome ?? id;
  for (let g = 0; g < 7; g++) {
    const giorno = piano[g];
    for (const fascia of ['M', 'I', 'P']) {
      const c = contaFascia(giorno, fascia), serve = r.fabbisogno[g][fascia] ?? 0;
      if (c < serve) errori.push(`${GIORNI[g]}: ${FASCE[fascia].toLowerCase()} ${c} su ${serve}`);
      if (fascia !== 'I' && c > 0 && !Object.entries(giorno).some(([id, t]) => t.fascia === fascia && dipendenti.find(d => d.id === id)?.resp))
        errori.push(`${GIORNI[g]}: ${FASCE[fascia].toLowerCase()} senza responsabile`);
    }
    const cop = coperture(giorno, dipendenti, r);
    if (cop.apertura < r.minApertura) errori.push(`${GIORNI[g]}: solo ${cop.apertura} all'apertura`);
    if (cop.chiusura < r.minChiusura) errori.push(`${GIORNI[g]}: solo ${cop.chiusura} alla chiusura`);
    if (cop.cambio < r.cambio.min || !cop.respCambio) errori.push(`${GIORNI[g]}: cambio turno scoperto`);
    for (const [id, t] of Object.entries(giorno)) {
      if (indisponibile(richieste, id, g, t)) errori.push(`${GIORNI[g]}: ${nome(id)} ha una richiesta`);
      if (!rispettaStacco(piano, id, g, t, r, precedente)) errori.push(`${GIORNI[g]}: ${nome(id)} senza 11 ore di stacco`);
    }
  }
  for (const d of dipendenti) {
    const giorni = piano.filter(x => x[d.id]).length, p = giorniPrevisti(d);
    const min = Math.max(0, p.min - giorniAssente(richieste, d.id));
    if (giorni > r.maxGiorni) errori.push(`${d.nome}: ${giorni} giorni di lavoro`);
    else if (giorni > p.max) errori.push(`${d.nome}: ${giorni} giorni, il contratto ne prevede ${p.max}`);
    if (giorni < min) mancano.push({ id: d.id, nome: d.nome, giorni, previsti: min });
  }
  const sopraMonte = [0, 1, 2, 3, 4, 5, 6].filter(g => oreGiorno(piano[g], r) > r.monteOre[g] + 0.01);
  return { errori, sopraMonte, mancano };
}

/// Malattie e maternità (dal…al, date AAAA-MM-GG) diventano richieste per i giorni della settimana che inizia `lunedi`.
export function assenzeSettimana(assenze = [], lunedi) {
  const out = [];
  for (let g = 0; g < 7; g++) {
    const d = new Date(lunedi + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + g);
    const giorno = d.toISOString().slice(0, 10);
    for (const a of assenze) if (a.dal <= giorno && giorno <= a.al) out.push({ dip: a.dip, giorno: g, tipo: a.tipo });
  }
  return out;
}
