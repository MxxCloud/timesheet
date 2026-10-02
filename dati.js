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

// I nomi veri (la sede dell'ente, per esempio) arrivano con il file di
// configurazione dell'amministrazione: il codice è pubblico e non li contiene.
export const LOCALITA_INIZIALI = ["Sede", "Smart working"];

// Lunedì … domenica, in minuti: otto ore dal lunedì al venerdì.
const ORE_PREVISTE_INIZIALI = [480, 480, 480, 480, 480, 0, 0];

const LUNGHEZZE = {
  nome: 60,
  matricola: 20,
  posizione: 80,
  azienda: 80,
  progetto: 60,
  localita: 60,
  assenza: 40,
  nota: 200,
  descrizione: 1000,
};
const CODICE_ASSENZA = /^[A-Z0-9]{1,6}$/;

const FORMATO_CONFIGURAZIONE = "timesheet-configurazione";
const FORMATO_BACKUP = "timesheet-backup";

// I dati stanno in memoria e si riscrivono su IndexedDB a ogni modifica: un
// anno di giornate è poca cosa, e così letture e totali restano codice sincrono.
const memoria = {
  giorni: new Map(),
  profilo: null,
  configurazione: null,
  esportazioni: {},
  preferenze: {},
};
let archivio = null;

const copia = (valore) => structuredClone(valore);

function profiloIniziale() {
  return {
    nome: "",
    cognome: "",
    matricola: "",
    posizione: "",
    localita: "",
    orePreviste: [...ORE_PREVISTE_INIZIALI],
  };
}

function configurazioneIniziale() {
  return {
    azienda: "",
    patrono: "",
    progetti: [],
    localita: [...LOCALITA_INIZIALI],
    assenze: copia(ASSENZE_INIZIALI),
  };
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

export async function inizializza() {
  archivio = await apriArchivio();
  for (const giorno of await leggiTutto("giorni")) memoria.giorni.set(giorno.data, giorno);

  const impostazioni = new Map((await leggiTutto("impostazioni")).map((r) => [r.chiave, r.valore]));
  memoria.profilo = { ...profiloIniziale(), ...impostazioni.get("profilo") };
  memoria.configurazione = { ...configurazioneIniziale(), ...impostazioni.get("configurazione") };
  memoria.esportazioni = impostazioni.get("esportazioni") ?? {};
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

const GIORNI_SETTIMANA = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

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
  return [
    {
      nome,
      cognome,
      matricola: testoCorto(grezzo?.matricola, LUNGHEZZE.matricola),
      posizione: testoCorto(grezzo?.posizione, LUNGHEZZE.posizione),
      localita: testoCorto(grezzo?.localita, LUNGHEZZE.localita),
      orePreviste,
    },
    [],
  ];
}

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

/** La località di una giornata senza località: quella abituale, o la prima dell'elenco. */
export function localitaPredefinita() {
  return memoria.profilo.localita || memoria.configurazione.localita[0] || "";
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

  const progetti = [];
  for (const voce of Array.isArray(grezza?.progetti) ? grezza.progetti : []) {
    const nome = testoCorto(typeof voce === "string" ? voce : voce?.nome, LUNGHEZZE.progetto);
    if (!nome) continue;
    if (progetti.some((p) => p.nome.toLowerCase() === nome.toLowerCase())) {
      errori.push(`Il progetto «${nome}» compare due volte.`);
      continue;
    }
    progetti.push({ nome, attivo: voce?.attivo !== false });
  }

  const localita = [];
  for (const voce of Array.isArray(grezza?.localita) ? grezza.localita : LOCALITA_INIZIALI) {
    const nome = testoCorto(voce, LUNGHEZZE.localita);
    if (!nome) continue;
    if (localita.some((l) => l.toLowerCase() === nome.toLowerCase())) {
      errori.push(`La località «${nome}» compare due volte.`);
      continue;
    }
    localita.push(nome);
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
  return [{ azienda, patrono, progetti, localita, assenze }, []];
}

async function salvaConfigurazione(nuova) {
  memoria.configurazione = nuova;
  await salvaImpostazione("configurazione", nuova);
}

async function cambiaConfigurazione(modifiche) {
  const [nuova, errori] = validaConfigurazione({ ...memoria.configurazione, ...modifiche });
  if (errori.length) return errori;
  await salvaConfigurazione(nuova);
  return [];
}

function progettoUsato(nome) {
  for (const giorno of memoria.giorni.values()) {
    if (giorno.progetti.some((voce) => voce.progetto === nome)) return true;
  }
  return false;
}

function assenzaUsata(codice) {
  for (const giorno of memoria.giorni.values()) {
    if (giorno.assenze.some((voce) => voce.tipo === codice)) return true;
  }
  return false;
}

/** I progetti, ciascuno con l'indicazione se ha ore registrate. */
export function elencoProgetti() {
  return memoria.configurazione.progetti.map((progetto) => ({
    ...progetto,
    usato: progettoUsato(progetto.nome),
  }));
}

export function elencoLocalita() {
  return [...memoria.configurazione.localita];
}

export function elencoAssenze() {
  return memoria.configurazione.assenze.map((assenza) => ({
    ...assenza,
    usata: assenzaUsata(assenza.codice),
  }));
}

export async function salvaDatiAzienda(azienda, patrono) {
  return cambiaConfigurazione({ azienda, patrono });
}

export async function aggiungiProgetto(grezzo) {
  const nome = testoCorto(grezzo, LUNGHEZZE.progetto);
  if (!nome) return ["Il nome del progetto non può essere vuoto."];
  return cambiaConfigurazione({
    progetti: [...memoria.configurazione.progetti, { nome, attivo: true }],
  });
}

export async function rinominaProgetto(vecchio, grezzo) {
  const nome = testoCorto(grezzo, LUNGHEZZE.progetto);
  if (!nome) return ["Il nome del progetto non può essere vuoto."];
  const errori = await cambiaConfigurazione({
    progetti: memoria.configurazione.progetti.map((p) => (p.nome === vecchio ? { ...p, nome } : p)),
  });
  if (errori.length) return errori;

  // Rinominare senza aggiornare le giornate lascerebbe ore senza progetto.
  for (const giorno of memoria.giorni.values()) {
    if (!giorno.progetti.some((voce) => voce.progetto === vecchio)) continue;
    for (const voce of giorno.progetti) if (voce.progetto === vecchio) voce.progetto = nome;
    await scrivi("giorni", giorno);
  }
  return [];
}

export async function impostaAttivoProgetto(nome, attivo) {
  return cambiaConfigurazione({
    progetti: memoria.configurazione.progetti.map((p) =>
      p.nome === nome ? { ...p, attivo: attivo === true } : p
    ),
  });
}

export async function eliminaProgetto(nome) {
  if (progettoUsato(nome)) {
    return [`«${nome}» ha ore registrate: disattivalo invece di eliminarlo, così le ore restano.`];
  }
  return cambiaConfigurazione({
    progetti: memoria.configurazione.progetti.filter((p) => p.nome !== nome),
  });
}

export async function aggiungiLocalita(grezzo) {
  const nome = testoCorto(grezzo, LUNGHEZZE.localita);
  if (!nome) return ["Il nome della località non può essere vuoto."];
  return cambiaConfigurazione({ localita: [...memoria.configurazione.localita, nome] });
}

/** Togliere una località dall'elenco non tocca le giornate: il nome resta scritto dove c'è. */
export async function eliminaLocalita(nome) {
  return cambiaConfigurazione({
    localita: memoria.configurazione.localita.filter((l) => l !== nome),
  });
}

export async function aggiungiAssenza(codice, nome) {
  return cambiaConfigurazione({
    assenze: [...memoria.configurazione.assenze, { codice, nome }],
  });
}

export async function rinominaAssenza(codice, nome) {
  return cambiaConfigurazione({
    assenze: memoria.configurazione.assenze.map((a) => (a.codice === codice ? { codice, nome } : a)),
  });
}

export async function eliminaAssenza(codice) {
  if (assenzaUsata(codice)) return [`Il codice «${codice}» è usato in qualche giornata: non si può eliminare.`];
  return cambiaConfigurazione({
    assenze: memoria.configurazione.assenze.filter((a) => a.codice !== codice),
  });
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
 * I progetti e le assenze già usati nelle giornate ma assenti dal file
 * restano, i progetti disattivati: le ore registrate non devono perdere il nome.
 */
export async function importaConfigurazione(contenuto) {
  if (contenuto?.formato !== FORMATO_CONFIGURAZIONE) {
    return ["Questo file non è una configurazione di Timesheet."];
  }
  if (contenuto.versione !== 1) return [`Configurazione in versione ${contenuto.versione}, non riconosciuta.`];

  const [nuova, errori] = validaConfigurazione(contenuto);
  if (errori.length) return errori;

  for (const vecchio of memoria.configurazione.progetti) {
    const presente = nuova.progetti.some((p) => p.nome === vecchio.nome);
    if (!presente && progettoUsato(vecchio.nome)) nuova.progetti.push({ nome: vecchio.nome, attivo: false });
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

export function giorniDellAnno(anno) {
  return giorniDelMese(`${anno}-`);
}

export function tuttiIGiorni() {
  return [...memoria.giorni.values()].sort((a, b) => a.data.localeCompare(b.data)).map(copia);
}

/**
 * Controlla una giornata. Le durate arrivano come testo dal modulo
 * («durata»: «4:30») oppure come minuti dai backup («minuti»: 270).
 */
function validaGiorno(data, grezzo, { apertoAmmesso, nomiProgetti, codiciAssenza, localita }) {
  const errori = [];
  const [intervalli, erroriIntervalli] = calcoli.validaIntervalli(grezzo?.intervalli ?? [], {
    apertoAmmesso,
  });
  errori.push(...erroriIntervalli);

  const progetti = [];
  for (const [indice, voce] of (grezzo?.progetti ?? []).entries()) {
    const posizione = `Progetto ${indice + 1}`;
    const nome = nomiProgetti.get(String(voce?.progetto ?? "").trim().toLowerCase());
    const minuti = durata(voce);
    if (!nome) errori.push(`${posizione}: scegli un progetto dall'elenco.`);
    if (!minuti) errori.push(`${posizione}: indica le ore, per esempio 2:30.`);
    if (nome && minuti) progetti.push({ progetto: nome, minuti });
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
  const notaStraordinario = testoCorto(grezzo?.straordinario?.nota, LUNGHEZZE.nota);
  const vuoto =
    grezzo?.straordinario?.minuti === undefined &&
    !String(grezzo?.straordinario?.durata ?? "").trim();
  if (grezzo?.straordinario && !(vuoto && !notaStraordinario)) {
    const minuti = durata(grezzo.straordinario);
    if (!minuti) errori.push("Straordinario: indica le ore, per esempio 1:30.");
    else straordinario = { minuti, nota: notaStraordinario };
  }

  if (errori.length) return [null, errori];

  // Chi ha lavorato ha lavorato da qualche parte: senza indicazione vale la
  // località abituale. Senza presenza la località non ha senso e si toglie.
  const scritta = testoCorto(grezzo?.localita, LUNGHEZZE.localita);
  return [
    {
      data,
      intervalli,
      progetti,
      descrizione: testoLungo(grezzo?.descrizione, LUNGHEZZE.descrizione),
      localita: intervalli.length ? scritta || localita : "",
      assenze,
      straordinario,
    },
    [],
  ];
}

function regoleAttuali() {
  return {
    nomiProgetti: new Map(memoria.configurazione.progetti.map((p) => [p.nome.toLowerCase(), p.nome])),
    codiciAssenza: new Set(memoria.configurazione.assenze.map((a) => a.codice)),
    localita: localitaPredefinita(),
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
  await segnaModificato(giornoValido.data.slice(0, 4));
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

// --- esportazione dell'anno ----------------------------------------------

export function statoAnno(anno) {
  return memoria.esportazioni[anno] ? { ...memoria.esportazioni[anno] } : null;
}

export async function segnaEsportato(anno, quando = new Date()) {
  memoria.esportazioni = {
    ...memoria.esportazioni,
    [anno]: { esportato: quando.toISOString(), modificatoDopo: false },
  };
  await salvaImpostazione("esportazioni", memoria.esportazioni);
}

async function segnaModificato(anno) {
  const stato = memoria.esportazioni[anno];
  if (!stato || stato.modificatoDopo) return;
  memoria.esportazioni = { ...memoria.esportazioni, [anno]: { ...stato, modificatoDopo: true } };
  await salvaImpostazione("esportazioni", memoria.esportazioni);
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
    esportazioni: copia(memoria.esportazioni),
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
    profiloGrezzo.nome || profiloGrezzo.cognome ? validaProfilo(profiloGrezzo) : [profiloIniziale(), []];
  if (erroriProfilo.length) return erroriProfilo;

  const regole = {
    nomiProgetti: new Map(nuovaConfigurazione.progetti.map((p) => [p.nome.toLowerCase(), p.nome])),
    codiciAssenza: new Set(nuovaConfigurazione.assenze.map((a) => a.codice)),
    localita: nuovoProfilo.localita || nuovaConfigurazione.localita[0] || "",
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

  const esportazioni = {};
  for (const [anno, stato] of Object.entries(contenuto.esportazioni ?? {})) {
    if (/^\d{4}$/.test(anno) && typeof stato?.esportato === "string") {
      esportazioni[anno] = { esportato: stato.esportato, modificatoDopo: stato.modificatoDopo === true };
    }
  }

  const transazione = archivio.transaction(["giorni", "impostazioni"], "readwrite");
  const giorniDeposito = transazione.objectStore("giorni");
  const impostazioniDeposito = transazione.objectStore("impostazioni");
  giorniDeposito.clear();
  for (const valido of giorni) giorniDeposito.put(valido);
  impostazioniDeposito.put({ chiave: "profilo", valore: nuovoProfilo });
  impostazioniDeposito.put({ chiave: "configurazione", valore: nuovaConfigurazione });
  impostazioniDeposito.put({ chiave: "esportazioni", valore: esportazioni });
  await new Promise((risolvi, rifiuta) => {
    transazione.oncomplete = risolvi;
    transazione.onerror = () => rifiuta(transazione.error);
    transazione.onabort = () => rifiuta(transazione.error);
  });

  memoria.giorni = new Map(giorni.map((g) => [g.data, g]));
  memoria.profilo = nuovoProfilo;
  memoria.configurazione = nuovaConfigurazione;
  memoria.esportazioni = esportazioni;
  return [];
}
