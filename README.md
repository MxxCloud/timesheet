# Timesheet

Registro delle presenze, delle attività e dei progetti di ogni giorno, con il
timesheet Excel dell'anno pronto da inviare. È una app web installabile che
funziona anche senza rete. Non ha server né dipendenze da installare: è HTML,
CSS e JavaScript, e i dati restano nel PC di chi la usa.

Sostituisce il timesheet compilato a mano in Excel, un file all'anno per
dipendente con un foglio per mese, e ne produce uno identico. Ognuno registra la
propria giornata dal proprio PC, esporta il suo file e lo manda
all'amministrazione, che può rileggere i file di tutti e farne un riepilogo.

## Per i dipendenti

**Prima volta.**
1. In *Impostazioni → Configurazione dell'ufficio* importa il file
   `configurazione-ufficio.json` che ti ha mandato l'amministrazione: contiene
   ente, progetti, località, codici di assenza e patrono.
2. Inserisci nome, cognome, posizione/funzione e località abituale; la
   matricola è facoltativa. Le ore previste per giorno servono solo per le
   assenze a giornata intera e per segnalare i giorni lasciati vuoti.
3. Con *Installa* la app compare fra i programmi del PC e si apre in una
   finestra sua.

**Ogni giorno.** In *Oggi* il pulsante **Entra** registra l'ora di ingresso e
diventa **Esci**. Per la pausa pranzo si può uscire e rientrare, oppure timbrare
solo l'arrivo e l'uscita di fine giornata: le ore lavorate sono sempre
dall'ultima uscita alla prima entrata, pausa compresa, come nel timesheet
dell'ufficio. Due tocchi nello stesso minuto si annullano. Gli orari si possono
anche scrivere o correggere a mano.

Sotto, la giornata segue le colonne del timesheet:

- **Attività svolte**: il testo della colonna *Attività*, più dettagliato
  possibile perché serve alla rendicontazione;
- **Località di svolgimento**: quella abituale è già scelta; per una trasferta
  si sceglie *Altro…* e si scrive il luogo;
- **Progetti**: le ore della giornata ripartite sui progetti. *Assegna il
  resto* mette su un progetto le ore non ancora ripartite;
- **Assenze**: ferie, malattia, permessi, con le ore. *Assente tutto il
  giorno* usa le ore previste per quel giorno;
- **Straordinario**: ore e nota, annotato a mano. Non compare nel timesheet:
  si tiene a parte, e arriva all'amministrazione con i dati del file.

**A fine mese**, o quando serve, in *Mese* si controllano i giorni segnati come
«Da completare», «Da ripartire» o «Manca l'uscita». Poi *Esporta l'Excel del
2026* scarica `Cognome_Nome_TIME_SHEET_2026.xlsx`, con tutto l'anno aggiornato,
da mandare all'amministrazione. Se dopo l'esportazione si modifica una
giornata, la app lo segnala: va esportato e mandato di nuovo.

## Per l'amministrazione

In *Impostazioni → Amministrazione* si attiva la sezione **Ufficio**.

- **Configurazione per i dipendenti.** Ente, patrono, progetti, località e
  codici di assenza si preparano in *Impostazioni → Configurazione
  dell'ufficio*. Da *Ufficio* si scarica il file da mandare a tutti, così
  ognuno usa gli stessi nomi. Quando cambia qualcosa, per esempio un progetto
  nuovo, si rimanda il file. I progetti già usati da un dipendente non
  spariscono: restano, disattivati.
- **Riepilogo del mese.** Si importano i file Excel dell'anno ricevuti, anche
  tutti insieme, e si sceglie il mese (all'inizio è l'ultimo con dati). La
  tabella mostra per ciascuno giorni di presenza, ore lavorate, assenze per
  codice, straordinari e ore per progetto. *Scarica il riepilogo in Excel*
  produce un file con il riepilogo e, per ogni dipendente, il foglio del mese
  nel formato dell'ufficio. Un dipendente importato due volte conta una volta
  sola; file di anni diversi vengono rifiutati.

## Il file Excel

Il file dell'anno ricalca il timesheet dell'ufficio: un foglio per mese, da
«GENNAIO 2026» a «DICEMBRE 2026», anche per i mesi ancora vuoti.

- **Intestazione:** Time sheet, Ente, Progetto, Nome e cognome,
  Posizione/funzione, giorni lavorati (le ore del mese diviso otto, con la
  formula del modello) e il mese.
- **Una riga per giorno:** data, dalle, alle, ore lavorate (la formula
  `alle − dalle`), attività, località di svolgimento e progetto. I progetti
  portano le loro ore: «Progetto Ponte (5:00), Rete Famiglie (3:00)».
- **Sabati, domeniche e festivi:** in rosso, e un festivo senza dati porta il
  nome della festa.
- **Assenze:** un'assenza a giornata intera si scrive in maiuscolo nella
  colonna Attività, «FERIE», con le altre celle vuote, come chiede la guida
  dell'ufficio. Un permesso di qualche ora in una giornata lavorata si aggiunge
  in coda all'attività.
- **Totale:** «TOTALE ORE LAVORATE NEL MESE» con la somma.
- **Stampa:** A4 verticale, ogni mese su una pagina.

Un foglio nascosto, **dati**, contiene le stesse registrazioni in forma di
elenco, straordinari compresi. Serve all'importazione nella sezione Ufficio e
regge anche un salvataggio da Excel. Non va modificato a mano.

L'impaginazione dei fogli mensili sta tutta in `modello.js`: è l'unico file da
cambiare se il modello dell'ufficio cambia.

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

Provano le regole di calcolo, cioè orari, ore lavorate, totali e festività.
Provano anche il file dell'anno nel formato dell'ufficio, la sua rilettura
(compresa quella dei file risalvati da Excel) e il riepilogo dell'ufficio. Non servono pacchetti da installare: basta
Node 20 o più recente.

## Struttura

| File | Contenuto |
|---|---|
| `index.html` | struttura della pagina |
| `style.css` | aspetto, con tema chiaro e scuro |
| `calcoli.js` | regole pure: orari, durate, intervalli, ore lavorate, totali, festività |
| `dati.js` | archiviazione nel browser, validazione, backup |
| `xlsx.js` | scrittura e lettura dei file .xlsx, senza librerie |
| `modello.js` | impaginazione del foglio mensile, sul modello dell'ufficio |
| `esportazione.js` | file dell'anno, rilettura e riepilogo dell'ufficio |
| `app.js` | interfaccia ed eventi |
| `sw.js` | copia locale per il funzionamento offline |
| `manifest.webmanifest` | dati per l'installazione |

Modificando i file dell'applicazione va aggiornata anche la costante `VERSIONE`
in `sw.js`. Non serve a far arrivare le modifiche, perché la strategia è «prima
la rete» e chi è online riceve comunque i file aggiornati. Serve però a far
accorgere il browser che c'è un nuovo service worker da installare, e a far
cancellare il deposito della versione precedente.
