// Turnista: il "motore" che crea i turni della settimana e controlla le regole.
// Orari in minuti dalla mezzanotte (05:00 = 300, 21:30 = 1290).

export const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
export const FASCE = { M: 'Mattina', I: 'Intermedio', P: 'Pomeriggio', C: 'Capo' };

export function regoleBase() {
  return {
    fasce: { M: { inizio: 300, fine: 810 }, I: { inizio: 540, fine: 1020 }, P: { inizio: 780, fine: 1290 }, C: { inizio: 480, fine: 960 } },
    pausa: 10, pausaSopra: 360,          // 10 min di pausa non pagata nei turni più lunghi di 6 ore
    fabbisogno: [
      { M: 5, I: 1, P: 5 }, { M: 4, I: 1, P: 4 }, { M: 6, I: 1, P: 6 }, { M: 5, I: 1, P: 5 },
      { M: 5, I: 1, P: 5 }, { M: 5, I: 1, P: 5 }, { M: 6, I: 1, P: 6 },
    ],
    monteOre: [90, 72, 96, 90, 90, 90, 96],
    minApertura: 4, minChiusura: 4,
    cambio: { da: 780, a: 810, min: 2 },  // al cambio turno almeno 2 persone, con un responsabile
    maxGiorni: 6, stacco: 660, durataMin: 240, passo: 30,
    accorciaDaSolo: true,
    attivita: [{"M": ["Commissionamento", "Frutta", "Bake", "Carne", "Cassa", "Attività da responsabile", "Testate"], "P": ["Commissionamento", "Cassa", "Attività da responsabile", "Bake"], "I": []}, {"M": ["Commissionamento", "Frutta", "Bake", "Carne", "Cassa", "Attività da responsabile"], "P": ["Commissionamento", "Cassa", "Attività da responsabile", "Bake"], "I": ["Surge occasioni", "Allegato bianco responsabile"]}, {"M": ["Commissionamento", "Frutta", "Bake", "Carne", "Cassa", "Attività da responsabile", "Testate", "Allegato bianco responsabile", "Food"], "P": ["Commissionamento", "Cassa", "Attività da responsabile", "Bake", "Promo", "Fresche occasioni"], "I": []}, {"M": ["Commissionamento", "Frutta", "Bake", "Carne", "Cassa", "Attività da responsabile"], "P": ["Commissionamento", "Cassa", "Attività da responsabile", "Bake"], "I": []}, {"M": ["Commissionamento", "Frutta", "Bake", "Carne", "Cassa", "Attività da responsabile"], "P": ["Commissionamento", "Cassa", "Attività da responsabile", "Bake"], "I": ["Allegato bianco responsabile"]}, {"M": ["Commissionamento", "Frutta", "Bake", "Carne", "Cassa", "Attività da responsabile", "Sconto food"], "P": ["Commissionamento", "Cassa", "Attività da responsabile", "Bake"], "I": ["Allegato bianco responsabile"]}, {"M": ["Commissionamento", "Frutta", "Bake", "Carne", "Cassa", "Attività da responsabile", "Testate", "Surge occasioni"], "P": ["Commissionamento", "Cassa", "Attività da responsabile", "Bake", "Promo", "Fresche occasioni"], "I": ["Allegato bianco responsabile"]}],               // dentro la fascia: si entra più tardi o si esce prima per stare nel monte ore
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
  const persone = dipendenti.filter(d => !d.soloFissi && !eCapo(d));
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
  // Ogni squadra deve avere chi sa fare le sue attività per tutti i giorni in cui servono:
  // si scambia una persona che sa farla con una dell'altra squadra con giorni simili.
  for (let giro = 0; giro < 3; giro++)
    for (const f of ['M', 'P'])
      for (const c of new Set([0, 1, 2, 3, 4, 5, 6].flatMap(g => serveAttivita(r, g, f)))) {
        if (c === 'resp') continue;
        const giorni = [0, 1, 2, 3, 4, 5, 6].filter(g => serveAttivita(r, g, f).includes(c)).length;
        const capC = x => persone.filter(d => pref[d.id] === x && sa(d, c)).reduce((s, d) => s + cap(d), 0);
        while (capC(f) < giorni + 2) {
          const o = altra(f);
          const viene = persone.filter(d => pref[d.id] === o && sa(d, c) && !d.resp && capC(o) - cap(d) >= [0, 1, 2, 3, 4, 5, 6].filter(g => serveAttivita(r, g, o).includes(c)).length + 2)
            .sort((a, b) => ruotato(a.id) - ruotato(b.id))[0];
          if (!viene) break;
          const va = persone.filter(d => pref[d.id] === f && !d.resp && !sa(d, c) && cap(d) === cap(viene))
            .sort((a, b) => (a.abilita?.length ?? 0) - (b.abilita?.length ?? 0))[0];
          pref[viene.id] = f;
          if (va) pref[va.id] = o;
        }
      }
  // Le testate le fa solo un responsabile che le sa fare: la squadra che le ha deve averne almeno uno
  // (si scambia con un responsabile dell'altra squadra che non le sa fare).
  for (const f of ['M', 'P']) {
    if (![0, 1, 2, 3, 4, 5, 6].some(g => g !== 0 && attivitaDi(r, g, f).some(n => /testate/i.test(n)))) continue;
    const sanno = x => persone.filter(d => d.resp && sa(d, 'testate') && pref[d.id] === x);
    if (sanno(f).length) continue;
    const viene = sanno(altra(f))[0], va = persone.find(d => d.resp && !sa(d, 'testate') && pref[d.id] === f);
    if (viene) { pref[viene.id] = f; if (va) pref[va.id] = altra(f); }
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

  // Il capo: i giorni del contratto, prima quelli con più persone, sempre 08:00–16:00.
  for (const d of dipendenti.filter(eCapo)) {
    const c = fasciaCapo(r);
    const giorni = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => totale(r.fabbisogno[b]) - totale(r.fabbisogno[a]) || a - b);
    for (const g of giorni) {
      if (giorniFatti[d.id] >= Math.min(r.maxGiorni, giorniPrevisti(d).max)) break;
      if (piano[g][d.id] || indisponibile(richieste, d.id, g, c)) continue;
      piano[g][d.id] = { fascia: 'C', inizio: c.inizio, fine: c.fine, fisso: true };
      giorniFatti[d.id]++;
    }
  }

  // Prima i giorni più pieni (mercoledì e domenica), poi gli altri.
  const ordine = [0, 1, 2, 3, 4, 5, 6].sort((a, b) => totale(r.fabbisogno[b]) - totale(r.fabbisogno[a]) || a - b);

  // Prima i responsabili, in quest'ordine: uno per mattina e pomeriggio di tutti i giorni, poi l'intermedio,
  // poi il secondo nei turni con testate o occasioni. Dopo tutti gli altri.
  for (const [fasce, quanti] of [[['M', 'P'], () => 1], [['I'], (g, f) => respNecessari(r, g, f)], [['M', 'P'], (g, f) => respNecessari(r, g, f)]])
    for (const g of ordine)
      for (const fascia of fasce) {
        const resp = () => Object.entries(piano[g]).filter(([id, x]) => x.fascia === fascia && dipendenti.find(d => d.id === id)?.resp).length;
        while (resp() < Math.min(quanti(g, fascia), r.fabbisogno[g][fascia] ?? 0) && contaFascia(piano[g], fascia) < (r.fabbisogno[g][fascia] ?? 0)) {
          const t = { fascia, inizio: r.fasce[fascia].inizio, fine: r.fasce[fascia].fine };
          const scelto = migliore(dipendenti, piano, g, t, r, richieste, precedente, pref, giorniFatti, fascia === 'I', true);
          if (!scelto) break;
          piano[g][scelto.id] = t;
          giorniFatti[scelto.id]++;
        }
      }
  // A giro: una persona per turno alla volta, così se le persone non bastano la mancanza si divide tra i giorni.
  for (let passo = 0; passo < 2; passo++) {           // al secondo giro si può uscire dalla propria squadra
    for (let aggiunto = true; aggiunto;) {
      aggiunto = false;
      for (const g of ordine) {
      for (const fascia of ['M', 'P', 'I']) {
        const serve = r.fabbisogno[g][fascia] ?? 0;
        if (contaFascia(piano[g], fascia) < serve) {
          const t = { fascia, inizio: r.fasce[fascia].inizio, fine: r.fasce[fascia].fine };
          const serveResp = Object.entries(piano[g]).filter(([id, x]) =>
            x.fascia === fascia && dipendenti.find(d => d.id === id)?.resp).length < respNecessari(r, g, fascia);
          const scelto = migliore(dipendenti, piano, g, t, r, richieste, precedente, pref, giorniFatti, passo === 1, serveResp)
            ?? (serveResp ? migliore(dipendenti, piano, g, t, r, richieste, precedente, pref, giorniFatti, passo === 1, false) : null);
          if (!scelto) continue;
          piano[g][scelto.id] = t;
          giorniFatti[scelto.id]++;
          aggiunto = true;
        }
      }
      }
    }
  }
  for (let g = 0; g < 7; g++)
    for (const fascia of ['M', 'I', 'P']) {
      const manca = (r.fabbisogno[g][fascia] ?? 0) - contaFascia(piano[g], fascia);
      if (manca > 0) scoperti.push({ giorno: g, fascia, manca });
    }
  // Attività: se in un turno nessuno sa fare un'attività, si scambia una persona con chi la sa fare.
  for (let g = 0; g < 7; g++)
    for (const f of ['M', 'P'])
      for (const c of mancaCompetenza(piano, dipendenti, r, g, f)) {
        if (c === 'resp') continue;
        const t = { fascia: f, inizio: r.fasce[f].inizio, fine: r.fasce[f].fine };
        const entra = dipendenti.filter(d => !piano[g][d.id] && !d.soloFissi && !eCapo(d) && sa(d, c) &&
          giorniFatti[d.id] < Math.min(r.maxGiorni, giorniPrevisti(d).max) && !indisponibile(richieste, d.id, g, t) &&
          rispettaStacco(piano, d.id, g, t, r, precedente)).sort((a, b) => (pref[b.id] === f) - (pref[a.id] === f))[0];
        const prima = mancaCompetenza(piano, dipendenti, r, g, f).length;
        if (!entra) { scambiaGiorni(piano, dipendenti, r, richieste, precedente, g, f, c, prima); continue; }
        const esce = Object.entries(piano[g]).filter(([id, x]) => x.fascia === f && !x.fisso).map(([id]) => id).find(id => {
          const tolto = piano[g][id]; delete piano[g][id]; piano[g][entra.id] = t;
          const ok = mancaCompetenza(piano, dipendenti, r, g, f).length < prima && coperture(piano[g], dipendenti, r).respTurno[f];
          delete piano[g][entra.id]; piano[g][id] = tolto; return ok;
        });
        if (!esce) continue;
        delete piano[g][esce]; giorniFatti[esce]--;
        piano[g][entra.id] = t; giorniFatti[entra.id]++;
      }
  // Chi fa la promo (circa 8 ore, solo quella) non si accorcia: si sceglie prima dei tagli.
  for (let g = 0; g < 7; g++)
    for (const f of ['M', 'P'])
      if ((r.attivita?.[g]?.[f] ?? []).some(n => /promo/i.test(n))) {
        const chi = Object.entries(piano[g]).filter(([id, t]) => t.fascia === f && !t.fisso && sa(dipendenti.find(d => d.id === id), 'promo') &&
          !dipendenti.find(d => d.id === id).resp).sort(([a], [b]) => dipendenti.find(d => d.id === a).abilita.length - dipendenti.find(d => d.id === b).abilita.length)[0];
        if (chi) chi[1].promo = true;
      }
  // Chi fa bake, commi o le attività dall'arrivo non si accorcia: si accorcia chi va in cassa.
  const protetti = [];
  for (let g = 0; g < 7; g++)
    for (const f of ['M', 'I', 'P'])
      for (const [id, l] of Object.entries(agendaTurno(piano, dipendenti, r, g, f).agenda))
        if (l.some(x => !x.cassa && x.da === piano[g][id].inizio && competenzaDi(x.attivita) !== 'resp')) { piano[g][id].protetto = true; protetti.push(piano[g][id]); }
  if (r.accorciaDaSolo !== false)
    for (let g = 0; g < 7; g++)
      for (let giro = 0; giro < 20; giro++) {
        const s = suggerimenti(piano, dipendenti, r, g);
        if (!s.length) break;
        for (const x of s) piano[g][x.id] = x.dopo;
      }
  // Il segno resta: anche i suggerimenti di dopo ("Applica") non accorciano chi inizia all'arrivo.
  return { piano, scoperti };
}

// Chi sa fare l'attività c lavora nella stessa fascia un altro giorno h: si scambia il giorno con qualcuno del turno g.
function scambiaGiorni(piano, dipendenti, r, richieste, precedente, g, f, c, prima) {
  const dDi = id => dipendenti.find(d => d.id === id);
  const t = { fascia: f, inizio: r.fasce[f].inizio, fine: r.fasce[f].fine };
  const puo = (id, giorno) => !indisponibile(richieste, id, giorno, t) && rispettaStacco(piano, id, giorno, t, r, precedente);
  for (let h = 0; h < 7; h++) {
    if (h === g) continue;
    for (const [x, tx] of Object.entries(piano[h])) {
      if (tx.fascia !== f || tx.fisso || piano[g][x] || !sa(dDi(x), c)) continue;
      for (const [y, ty] of Object.entries(piano[g])) {
        if (ty.fascia !== f || ty.fisso || piano[h][y]) continue;
        delete piano[h][x]; delete piano[g][y];
        const ok = puo(x, g) && puo(y, h);
        piano[g][x] = { ...t }; piano[h][y] = { ...t };
        if (ok && rispettaStacco(piano, x, g, t, r, precedente) && rispettaStacco(piano, y, h, t, r, precedente) &&
            mancaCompetenza(piano, dipendenti, r, g, f).length < prima &&
            mancaCompetenza(piano, dipendenti, r, h, f).length <= mancaCompetenza({ ...piano, [h]: { ...piano[h], [x]: tx } }, dipendenti, r, h, f).length &&
            coperture(piano[g], dipendenti, r).respTurno[f] && coperture(piano[h], dipendenti, r).respTurno[f]) return true;
        delete piano[g][x]; delete piano[h][y]; piano[h][x] = tx; piano[g][y] = ty;
      }
    }
  }
  return false;
}

// La fascia più vicina all'orario di un turno fisso.
const fasciaDi = (t, r) => ['M', 'I', 'P'].reduce((a, k) => Math.abs(r.fasce[k].inizio - t.inizio) < Math.abs(r.fasce[a].inizio - t.inizio) ? k : a, 'M');

// Il capo filiale (sigla CF) fa sempre 08:00–16:00, in più rispetto alle persone per fascia.
export const eCapo = d => String(d.ruolo ?? '').toUpperCase() === 'CF';
const fasciaCapo = r => r.fasce.C ?? { inizio: 480, fine: 960 };

/// La competenza che serve per un'attività: 'resp' = un responsabile, null = la può fare chiunque.
export function competenzaDi(attivita) {
  const a = attivita.toLowerCase();
  // Testate e occasioni (surge, fresche) le fa solo un responsabile.
  if (a.includes('responsabile') || a.includes('occasioni')) return 'resp';
  if (a.includes('food')) return 'food';
  if (a.includes('bake') || a.includes('pane')) return 'pane';
  if (a.includes('carne')) return null;
  if (/^cassa( automatica| \d)?$/.test(a.trim())) return /cassa 3/.test(a) ? 'resp' : 'cassa';
  return a.trim();
}
const eAV = d => String(d.ruolo ?? '').toUpperCase() === 'AV';
// La cassa la fanno tutti tranne il garzone (GA), anche se non è segnata tra le competenze.
// I responsabili sanno fare tutti la frutta.
/// Le attività di un giorno e fascia (se nelle regole salvate manca l'intermedio, si usano quelle di partenza).
export const attivitaDi = (r, g, f) => r.attivita?.[g]?.[f] ?? regoleBase().attivita[g]?.[f] ?? [];
/// Quanti responsabili servono: l'intermedio è sempre un responsabile; 2 nei turni con testate o occasioni
/// (le testate del lunedì sono solo di riserva, se non fatte domenica).
export function respNecessari(r, g, f) {
  if (f === 'I') return r.fabbisogno[g]?.I ?? 0;
  return attivitaDi(r, g, f).some(n => /occasioni/i.test(n) || (/testate/i.test(n) && g !== 0)) ? 2 : 1;
}
const sa = (d, c) => c == null || (c === 'resp' ? !!d.resp : c === 'cassa' ? !['GA', 'CF'].includes(String(d.ruolo ?? '').toUpperCase())
  : (c === 'frutta' && d.resp) || (d.abilita ?? []).some(x => x.toLowerCase() === c));
const serveAttivita = (r, g, f) => [...new Set(attivitaDi(r, g, f).map(competenzaDi).filter(c => c != null))];
const mancaCompetenza = (piano, dipendenti, r, g, f) => serveAttivita(r, g, f).filter(c =>
  !Object.entries(piano[g]).some(([id, t]) => t.fascia === f && sa(dipendenti.find(d => d.id === id) ?? {}, c)));

// Durate e orari delle attività (minuti). Ognuno fa un'attività alla volta, poi passa alla successiva.
const DURATA_COMMI = 330;      // all'arrivo, finché non è finito: circa fino alle 10:30 se si entra alle 5
const DURATA_FOOD = 180;       // food / occasioni / sconto food: circa 3 ore
const PRIMA_APERTURA = ['carne', 'frutta', 'testate'];  // carne e frutta all'arrivo, entro l'apertura
const DURATA_TESTATE = 180;    // testate: dopo le attività dell'arrivo, circa 3 ore
const aperturaCasse = g => g === 6 ? 510 : 480;         // 08:00, domenica 08:30
const chiusuraCasse = g => g === 6 ? 1230 : 1260;       // 21:00, domenica 20:30

/// Agenda del turno: per ogni persona le attività in ordine di orario; `mancano` = attività che nessuno può fare.
export function agendaTurno(piano, dipendenti, r, g, f) {
  const presenti = Object.entries(piano[g]).filter(([, t]) => t.fascia === f).map(([id]) => dipendenti.find(d => d.id === id)).filter(Boolean);
  const turno = id => piano[g][id];
  const agenda = Object.fromEntries(presenti.map(d => [d.id, []]));
  const libero = (id, da, a) => da >= turno(id).inizio && a <= turno(id).fine && a > da && agenda[id].every(x => x.cassa || x.da == null || x.a <= da || x.da >= a);
  const metti = (id, attivita, da, a) => { agenda[id].push({ attivita, da, a }); agenda[id].sort((x, y) => x.da - y.da); };
  const mancano = [];
  const carico = id => agenda[id].length;
  const intero = d => turno(d.id).inizio <= r.fasce[f].inizio && turno(d.id).fine >= r.fasce[f].fine;
  const lista = attivitaDi(r, g, f);
  const prese = new Set();
  const ha = test => lista.filter(n => !prese.has(n) && test(n.toLowerCase()));
  const prova = (nome, candidati, finestra) => {
    for (const d of candidati) { const [da, a] = finestra(d); if (libero(d.id, da, a)) { metti(d.id, nome, da, a); return d; } }
    mancano.push(nome); return null;
  };
  // Quante delle altre attività del turno sa fare: chi ne sa fare meno va sulle attività lunghe.
  const servite = [...new Set(lista.map(competenzaDi).filter(c => c && c !== 'resp' && c !== 'cassa'))];
  const utile = d => servite.filter(c => sa(d, c)).length;
  const per = (arr, ...criteri) => [...arr].sort((a, b) => { for (const c of criteri) { const v = c(a) - c(b); if (v) return v; } return 0; });

  // 0. Mansioni scelte a mano nella vista del giorno: vengono prima di tutto, con il loro orario.
  for (const d of presenti) {
    const n = turno(d.id).mansione;
    if (!n || !lista.includes(n)) continue;
    const t = turno(d.id), a = n.toLowerCase(), c = competenzaDi(n);
    const fin = /promo/.test(a) || c === 'pane' ? [t.inizio, t.fine]
      : c === 'commissionamento' ? [t.inizio, Math.min(t.fine, t.inizio + DURATA_COMMI)]
      : PRIMA_APERTURA.some(x => a.includes(x)) ? [t.inizio, Math.min(t.fine, aperturaCasse(g))]
      : c === 'food' || a.includes('occasioni') ? [t.inizio, Math.min(t.fine, t.inizio + DURATA_FOOD)] : [null, null];
    metti(d.id, n, ...fin);
    prese.add(n);
  }
  // 1. Promo: una persona per tutto il turno, solo quello.
  for (const n of ha(a => a.includes('promo')))
    prova(n, per(presenti.filter(d => sa(d, 'promo') && !d.resp), d => +!turno(d.id).promo, utile, d => carico(d.id)), d => [turno(d.id).inizio, turno(d.id).fine]);
  // 2. Bake: dall'arrivo a fine turno.
  for (const n of ha(a => competenzaDi(a) === 'pane'))
    prova(n, per(presenti.filter(d => sa(d, 'pane') && !d.resp), utile, d => +eAV(d), d => carico(d.id)), d => [turno(d.id).inizio, turno(d.id).fine]);
  // 3. Commi: dall'arrivo finché non è finito (prima chi non serve in cassa).
  for (const n of ha(a => competenzaDi(a) === 'commissionamento'))
    prova(n, per(presenti.filter(d => sa(d, 'commissionamento') && !d.resp), utile, d => +eAV(d), d => carico(d.id)),
      d => [turno(d.id).inizio, Math.min(turno(d.id).fine, turno(d.id).inizio + DURATA_COMMI)]);
  const primoSpazio = (d, durata) => {
    const t = turno(d.id); let da = t.inizio;
    for (const x of agenda[d.id]) { if (x.da - da >= durata) break; da = Math.max(da, x.a); }
    return [da, Math.min(t.fine, da + durata)];
  };
  const spazioDi = durata => d => (([da, a]) => a - da >= durata ? [da, a] : [0, 0])(primoSpazio(d, durata));
  // 4. All'arrivo, insieme a bake e commi: carne e frutta (entro l'apertura). Prima gli addetti, poi un responsabile.
  for (const n of ha(a => PRIMA_APERTURA.some(x => a.includes(x)) && !a.includes('testate')))
    prova(n, per(presenti.filter(d => sa(d, competenzaDi(n))), d => +!!d.resp, d => carico(d.id)), d => [turno(d.id).inizio, aperturaCasse(g)]);
  // 5. Tutto il resto dopo: testate (un responsabile che le sa fare) e occasioni (un responsabile, circa 3 ore).
  const respInteri = () => presenti.filter(d => d.resp && intero(d));
  const facoltative = [];
  for (const n of ha(a => a.includes('testate'))) {
    const chi = prova(n, per(respInteri().filter(d => sa(d, 'testate')), d => primoSpazio(d, DURATA_TESTATE)[0], d => carico(d.id)), spazioDi(DURATA_TESTATE));
    // Il lunedì le testate sono di riserva: se nessuno è libero non è un errore.
    if (!chi && g === 0) { mancano.splice(mancano.indexOf(n), 1); facoltative.push(n); }
  }
  for (const n of ha(a => a.includes('occasioni')))
    prova(n, per(respInteri(), d => primoSpazio(d, DURATA_FOOD)[0], d => carico(d.id)), spazioDi(DURATA_FOOD));
  // 6. Food / occasioni: circa 3 ore, nel primo spazio libero.
  for (const n of ha(a => competenzaDi(a) === 'food'))
    prova(n, per(presenti.filter(d => sa(d, 'food')), d => primoSpazio(d, DURATA_FOOD)[0], d => +!!d.resp), spazioDi(DURATA_FOOD));
  // 7. Il resto (attività da responsabile, allegato bianco…): nel primo spazio libero, se no durante il turno.
  const fatte = new Set(Object.values(agenda).flat().map(x => x.attivita));
  for (const n of lista.filter(n => !fatte.has(n) && !mancano.includes(n) && !facoltative.includes(n) && competenzaDi(n) !== 'cassa')) {
    const c = competenzaDi(n);
    const chi = per(presenti.filter(d => sa(d, c) && (c !== 'resp' || intero(d))), d => carico(d.id))[0];
    if (!chi) { mancano.push(n); continue; }
    // Il primo buco libero di almeno mezz'ora, fino all'attività successiva.
    const t = turno(chi.id); let da = t.inizio, a = null;
    for (const x of [...agenda[chi.id], { da: t.fine, a: t.fine }]) { if (x.da - da >= 30) { a = x.da; break; } da = Math.max(da, x.a); }
    metti(chi.id, n, a == null ? null : da, a);
  }
  // Casse: non bloccano nessuno. Chi è di cassa fa le sue attività e va in cassa quando arrivano i clienti.
  // Cassa automatica e 1 agli addetti (il responsabile solo come ultima spiaggia); cassa 2 e 3 agli addetti,
  // anche a chi fa il bake; mai a chi fa promo. Se non c'è nessuno, cassa 2 e 3 restano chiuse.
  const chiuse = [];
  if (ha(a => competenzaDi(a) === 'cassa').length) {
    const [da, a] = f === 'M' ? [aperturaCasse(g), r.cambio.da] : [r.fasce.P.inizio, chiusuraCasse(g)];
    const finestra = d => [Math.max(da, turno(d.id).inizio), Math.min(a, turno(d.id).fine)];
    const fa = (d, re) => agenda[d.id].some(y => re.test(y.attivita));
    const giaCassa = new Set();
    const candidati = (conBake, conResp) => per(presenti.filter(d => sa(d, 'cassa') && !giaCassa.has(d.id) && !fa(d, /promo/i) &&
      (conBake || !fa(d, /^bake$/i)) && (conResp || !d.resp) && finestra(d)[1] - finestra(d)[0] >= 60),
      d => +!!d.resp, d => +fa(d, /^bake$/i), d => carico(d.id), d => finestra(d)[0]);
    for (const n of ['Cassa automatica', 'Cassa 1', 'Cassa 2', 'Cassa 3']) {
      const base = n === 'Cassa automatica' || n === 'Cassa 1';
      const chi = candidati(!base, false)[0] ?? (base ? candidati(false, true)[0] : null);
      if (!chi) { (base ? mancano : chiuse).push(n); continue; }
      giaCassa.add(chi.id);
      const [x, y] = finestra(chi);
      agenda[chi.id].push({ attivita: n, da: x, a: y, cassa: true });
    }
  }
  // Il responsabile che sa fare il bake non lo fa, ma ne è il referente.
  if (ha(a => competenzaDi(a) === 'pane').length) {
    const ref = per(presenti.filter(d => d.resp && sa(d, 'pane')), d => carico(d.id))[0];
    if (ref) metti(ref.id, 'Referente bake', null, null);
  }
  for (const id in agenda) agenda[id].sort((x, y) => (x.da ?? 9999) - (y.da ?? 9999));
  return { agenda, mancano, chiuse, facoltative };
}

/// Chi fa ogni attività del turno (con l'orario, se ce l'ha).
export function assegnaAttivita(piano, dipendenti, r, g, f) {
  const { agenda, mancano } = agendaTurno(piano, dipendenti, r, g, f);
  return [...Object.entries(agenda).flatMap(([id, l]) => l.map(x => ({ ...x, id }))), ...mancano.map(attivita => ({ attivita, id: null }))];
}

const totale = f => (f.M ?? 0) + (f.I ?? 0) + (f.P ?? 0);
const contaFascia = (giorno, fascia) => Object.values(giorno).filter(t => t.fascia === fascia).length;

function migliore(dipendenti, piano, g, t, r, richieste, precedente, pref, giorniFatti, fuoriSquadra, serveResp) {
  let meglio = null, punti = -Infinity;
  const abilitaPresenti = new Set(Object.entries(piano[g]).filter(([, x]) => x.fascia === t.fascia)
    .flatMap(([id]) => dipendenti.find(d => d.id === id)?.abilita ?? []));
  for (const d of dipendenti) {
    if (piano[g][d.id] || d.soloFissi || eCapo(d)) continue;
    if (serveResp && !d.resp) continue;
    if (!fuoriSquadra && t.fascia !== 'I' && pref[d.id] !== t.fascia) continue;
    if (indisponibile(richieste, d.id, g, t)) continue;
    const previsti = giorniPrevisti(d);
    if (giorniFatti[d.id] >= Math.min(r.maxGiorni, previsti.max)) continue;
    if (!rispettaStacco(piano, d.id, g, t, r, precedente)) continue;
    // Un secondo responsabile nello stesso turno solo se ai responsabili della squadra restano
    // abbastanza giorni per i turni che non hanno ancora un responsabile.
    if (!serveResp && d.resp && t.fascia !== 'I') {
      const squadra = dipendenti.filter(x => x.resp && !eCapo(x) && pref[x.id] === t.fascia);
      const restano = squadra.reduce((s, x) => s + Math.max(0, Math.min(r.maxGiorni, giorniPrevisti(x).max, 7 - giorniAssente(richieste, x.id)) - giorniFatti[x.id]), 0);
      const servono = [0, 1, 2, 3, 4, 5, 6].filter(h => h !== g && (r.fabbisogno[h][t.fascia] ?? 0) > 0 &&
        !Object.entries(piano[h]).some(([id, x]) => x.fascia === t.fascia && dipendenti.find(z => z.id === id)?.resp)).length;
      if (restano - 1 < servono) continue;
    }
    // Prima chi è più indietro rispetto ai giorni del suo contratto: i giorni si dividono in proporzione.
    let p = -giorniFatti[d.id] / Math.max(1, previsti.min) * 40;
    if (pref[d.id] !== t.fascia && t.fascia !== 'I') p -= 50;
    if (!serveResp && d.resp) p -= 3;                         // i responsabili servono dove manca un responsabile
    // Nei turni con le testate, almeno un responsabile che le sa fare.
    if (serveResp && d.resp && attivitaDi(r, g, t.fascia).some(n => /testate/i.test(n)) && sa(d, 'testate') &&
        !Object.entries(piano[g]).some(([id, x]) => x.fascia === t.fascia && sa(dipendenti.find(z => z.id === id) ?? {}, 'testate') && dipendenti.find(z => z.id === id)?.resp)) p += 30;
    p += (d.abilita ?? []).filter(a => !abilitaPresenti.has(a)).length * 2;  // varietà di mansioni nel turno
    if (t.fascia !== 'I') p += mancaCompetenza(piano, dipendenti, r, g, t.fascia).filter(c => c !== 'resp' && sa(d, c)).length * 30;  // attività del turno
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
  if (!t || t.fisso || t.promo || t.protetto) return null;
  // Il responsabile dell'intermedio (allegato bianco, occasioni) non si accorcia.
  if (t.fascia === 'I' && dipendenti.find(d => d.id === id)?.resp) return null;
  // Nei turni con testate o occasioni (2 responsabili) i responsabili non si accorciano.
  if (respNecessari(r, g, t.fascia) >= 2 && dipendenti.find(d => d.id === id)?.resp) return null;
  const passi = Math.floor(minuti / r.passo) * r.passo;
  if (passi <= 0) return null;
  for (const modo of ['tardi', 'prima']) {
    for (let m = passi; m >= r.passo; m -= r.passo) {
      const dopo = modo === 'tardi' ? { ...t, inizio: t.inizio + m } : { ...t, fine: t.fine - m };
      // Di mattina si entra al più tardi all'apertura delle casse (08:00, domenica 08:30).
      if (modo === 'tardi' && t.fascia === 'M' && dopo.inizio > aperturaCasse(g)) continue;
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
  // In ogni turno (mattina e pomeriggio) un responsabile dall'inizio alla fine; il capo non conta.
  const respTurno = Object.fromEntries(['M', 'P'].map(f => [f, !turni.some(([, t]) => t.fascia === f) || turni.some(([id, t]) =>
    t.fascia === f && t.inizio <= r.fasce[f].inizio && t.fine >= r.fasce[f].fine && dipendenti.find(d => d.id === id)?.resp)]));
  return {
    apertura, chiusura, cambio: alCambio.length, respCambio, respTurno,
    ok: apertura >= r.minApertura && chiusura >= r.minChiusura && alCambio.length >= r.cambio.min && respCambio && respTurno.M && respTurno.P,
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
  const errori = [], mancano = [], avvisi = [];
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
    for (const f of ['M', 'P']) for (const c of mancaCompetenza(piano, dipendenti, r, g, f).filter(c => c !== 'resp'))
      errori.push(`${GIORNI[g]}: ${FASCE[f].toLowerCase()} senza nessuno che sa fare ${c}`);
    for (const f of ['M', 'I', 'P']) {
      const n = Object.entries(giorno).filter(([id, t]) => t.fascia === f && dipendenti.find(d => d.id === id)?.resp).length;
      if (Object.values(giorno).some(t => t.fascia === f) && n < respNecessari(r, g, f))
        (n === 0 && f !== 'I' ? errori : avvisi).push(`${GIORNI[g]}: ${FASCE[f].toLowerCase()} con ${n} responsabil${n === 1 ? 'e' : 'i'}, ne servono ${respNecessari(r, g, f)}`);
    }
    for (const f of ['M', 'P']) if (!cop.respTurno[f]) errori.push(`${GIORNI[g]}: ${FASCE[f].toLowerCase()} senza responsabile per tutto il turno`);
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
  return { errori, sopraMonte, mancano, avvisi };
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

/// Chi resta sotto le ore del contratto (le assenze di un giorno intero tolgono la loro parte di contratto).
export function oreMancanti(piano, dipendenti, r, richieste = []) {
  return dipendenti.map(d => {
    const previsti = Math.max(1, giorniPrevisti(d).min);
    const contratto = (d.ore ?? 40) * Math.max(0, 1 - giorniAssente(richieste, d.id) / previsti);
    const fatte = oreSettimana(piano, d.id, r);
    return { id: d.id, nome: d.nome, contratto, fatte, manca: contratto - fatte };
  }).filter(x => x.manca > 0.01).sort((a, b) => b.manca - a.manca);
}
