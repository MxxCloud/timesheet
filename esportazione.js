// I file Excel che escono dalla app e quelli che vi rientrano.
//
// Ogni dipendente ha un file per anno, come il timesheet dell'ufficio: un
// foglio per mese, impaginato da modello.js per chi lo legge, e un foglio
// nascosto «dati» con le stesse registrazioni in forma di elenco. Il secondo
// serve all'amministrazione per rileggere i file di tutti e farne il
// riepilogo, senza dipendere dall'impaginazione dei fogli mensili: il modello
// può cambiare, il foglio dati no.

import * as calcoli from "./calcoli.js";
import { foglioMese, nomeDelMese, nomeDipendente } from "./modello.js";
import { creaXlsx, frazioneGiorno, leggiXlsx, nomeFoglioValido } from "./xlsx.js";

export const FORMATO_DATI = "timesheet-dati";
export const VERSIONE_DATI = 1;
const NOME_FOGLIO_DATI = "dati";

function foglioDati({ azienda, profilo, anno, giorni, tipiAssenza }) {
  const righe = [
    [FORMATO_DATI, VERSIONE_DATI],
    ["anno", String(anno)],
    ["azienda", azienda ?? ""],
    [
      "dipendente",
      profilo?.nome ?? "",
      profilo?.cognome ?? "",
      profilo?.matricola ?? "",
      profilo?.posizione ?? "",
    ],
  ];
  for (const tipo of tipiAssenza ?? []) righe.push(["tipo-assenza", tipo.codice, tipo.nome]);
  righe.push(["registro", "data", "valore", "valore", "valore"]);

  for (const giorno of [...giorni.values()].sort((a, b) => a.data.localeCompare(b.data))) {
    for (const intervallo of giorno.intervalli ?? []) {
      righe.push(["intervallo", giorno.data, intervallo.entrata, intervallo.uscita ?? ""]);
    }
    for (const voce of giorno.progetti ?? []) {
      righe.push(["progetto", giorno.data, voce.progetto, voce.minuti]);
    }
    if (giorno.descrizione) righe.push(["descrizione", giorno.data, giorno.descrizione]);
    if (giorno.localita) righe.push(["localita", giorno.data, giorno.localita]);
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
  }
  return { nome: NOME_FOGLIO_DATI, nascosto: true, righe, colonne: [14, 12, 40, 10, 30] };
}

function perData(giorni, prefisso) {
  return new Map(
    [...giorni]
      .filter((giorno) => giorno.data.startsWith(prefisso) && !calcoli.giornoSenzaDati(giorno))
      .map((giorno) => [giorno.data, giorno])
  );
}

/** Il file .xlsx dell'anno di un dipendente: dodici fogli mensili più i dati. */
export function fileDellAnno({ configurazione, profilo, anno, giorni }) {
  const dellAnno = perData(giorni, `${anno}-`);
  const tipiAssenza = configurazione?.assenze ?? [];
  const ente = configurazione?.azienda ?? "";
  return creaXlsx(
    [
      ...calcoli.mesiDellAnno(anno).map((mese) =>
        foglioMese({
          ente,
          profilo,
          mese,
          giorni: perData(dellAnno.values(), mese),
          tipiAssenza,
          patrono: configurazione?.patrono ?? "",
        })
      ),
      foglioDati({ azienda: ente, profilo, anno, giorni: dellAnno, tipiAssenza }),
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

function minuti(valore) {
  const numero = Number(valore);
  return Number.isInteger(numero) && numero >= 0 && numero <= calcoli.MINUTI_GIORNO ? numero : null;
}

/**
 * Rilegge un file prodotto da fileDellAnno. Restituisce
 * { profilo, anno, azienda, tipiAssenza, giorni: Map } oppure lancia un
 * errore con un messaggio da mostrare così com'è.
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
    throw new Error(`${nomeFile} usa una versione dei dati non riconosciuta (${foglio.righe[0][1]}).`);
  }

  let anno = null;
  let azienda = "";
  const profilo = { nome: "", cognome: "", matricola: "", posizione: "" };
  const tipiAssenza = [];
  const giorni = new Map();
  const errori = [];

  const giorno = (data) => {
    if (!giorni.has(data)) giorni.set(data, calcoli.giornoVuoto(data));
    return giorni.get(data);
  };

  foglio.righe.slice(1).forEach((riga, indice) => {
    const [tipo, ...valori] = riga ?? [];
    const posizione = `riga ${indice + 2}`;
    switch (testo(tipo)) {
      case "":
      case "registro":
        return;
      case "anno":
        anno = /^\d{4}$/.test(testo(valori[0])) ? testo(valori[0]) : null;
        return;
      case "azienda":
        azienda = testo(valori[0]);
        return;
      case "dipendente":
        profilo.nome = testo(valori[0]);
        profilo.cognome = testo(valori[1]);
        profilo.matricola = testo(valori[2]);
        profilo.posizione = testo(valori[3]);
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
      case "intervallo":
        giorno(data).intervalli.push({ entrata: testo(valori[1]), uscita: testo(valori[2]) || null });
        return;
      case "progetto": {
        const durata = minuti(valori[2]);
        if (!testo(valori[1]) || durata === null) errori.push(`${posizione}: progetto non valido.`);
        else giorno(data).progetti.push({ progetto: testo(valori[1]), minuti: durata });
        return;
      }
      case "descrizione":
        giorno(data).descrizione = testo(valori[1]);
        return;
      case "localita":
        giorno(data).localita = testo(valori[1]);
        return;
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
      default:
        errori.push(`${posizione}: voce «${testo(tipo)}» sconosciuta.`);
    }
  });

  if (!anno) errori.push("manca l'anno.");
  for (const [data, registrato] of giorni) {
    if (anno && !data.startsWith(`${anno}-`)) errori.push(`il giorno ${data} non è dell'anno ${anno}.`);
    const [validi, suoi] = calcoli.validaIntervalli(registrato.intervalli, { apertoAmmesso: true });
    if (suoi.length) errori.push(`${data}: ${suoi.join(" ")}`);
    else registrato.intervalli = validi;
  }
  if (errori.length) {
    throw new Error(`${nomeFile} contiene dati non validi: ${errori.slice(0, 3).join(" ")}`);
  }

  return { profilo, anno, azienda, tipiAssenza, giorni };
}

// --- riepilogo dell'ufficio ----------------------------------------------

function chiaveDipendente(profilo) {
  return (profilo.matricola || `${profilo.cognome} ${profilo.nome}`).toLowerCase();
}

/** I mesi in cui almeno un file ha qualcosa, dal più recente. */
export function mesiConDati(letti) {
  const mesi = new Set();
  for (const file of letti) for (const data of file.giorni.keys()) mesi.add(data.slice(0, 7));
  return [...mesi].sort().reverse();
}

/**
 * Unisce i file letti. Un dipendente ripetuto (stessa matricola, o stesso
 * nome se manca) vale una volta sola: l'ultimo file importato sostituisce il
 * precedente. Restituisce [{ anno, file }, errori].
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

/** Il riepilogo di un mese a partire dai file uniti. */
export function riepilogoUfficio(file, mese) {
  const tipiAssenza = new Map();
  const progetti = [];
  const righe = file.map((letto) => {
    const giorni = new Map([...letto.giorni].filter(([data]) => data.startsWith(mese)));
    for (const tipo of letto.tipiAssenza) if (!tipiAssenza.has(tipo.codice)) tipiAssenza.set(tipo.codice, tipo);
    const totali = calcoli.totaliMese([...giorni.values()]);
    for (const codice of totali.perAssenza.keys()) {
      if (!tipiAssenza.has(codice)) tipiAssenza.set(codice, { codice, nome: "" });
    }
    for (const nome of totali.perProgetto.keys()) if (!progetti.includes(nome)) progetti.push(nome);
    return { ...letto, giorni, totali };
  });

  // Nel riepilogo compaiono solo le assenze usate da qualcuno nel mese.
  const assenzeUsate = [...tipiAssenza.values()].filter((tipo) =>
    righe.some((riga) => riga.totali.perAssenza.has(tipo.codice))
  );
  return { mese, righe, tipiAssenza: assenzeUsate, progetti };
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
export function fileRiepilogo(riepilogo, configurazione = {}) {
  const { mese, righe, tipiAssenza, progetti } = riepilogo;
  const intestazioni = [
    "Dipendente",
    "Matricola",
    "Giorni di presenza",
    "Ore lavorate",
    ...tipiAssenza.map((tipo) => (tipo.nome ? `${tipo.codice} — ${tipo.nome}` : tipo.codice)),
    "Straordinari",
    ...progetti,
  ];
  const durata = (minutiDurata) => ({ v: minutiDurata ? frazioneGiorno(minutiDurata) : null, stile: DURATA });

  const tabella = [
    [{ v: `Riepilogo presenze — ${nomeDelMese(mese)}`, stile: { grassetto: true, dimensione: 14 } }],
    [configurazione.azienda ?? ""],
    [],
    { altezza: 32, celle: intestazioni.map((voce) => ({ v: voce, stile: INTESTAZIONE })) },
    ...righe.map((riga) => [
      { v: nomeDipendente(riga.profilo), stile: { bordo: true } },
      { v: riga.profilo.matricola, stile: { bordo: true, allinea: "center" } },
      { v: riga.totali.giorniPresenza, stile: { bordo: true, allinea: "center" } },
      durata(riga.totali.lavorate),
      ...tipiAssenza.map((tipo) => durata(riga.totali.perAssenza.get(tipo.codice))),
      durata(riga.totali.straordinario),
      ...progetti.map((nome) => durata(riga.totali.perProgetto.get(nome))),
    ]),
  ];

  const nomiUsati = new Set(["riepilogo"]);
  const fogliDipendenti = righe.map((riga) => {
    let nome = nomeFoglioValido(nomeDipendente(riga.profilo));
    for (let numero = 2; nomiUsati.has(nome.toLowerCase()); numero++) {
      nome = nomeFoglioValido(`${nomeDipendente(riga.profilo).slice(0, 27)} ${numero}`);
    }
    nomiUsati.add(nome.toLowerCase());
    return foglioMese({
      ente: configurazione.azienda || riga.azienda,
      profilo: riga.profilo,
      mese,
      giorni: riga.giorni,
      tipiAssenza: riga.tipiAssenza.length ? riga.tipiAssenza : configurazione.assenze ?? [],
      patrono: configurazione.patrono ?? "",
      nomeFoglio: nome,
    });
  });

  return creaXlsx([
    {
      nome: "Riepilogo",
      righe: tabella,
      colonne: [26, 11, 10, 10, ...tipiAssenza.map(() => 12), 13, ...progetti.map(() => 14)],
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
