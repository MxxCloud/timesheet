// Regole del timesheet che non toccano né l'archivio né la pagina: date,
// orari, ore lavorate, totali e calendario delle festività.
// Stanno qui da sole perché così si provano in Node senza un browser.

export const MINUTI_GIORNO = 24 * 60;

// --- date ----------------------------------------------------------------

export function isoLocale(data) {
  const scostamento = data.getTimezoneOffset() * 60000;
  return new Date(data - scostamento).toISOString().slice(0, 10);
}

export function oggiIso() {
  return isoLocale(new Date());
}

export function meseCorrente() {
  return oggiIso().slice(0, 7);
}

export function meseDi(iso) {
  return iso.slice(0, 7);
}

export function giorniNelMese(mese) {
  const [anno, numero] = mese.split("-").map(Number);
  // Giorno 0 del mese successivo è l'ultimo di questo, senza aritmetica sulle ore.
  return new Date(anno, numero, 0).getDate();
}

export function dateDelMese(mese) {
  return Array.from(
    { length: giorniNelMese(mese) },
    (_, indice) => `${mese}-${String(indice + 1).padStart(2, "0")}`
  );
}

export function meseSpostato(mese, passo) {
  const [anno, numero] = mese.split("-").map(Number);
  const data = new Date(anno, numero - 1 + passo, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

export function mesiDellAnno(anno) {
  return Array.from({ length: 12 }, (_, indice) => `${anno}-${String(indice + 1).padStart(2, "0")}`);
}

/** 0 = lunedì … 6 = domenica: la settimana del calendario italiano. */
export function giornoSettimana(iso) {
  const [anno, mese, giorno] = iso.split("-").map(Number);
  return (new Date(anno, mese - 1, giorno).getDay() + 6) % 7;
}

export function dataValida(grezzo) {
  const testo = String(grezzo ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(testo)) return null;
  const anno = Number(testo.slice(0, 4));
  if (anno < 2000 || anno > 2100) return null;
  const [a, m, g] = testo.split("-").map(Number);
  const data = new Date(a, m - 1, g);
  return data.getFullYear() === a && data.getMonth() === m - 1 && data.getDate() === g
    ? testo
    : null;
}

export function meseValido(grezzo) {
  const testo = String(grezzo ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(testo)) return null;
  return dataValida(`${testo}-01`) ? testo : null;
}

// --- orari e durate ------------------------------------------------------

/** «8:30», «08.30» o «0830» → minuti dalla mezzanotte; null se non è un orario. */
export function minutiDaOrario(grezzo) {
  const testo = String(grezzo ?? "").trim();
  const trovato = /^(\d{1,2})(?:[:.]?(\d{2}))?$/.exec(testo);
  if (!trovato) return null;
  const ore = Number(trovato[1]);
  const minuti = Number(trovato[2] ?? 0);
  if (ore > 23 || minuti > 59) return null;
  return ore * 60 + minuti;
}

export function orarioDaMinuti(minuti) {
  const ore = Math.floor(minuti / 60);
  return `${String(ore).padStart(2, "0")}:${String(minuti % 60).padStart(2, "0")}`;
}

/** «09:00» → «9:00», come lo mostra il foglio dell'ufficio. */
export function orarioInTesto(orario) {
  const minuti = minutiDaOrario(orario);
  return minuti === null ? "" : `${Math.floor(minuti / 60)}:${String(minuti % 60).padStart(2, "0")}`;
}

/** Minuti → «7:30». Zero si scrive «0:00», non vuoto: è un dato, non un'assenza. */
export function durataInTesto(minuti) {
  const segno = minuti < 0 ? "−" : "";
  const assoluto = Math.abs(Math.round(minuti));
  return `${segno}${Math.floor(assoluto / 60)}:${String(assoluto % 60).padStart(2, "0")}`;
}

// --- la giornata ---------------------------------------------------------

/**
 * Una giornata è una riga del timesheet dell'ufficio: dalle, alle, attività,
 * località di svolgimento e progetto. Gli orari stanno come «09:00», oppure
 * vuoti; le ore lavorate non si salvano, si calcolano.
 */
export function giornoVuoto(data) {
  return { data, dalle: "", alle: "", attivita: "", localita: "", progetto: "" };
}

/** La località da sola non è un dato: senza nient'altro la giornata è vuota. */
export function giornoSenzaDati(giorno) {
  return (
    !giorno ||
    (!giorno.dalle &&
      !giorno.alle &&
      !String(giorno.attivita ?? "").trim() &&
      !String(giorno.progetto ?? "").trim())
  );
}

/** Le ore lavorate di una riga, come la formula del modello: alle − dalle. */
export function minutiLavorati(giorno) {
  const dalle = minutiDaOrario(giorno?.dalle);
  const alle = minutiDaOrario(giorno?.alle);
  return dalle === null || alle === null || alle <= dalle ? 0 : alle - dalle;
}

/** Il totale delle ore di un insieme di giorni e quanti giorni hanno ore. */
export function totaliMese(giorni) {
  let minuti = 0;
  let giorniConOre = 0;
  for (const giorno of giorni ?? []) {
    const delGiorno = minutiLavorati(giorno);
    minuti += delGiorno;
    if (delGiorno > 0) giorniConOre += 1;
  }
  return { minuti, giorniConOre };
}

// Le assenze a giornata intera si scrivono nella colonna Attività, in
// maiuscolo e con le altre celle vuote, come chiede la guida dell'ufficio.
export const ASSENZE = ["FERIE", "MALATTIA", "PERMESSO", "ROL", "CONGEDO", "INFORTUNIO"];

/** «ferie» → «FERIE»; null se il testo non è un'assenza dell'elenco. */
export function assenza(testo) {
  const maiuscolo = String(testo ?? "").trim().toUpperCase();
  return ASSENZE.includes(maiuscolo) ? maiuscolo : null;
}

// --- festività -----------------------------------------------------------

/** Domenica di Pasqua (algoritmo di Meeus/Jones/Butcher, calendario gregoriano). */
export function pasqua(anno) {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
}

const FESTIVITA_FISSE = [
  ["01-01", "Capodanno"],
  ["01-06", "Epifania"],
  ["04-25", "Festa della Liberazione"],
  ["05-01", "Festa del Lavoro"],
  ["06-02", "Festa della Repubblica"],
  ["08-15", "Ferragosto"],
  ["11-01", "Ognissanti"],
  ["12-08", "Immacolata Concezione"],
  ["12-25", "Natale"],
  ["12-26", "Santo Stefano"],
];

/**
 * Le festività nazionali di un anno, più il patrono se indicato («MM-GG»).
 * Il 4 ottobre (San Francesco) è festa nazionale dal 2026, legge 151/2025.
 */
export function festivita(anno, patrono = "") {
  const elenco = new Map(FESTIVITA_FISSE.map(([giorno, nome]) => [`${anno}-${giorno}`, nome]));
  if (anno >= 2026) elenco.set(`${anno}-10-04`, "San Francesco d'Assisi");

  const domenica = pasqua(anno);
  elenco.set(domenica, "Pasqua");
  const [a, m, g] = domenica.split("-").map(Number);
  elenco.set(isoLocale(new Date(a, m - 1, g + 1)), "Lunedì dell'Angelo");

  const patronoValido = /^\d{2}-\d{2}$/.test(patrono) && dataValida(`${anno}-${patrono}`);
  if (patronoValido && !elenco.has(`${anno}-${patrono}`)) {
    elenco.set(`${anno}-${patrono}`, "Santo patrono");
  }
  return elenco;
}

/** «feriale», «sabato», «domenica» o «festivo», con il nome della festa. */
export function tipoGiorno(iso, patrono = "") {
  const festa = festivita(Number(iso.slice(0, 4)), patrono).get(iso);
  if (festa) return { tipo: "festivo", nome: festa };
  const settimana = giornoSettimana(iso);
  if (settimana === 6) return { tipo: "domenica", nome: "" };
  if (settimana === 5) return { tipo: "sabato", nome: "" };
  return { tipo: "feriale", nome: "" };
}
