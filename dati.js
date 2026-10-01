// Archivio del timesheet: profilo, configurazione dell'ufficio e giornate,
// tutto nel browser (IndexedDB) del PC di chi lo usa. L'interfaccia in app.js
// parla solo con questo modulo; le regole di calcolo stanno in calcoli.js.

import * as calcoli from "./calcoli.js";

const NOME_ARCHIVIO = "timesheet";
const VERSIONE_ARCHIVIO = 1;

export const ASSENZE_INIZIALI = [
  { codice: "FE", nome: "Ferie" },
  { codice: "MA", nome: "Malattia" },
  { codice: "PE", nome: "Permesso" },
  { codice: "ROL", nome: "Riduzione orario di lavoro" },
  { codice: "FS", nome: "Festività" },
];

// Lunedì … domenica, in minuti: otto ore dal lunedì al venerdì.
const ORE_PREVISTE_INIZIALI = [480, 480, 480, 480, 480, 0, 0];

const LUNGHEZZE = { nome: 60, matricola: 20, azienda: 80, attivita: 60, assenza: 40, testo: 200, note: 500 };
const CODICE_ASSENZA = /^[A-Z0-9]{1,6}$/;

const FORMATO_CONFIGURAZIONE = "timesheet-configurazione";
const FORMATO_BACKUP = "timesheet-backup";

// Come in Budget futuro, i dati stanno in memoria e si riscrivono su IndexedDB
// a ogni modifica: un anno di giornate è poca cosa, e così letture e totali
// restano codice sincrono.
const memoria = {
  giorni: new Map(),
  profilo: null,
  configurazione: null,
  mesi: {},
  preferenze: {},
};
let archivio = null;

const copia = (valore) => structuredClone(valore);

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

export async function inizializza() {
  archivio = await apriArchivio();
  for (const giorno of await leggiTutto("giorni")) memoria.giorni.set(giorno.data, giorno);

  const impostazioni = new Map((await leggiTutto("impostazioni")).map((r) => [r.chiave, r.valore]));
  memoria.profilo = impostazioni.get("profilo") ?? {
    nome: "",
    cognome: "",
    matricola: "",
    orePreviste: [...ORE_PREVISTE_INIZIALI],
  };
  memoria.configurazione = impostazioni.get("configurazione") ?? {
    azienda: "",
    patrono: "",
    attivita: [],
    assenze: copia(ASSENZE_INIZIALI),
  };
  memoria.mesi = impostazioni.get("mesi") ?? {};
  memoria.preferenze = impostazioni.get("preferenze") ?? {};
}

// --- testi ---------------------------------------------------------------

function testoCorto(grezzo, massimo) {
  return String(grezzo ?? "").replace(/\s+/g, " ").trim().slice(0, massimo);
}

function testoLungo(grezzo, massimo) {
  return String(grezzo ?? "").trim().slice(0, massimo);
}

function durata(voce) {
  if (typeof voce?.minuti === "number") {
    return Number.isInteger(voce.minuti) && voce.minuti >= 0 && voce.minuti <= calcoli.MINUTI_GIORNO
      ? voce.minuti
      : null;
  }
  return calcoli.minutiDaDurata(voce?.durata);
}

// --- profilo -------------------------------------------------------------

export function profilo() {
  return copia(memoria.profilo);
}

export function profiloCompleto() {
  return Boolean(memoria.profilo.nome && memoria.profilo.cognome);
}

function validaProfilo(grezzo) {
  const errori = [];
  const nome = testoCorto(grezzo?.nome, LUNGHEZZE.nome);
  const cognome = testoCorto(grezzo?.cognome, LUNGHEZZE.nome);
  if (!nome) errori.push("Indica il nome.");
  if (!cognome) errori.push("Indica il cognome.");

  const orePreviste = Array.from({ length: 7 }, (_, indice) => {
    const valore = grezzo?.orePreviste?.[indice];
    if (valore === "" || valore === null || valore === undefined) return 0;
    const minuti = typeof valore === "number" ? valore : calcoli.minutiDaDurata(valore);
    if (minuti === null) errori.push(`Ore previste del ${GIORNI_SETTIMANA[indice]}: durata non valida.`);
    return minuti ?? 0;
  });

  if (errori.length) return [null, errori];
  return [{ nome, cognome, matricola: testoCorto(grezzo?.matricola, LUNGHEZZE.matricola), orePreviste }, []];
}

const GIORNI_SETTIMANA = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

export async function salvaProfilo(grezzo) {
  const [valido, errori] = validaProfilo(grezzo);
  if (errori.length) return errori;
  memoria.profilo = valido;
  await salvaImpostazione("profilo", valido);
  return [];
}

/** Le ore previste in un giorno, secondo il profilo: servono per le assenze a giornata intera. */
export function orePreviste(data) {
  return memoria.profilo.orePreviste?.[calcoli.giornoSettimana(data)] ?? 0;
}

// --- configurazione dell'ufficio -----------------------------------------

export function configurazione() {
  return copia(memoria.configurazione);
}

function validaConfigurazione(grezza) {
  const errori = [];
  const azienda = testoCorto(grezza?.azienda, LUNGHEZZE.azienda);

  const patrono = String(grezza?.patrono ?? "").trim();
  if (patrono && !(/^\d{2}-\d{2}$/.test(patrono) && calcoli.dataValida(`2024-${patrono}`))) {
    errori.push("Il giorno del patrono va indicato come giorno/mese, per esempio 24/06.");
  }

  const attivita = [];
  for (const voce of Array.isArray(grezza?.attivita) ? grezza.attivita : []) {
    const nome = testoCorto(typeof voce === "string" ? voce : voce?.nome, LUNGHEZZE.attivita);
    if (!nome) continue;
    if (attivita.some((a) => a.nome.toLowerCase() === nome.toLowerCase())) {
      errori.push(`L'attività «${nome}» compare due volte.`);
      continue;
    }
    attivita.push({ nome, attiva: voce?.attiva !== false });
  }

  const assenze = [];
  for (const voce of Array.isArray(grezza?.assenze) ? grezza.assenze : []) {
    const codice = String(voce?.codice ?? "").trim().toUpperCase();
    const nome = testoCorto(voce?.nome, LUNGHEZZE.assenza);
    if (!CODICE_ASSENZA.test(codice)) {
      errori.push(`Il codice di assenza «${codice}» non è valido: da 1 a 6 lettere o cifre.`);
      continue;
    }
    if (assenze.some((a) => a.codice === codice)) {
      errori.push(`Il codice di assenza «${codice}» compare due volte.`);
      continue;
    }
    assenze.push({ codice, nome: nome || codice });
  }

  if (errori.length) return [null, errori];
  return [{ azienda, patrono, attivita, assenze }, []];
}

async function salvaConfigurazione(nuova) {
  memoria.configurazione = nuova;
  await salvaImpostazione("configurazione", nuova);
}

function attivitaUsata(nome) {
  for (const giorno of memoria.giorni.values()) {
    if (giorno.attivita.some((voce) => voce.attivita === nome)) return true;
  }
  return false;
}

function assenzaUsata(codice) {
  for (const giorno of memoria.giorni.values()) {
    if (giorno.assenze.some((voce) => voce.tipo === codice)) return true;
  }
  return false;
}

/** Le attività con il numero di giornate in cui compaiono. */
export function elencoAttivita() {
  return memoria.configurazione.attivita.map((attivita) => ({
    ...attivita,
    usata: attivitaUsata(attivita.nome),
  }));
}

export function elencoAssenze() {
  return memoria.configurazione.assenze.map((assenza) => ({
    ...assenza,
    usata: assenzaUsata(assenza.codice),
  }));
}

export async function salvaDatiAzienda(azienda, patrono) {
  const [nuova, errori] = validaConfigurazione({ ...memoria.configurazione, azienda, patrono });
  if (errori.length) return errori;
  await salvaConfigurazione(nuova);
  return [];
}

export async function aggiungiAttivita(grezzo) {
  const nome = testoCorto(grezzo, LUNGHEZZE.attivita);
  if (!nome) return ["Il nome dell'attività non può essere vuoto."];
  const [nuova, errori] = validaConfigurazione({
    ...memoria.configurazione,
    attivita: [...memoria.configurazione.attivita, { nome, attiva: true }],
  });
  if (errori.length) return errori;
  await salvaConfigurazione(nuova);
  return [];
}

export async function rinominaAttivita(vecchio, grezzo) {
  const nome = testoCorto(grezzo, LUNGHEZZE.attivita);
  if (!nome) return ["Il nome dell'attività non può essere vuoto."];
  const [nuova, errori] = validaConfigurazione({
    ...memoria.configurazione,
    attivita: memoria.configurazione.attivita.map((a) => (a.nome === vecchio ? { ...a, nome } : a)),
  });
  if (errori.length) return errori;
  await salvaConfigurazione(nuova);

  // Rinominare senza aggiornare le giornate lascerebbe ore senza attività.
  for (const giorno of memoria.giorni.values()) {
    if (!giorno.attivita.some((voce) => voce.attivita === vecchio)) continue;
    for (const voce of giorno.attivita) if (voce.attivita === vecchio) voce.attivita = nome;
    await scrivi("giorni", giorno);
  }
  return [];
}

export async function impostaAttivaAttivita(nome, attiva) {
  await salvaConfigurazione({
    ...memoria.configurazione,
    attivita: memoria.configurazione.attivita.map((a) =>
      a.nome === nome ? { ...a, attiva: attiva === true } : a
    ),
  });
  return [];
}

export async function eliminaAttivita(nome) {
  if (attivitaUsata(nome)) {
    return [`«${nome}» ha ore registrate: disattivala invece di eliminarla, così le ore restano.`];
  }
  await salvaConfigurazione({
    ...memoria.configurazione,
    attivita: memoria.configurazione.attivita.filter((a) => a.nome !== nome),
  });
  return [];
}

export async function aggiungiAssenza(codice, nome) {
  const [nuova, errori] = validaConfigurazione({
    ...memoria.configurazione,
    assenze: [...memoria.configurazione.assenze, { codice, nome }],
  });
  if (errori.length) return errori;
  await salvaConfigurazione(nuova);
  return [];
}

export async function rinominaAssenza(codice, nome) {
  const [nuova, errori] = validaConfigurazione({
    ...memoria.configurazione,
    assenze: memoria.configurazione.assenze.map((a) => (a.codice === codice ? { codice, nome } : a)),
  });
  if (errori.length) return errori;
  await salvaConfigurazione(nuova);
  return [];
}

export async function eliminaAssenza(codice) {
  if (assenzaUsata(codice)) return [`Il codice «${codice}» è usato in qualche giornata: non si può eliminare.`];
  await salvaConfigurazione({
    ...memoria.configurazione,
    assenze: memoria.configurazione.assenze.filter((a) => a.codice !== codice),
  });
  return [];
}

export function esportaConfigurazione() {
  return {
    formato: FORMATO_CONFIGURAZIONE,
    versione: 1,
    ...configurazione(),
  };
}

/**
 * Sostituisce la configurazione con quella preparata dall'amministrazione.
 * Le attività e le assenze già usate nelle giornate ma assenti dal file
 * restano, disattivate: le ore registrate non devono perdere il loro nome.
 */
export async function importaConfigurazione(contenuto) {
  if (contenuto?.formato !== FORMATO_CONFIGURAZIONE) {
    return ["Questo file non è una configurazione di Timesheet."];
  }
  if (contenuto.versione !== 1) return [`Configurazione in versione ${contenuto.versione}, non riconosciuta.`];

  const [nuova, errori] = validaConfigurazione(contenuto);
  if (errori.length) return errori;

  for (const vecchia of memoria.configurazione.attivita) {
    const presente = nuova.attivita.some((a) => a.nome === vecchia.nome);
    if (!presente && attivitaUsata(vecchia.nome)) nuova.attivita.push({ nome: vecchia.nome, attiva: false });
  }
  for (const vecchia of memoria.configurazione.assenze) {
    const presente = nuova.assenze.some((a) => a.codice === vecchia.codice);
    if (!presente && assenzaUsata(vecchia.codice)) nuova.assenze.push(vecchia);
  }
  await salvaConfigurazione(nuova);
  return [];
}

// --- giornate ------------------------------------------------------------

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

/**
 * Controlla una giornata. Le durate arrivano come testo dal modulo
 * («durata»: «4:30») oppure come minuti dai backup («minuti»: 270).
 */
function validaGiorno(data, grezzo, { apertoAmmesso, nomiAttivita, codiciAssenza }) {
  const errori = [];
  const [intervalli, erroriIntervalli] = calcoli.validaIntervalli(grezzo?.intervalli ?? [], {
    apertoAmmesso,
  });
  errori.push(...erroriIntervalli);

  const attivita = [];
  for (const [indice, voce] of (grezzo?.attivita ?? []).entries()) {
    const posizione = `Attività ${indice + 1}`;
    const nome = nomiAttivita.get(String(voce?.attivita ?? "").trim().toLowerCase());
    const minuti = durata(voce);
    if (!nome) errori.push(`${posizione}: scegli un'attività dall'elenco.`);
    if (!minuti) errori.push(`${posizione}: indica le ore, per esempio 2:30.`);
    if (nome && minuti) {
      attivita.push({ attivita: nome, minuti, descrizione: testoCorto(voce?.descrizione, LUNGHEZZE.testo) });
    }
  }

  const assenze = [];
  for (const [indice, voce] of (grezzo?.assenze ?? []).entries()) {
    const posizione = `Assenza ${indice + 1}`;
    const tipo = String(voce?.tipo ?? "").trim().toUpperCase();
    const minuti = durata(voce);
    if (!codiciAssenza.has(tipo)) errori.push(`${posizione}: scegli il tipo di assenza.`);
    if (!minuti) errori.push(`${posizione}: indica le ore di assenza.`);
    if (codiciAssenza.has(tipo) && minuti) assenze.push({ tipo, minuti });
  }

  let straordinario = null;
  const notaStraordinario = testoCorto(grezzo?.straordinario?.nota, LUNGHEZZE.testo);
  const vuoto =
    grezzo?.straordinario?.minuti === undefined &&
    !String(grezzo?.straordinario?.durata ?? "").trim();
  if (grezzo?.straordinario && !(vuoto && !notaStraordinario)) {
    const minuti = durata(grezzo.straordinario);
    if (!minuti) errori.push("Straordinario: indica le ore, per esempio 1:30.");
    else straordinario = { minuti, nota: notaStraordinario };
  }

  if (errori.length) return [null, errori];
  return [
    { data, intervalli, attivita, assenze, straordinario, note: testoLungo(grezzo?.note, LUNGHEZZE.note) },
    [],
  ];
}

function regoleAttuali() {
  return {
    nomiAttivita: new Map(memoria.configurazione.attivita.map((a) => [a.nome.toLowerCase(), a.nome])),
    codiciAssenza: new Set(memoria.configurazione.assenze.map((a) => a.codice)),
  };
}

async function registraGiorno(giornoValido) {
  if (calcoli.giornoSenzaDati(giornoValido)) {
    memoria.giorni.delete(giornoValido.data);
    await rimuovi("giorni", giornoValido.data);
  } else {
    memoria.giorni.set(giornoValido.data, giornoValido);
    await scrivi("giorni", giornoValido);
  }
  await segnaModificato(calcoli.meseDi(giornoValido.data));
}

/** Salva una giornata intera; una giornata senza dati viene tolta dall'archivio. */
export async function salvaGiorno(dataGrezza, grezzo, oggi = calcoli.oggiIso()) {
  const data = calcoli.dataValida(dataGrezza);
  if (!data) return ["La data non è valida."];
  const [valido, errori] = validaGiorno(data, grezzo, {
    ...regoleAttuali(),
    apertoAmmesso: data === oggi,
  });
  if (errori.length) return errori;
  await registraGiorno(valido);
  return [];
}

function orarioDi(adesso) {
  return calcoli.orarioDaMinuti(adesso.getHours() * 60 + adesso.getMinutes());
}

/**
 * Il pulsante Entra/Esci: apre un intervallo con l'ora attuale o chiude quello
 * aperto. Uscire nello stesso minuto in cui si è entrati annulla l'entrata,
 * perché è quasi sempre un doppio tocco.
 *
 * `base` è la giornata come sta nel modulo, se ha modifiche non salvate: la
 * timbratura si aggiunge a quelle e salva tutto insieme, invece di perderle.
 */
export async function timbra(adesso = new Date(), base = null) {
  const data = calcoli.isoLocale(adesso);
  const orario = orarioDi(adesso);
  const minuti = calcoli.minutiDaOrario(orario);
  const attuale = base ? { ...copia(base), data } : giorno(data);
  attuale.intervalli = attuale.intervalli ?? [];
  const aperto = attuale.intervalli.find((intervallo) => !intervallo.uscita);

  if (aperto) {
    if (minuti <= calcoli.minutiDaOrario(aperto.entrata)) {
      attuale.intervalli = attuale.intervalli.filter((intervallo) => intervallo !== aperto);
    } else {
      aperto.uscita = orario;
    }
  } else {
    const ultima = attuale.intervalli
      .map((intervallo) => calcoli.minutiDaOrario(intervallo.uscita))
      .filter((valore) => valore !== null)
      .reduce((massimo, valore) => Math.max(massimo, valore), -1);
    if (minuti < ultima) {
      return [
        `L'ultima uscita registrata oggi è alle ${calcoli.orarioDaMinuti(ultima)}: controlla gli orari della giornata o l'orologio del PC.`,
      ];
    }
    attuale.intervalli.push({ entrata: orario, uscita: null });
  }

  const [valido, errori] = validaGiorno(data, attuale, { ...regoleAttuali(), apertoAmmesso: true });
  if (errori.length) return errori;
  await registraGiorno(valido);
  return [];
}

/** I giorni passati rimasti con un'entrata senza uscita: vanno sistemati a mano. */
export function giorniConUscitaMancante(oggi = calcoli.oggiIso()) {
  return [...memoria.giorni.values()]
    .filter((g) => g.data < oggi && calcoli.intervalloAperto(g.intervalli))
    .map((g) => g.data)
    .sort();
}

/** Un mese con almeno una giornata registrata, dal più recente. */
export function mesiConDati() {
  return [...new Set([...memoria.giorni.keys()].map(calcoli.meseDi))].sort().reverse();
}

// --- invio del mese ------------------------------------------------------

export function statoMese(mese) {
  return memoria.mesi[mese] ? { ...memoria.mesi[mese] } : null;
}

export async function segnaInviato(mese, quando = new Date()) {
  memoria.mesi = { ...memoria.mesi, [mese]: { inviato: quando.toISOString(), modificatoDopo: false } };
  await salvaImpostazione("mesi", memoria.mesi);
}

async function segnaModificato(mese) {
  const stato = memoria.mesi[mese];
  if (!stato || stato.modificatoDopo) return;
  memoria.mesi = { ...memoria.mesi, [mese]: { ...stato, modificatoDopo: true } };
  await salvaImpostazione("mesi", memoria.mesi);
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
    versione: 1,
    esportato: quando.toISOString(),
    profilo: profilo(),
    configurazione: configurazione(),
    mesi: copia(memoria.mesi),
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
 * Sostituisce tutto l'archivio con il contenuto del backup. Ogni giornata
 * passa dagli stessi controlli dell'inserimento a mano; se anche una sola non
 * va, non si tocca nulla e si restituiscono gli errori.
 */
export async function importaBackup(contenuto) {
  if (contenuto?.formato !== FORMATO_BACKUP) return ["Questo file non è un backup di Timesheet."];
  if (contenuto.versione !== 1) return [`Backup in versione ${contenuto.versione}, non riconosciuta.`];

  const [nuovaConfigurazione, erroriConfigurazione] = validaConfigurazione(contenuto.configurazione);
  if (erroriConfigurazione.length) return erroriConfigurazione;

  const profiloGrezzo = contenuto.profilo ?? {};
  const [nuovoProfilo, erroriProfilo] =
    profiloGrezzo.nome || profiloGrezzo.cognome
      ? validaProfilo(profiloGrezzo)
      : [{ nome: "", cognome: "", matricola: "", orePreviste: [...ORE_PREVISTE_INIZIALI] }, []];
  if (erroriProfilo.length) return erroriProfilo;

  const regole = {
    nomiAttivita: new Map(nuovaConfigurazione.attivita.map((a) => [a.nome.toLowerCase(), a.nome])),
    codiciAssenza: new Set(nuovaConfigurazione.assenze.map((a) => a.codice)),
    apertoAmmesso: true,
  };
  const errori = [];
  const giorni = [];
  for (const grezzo of Array.isArray(contenuto.giorni) ? contenuto.giorni : []) {
    const data = calcoli.dataValida(grezzo?.data);
    if (!data) {
      errori.push(`Data non valida: «${grezzo?.data}».`);
      continue;
    }
    const [valido, suoi] = validaGiorno(data, grezzo, regole);
    if (suoi.length) errori.push(`${data}: ${suoi.join(" ")}`);
    else if (!calcoli.giornoSenzaDati(valido)) giorni.push(valido);
  }
  if (errori.length) return errori.slice(0, 10);

  const mesi = {};
  for (const [mese, stato] of Object.entries(contenuto.mesi ?? {})) {
    if (calcoli.meseValido(mese) && typeof stato?.inviato === "string") {
      mesi[mese] = { inviato: stato.inviato, modificatoDopo: stato.modificatoDopo === true };
    }
  }

  const transazione = archivio.transaction(["giorni", "impostazioni"], "readwrite");
  const giorniDeposito = transazione.objectStore("giorni");
  const impostazioniDeposito = transazione.objectStore("impostazioni");
  giorniDeposito.clear();
  for (const valido of giorni) giorniDeposito.put(valido);
  impostazioniDeposito.put({ chiave: "profilo", valore: nuovoProfilo });
  impostazioniDeposito.put({ chiave: "configurazione", valore: nuovaConfigurazione });
  impostazioniDeposito.put({ chiave: "mesi", valore: mesi });
  await new Promise((risolvi, rifiuta) => {
    transazione.oncomplete = risolvi;
    transazione.onerror = () => rifiuta(transazione.error);
    transazione.onabort = () => rifiuta(transazione.error);
  });

  memoria.giorni = new Map(giorni.map((g) => [g.data, g]));
  memoria.profilo = nuovoProfilo;
  memoria.configurazione = nuovaConfigurazione;
  memoria.mesi = mesi;
  return [];
}
