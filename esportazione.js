// I file Excel che escono dalla app e quelli che vi rientrano.
//
// Ogni dipendente ha un file per anno, come il timesheet dell'ufficio: un
// foglio per mese, impaginato da modello.js per chi lo legge, e un foglio
// nascosto «dati» con le stesse righe in forma di elenco. Il secondo serve
// all'amministrazione per rileggere i file di tutti e farne il riepilogo,
// senza dipendere dall'impaginazione dei fogli mensili: il modello può
// cambiare, il foglio dati no.

import * as calcoli from "./calcoli.js";
import { foglioMese, nomeDelMese, nomeDipendente } from "./modello.js";
import { creaXlsx, frazioneGiorno, leggiXlsx, nomeFoglioValido } from "./xlsx.js";

export const FORMATO_DATI = "timesheet-dati";
export const VERSIONE_DATI = 2;
const NOME_FOGLIO_DATI = "dati";

function foglioDati({ profilo, anno, giorni, patrono }) {
  const righe = [
    [FORMATO_DATI, VERSIONE_DATI],
    ["anno", String(anno)],
    ["dipendente", profilo?.nome ?? "", profilo?.cognome ?? "", profilo?.posizione ?? ""],
    ["ente", profilo?.ente ?? ""],
    ["progetto", profilo?.progetto ?? ""],
    ["patrono", patrono ?? ""],
    ["giorno", "data", "dalle", "alle", "attività", "località", "progetto"],
  ];
  for (const giorno of [...giorni.values()].sort((a, b) => a.data.localeCompare(b.data))) {
    righe.push(["giorno", giorno.data, giorno.dalle, giorno.alle, giorno.attivita, giorno.localita, giorno.progetto]);
  }
  return { nome: NOME_FOGLIO_DATI, nascosto: true, righe, colonne: [10, 12, 8, 8, 50, 20, 30] };
}

function perData(giorni, prefisso) {
  return new Map(
    [...giorni]
      .filter((giorno) => giorno.data.startsWith(prefisso) && !calcoli.giornoSenzaDati(giorno))
      .map((giorno) => [giorno.data, giorno])
  );
}

/** Il file .xlsx dell'anno di un dipendente: dodici fogli mensili più i dati. */
export function fileDellAnno({ profilo, anno, giorni, patrono = "" }) {
  const dellAnno = perData(giorni, `${anno}-`);
  return creaXlsx(
    [
      ...calcoli.mesiDellAnno(anno).map((mese) =>
        foglioMese({ profilo, mese, giorni: perData(dellAnno.values(), mese), patrono })
      ),
      foglioDati({ profilo, anno, giorni: dellAnno, patrono }),
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

/** Come i file dell'ufficio: «Rossi_Mario_TIME_SHEET_2026.xlsx». */
export function nomeFileAnno(profilo, anno) {
  const nome = [perNomeFile(profilo?.cognome), perNomeFile(profilo?.nome)].filter(Boolean).join("_");
  return `${nome || "timesheet"}_TIME_SHEET_${anno}.xlsx`;
}

// --- rilettura -----------------------------------------------------------

function testo(valore) {
  return valore === null || valore === undefined ? "" : String(valore).trim();
}

function orario(valore) {
  const minuti = calcoli.minutiDaOrario(testo(valore));
  return minuti === null ? null : calcoli.orarioDaMinuti(minuti);
}

/**
 * Rilegge un file prodotto da fileDellAnno. Restituisce
 * { profilo, anno, patrono, giorni: Map } oppure lancia un errore con un
 * messaggio da mostrare così com'è.
 */
export async function leggiFile(byte, nomeFile = "Il file") {
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
    throw new Error(
      `${nomeFile} viene da una versione precedente della app: chiedi di esportarlo di nuovo.`
    );
  }

  let anno = null;
  let patrono = "";
  const profilo = { nome: "", cognome: "", posizione: "", ente: "", progetto: "" };
  const giorni = new Map();
  const errori = [];

  foglio.righe.slice(1).forEach((riga, indice) => {
    const [tipo, ...valori] = riga ?? [];
    const posizione = `riga ${indice + 2}`;
    switch (testo(tipo)) {
      case "":
        return;
      case "anno":
        anno = /^\d{4}$/.test(testo(valori[0])) ? testo(valori[0]) : null;
        return;
      case "dipendente":
        profilo.nome = testo(valori[0]);
        profilo.cognome = testo(valori[1]);
        profilo.posizione = testo(valori[2]);
        return;
      case "ente":
        profilo.ente = testo(valori[0]);
        return;
      case "progetto":
        profilo.progetto = testo(valori[0]);
        return;
      case "patrono":
        patrono = testo(valori[0]);
        return;
      case "giorno": {
        if (testo(valori[0]) === "data") return;
        const data = calcoli.dataValida(testo(valori[0]));
        const dalle = testo(valori[1]) ? orario(valori[1]) : "";
        const alle = testo(valori[2]) ? orario(valori[2]) : "";
        if (!data) errori.push(`${posizione}: data non valida.`);
        else if (dalle === null || alle === null) errori.push(`${posizione}: orario non valido.`);
        else if (anno && !data.startsWith(`${anno}-`)) errori.push(`il giorno ${data} non è dell'anno ${anno}.`);
        else {
          giorni.set(data, {
            data,
            dalle,
            alle,
            attivita: testo(valori[3]),
            localita: testo(valori[4]),
            progetto: testo(valori[5]),
          });
        }
        return;
      }
      default:
        errori.push(`${posizione}: voce «${testo(tipo)}» sconosciuta.`);
    }
  });

  if (!anno) errori.push("manca l'anno.");
  if (errori.length) {
    throw new Error(`${nomeFile} contiene dati non validi: ${errori.slice(0, 3).join(" ")}`);
  }
  return { profilo, anno, patrono, giorni };
}

// --- riepilogo dell'ufficio ----------------------------------------------

function chiaveDipendente(profilo) {
  return `${profilo.cognome} ${profilo.nome}`.toLowerCase();
}

/** I mesi in cui almeno un file ha qualcosa, dal più recente. */
export function mesiConDati(letti) {
  const mesi = new Set();
  for (const file of letti) for (const data of file.giorni.keys()) mesi.add(data.slice(0, 7));
  return [...mesi].sort().reverse();
}

/**
 * Unisce i file letti. Un dipendente ripetuto (stesso nome e cognome) vale una
 * volta sola: l'ultimo file importato sostituisce il precedente.
 * Restituisce [{ anno, file }, errori].
 */
export function unisciFile(letti) {
  const anni = [...new Set(letti.map((file) => file.anno))];
  if (anni.length > 1) {
    return [null, [`I file sono di anni diversi (${anni.join(", ")}): importa un anno alla volta.`]];
  }
  const perDipendente = new Map();
  for (const file of letti) perDipendente.set(chiaveDipendente(file.profilo), file);
  const file = [...perDipendente.values()].sort((a, b) =>
    nomeDipendente(a.profilo).localeCompare(nomeDipendente(b.profilo), "it")
  );
  return [{ anno: anni[0] ?? null, file }, []];
}

/** Il riepilogo di un mese a partire dai file uniti: ore e giorni di ciascuno. */
export function riepilogoUfficio(file, mese) {
  const righe = file.map((letto) => {
    const giorni = new Map([...letto.giorni].filter(([data]) => data.startsWith(mese)));
    return { ...letto, giorni, totali: calcoli.totaliMese(giorni.values()) };
  });
  return { mese, righe };
}

const INTESTAZIONE = {
  grassetto: true,
  sfondo: "FFDCE3EC",
  bordo: true,
  allinea: "center",
  verticale: "center",
  aCapo: true,
};
const DURATA = { formato: "[h]:mm", bordo: true, allinea: "center" };

/** Il file .xlsx del riepilogo: un foglio con tutti, poi il foglio del mese di ciascuno. */
export function fileRiepilogo(riepilogo) {
  const { mese, righe } = riepilogo;
  const intestazioni = ["Dipendente", "Posizione/funzione", "Giorni con ore", "Ore lavorate", "Giorni lavorati (ore ÷ 8)"];

  const tabella = [
    [{ v: `Riepilogo timesheet — ${nomeDelMese(mese)}`, stile: { grassetto: true, dimensione: 14 } }],
    [righe.find((riga) => riga.profilo.ente)?.profilo.ente ?? ""],
    [],
    { altezza: 32, celle: intestazioni.map((voce) => ({ v: voce, stile: INTESTAZIONE })) },
    ...righe.map((riga) => [
      { v: nomeDipendente(riga.profilo), stile: { bordo: true } },
      { v: riga.profilo.posizione, stile: { bordo: true } },
      { v: riga.totali.giorniConOre, stile: { bordo: true, allinea: "center" } },
      { v: frazioneGiorno(riga.totali.minuti), stile: DURATA },
      { v: riga.totali.minuti / 60 / 8, stile: { bordo: true, allinea: "center" } },
    ]),
  ];

  const nomiUsati = new Set(["riepilogo"]);
  const fogliDipendenti = righe.map((riga) => {
    let nome = nomeFoglioValido(nomeDipendente(riga.profilo));
    for (let numero = 2; nomiUsati.has(nome.toLowerCase()); numero++) {
      nome = nomeFoglioValido(`${nomeDipendente(riga.profilo).slice(0, 27)} ${numero}`);
    }
    nomiUsati.add(nome.toLowerCase());
    return foglioMese({ profilo: riga.profilo, mese, giorni: riga.giorni, patrono: riga.patrono, nomeFoglio: nome });
  });

  return creaXlsx([
    {
      nome: "Riepilogo",
      righe: tabella,
      colonne: [28, 30, 12, 12, 14],
      bloccaRighe: 4,
      adattaLarghezza: true,
    },
    ...fogliDipendenti,
  ]);
}

export function nomeFileRiepilogo(mese) {
  return `riepilogo-timesheet_${mese}.xlsx`;
}
