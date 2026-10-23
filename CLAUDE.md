# Turnista: istruzioni per Claude

Web app (HTML + JavaScript, senza librerie) per creare i turni settimanali di un punto vendita Lidl di circa 25 dipendenti. L'utente non programma: rispondi in italiano, in breve, con anteprime delle schermate (iPhone con Dynamic Island) prima di ogni modifica, e parti solo quando scrive "parti". Dubbio = domanda prima di lavorare. Niente lavoro non richiesto.

- `motore.js`: il motore (genera, verifica, suggerimenti per il monte ore, accorcia, bilancio). Orari in minuti dalla mezzanotte.
- `index.html`: schermate Settimana, Dipendenti (con richieste), Regole (fabbisogno, monte ore, orari, minimi, copia dei dati).
- `test/motore.test.mjs`: prove (`npm test`). Ogni logica nuova va provata qui. La CI le esegue a ogni push, solo come controllo.
- Il sito è GitHub Pages da ramo (`main`, cartella principale), come il progetto Vendite: ogni push su `main` si pubblica in 1–2 minuti. https://kamizakinano.github.io/Turnista/

## Regole dei turni (decise con l'utente)
- Turni fissi: mattina 05:00–13:30, intermedio 09:00–17:00, pomeriggio 13:00–21:30; pausa non pagata di 10 minuti (M e P = 8 h 20 pagate, I = 7 h 50): non è straordinario.
- Persone per fascia: le decide l'utente in Regole e sono legge (esattamente quelle, mai di più).
- In ogni turno (M e P) un responsabile (CM) dall'inizio alla fine: mai accorciato. Il capo filiale (CF) fa sempre 08:00–16:00, in più rispetto alle persone per fascia, e non conta come responsabile del turno.
- Almeno un responsabile per turno; al cambio turno 13:00–13:30 almeno 2 persone con un responsabile.
- Almeno 4 all'apertura (05:00) e 4 alla chiusura (21:30).
- Massimo 6 giorni di lavoro, 11 ore di stacco tra un turno e l'altro.
- Rotazione: ognuno fa tutta la settimana in una squadra (mattina o pomeriggio), la settimana dopo cambia; le squadre si equilibrano per giorni e responsabili.
- Giorni per contratto: 40 h → 5, 30 h → 4, 20 h → 3–4, turno fisso (es. 8 h solo domenica 06:00–14:10). Mai di più; se i posti non bastano si fanno meno giorni, divisi in proporzione.
- Orari dei turni = finestra. Monte ore per giorno: se superato, il sistema accorcia da solo (opzione in Regole): prima si fa entrare più tardi (anche di pomeriggio), solo dopo uscire prima; orari a mezz'ore, turno minimo in Regole, turni fissi intoccabili.
- Attività per giorno e fascia (in Regole): in ogni turno ci dev'essere chi sa farle; una persona per attività, la stessa può farne più d'una. Occasioni/food = Food, Bake = pane, responsabile = CM, Carne = chiunque. Le squadre si equilibrano anche per competenze.
- Agenda (motore `agendaTurno`): ognuno fa un'attività alla volta. La cassa non blocca: è un ruolo "quando arrivano clienti" dato a chi fa anche altro (cassa 2 e 3 anche a chi fa il bake, mai a chi fa promo). Casse 08:00–13:00 e 13:00–21:00 (domenica 08:30–20:30), a tutti tranne GA e capo filiale; sempre aperte cassa automatica (addetto, mai responsabile né bake), cassa 1 e cassa 2 (addetto; se manca, un responsabile libero in quell'orario); cassa 3 se resta qualcuno; chi resta senza mansione fa supporto cassa; chi fa il bake al massimo cassa 3; promo solo chi non è responsabile; cassa 2 e 3 se non c'è nessuno restano chiuse. All'arrivo prima frutta, bake, carne e commi (carne e frutta entro l'apertura); tutto il resto dopo: testate (circa 3 h, solo a un responsabile che le sa fare), occasioni, food; frutta la sanno tutti i responsabili. Commi dall'arrivo, circa 5 h 30. Bake dall'arrivo a fine turno, a un addetto (il responsabile che lo sa fare è il referente). Food circa 3 h; surge/fresche occasioni a un responsabile. Promo (mer e dom pomeriggio) solo quella per tutto il turno, mai accorciato.
- Responsabili: si mettono per primi (uno per M e P tutti i giorni, poi l'intermedio, poi il secondo). L'intermedio del martedì è un responsabile (fa le surge). Allegato bianco solo il mercoledì, da un responsabile con la competenza "Allegato bianco" (non Ahlem né Giacomo). Testate e occasioni: mercoledì mattina e domenica (fresche anche mercoledì pomeriggio), in quei turni 2 responsabili di cui uno sa fare le testate; le testate del lunedì sono solo di riserva. Il secondo responsabile mancante è un avviso, non un errore. I turni si riempiono a giro (uno per turno alla volta) così le mancanze si dividono.
- Accorciare: mai chi fa bake, commi, promo o attività dall'arrivo; di mattina si entra al più tardi all'apertura casse.
- Dopo la generazione: elenco "Ore mancanti" di chi resta sotto contratto.
- Versioni: ogni push su `main` che cambia l'app aggiunge in cima a `VERSIONI` (index.html) il numero successivo (0.01, 0.02, …) con data e cosa cambia; l'utente le vede in fondo a Regole.
- Le anteprime per l'utente sono foto vere dell'app (copia di prova) in cornice iPhone, non disegni.
- Le richieste (ferie, permessi, non disponibile in un orario) escludono la persona e il sistema assegna altri.
- I dati dei colleghi restano solo nel browser dell'utente: il repository è pubblico, mai salvarci nomi veri.
