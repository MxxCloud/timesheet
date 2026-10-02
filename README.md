# Timesheet

Registro delle presenze e delle attività di ogni giorno, con il foglio Excel del
mese pronto da inviare. È una app web installabile che funziona anche senza rete.
Non ha server né dipendenze da installare: è HTML, CSS e JavaScript, e i dati
restano nel PC di chi la usa.

Sostituisce i file Excel compilati a mano, uno per dipendente. Ognuno registra
la propria giornata dal proprio PC; a fine mese esporta il suo file e lo manda
all'amministrazione, che può rileggere i file di tutti e farne un riepilogo.

## Per i dipendenti

**Prima volta.**
1. Apri la app e inserisci nome, cognome ed eventuale matricola. Le ore previste
   per giorno servono solo per le assenze a giornata intera e per segnalare i
   giorni lasciati vuoti.
2. In *Impostazioni → Configurazione dell'ufficio* importa il file
   `configurazione-ufficio.json` che ti ha mandato l'amministrazione: contiene
   attività, codici di assenza, azienda e patrono.
3. Con *Installa* la app compare fra i programmi del PC e si apre in una
   finestra sua.

**Ogni giorno.** In *Oggi* il pulsante **Entra** registra l'ora di ingresso e
diventa **Esci**. Per la pausa pranzo si esce e si rientra: la pausa è il buco
fra i due intervalli. Due tocchi nello stesso minuto si annullano. Sotto, nella
giornata, si ripartiscono le ore sulle attività: *Assegna il resto* mette su
un'attività le ore non ancora ripartite. Nella stessa scheda si aggiungono le
assenze, lo straordinario (ore e nota, annotato a mano: la app non lo calcola)
e le note. Gli orari si possono anche scrivere o correggere a mano.

**A fine mese.** In *Mese* si controllano i giorni segnati come «Da
completare», «Da ripartire» o «Manca l'uscita». Poi *Esporta l'Excel del mese*
scarica `Cognome_Nome_AAAA-MM.xlsx`, da mandare all'amministrazione. Se dopo
l'esportazione si modifica una giornata, la app lo segnala: va esportato e
mandato di nuovo.

## Per l'amministrazione

In *Impostazioni → Amministrazione* si attiva la sezione **Ufficio**.

- **Configurazione per i dipendenti.** Azienda, patrono, attività e codici di
  assenza si preparano in *Impostazioni → Configurazione dell'ufficio*. Da
  *Ufficio* si scarica il file da mandare a tutti, così ognuno usa gli stessi
  nomi. Quando cambia qualcosa, per esempio una commessa nuova, si rimanda il
  file. Le attività già usate da un dipendente non spariscono: restano,
  disattivate.
- **Riepilogo del mese.** Si importano i file Excel ricevuti, anche tutti
  insieme. La tabella mostra per ciascuno giorni di presenza, ore lavorate,
  assenze per codice, straordinari e ore per attività. *Scarica il riepilogo in
  Excel* produce un file con il riepilogo e un foglio per dipendente. Un
  dipendente importato due volte conta una volta sola; file di mesi diversi
  vengono rifiutati.

## Il file Excel

Ogni file mensile ha due fogli.

- **Timesheet**, quello che si legge e si stampa:
  - una riga per giorno con entrata e uscita (due intervalli; gli altri finiscono nelle note);
  - ore lavorate, ore per attività, codice e ore di assenza, straordinario e note;
  - sabati, domeniche e festivi in grigio;
  - i totali con le formule, il riepilogo delle assenze e lo spazio per le firme.

  È impostato in orizzontale su una pagina A4.
- **dati**, nascosto: le stesse registrazioni in forma di elenco. Serve
  all'importazione nella sezione Ufficio e regge anche un salvataggio da Excel.
  Non va modificato a mano.

L'impaginazione del foglio *Timesheet* sta tutta in `modello.js`: è l'unico
file da cambiare per adattarla al modello dell'ufficio.

Le festività sono quelle nazionali, compresi Pasqua, Pasquetta e, dal 2026,
San Francesco il 4 ottobre (legge 151/2025). Il patrono locale si aggiunge
dalla configurazione.

## Dove stanno i dati

Nell'archivio del browser (IndexedDB), sul singolo PC. Non vengono inviati da
nessuna parte: l'unica cosa che esce è il file Excel che il dipendente scarica
e manda. Il codice della app è pubblico, ma attività, clienti e nomi stanno solo
nei PC e nei file di configurazione.

Ne seguono tre cose:

- **Ogni PC ha il suo archivio.** Chi usa due computer ha due timesheet
  separati.
- **Svuotare i dati del browser cancella tutto.** Il backup
  (*Impostazioni → Backup e ripristino*) è l'unico modo per riaverli, ed è anche
  il modo per spostarli su un altro PC. La app ricorda di farlo se l'ultimo
  backup ha più di trenta giorni.
- **In una finestra anonima la app non conserva nulla.**

## Uso locale

Non basta aprire `index.html` con un doppio clic: il browser blocca i moduli
JavaScript caricati da file locali. Serve un server statico qualsiasi, per
esempio, dalla cartella del repository:

```
python -m http.server 8001
```

Poi apri <http://127.0.0.1:8001/>.

## Pubblicazione

Il sito si pubblica con GitHub Pages: in *Settings → Pages* scegli *Deploy
from a branch*, ramo `main`, cartella `/ (root)`. L'indirizzo è
<https://mxxcloud.github.io/timesheet/>, lo stesso di quando la app stava nella
cartella `timesheet/` del sito principale. Restano quindi validi anche i dati
già salvati nei browser e le copie già installate, che appartengono a
quell'indirizzo.

Il file `.nojekyll` nella radice dice a GitHub Pages di pubblicare i file così
come sono, senza passarli da Jekyll.

## Prove

```
npm test
```

Provano le regole di calcolo, cioè orari, intervalli, totali e festività. Provano
anche la scrittura e la rilettura dei file Excel, compresi quelli risalvati da
Excel, e il riepilogo dell'ufficio. Non servono pacchetti da installare: basta
Node 20 o più recente.

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | struttura della pagina |
| `style.css` | aspetto, con tema chiaro e scuro |
| `calcoli.js` | regole pure: orari, durate, intervalli, totali, festività |
| `dati.js` | archiviazione nel browser, validazione, backup |
| `xlsx.js` | scrittura e lettura dei file .xlsx, senza librerie |
| `modello.js` | impaginazione del foglio Excel del mese |
| `esportazione.js` | file del mese, rilettura e riepilogo dell'ufficio |
| `app.js` | interfaccia ed eventi |
| `sw.js` | copia locale per il funzionamento offline |
| `manifest.webmanifest` | dati per l'installazione |

Modificando i file dell'applicazione va aggiornata anche la costante `VERSIONE`
in `sw.js`. Non serve a far arrivare le modifiche, perché la strategia è «prima
la rete» e chi è online riceve comunque i file aggiornati. Serve però a far
accorgere il browser che c'è un nuovo service worker da installare, e a far
cancellare il deposito della versione precedente.
