# Timesheet

Il timesheet dell'ufficio, compilato nel browser invece che in Excel. La
schermata è il foglio del mese, uguale a quello che si compilava a mano:
intestazione, una riga per giorno con dalle, alle, ore lavorate, attività,
località di svolgimento e progetto, sabati, domeniche e festivi in rosso, il
totale in fondo. Si scrive direttamente nelle celle, e a fine mese si esporta
il file Excel dell'anno nel formato dell'ufficio.

È una app web installabile che funziona anche senza rete. Non ha server né
dipendenze da installare: è HTML, CSS e JavaScript, e i dati restano nel PC di
chi la usa.

## Come si compila

**L'intestazione.** In cima al foglio si scrivono ente, progetto, nome e
cognome, posizione/funzione: restano uguali per tutti i mesi. I giorni lavorati
si calcolano da soli, come nel modello (ore del mese diviso otto).

**Le righe.** Si clicca in una cella e si scrive.

- <kbd>Invio</kbd> scende alla stessa colonna del giorno dopo, <kbd>Tab</kbd>
  passa alla cella accanto, le frecce su e giù cambiano riga, <kbd>Esc</kbd>
  annulla la modifica della cella, <kbd>Alt</kbd>+<kbd>Invio</kbd> va a capo
  dentro la cella.
- Gli orari si scrivono come viene: «9», «9.30», «930» diventano «9:00»,
  «9:30». Le ore lavorate sono alle meno dalle, come la formula del foglio.
- In un giorno lavorativo, appena si scrive l'attività in una riga ancora
  vuota, dalle, alle e località si compilano con quelli abituali (di serie
  9:00–17:00; si cambiano in *Impostazioni*). Restano modificabili riga per
  riga.
- Attività, località e progetti già scritti tornano come suggerimenti mentre
  si scrive: frecce e <kbd>Invio</kbd>, o un clic, per sceglierli.
- **Assenze**: si scrive FERIE, MALATTIA o PERMESSO nell'attività e si lasciano
  vuoti gli orari, come chiede la guida dell'ufficio. Scritto in minuscolo
  diventa maiuscolo da sé.

Ogni cella si salva da sola mentre si scrive: non c'è un pulsante Salva.

**A fine mese** *Esporta l'Excel del 2026* scarica
`Cognome_Nome_TIME_SHEET_2026.xlsx`, con tutto l'anno aggiornato, da mandare
all'amministrazione.

**Impostazioni**: orario e località abituali, il patrono (che si aggiunge ai
festivi in rosso), backup e ripristino, e la sezione Ufficio.

## Per l'amministrazione

In *Impostazioni → Amministrazione* si attiva la sezione **Ufficio**. Lì si
importano i file Excel dell'anno ricevuti dai dipendenti, anche tutti insieme,
e si sceglie il mese. La tabella mostra per ciascuno i giorni con ore, le ore
lavorate e i giorni lavorati (ore diviso otto). *Scarica il riepilogo in Excel*
produce un file con il riepilogo e, per ogni dipendente, il suo foglio del
mese. Un dipendente importato due volte conta una volta sola; file di anni
diversi vengono rifiutati.

## Il file Excel

Il file dell'anno ricalca il timesheet dell'ufficio: un foglio per mese, da
«GENNAIO 2026» a «DICEMBRE 2026», anche per i mesi ancora vuoti.

- **Intestazione:** Time sheet, Ente, Progetto, Nome e cognome,
  Posizione/funzione, giorni lavorati (le ore del mese diviso otto, con la
  formula del modello) e il mese.
- **Una riga per giorno:** data, dalle, alle, ore lavorate (la formula
  `alle − dalle`), attività, località di svolgimento e progetto, come sono
  scritte nella app.
- **Sabati, domeniche e festivi:** in rosso, e un festivo senza dati porta il
  nome della festa.
- **Assenze:** «FERIE» nella colonna Attività, con le altre celle vuote, come
  chiede la guida dell'ufficio.
- **Totale:** «TOTALE ORE LAVORATE NEL MESE» con la somma.
- **Stampa:** A4 verticale, ogni mese su una pagina.

Un foglio nascosto, **dati**, contiene le stesse righe in forma di elenco. Serve all'importazione nella sezione Ufficio e
regge anche un salvataggio da Excel. Non va modificato a mano.

L'impaginazione dei fogli mensili sta tutta in `modello.js`: è l'unico file da
cambiare se il modello dell'ufficio cambia.

Le festività sono quelle nazionali, compresi Pasqua, Pasquetta e, dal 2026,
San Francesco il 4 ottobre (legge 151/2025). Il patrono locale si aggiunge
dalle impostazioni.

## Dove stanno i dati

Nell'archivio del browser (IndexedDB), sul singolo PC. Non vengono inviati da
nessuna parte: l'unica cosa che esce è il file Excel che il dipendente scarica
e manda. Il codice della app è pubblico, ma attività, progetti e nomi stanno solo
nei PC e nei file esportati.

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

Provano le regole di calcolo, cioè orari, ore lavorate, totali, assenze e festività.
Provano anche il file dell'anno nel formato dell'ufficio, la sua rilettura
(compresa quella dei file risalvati da Excel) e il riepilogo dell'ufficio. Non servono pacchetti da installare: basta
Node 20 o più recente.

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | struttura della pagina |
| `style.css` | aspetto del foglio, sul modello Excel dell'ufficio |
| `calcoli.js` | regole pure: orari, ore lavorate, totali, assenze, festività |
| `dati.js` | archiviazione nel browser, validazione, backup, dati della prima versione |
| `xlsx.js` | scrittura e lettura dei file .xlsx, senza librerie |
| `modello.js` | impaginazione del foglio mensile, sul modello dell'ufficio |
| `esportazione.js` | file dell'anno, rilettura e riepilogo dell'ufficio |
| `app.js` | il foglio da compilare, impostazioni e sezione Ufficio |
| `sw.js` | copia locale per il funzionamento offline |
| `manifest.webmanifest` | dati per l'installazione |

Modificando i file dell'applicazione va aggiornata anche la costante `VERSIONE`
in `sw.js`. Non serve a far arrivare le modifiche, perché la strategia è «prima
la rete» e chi è online riceve comunque i file aggiornati. Serve però a far
accorgere il browser che c'è un nuovo service worker da installare, e a far
cancellare il deposito della versione precedente.
