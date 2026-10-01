// Impaginazione del foglio Excel del timesheet mensile: è il file da cambiare
// quando cambia il modello dell'ufficio. Riceve dati già validati e restituisce
// la descrizione di un foglio per xlsx.js; non legge l'archivio e non calcola
// nulla che non stia già in calcoli.js.
//
// Disposizione: intestazione con azienda, mese e dipendente; una riga per
// giorno con le timbrature, le ore lavorate, le ore per attività, l'assenza,
// lo straordinario annotato e le note; i totali con le formule; il riepilogo
// delle assenze e lo spazio per le firme.

import * as calcoli from "./calcoli.js";
import { frazioneGiorno, lettereColonna, serialeData } from "./xlsx.js";

const NOMI_GIORNI = ["lun", "mar", "mer", "gio", "ven", "sab", "dom"];
const meseLungo = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });

const GRIGIO_INTESTAZIONE = "FFDCE3EC";
const GRIGIO_FESTIVO = "FFEFF1F4";

const STILI = {
  titolo: { grassetto: true, dimensione: 14 },
  etichetta: { grassetto: true },
  valore: {},
  intestazione: {
    grassetto: true,
    sfondo: GRIGIO_INTESTAZIONE,
    bordo: true,
    allinea: "center",
    aCapo: true,
  },
  data: { formato: "dd/mm/yyyy", bordo: true, allinea: "center" },
  testo: { bordo: true, allinea: "center" },
  orario: { formato: "hh:mm", bordo: true, allinea: "center" },
  durata: { formato: "[h]:mm", bordo: true, allinea: "center" },
  nota: { bordo: true, aCapo: true },
};

function conSfondo(stile, sfondo) {
  return sfondo ? { ...stile, sfondo } : stile;
}

function totale(stile) {
  return { ...stile, grassetto: true, sfondo: GRIGIO_INTESTAZIONE };
}

export function nomeDelMese(mese) {
  const [anno, numero] = mese.split("-").map(Number);
  const testo = meseLungo.format(new Date(anno, numero - 1, 1));
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

export function nomeDipendente(profilo) {
  return [profilo?.cognome, profilo?.nome].filter(Boolean).join(" ") || "Dipendente";
}

function durataOVuoto(minuti, stile) {
  return { v: minuti ? frazioneGiorno(minuti) : null, stile };
}

function orarioOVuoto(orario, stile) {
  const minuti = calcoli.minutiDaOrario(orario);
  return { v: minuti === null ? null : frazioneGiorno(minuti), stile };
}

/**
 * Il foglio del mese di un dipendente.
 * giorni: Map data ISO → giorno (i giorni mancanti sono vuoti);
 * attivita: nomi delle colonne di attività, nell'ordine voluto;
 * tipiAssenza: [{ codice, nome }].
 */
export function foglioTimesheet({
  azienda = "",
  profilo = {},
  mese,
  giorni = new Map(),
  attivita = [],
  tipiAssenza = [],
  patrono = "",
  nomeFoglio = "Timesheet",
}) {
  const colonneAttivita = attivita.length;
  const primaAttivita = 7;
  const colonnaAssenza = primaAttivita + colonneAttivita;
  const colonnaOreAssenza = colonnaAssenza + 1;
  const colonnaStraordinario = colonnaAssenza + 2;
  const colonnaNote = colonnaAssenza + 3;
  const ultimaColonna = colonnaNote;

  const righe = [];
  const unite = [];
  const vuote = (quante) => Array.from({ length: quante }, () => null);

  righe.push({
    altezza: 22,
    celle: [{ v: `Timesheet mensile — ${nomeDelMese(mese)}`, stile: STILI.titolo }],
  });
  unite.push(`A1:${lettereColonna(ultimaColonna)}1`);
  righe.push([
    { v: "Azienda", stile: STILI.etichetta },
    null,
    { v: azienda, stile: STILI.valore },
  ]);
  righe.push([
    { v: "Dipendente", stile: STILI.etichetta },
    null,
    { v: nomeDipendente(profilo), stile: STILI.valore },
    null,
    null,
    null,
    { v: "Matricola", stile: STILI.etichetta },
    { v: profilo?.matricola ?? "", stile: STILI.valore },
  ]);
  unite.push("A2:B2", "A3:B3", `C2:${lettereColonna(Math.max(5, ultimaColonna))}2`, "C3:F3");
  righe.push([]);

  const intestazioni = [
    "Data",
    "Giorno",
    "Entrata",
    "Uscita",
    "Entrata",
    "Uscita",
    "Ore lavorate",
    ...attivita,
    "Assenza",
    "Ore assenza",
    "Straord.",
    "Note",
  ];
  righe.push({
    altezza: 32,
    celle: intestazioni.map((testo) => ({ v: testo, stile: STILI.intestazione })),
  });
  const rigaIntestazione = righe.length;

  const date = calcoli.dateDelMese(mese);
  for (const data of date) {
    const giorno = giorni.get(data) ?? calcoli.giornoVuoto(data);
    const calendario = calcoli.tipoGiorno(data, patrono);
    const sfondo = calendario.tipo === "feriale" ? null : GRIGIO_FESTIVO;
    const stile = (nome) => conSfondo(STILI[nome], sfondo);
    const totali = calcoli.totaliGiorno(giorno);

    const [primo, secondo, ...altri] = giorno.intervalli ?? [];
    const perAttivita = new Map();
    for (const voce of giorno.attivita ?? []) {
      perAttivita.set(voce.attivita, (perAttivita.get(voce.attivita) ?? 0) + voce.minuti);
    }

    const note = [];
    if (calendario.nome) note.push(calendario.nome);
    if (altri.length) {
      note.push(
        `Altri intervalli: ${altri.map((i) => `${i.entrata}–${i.uscita ?? "…"}`).join(", ")}`
      );
    }
    for (const voce of giorno.attivita ?? []) {
      if (voce.descrizione) note.push(`${voce.attivita}: ${voce.descrizione}`);
    }
    if (giorno.straordinario?.nota) note.push(`Straordinario: ${giorno.straordinario.nota}`);
    if (giorno.note) note.push(giorno.note);

    righe.push([
      { v: serialeData(data), stile: stile("data") },
      { v: NOMI_GIORNI[calcoli.giornoSettimana(data)], stile: stile("testo") },
      orarioOVuoto(primo?.entrata, stile("orario")),
      orarioOVuoto(primo?.uscita, stile("orario")),
      orarioOVuoto(secondo?.entrata, stile("orario")),
      orarioOVuoto(secondo?.uscita, stile("orario")),
      durataOVuoto(totali.presenza, stile("durata")),
      ...attivita.map((nome) => durataOVuoto(perAttivita.get(nome) ?? 0, stile("durata"))),
      { v: (giorno.assenze ?? []).map((a) => a.tipo).join(", "), stile: stile("testo") },
      durataOVuoto(totali.assenze, stile("durata")),
      durataOVuoto(totali.straordinario, stile("durata")),
      { v: note.join(" · "), stile: stile("nota") },
    ]);
  }

  const prima = rigaIntestazione + 1;
  const ultima = rigaIntestazione + date.length;
  const totaliMese = calcoli.totaliMese([...giorni.values()].filter((g) => g.data?.startsWith(mese)));
  const somma = (colonna, minuti) => ({
    f: `SUM(${lettereColonna(colonna)}${prima}:${lettereColonna(colonna)}${ultima})`,
    v: frazioneGiorno(minuti),
    stile: totale(STILI.durata),
  });

  const rigaTotali = vuote(ultimaColonna + 1).map(() => ({ v: null, stile: totale(STILI.testo) }));
  rigaTotali[0] = { v: "Totale", stile: totale(STILI.testo) };
  rigaTotali[6] = somma(6, totaliMese.presenza);
  attivita.forEach((nome, indice) => {
    rigaTotali[primaAttivita + indice] = somma(
      primaAttivita + indice,
      totaliMese.perAttivita.get(nome) ?? 0
    );
  });
  rigaTotali[colonnaOreAssenza] = somma(colonnaOreAssenza, totaliMese.assenze);
  rigaTotali[colonnaStraordinario] = somma(colonnaStraordinario, totaliMese.straordinario);
  righe.push(rigaTotali);
  unite.push(`A${righe.length}:F${righe.length}`);

  // Riepilogo delle assenze: un codice per riga, con ore e giorni.
  const usate = tipiAssenza.filter((tipo) => totaliMese.perAssenza.has(tipo.codice));
  const ignote = [...totaliMese.perAssenza.keys()].filter(
    (codice) => !tipiAssenza.some((tipo) => tipo.codice === codice)
  );
  const elencoAssenze = [...usate, ...ignote.map((codice) => ({ codice, nome: "" }))];
  if (elencoAssenze.length) {
    righe.push([]);
    righe.push([
      { v: "Assenze", stile: STILI.intestazione },
      { v: null, stile: STILI.intestazione },
      { v: null, stile: STILI.intestazione },
      { v: "Ore", stile: STILI.intestazione },
      { v: "Giorni", stile: STILI.intestazione },
    ]);
    unite.push(`A${righe.length}:C${righe.length}`);
    for (const tipo of elencoAssenze) {
      const giorniConAssenza = [...giorni.values()].filter((g) =>
        g.assenze?.some((a) => a.tipo === tipo.codice)
      ).length;
      righe.push([
        { v: tipo.nome ? `${tipo.codice} — ${tipo.nome}` : tipo.codice, stile: { bordo: true } },
        { v: null, stile: { bordo: true } },
        { v: null, stile: { bordo: true } },
        durataOVuoto(totaliMese.perAssenza.get(tipo.codice), STILI.durata),
        { v: giorniConAssenza, stile: { bordo: true, allinea: "center" } },
      ]);
      unite.push(`A${righe.length}:C${righe.length}`);
    }
  }

  righe.push([], []);
  righe.push([
    { v: "Firma del dipendente", stile: STILI.etichetta },
    null,
    null,
    null,
    null,
    null,
    { v: "Firma del responsabile", stile: STILI.etichetta },
  ]);
  righe.push([]);
  righe.push([
    { v: "______________________________", stile: STILI.valore },
    null,
    null,
    null,
    null,
    null,
    { v: "______________________________", stile: STILI.valore },
  ]);

  return {
    nome: nomeFoglio,
    colonne: [11, 7, 8, 8, 8, 8, 9, ...attivita.map(() => 13), 9, 9, 9, 44],
    righe,
    unite,
    bloccaRighe: rigaIntestazione,
    orizzontale: true,
    adattaLarghezza: true,
  };
}
