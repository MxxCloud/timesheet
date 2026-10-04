// Archivio del timesheet: l'intestazione del foglio, le abitudini di chi lo
// compila e le righe dei giorni, tutto nel browser (IndexedDB) del PC di chi
// lo usa. L'interfaccia in app.js parla solo con questo modulo; le regole di
// calcolo stanno in calcoli.js.

import * as calcoli from "./calcoli.js";

const NOME_ARCHIVIO = "timesheet";
const VERSIONE_ARCHIVIO = 1;

const LUNGHEZZE = { breve: 120, lunga: 1000 };
const FORMATO_BACKUP = "timesheet-backup";
const VERSIONE_BACKUP = 2;

// I dati stanno in memoria e si riscrivono su IndexedDB a ogni modifica: un
// anno di righe è poca cosa, e così letture e totali restano codice sincrono.
const memoria = {
  giorni: new Map(),
  profilo: null,
  abituale: null,
  preferenze: {},
};
let archivio = null;

const copia = (valore) => structuredClone(valore);

/** L'intestazione del foglio: «Ente», «Progetto», «Nome e cognome», «Posizione/funzione». */
function profiloIniziale() {
  return { nome: "", cognome: "", posizione: "", ente: "", progetto: "" };
}

/** Quello che si scrive da solo in un giorno lavorativo, e il patrono per il calendario. */
function abitualeIniziale() {
  return { dalle: "09:00", alle: "17:00", localita: "", patrono: "" };
}

// --- archiviazione -------------------------------------------------------

function richiesta(operazione) {
  return new Promise((risolvi, rifiuta) => {
    operazione.onsuccess = () => risolvi(operazione.result);
    operazione.onerror = () => rifiuta(operazione.error);
  });
}

function apriArchivio() {
  return new Promise((risolvi, rifiuta) => {
    const apertura = indexedDB.open(NOME_ARCHIVIO, VERSIONE_ARCHIVIO);
    apertura.onupgradeneeded = () => {
      const db = apertura.result;
      if (!db.objectStoreNames.contains("giorni")) db.createObjectStore("giorni", { keyPath: "data" });
      if (!db.objectStoreNames.contains("impostazioni")) {
        db.createObjectStore("impostazioni", { keyPath: "chiave" });
      }
    };
    apertura.onsuccess = () => risolvi(apertura.result);
    apertura.onerror = () => rifiuta(apertura.error);
  });
}

async function leggiTutto(deposito) {
  return richiesta(archivio.transaction(deposito, "readonly").objectStore(deposito).getAll());
}

async function scrivi(deposito, record) {
  return richiesta(archivio.transaction(deposito, "readwrite").objectStore(deposito).put(record));
}

async function rimuovi(deposito, chiave) {
  await richiesta(archivio.transaction(deposito, "readwrite").objectStore(deposito).delete(chiave));
}

async function salvaImpostazione(chiave, valore) {
  await scrivi("impostazioni", { chiave, valore });
}

// --- testi e orari -------------------------------------------------------

function testoCorto(grezzo, massimo = LUNGHEZZE.breve) {
  return String(grezzo ?? "").replace(/\s+/g, " ").trim().slice(0, massimo);
}

function testoLungo(grezzo, massimo = LUNGHEZZE.lunga) {
  return String(grezzo ?? "").trim().slice(0, massimo);
}

/** «9», «9.30», «0930» → «09:30»; vuoto resta vuoto; null se non è un orario. */
function orario(grezzo) {
  if (!String(grezzo ?? "").trim()) return "";
  const minuti = calcoli.minutiDaOrario(grezzo);
  return minuti === null ? null : calcoli.orarioDaMinuti(minuti);
}

// --- la versione precedente ----------------------------------------------

// La prima versione della app registrava timbrature, ore per progetto e
// assenze per codice. Una giornata di allora diventa una riga del foglio come
// l'avrebbe scritta il foglio esportato.
function giornoDaVersione1(vecchio, nomiAssenze = new Map()) {
  const entrate = (vecchio.intervalli ?? []).map((i) => calcoli.minutiDaOrario(i.entrata)).filter((m) => m !== null);
  const uscite = (vecchio.intervalli ?? []).map((i) => calcoli.minutiDaOrario(i.uscita)).filter((m) => m !== null);
  const nomeAssenza = (codice) => nomiAssenze.get(codice) ?? codice;
  const attivita = [String(vecchio.descrizione ?? "").trim()].filter(Boolean);
  for (const voce of vecchio.assenze ?? []) {
    attivita.push(entrate.length ? `${nomeAssenza(voce.tipo).toLowerCase()} ${calcoli.durataInTesto(voce.minuti)}` : nomeAssenza(voce.tipo).toUpperCase());
  }
  return {
    data: vecchio.data,
    dalle: entrate.length ? calcoli.orarioDaMinuti(Math.min(...entrate)) : "",
    alle: uscite.length ? calcoli.orarioDaMinuti(Math.max(...uscite)) : "",
    attivita: attivita.join(" — "),
    localita: entrate.length ? testoCorto(vecchio.localita) : "",
    progetto: (vecchio.progetti ?? []).map((voce) => voce.progetto).join(", "),
  };
}

function nomiAssenzeVersione1(configurazione) {
  return new Map((configurazione?.assenze ?? []).map((a) => [a.codice, a.nome]));
}

// --- avvio ---------------------------------------------------------------

export async function inizializza() {
  archivio = await apriArchivio();
  const impostazioni = new Map((await leggiTutto("impostazioni")).map((r) => [r.chiave, r.valore]));
  const vecchiaConfigurazione = impostazioni.get("configurazione");
  const salvato = impostazioni.get("profilo") ?? {};

  memoria.profilo = { ...profiloIniziale(), ...salvato };
  memoria.abituale = { ...abitualeIniziale(), ...impostazioni.get("abituale") };
  memoria.preferenze = impostazioni.get("preferenze") ?? {};

  // Dalla prima versione: l'ente stava nella configurazione dell'ufficio, la
  // località abituale nel profilo.
  if (!impostazioni.has("abituale") && (vecchiaConfigurazione || salvato.localita)) {
    memoria.profilo.ente ||= vecchiaConfigurazione?.azienda ?? "";
    memoria.abituale.localita = salvato.localita ?? "";
    memoria.abituale.patrono = vecchiaConfigurazione?.patrono ?? "";
  }
  memoria.profilo = Object.fromEntries(Object.keys(profiloIniziale()).map((k) => [k, memoria.profilo[k] ?? ""]));

  const nomiAssenze = nomiAssenzeVersione1(vecchiaConfigurazione);
  for (const registrato of await leggiTutto("giorni")) {
    const giorno = "intervalli" in registrato ? giornoDaVersione1(registrato, nomiAssenze) : registrato;
    memoria.giorni.set(giorno.data, giorno);
    if (giorno !== registrato) await scrivi("giorni", giorno);
  }
  if (!impostazioni.has("abituale")) {
    await salvaImpostazione("profilo", memoria.profilo);
    await salvaImpostazione("abituale", memoria.abituale);
  }
}

// --- intestazione --------------------------------------------------------

export function profilo() {
  return copia(memoria.profilo);
}

export function profiloCompleto() {
  return Boolean(memoria.profilo.nome && memoria.profilo.cognome);
}

/** Salva un campo dell'intestazione: si scrive come una cella, senza controlli. */
export async function salvaProfilo(campo, valore) {
  if (!(campo in profiloIniziale())) return;
  memoria.profilo = { ...memoria.profilo, [campo]: testoCorto(valore) };
  await salvaImpostazione("profilo", memoria.profilo);
}

// --- abitudini -----------------------------------------------------------

export function abituale() {
  return copia(memoria.abituale);
}

function validaAbituale(grezzo) {
  const errori = [];
  const dalle = orario(grezzo?.dalle);
  const alle = orario(grezzo?.alle);
  if (dalle === null) errori.push("L'orario abituale di inizio non è valido: scrivilo come 9:00.");
  if (alle === null) errori.push("L'orario abituale di fine non è valido: scrivilo come 17:00.");
  if (dalle && alle && calcoli.minutiDaOrario(alle) <= calcoli.minutiDaOrario(dalle)) {
    errori.push("L'orario abituale di fine deve venire dopo quello di inizio.");
  }
  const patrono = String(grezzo?.patrono ?? "").trim();
  if (patrono && !(/^\d{2}-\d{2}$/.test(patrono) && calcoli.dataValida(`2024-${patrono}`))) {
    errori.push("Il giorno del patrono va indicato come giorno/mese, per esempio 24/06.");
  }
  if (errori.length) return [null, errori];
  return [{ dalle, alle, localita: testoCorto(grezzo?.localita), patrono }, []];
}

export async function salvaAbituale(grezzo) {
  const [valido, errori] = validaAbituale(grezzo);
  if (errori.length) return errori;
  memoria.abituale = valido;
  await salvaImpostazione("abituale", valido);
  return [];
}

// --- giorni --------------------------------------------------------------

export function giorno(data) {
  return copia(memoria.giorni.get(data) ?? calcoli.giornoVuoto(data));
}

export function giorniDelMese(mese) {
  return [...memoria.giorni.values()]
    .filter((g) => g.data.startsWith(mese))
    .sort((a, b) => a.data.localeCompare(b.data))
    .map(copia);
}

export function tuttiIGiorni() {
  return [...memoria.giorni.values()].sort((a, b) => a.data.localeCompare(b.data)).map(copia);
}

/** Controlla una riga; gli orari si accettano come si scrivono a mano («9», «9.30»). */
function validaGiorno(data, grezzo) {
  const errori = [];
  const dalle = orario(grezzo?.dalle);
  const alle = orario(grezzo?.alle);
  if (dalle === null) errori.push("«dalle» non è un orario: scrivilo come 9:00.");
  if (alle === null) errori.push("«alle» non è un orario: scrivilo come 17:00.");
  if (errori.length) return [null, errori];

  const attivita = testoLungo(grezzo?.attivita);
  return [
    {
      data,
      dalle,
      alle,
      // «ferie» si scrive «FERIE», come chiede la guida dell'ufficio.
      attivita: calcoli.assenza(attivita) ?? attivita,
      localita: testoCorto(grezzo?.localita),
      progetto: testoLungo(grezzo?.progetto),
    },
    [],
  ];
}

/** Salva una riga; una riga senza dati viene tolta dall'archivio. */
export async function salvaGiorno(dataGrezza, grezzo) {
  const data = calcoli.dataValida(dataGrezza);
  if (!data) return ["La data non è valida."];
  const [valido, errori] = validaGiorno(data, grezzo);
  if (errori.length) return errori;
  if (calcoli.giornoSenzaDati(valido)) {
    memoria.giorni.delete(data);
    await rimuovi("giorni", data);
  } else {
    memoria.giorni.set(data, valido);
    await scrivi("giorni", valido);
  }
  return [];
}

/**
 * I testi già scritti in una colonna («attivita», «localita», «progetto»),
 * dal più usato: diventano i suggerimenti mentre si scrive.
 */
export function suggerimenti(colonna, quanti = 200) {
  const conteggi = new Map();
  for (const giorno of memoria.giorni.values()) {
    const valore = String(giorno[colonna] ?? "").trim();
    if (valore) conteggi.set(valore, (conteggi.get(valore) ?? 0) + 1);
  }
  return [...conteggi]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "it"))
    .slice(0, quanti)
    .map(([valore]) => valore);
}

// --- preferenze ----------------------------------------------------------

export function preferenza(nome) {
  return memoria.preferenze[nome];
}

export async function impostaPreferenza(nome, valore) {
  memoria.preferenze = { ...memoria.preferenze, [nome]: valore };
  await salvaImpostazione("preferenze", memoria.preferenze);
}

// --- backup --------------------------------------------------------------

export function esportaBackup(quando = new Date()) {
  return {
    formato: FORMATO_BACKUP,
    versione: VERSIONE_BACKUP,
    esportato: quando.toISOString(),
    profilo: profilo(),
    abituale: abituale(),
    giorni: tuttiIGiorni(),
  };
}

export function nomeFileBackup(oggi = calcoli.oggiIso()) {
  return `backup-timesheet_${oggi}.json`;
}

export async function segnaBackup(quando = new Date()) {
  await impostaPreferenza("ultimoBackup", quando.toISOString());
}

/** Giorni trascorsi dall'ultimo backup; null se non è mai stato fatto. */
export function giorniDalBackup(adesso = new Date()) {
  const ultimo = memoria.preferenze.ultimoBackup;
  if (!ultimo) return null;
  return Math.floor((adesso - new Date(ultimo)) / 86400000);
}

/**
 * Sostituisce tutto l'archivio con il contenuto del backup. Ogni riga passa
 * dagli stessi controlli dell'inserimento a mano; se anche una sola non va,
 * non si tocca nulla e si restituiscono gli errori. Si leggono anche i backup
 * della prima versione della app.
 */
export async function importaBackup(contenuto) {
  if (contenuto?.formato !== FORMATO_BACKUP) return ["Questo file non è un backup di Timesheet."];
  const versione1 = contenuto.versione === 1;
  if (!versione1 && contenuto.versione !== VERSIONE_BACKUP) {
    return [`Backup in versione ${contenuto.versione}, non riconosciuta.`];
  }

  const grezzoProfilo = contenuto.profilo ?? {};
  const nuovoProfilo = Object.fromEntries(
    Object.keys(profiloIniziale()).map((campo) => [campo, testoCorto(grezzoProfilo[campo])])
  );
  let grezzoAbituale = contenuto.abituale ?? abitualeIniziale();
  if (versione1) {
    nuovoProfilo.ente = testoCorto(contenuto.configurazione?.azienda);
    grezzoAbituale = {
      ...abitualeIniziale(),
      localita: grezzoProfilo.localita ?? "",
      patrono: contenuto.configurazione?.patrono ?? "",
    };
  }
  const [nuovoAbituale, erroriAbituale] = validaAbituale(grezzoAbituale);
  if (erroriAbituale.length) return erroriAbituale;

  const nomiAssenze = nomiAssenzeVersione1(contenuto.configurazione);
  const errori = [];
  const giorni = [];
  for (const grezzo of Array.isArray(contenuto.giorni) ? contenuto.giorni : []) {
    const data = calcoli.dataValida(grezzo?.data);
    if (!data) {
      errori.push(`Data non valida: «${grezzo?.data}».`);
      continue;
    }
    const [valido, suoi] = validaGiorno(data, versione1 ? giornoDaVersione1(grezzo, nomiAssenze) : grezzo);
    if (suoi.length) errori.push(`${data}: ${suoi.join(" ")}`);
    else if (!calcoli.giornoSenzaDati(valido)) giorni.push(valido);
  }
  if (errori.length) return errori.slice(0, 10);

  const transazione = archivio.transaction(["giorni", "impostazioni"], "readwrite");
  const giorniDeposito = transazione.objectStore("giorni");
  const impostazioniDeposito = transazione.objectStore("impostazioni");
  giorniDeposito.clear();
  for (const valido of giorni) giorniDeposito.put(valido);
  impostazioniDeposito.put({ chiave: "profilo", valore: nuovoProfilo });
  impostazioniDeposito.put({ chiave: "abituale", valore: nuovoAbituale });
  await new Promise((risolvi, rifiuta) => {
    transazione.oncomplete = risolvi;
    transazione.onerror = () => rifiuta(transazione.error);
    transazione.onabort = () => rifiuta(transazione.error);
  });

  memoria.giorni = new Map(giorni.map((g) => [g.data, g]));
  memoria.profilo = nuovoProfilo;
  memoria.abituale = nuovoAbituale;
  return [];
}
