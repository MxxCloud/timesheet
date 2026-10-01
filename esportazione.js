// I file Excel che escono dalla app e quelli che vi rientrano.
//
// Ogni file mensile ha due fogli: quello visibile, impaginato da modello.js per
// chi lo legge, e un foglio nascosto «dati» con le stesse registrazioni in
// forma di elenco. Il secondo serve all'amministrazione per rileggere i file di
// tutti e farne il riepilogo, senza dipendere dall'impaginazione del primo:
// il modello può cambiare, il foglio dati no.

import * as calcoli from "./calcoli.js";
import { foglioTimesheet, nomeDelMese, nomeDipendente } from "./modello.js";
import { creaXlsx, frazioneGiorno, leggiXlsx, nomeFoglioValido } from "./xlsx.js";

export const FORMATO_DATI = "timesheet-dati";
export const VERSIONE_DATI = 1;
const NOME_FOGLIO_DATI = "dati";

function attivitaDelMese(configurazione, giorni) {
  // Le colonne sono le attività attive più quelle usate nel mese anche se
  // disattivate dopo: un'ora registrata non deve sparire dal file.
  const usate = new Set();
  for (const giorno of giorni.values()) {
    for (const voce of giorno.attivita ?? []) usate.add(voce.attivita);
  }
  const nomi = (configurazione?.attivita ?? [])
    .filter((attivita) => attivita.attiva !== false || usate.has(attivita.nome))
    .map((attivita) => attivita.nome);
  for (const nome of usate) if (!nomi.includes(nome)) nomi.push(nome);
  return nomi;
}

function foglioDati({ azienda, profilo, mese, giorni, tipiAssenza }) {
  const righe = [
    [FORMATO_DATI, VERSIONE_DATI],
    ["mese", mese],
    ["azienda", azienda ?? ""],
    ["dipendente", profilo?.nome ?? "", profilo?.cognome ?? "", profilo?.matricola ?? ""],
  ];
  for (const tipo of tipiAssenza ?? []) righe.push(["tipo-assenza", tipo.codice, tipo.nome]);
  righe.push(["registro", "data", "valore", "valore", "valore"]);

  for (const giorno of [...giorni.values()].sort((a, b) => a.data.localeCompare(b.data))) {
    for (const intervallo of giorno.intervalli ?? []) {
      righe.push(["intervallo", giorno.data, intervallo.entrata, intervallo.uscita ?? ""]);
    }
    for (const voce of giorno.attivita ?? []) {
      righe.push(["attivita", giorno.data, voce.attivita, voce.minuti, voce.descrizione ?? ""]);
    }
    for (const voce of giorno.assenze ?? []) {
      righe.push(["assenza", giorno.data, voce.tipo, voce.minuti]);
    }
    if (giorno.straordinario) {
      righe.push([
        "straordinario",
        giorno.data,
        giorno.straordinario.minuti,
        giorno.straordinario.nota ?? "",
      ]);
    }
    if (giorno.note) righe.push(["nota", giorno.data, giorno.note]);
  }
  return { nome: NOME_FOGLIO_DATI, nascosto: true, righe, colonne: [14, 12, 24, 10, 40] };
}

function giorniDelMese(giorni, mese) {
  return new Map(
    [...giorni]
      .filter((giorno) => giorno.data.startsWith(mese) && !calcoli.giornoSenzaDati(giorno))
      .map((giorno) => [giorno.data, giorno])
  );
}

/** Il file .xlsx del mese di un dipendente. */
export function fileDelMese({ configurazione, profilo, mese, giorni }) {
  const delMese = giorniDelMese(giorni, mese);
  const tipiAssenza = configurazione?.assenze ?? [];
  const azienda = configurazione?.azienda ?? "";
  return creaXlsx(
    [
      foglioTimesheet({
        azienda,
        profilo,
        mese,
        giorni: delMese,
        attivita: attivitaDelMese(configurazione, delMese),
        tipiAssenza,
        patrono: configurazione?.patrono ?? "",
      }),
      foglioDati({ azienda, profilo, mese, giorni: delMese, tipiAssenza }),
    ],
    { autore: nomeDipendente(profilo) }
  );
}

function perNomeFile(testo) {
  return String(testo ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function nomeFileMese(profilo, mese) {
  const nome = [perNomeFile(profilo?.cognome), perNomeFile(profilo?.nome)].filter(Boolean).join("_");
  return `${nome || "timesheet"}_${mese}.xlsx`;
}

// --- rilettura -----------------------------------------------------------

function testo(valore) {
  return valore === null || valore === undefined ? "" : String(valore).trim();
}

function minuti(valore) {
  const numero = Number(valore);
  return Number.isInteger(numero) && numero >= 0 && numero <= calcoli.MINUTI_GIORNO ? numero : null;
}

/**
 * Rilegge un file prodotto da fileDelMese. Restituisce
 * { profilo, mese, azienda, tipiAssenza, giorni: Map } oppure lancia un
 * errore con un messaggio da mostrare così com'è.
 */
export async function leggiFileMese(byte, nomeFile = "Il file") {
  let fogli;
  try {
    fogli = await leggiXlsx(byte);
  } catch {
    throw new Error(`${nomeFile} non è un file Excel leggibile.`);
  }

  const foglio = fogli.find(
    (f) => f.nome === NOME_FOGLIO_DATI && testo(f.righe[0]?.[0]) === FORMATO_DATI
  );
  if (!foglio) {
    throw new Error(`${nomeFile} non è stato esportato dalla app Timesheet: manca il foglio dei dati.`);
  }
  if (Number(foglio.righe[0][1]) !== VERSIONE_DATI) {
    throw new Error(`${nomeFile} usa una versione dei dati non riconosciuta (${foglio.righe[0][1]}).`);
  }

  let mese = null;
  let azienda = "";
  const profilo = { nome: "", cognome: "", matricola: "" };
  const tipiAssenza = [];
  const giorni = new Map();
  const errori = [];

  const giorno = (data) => {
    if (!giorni.has(data)) giorni.set(data, calcoli.giornoVuoto(data));
    return giorni.get(data);
  };

  foglio.righe.slice(1).forEach((riga, indice) => {
    const [tipo, ...valori] = (riga ?? []).map((valore) => valore);
    const posizione = `riga ${indice + 2}`;
    switch (testo(tipo)) {
      case "":
      case "registro":
        return;
      case "mese":
        mese = calcoli.meseValido(testo(valori[0]));
        return;
      case "azienda":
        azienda = testo(valori[0]);
        return;
      case "dipendente":
        profilo.nome = testo(valori[0]);
        profilo.cognome = testo(valori[1]);
        profilo.matricola = testo(valori[2]);
        return;
      case "tipo-assenza":
        tipiAssenza.push({ codice: testo(valori[0]), nome: testo(valori[1]) });
        return;
    }

    const data = calcoli.dataValida(testo(valori[0]));
    if (!data) {
      errori.push(`${posizione}: data non valida.`);
      return;
    }

    switch (testo(tipo)) {
      case "intervallo": {
        giorno(data).intervalli.push({ entrata: testo(valori[1]), uscita: testo(valori[2]) || null });
        return;
      }
      case "attivita": {
        const durata = minuti(valori[2]);
        if (!testo(valori[1]) || durata === null) errori.push(`${posizione}: attività non valida.`);
        else {
          giorno(data).attivita.push({
            attivita: testo(valori[1]),
            minuti: durata,
            descrizione: testo(valori[3]),
          });
        }
        return;
      }
      case "assenza": {
        const durata = minuti(valori[2]);
        if (!testo(valori[1]) || durata === null) errori.push(`${posizione}: assenza non valida.`);
        else giorno(data).assenze.push({ tipo: testo(valori[1]), minuti: durata });
        return;
      }
      case "straordinario": {
        const durata = minuti(valori[1]);
        if (durata === null) errori.push(`${posizione}: straordinario non valido.`);
        else giorno(data).straordinario = { minuti: durata, nota: testo(valori[2]) };
        return;
      }
      case "nota":
        giorno(data).note = testo(valori[1]);
        return;
      default:
        errori.push(`${posizione}: voce «${testo(tipo)}» sconosciuta.`);
    }
  });

  if (!mese) errori.push("manca il mese.");
  for (const [data, registrato] of giorni) {
    if (mese && !data.startsWith(mese)) errori.push(`il giorno ${data} non è del mese ${mese}.`);
    const [validi, suoi] = calcoli.validaIntervalli(registrato.intervalli, { apertoAmmesso: true });
    if (suoi.length) errori.push(`${data}: ${suoi.join(" ")}`);
    else registrato.intervalli = validi;
  }
  if (errori.length) {
    throw new Error(`${nomeFile} contiene dati non validi: ${errori.slice(0, 3).join(" ")}`);
  }

  return { profilo, mese, azienda, tipiAssenza, giorni };
}

// --- riepilogo dell'ufficio ----------------------------------------------

function chiaveDipendente(profilo) {
  return (profilo.matricola || `${profilo.cognome} ${profilo.nome}`).toLowerCase();
}

/**
 * Unisce i file letti in un riepilogo per un mese. Un dipendente ripetuto
 * (stessa matricola, o stesso nome se manca) vale una volta sola: l'ultimo
 * file importato sostituisce il precedente.
 */
export function riepilogoUfficio(letti) {
  const mesi = [...new Set(letti.map((file) => file.mese))];
  if (mesi.length > 1) {
    return [null, [`I file sono di mesi diversi (${mesi.join(", ")}): importa un mese alla volta.`]];
  }

  const perDipendente = new Map();
  for (const file of letti) perDipendente.set(chiaveDipendente(file.profilo), file);
  const dipendenti = [...perDipendente.values()].sort((a, b) =>
    nomeDipendente(a.profilo).localeCompare(nomeDipendente(b.profilo), "it")
  );

  const tipiAssenza = new Map();
  const attivita = [];
  const righe = dipendenti.map((file) => {
    for (const tipo of file.tipiAssenza) if (!tipiAssenza.has(tipo.codice)) tipiAssenza.set(tipo.codice, tipo);
    const totali = calcoli.totaliMese([...file.giorni.values()]);
    for (const codice of totali.perAssenza.keys()) {
      if (!tipiAssenza.has(codice)) tipiAssenza.set(codice, { codice, nome: "" });
    }
    for (const nome of totali.perAttivita.keys()) if (!attivita.includes(nome)) attivita.push(nome);
    return { ...file, totali };
  });

  // Nel riepilogo compaiono solo le assenze usate da qualcuno.
  const assenzeUsate = [...tipiAssenza.values()].filter((tipo) =>
    righe.some((riga) => riga.totali.perAssenza.has(tipo.codice))
  );

  return [{ mese: mesi[0] ?? null, righe, tipiAssenza: assenzeUsate, attivita }, []];
}

const INTESTAZIONE = {
  grassetto: true,
  sfondo: "FFDCE3EC",
  bordo: true,
  allinea: "center",
  aCapo: true,
};
const DURATA = { formato: "[h]:mm", bordo: true, allinea: "center" };

/** Il file .xlsx del riepilogo: un foglio con tutti, poi un foglio per dipendente. */
export function fileRiepilogo(riepilogo, configurazione = {}) {
  const { mese, righe, tipiAssenza, attivita } = riepilogo;
  const intestazioni = [
    "Dipendente",
    "Matricola",
    "Giorni di presenza",
    "Ore lavorate",
    ...tipiAssenza.map((tipo) => (tipo.nome ? `${tipo.codice} — ${tipo.nome}` : tipo.codice)),
    "Straordinari",
    ...attivita,
  ];
  const durata = (minuti) => ({ v: minuti ? frazioneGiorno(minuti) : null, stile: DURATA });

  const tabella = [
    [{ v: `Riepilogo presenze — ${nomeDelMese(mese)}`, stile: { grassetto: true, dimensione: 14 } }],
    [configurazione.azienda ?? ""],
    [],
    { altezza: 32, celle: intestazioni.map((testoIntestazione) => ({ v: testoIntestazione, stile: INTESTAZIONE })) },
    ...righe.map((riga) => [
      { v: nomeDipendente(riga.profilo), stile: { bordo: true } },
      { v: riga.profilo.matricola, stile: { bordo: true, allinea: "center" } },
      { v: riga.totali.giorniPresenza, stile: { bordo: true, allinea: "center" } },
      durata(riga.totali.presenza),
      ...tipiAssenza.map((tipo) => durata(riga.totali.perAssenza.get(tipo.codice))),
      durata(riga.totali.straordinario),
      ...attivita.map((nome) => durata(riga.totali.perAttivita.get(nome))),
    ]),
  ];

  const nomiUsati = new Set(["riepilogo"]);
  const fogliDipendenti = righe.map((riga) => {
    let nome = nomeFoglioValido(nomeDipendente(riga.profilo));
    for (let numero = 2; nomiUsati.has(nome.toLowerCase()); numero++) {
      nome = nomeFoglioValido(`${nomeDipendente(riga.profilo).slice(0, 27)} ${numero}`);
    }
    nomiUsati.add(nome.toLowerCase());
    const colonne = attivitaDelMese(configurazione, riga.giorni);
    return foglioTimesheet({
      azienda: configurazione.azienda || riga.azienda,
      profilo: riga.profilo,
      mese,
      giorni: riga.giorni,
      attivita: colonne,
      tipiAssenza: riga.tipiAssenza.length ? riga.tipiAssenza : configurazione.assenze ?? [],
      patrono: configurazione.patrono ?? "",
      nomeFoglio: nome,
    });
  });

  return creaXlsx([
    {
      nome: "Riepilogo",
      righe: tabella,
      colonne: [26, 11, 10, 10, ...tipiAssenza.map(() => 12), 13, ...attivita.map(() => 14)],
      bloccaRighe: 4,
      orizzontale: true,
      adattaLarghezza: true,
    },
    ...fogliDipendenti,
  ]);
}

export function nomeFileRiepilogo(mese) {
  return `riepilogo-presenze_${mese}.xlsx`;
}
