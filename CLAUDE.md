# Turnista: istruzioni per Claude

Web app (HTML + JavaScript, senza librerie) per creare i turni settimanali di un punto vendita Lidl di circa 25 dipendenti. L'utente non programma: rispondi in italiano, in breve, con anteprime delle schermate (iPhone con Dynamic Island) prima di ogni modifica, e parti solo quando scrive "parti". Dubbio = domanda prima di lavorare. Niente lavoro non richiesto.

- `motore.js`: il motore (genera, verifica, suggerimenti per il monte ore, accorcia, bilancio). Orari in minuti dalla mezzanotte.
- `index.html`: schermate Settimana, Dipendenti (con richieste), Regole (fabbisogno, monte ore, orari, minimi, copia dei dati).
- `test/motore.test.mjs`: prove (`npm test`). Ogni logica nuova va provata qui. La CI le esegue a ogni push, solo come controllo.
- Il sito è GitHub Pages da ramo (`main`, cartella principale), come il progetto Vendite: ogni push su `main` si pubblica in 1–2 minuti. https://kamizakinano.github.io/Turnista/

## Regole dei turni (decise con l'utente)
- Turni fissi: mattina 05:00–13:30, intermedio 09:00–17:00, pomeriggio 13:00–21:30; pausa non pagata di 10 minuti (M e P = 8 h 20 pagate, I = 7 h 50): non è straordinario.
- Persone per fascia: le decide l'utente in Regole e sono legge (esattamente quelle, mai di più).
- Almeno un responsabile per turno; al cambio turno 13:00–13:30 almeno 2 persone con un responsabile.
- Almeno 4 all'apertura (05:00) e 4 alla chiusura (21:30).
- Massimo 6 giorni di lavoro, 11 ore di stacco tra un turno e l'altro.
- Rotazione: ognuno fa tutta la settimana in una squadra (mattina o pomeriggio), la settimana dopo cambia; le squadre si equilibrano per giorni e responsabili.
- Giorni per contratto: 40 h → 5, 30 h → 4, 20 h → 3–4, turno fisso (es. 8 h solo domenica 06:00–14:10). Mai di più; se i posti non bastano si fanno meno giorni, divisi in proporzione.
- Orari dei turni = finestra. Monte ore per giorno: se superato, il sistema accorcia da solo (opzione in Regole): prima si fa entrare più tardi (anche di pomeriggio), solo dopo uscire prima; orari a mezz'ore, turno minimo in Regole, turni fissi intoccabili.
- Le richieste (ferie, permessi, non disponibile in un orario) escludono la persona e il sistema assegna altri.
- I dati dei colleghi restano solo nel browser dell'utente: il repository è pubblico, mai salvarci nomi veri.
