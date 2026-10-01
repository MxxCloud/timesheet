// Regole del timesheet che non toccano né l'archivio né la pagina: orari,
// durate, controlli sugli intervalli, totali e calendario delle festività.
// Stanno qui da sole perché così si provano in Node senza un browser.

export const MINUTI_GIORNO = 24 * 60;
const DURATA_MASSIMA = MINUTI_GIORNO;

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

/**
 * Una durata scritta come la scrive chi compila un timesheet: «7:30», «7,5»,
 * «7.5» o «7» sono tutte sette ore e mezza o sette ore. Restituisce minuti.
 */
export function minutiDaDurata(grezzo) {
  const testo = String(grezzo ?? "").trim();
  if (!testo) return null;

  const conDuePunti = /^(\d{1,2}):(\d{2})$/.exec(testo);
  if (conDuePunti) {
    const minuti = Number(conDuePunti[2]);
    if (minuti > 59) return null;
    const totale = Number(conDuePunti[1]) * 60 + minuti;
    return totale <= DURATA_MASSIMA ? totale : null;
  }

  if (!/^\d{1,2}(?:[.,]\d{1,2})?$/.test(testo)) return null;
  const totale = Math.round(Number(testo.replace(",", ".")) * 60);
  return totale <= DURATA_MASSIMA ? totale : null;
}

/** Minuti → «7:30». Zero si scrive «0:00», non vuoto: è un dato, non un'assenza. */
export function durataInTesto(minuti) {
  const segno = minuti < 0 ? "−" : "";
  const assoluto = Math.abs(Math.round(minuti));
  return `${segno}${Math.floor(assoluto / 60)}:${String(assoluto % 60).padStart(2, "0")}`;
}

// --- intervalli di presenza ----------------------------------------------

/**
 * Controlla gli intervalli di un giorno e li restituisce ordinati.
 * Solo l'ultimo può restare aperto (uscita mancante), e solo se `apertoAmmesso`:
 * è il caso di chi è al lavoro in questo momento.
 */
export function validaIntervalli(grezzi, { apertoAmmesso = false } = {}) {
  const errori = [];
  const intervalli = [];

  for (const [indice, grezzo] of (grezzi ?? []).entries()) {
    const posizione = `Intervallo ${indice + 1}`;
    const entrata = minutiDaOrario(grezzo?.entrata);
    const uscitaVuota = grezzo?.uscita === null || String(grezzo?.uscita ?? "").trim() === "";
    const uscita = uscitaVuota ? null : minutiDaOrario(grezzo?.uscita);

    if (entrata === null) {
      errori.push(`${posizione}: l'orario di entrata non è valido.`);
      continue;
    }
    if (!uscitaVuota && uscita === null) {
      errori.push(`${posizione}: l'orario di uscita non è valido.`);
      continue;
    }
    if (uscita !== null && uscita <= entrata) {
      errori.push(`${posizione}: l'uscita deve essere dopo l'entrata.`);
      continue;
    }
    intervalli.push({ entrata, uscita });
  }
  if (errori.length) return [null, errori];

  intervalli.sort((a, b) => a.entrata - b.entrata);

  const aperti = intervalli.filter((i) => i.uscita === null);
  if (aperti.length && !apertoAmmesso) {
    return [null, ["Ogni intervallo deve avere l'orario di uscita."]];
  }
  if (aperti.length > 1 || (aperti.length === 1 && intervalli.at(-1).uscita !== null)) {
    return [null, ["Solo l'ultimo intervallo della giornata può restare senza uscita."]];
  }

  for (let indice = 1; indice < intervalli.length; indice++) {
    const precedente = intervalli[indice - 1];
    if (intervalli[indice].entrata < precedente.uscita) {
      return [
        null,
        [
          `Gli intervalli ${orarioDaMinuti(precedente.entrata)}–${orarioDaMinuti(precedente.uscita)} ` +
            `e dalle ${orarioDaMinuti(intervalli[indice].entrata)} si sovrappongono.`,
        ],
      ];
    }
  }

  return [
    intervalli.map((i) => ({
      entrata: orarioDaMinuti(i.entrata),
      uscita: i.uscita === null ? null : orarioDaMinuti(i.uscita),
    })),
    [],
  ];
}

/**
 * Minuti di presenza. Un intervallo aperto conta fino ad `adesso` (minuti
 * dalla mezzanotte) se lo si passa, altrimenti non conta: per un giorno già
 * chiuso non ha senso, e per oggi lo si vuole vedere crescere.
 */
export function minutiPresenza(intervalli, adesso = null) {
  let totale = 0;
  for (const intervallo of intervalli ?? []) {
    const entrata = minutiDaOrario(intervallo.entrata);
    const uscita =
      intervallo.uscita === null || intervallo.uscita === undefined
        ? adesso
        : minutiDaOrario(intervallo.uscita);
    if (entrata === null || uscita === null || uscita <= entrata) continue;
    totale += uscita - entrata;
  }
  return totale;
}

/** Le pause sono i buchi fra un intervallo e il successivo. */
export function pause(intervalli) {
  const chiusi = (intervalli ?? []).filter((i) => i.uscita);
  const risultato = [];
  for (let indice = 1; indice < chiusi.length; indice++) {
    const inizio = chiusi[indice - 1].uscita;
    const fine = chiusi[indice].entrata;
    const durata = minutiDaOrario(fine) - minutiDaOrario(inizio);
    if (durata > 0) risultato.push({ inizio, fine, minuti: durata });
  }
  return risultato;
}

export function intervalloAperto(intervalli) {
  const ultimo = (intervalli ?? []).at(-1);
  return ultimo && !ultimo.uscita ? ultimo : null;
}

// --- totali --------------------------------------------------------------

function somma(elenco, campo = "minuti") {
  return (elenco ?? []).reduce((totale, voce) => totale + (Number(voce?.[campo]) || 0), 0);
}

export function giornoVuoto(data) {
  return { data, intervalli: [], attivita: [], assenze: [], straordinario: null, note: "" };
}

export function giornoSenzaDati(giorno) {
  return (
    !giorno ||
    (!giorno.intervalli?.length &&
      !giorno.attivita?.length &&
      !giorno.assenze?.length &&
      !giorno.straordinario &&
      !String(giorno.note ?? "").trim())
  );
}

/**
 * I conti di una giornata. «Da ripartire» è la presenza che non è ancora stata
 * assegnata a un'attività: se è negativa, si sono assegnate più ore di quelle
 * lavorate.
 */
export function totaliGiorno(giorno, adesso = null) {
  const presenza = minutiPresenza(giorno?.intervalli, adesso);
  const attivita = somma(giorno?.attivita);
  return {
    presenza,
    attivita,
    assenze: somma(giorno?.assenze),
    straordinario: Number(giorno?.straordinario?.minuti) || 0,
    daRipartire: presenza - attivita,
  };
}

/** I totali di un insieme di giorni, con le ripartizioni per attività e per assenza. */
export function totaliMese(giorni) {
  const perAttivita = new Map();
  const perAssenza = new Map();
  const totali = {
    presenza: 0,
    attivita: 0,
    assenze: 0,
    straordinario: 0,
    giorniPresenza: 0,
    giorniAssenza: 0,
    perAttivita,
    perAssenza,
  };

  for (const giorno of giorni ?? []) {
    const delGiorno = totaliGiorno(giorno);
    totali.presenza += delGiorno.presenza;
    totali.attivita += delGiorno.attivita;
    totali.assenze += delGiorno.assenze;
    totali.straordinario += delGiorno.straordinario;
    if (delGiorno.presenza > 0) totali.giorniPresenza += 1;
    if (giorno.assenze?.length) totali.giorniAssenza += 1;

    for (const voce of giorno.attivita ?? []) {
      perAttivita.set(voce.attivita, (perAttivita.get(voce.attivita) ?? 0) + voce.minuti);
    }
    for (const voce of giorno.assenze ?? []) {
      perAssenza.set(voce.tipo, (perAssenza.get(voce.tipo) ?? 0) + voce.minuti);
    }
  }
  return totali;
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
