# Turnista: istruzioni per Claude

Web app (HTML + JavaScript, senza librerie) per creare i turni settimanali di un punto vendita Lidl di circa 25 dipendenti. L'utente non programma: rispondi in italiano, in breve, con anteprime delle schermate (iPhone con Dynamic Island) prima di ogni modifica, e parti solo quando scrive "parti". Dubbio = domanda prima di lavorare. Niente lavoro non richiesto.

- `motore.js`: il motore (genera, verifica, suggerimenti per il monte ore, accorcia, bilancio). Orari in minuti dalla mezzanotte.
- `index.html`: schermate Settimana, Dipendenti (con richieste), Regole (fabbisogno, monte ore, orari, minimi, copia dei dati).
- `test/motore.test.mjs`: prove (`npm test`). Ogni logica nuova va provata qui. La CI le esegue a ogni push; il sito (GitHub Pages) si pubblica da `main` solo se passano: https://kamizakinano.github.io/Turnista/
- Una copia privata gira anche come Artifact: https://claude.ai/artifact/MW1aJms1bMFd2wMZCewuhD (lì non funzionano confirm/alert/download: si usano le finestre `chiedi`/`avvisa` già nel codice).

## Regole dei turni (decise con l'utente)
- Turni fissi: mattina 05:00–13:30, intermedio 09:00–17:00, pomeriggio 13:00–21:30; massimo 8 ore pagate (30 min di pausa).
- Persone per fascia: 5 M + 1 I + 5 P; martedì 4 + 1 + 4; mercoledì e domenica 6 + 1 + 6.
- Almeno un responsabile per turno; al cambio turno 13:00–13:30 almeno 2 persone con un responsabile.
- Almeno 4 all'apertura (05:00) e 4 alla chiusura (21:30).
- Massimo 6 giorni di lavoro, 11 ore di stacco tra un turno e l'altro.
- Rotazione: chi fa la mattina una settimana fa il pomeriggio la successiva.
- Monte ore per giorno: se superato, prima si fa entrare più tardi (anche di pomeriggio), solo dopo uscire prima; orari a mezz'ore.
- Le richieste (ferie, permessi, non disponibile in un orario) escludono la persona e il sistema assegna altri.
- I dati dei colleghi restano solo nel browser dell'utente: il repository è pubblico, mai salvarci nomi veri.
