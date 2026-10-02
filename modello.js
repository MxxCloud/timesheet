// Impaginazione del foglio Excel mensile, ricalcata sul timesheet in uso
// nell'ufficio: è il file da cambiare quando cambia il modello. Riceve dati già
// validati e restituisce la descrizione di un foglio per xlsx.js; non legge
// l'archivio e non calcola nulla che non stia già in calcoli.js.
//
// Disposizione del modello:
// - intestazione nelle righe 1–8, con il bordo spesso a sinistra e in alto:
//   «Time sheet», ente, progetto, nome e cognome, posizione/funzione, giorni
//   lavorati (ore del mese diviso 8) e mese;
// - riga 11: dalle · alle · Ore lavorate · Attività · Località · Progetto;
// - dalla riga 12 un giorno per riga, weekend e festivi tutti in rosso;
// - in fondo il totale delle ore del mese.
// Le assenze a giornata intera si scrivono nella colonna Attività, in
// maiuscolo e con le altre celle vuote, come chiede la guida dell'ufficio.

import * as calcoli from "./calcoli.js";
import { frazioneGiorno, serialeData } from "./xlsx.js";

const NOMI_MESI = [
  "GENNAIO",
  "FEBBRAIO",
  "MARZO",
  "APRILE",
  "MAGGIO",
  "GIUGNO",
  "LUGLIO",
  "AGOSTO",
  "SETTEMBRE",
  "OTTOBRE",
  "NOVEMBRE",
  "DICEMBRE",
];

const ROSSO = "FFFF0000";
const PRIMA_RIGA_GIORNI = 12;
// Larghezze delle colonne del modello, in caratteri. La prima è un poco più
// larga dell'originale perché la data in italiano («mercoledì 30 settembre
// 2026») altrimenti andrebbe a capo.
const COLONNE = [27, 9.1, 13, 14.4, 56.9, 21.9, 34.7];
// Caratteri che stanno in una riga delle colonne che vanno a capo.
const CARATTERI_PER_RIGA = { attivita: 62, localita: 23, progetto: 38 };

const ARIAL = { carattere: "Arial", dimensione: 10, grassetto: true };
const CELLA = { bordo: true, verticale: "center", aCapo: true };

const STILI = {
  titolo: {
    carattere: "Arial",
    dimensione: 14,
    grassetto: true,
    allinea: "center",
    bordo: { sinistra: "medium", sopra: "medium" },
  },
  bordoAlto: { bordo: { sopra: "medium" } },
  bordoSinistro: { bordo: { sinistra: "medium" } },
  etichetta: { ...ARIAL, bordo: { sinistra: "medium" } },
  valore: { ...ARIAL, allinea: "center" },
  giorniLavorati: { ...ARIAL, allinea: "left", formato: "[h]:mm" },
  mese: { grassetto: true, bordo: { sinistra: "medium" } },
  intestazione: { ...CELLA, grassetto: true, allinea: "center" },
  angolo: { ...CELLA, grassetto: true },
  data: { ...CELLA, grassetto: true, formato: "[$-410]dddd d mmmm yyyy" },
  orario: { ...CELLA, grassetto: true, allinea: "center", formato: "h:mm;@" },
  attivita: { ...CELLA },
  localita: { ...CELLA, grassetto: true },
  progetto: { ...CELLA },
  etichettaTotale: { grassetto: true, verticale: "center", aCapo: true },
  totale: { grassetto: true, allinea: "center", verticale: "center", formato: "[h]:mm:ss" },
};

/** «2026-03» → «MARZO 2026», il nome dei fogli nel modello. */
export function nomeFoglioMese(mese) {
  const [anno, numero] = mese.split("-");
  return `${NOMI_MESI[Number(numero) - 1]} ${anno}`;
}

/** «2026-03» → «Marzo 2026». */
export function nomeDelMese(mese) {
  const nome = nomeFoglioMese(mese);
  return nome.charAt(0) + nome.slice(1).toLowerCase();
}

/** «Rossi Mario»: per ordinare e per i nomi dei file. */
export function nomeDipendente(profilo) {
  return [profilo?.cognome, profilo?.nome].filter(Boolean).join(" ") || "Dipendente";
}

/** «Mario Rossi»: come il modello scrive «Nome e cognome». */
export function nomeECognome(profilo) {
  return [profilo?.nome, profilo?.cognome].filter(Boolean).join(" ");
}

function orario(testo) {
  const minuti = calcoli.minutiDaOrario(testo);
  return minuti === null ? null : frazioneGiorno(minuti);
}

function progettiConOre(giorno) {
  return (giorno.progetti ?? [])
    .map((voce) => `${voce.progetto} (${calcoli.durataInTesto(voce.minuti)})`)
    .join(", ");
}

/**
 * Il testo della colonna Attività. Un'assenza a giornata intera (senza
 * presenza) si scrive in maiuscolo, come «FERIE»; un'assenza di qualche ora in
 * una giornata lavorata si aggiunge in coda alla descrizione.
 */
function testoAttivita(giorno, tipiAssenza, festa) {
  const nomeAssenza = (codice) => tipiAssenza.find((tipo) => tipo.codice === codice)?.nome ?? codice;
  const descrizione = String(giorno.descrizione ?? "").trim();
  const assenze = giorno.assenze ?? [];

  if (!giorno.intervalli?.length && assenze.length) {
    const nomi = assenze.map((assenza) => nomeAssenza(assenza.tipo).toUpperCase()).join(" / ");
    return descrizione ? `${nomi} — ${descrizione}` : nomi;
  }
  const parti = descrizione ? [descrizione] : [];
  for (const assenza of assenze) {
    parti.push(`${nomeAssenza(assenza.tipo).toLowerCase()} ${calcoli.durataInTesto(assenza.minuti)}`);
  }
  if (!parti.length && festa && !giorno.intervalli?.length) return festa;
  return parti.join(" — ");
}

function righeOccupate(testo, perRiga) {
  return Math.max(1, Math.ceil(String(testo ?? "").length / perRiga));
}

/**
 * Il foglio di un mese.
 * giorni: Map data ISO → giorno (i giorni mancanti sono vuoti);
 * tipiAssenza: [{ codice, nome }], per scrivere il nome delle assenze.
 */
export function foglioMese({
  ente = "",
  profilo = {},
  mese,
  giorni = new Map(),
  tipiAssenza = [],
  patrono = "",
  nomeFoglio = nomeFoglioMese(mese),
}) {
  const date = calcoli.dateDelMese(mese);
  const ultimaRigaGiorni = PRIMA_RIGA_GIORNI + date.length - 1;
  const rigaTotale = ultimaRigaGiorni + 1;
  const totaleMinuti = date.reduce(
    (totale, data) => totale + calcoli.minutiLavorati(giorni.get(data)?.intervalli),
    0
  );

  const vuota = (stile) => ({ v: null, stile });
  const etichetta = (testo, valore, stile = STILI.valore) => [
    { v: testo, stile: STILI.etichetta },
    { v: valore, stile },
  ];

  const righe = [
    {
      altezza: 18,
      celle: [{ v: "Time sheet", stile: STILI.titolo }, ...Array.from({ length: 6 }, () => vuota(STILI.bordoAlto))],
    },
    [vuota(STILI.bordoSinistro)],
    etichetta("Ente:", ente),
    etichetta("Progetto:", ""),
    etichetta("Nome e cognome:", nomeECognome(profilo)),
    etichetta("Posizione/funzione:", profilo?.posizione ?? ""),
    etichetta("giorni lavorati:", null, STILI.giorniLavorati),
    [{ v: `Mese: ${nomeFoglioMese(mese)}`, stile: STILI.mese }],
    [],
    [],
    [
      vuota(STILI.angolo),
      ...["dalle", "alle", "Ore lavorate", "Attività", "Località di svolgimento", "Progetto"].map((testo) => ({
        v: testo,
        stile: STILI.intestazione,
      })),
    ],
  ];

  // I giorni lavorati del modello sono le ore del mese diviso otto, in formato ore.
  righe[6][1] = { f: `D${rigaTotale}/8`, v: frazioneGiorno(totaleMinuti) / 8, stile: STILI.giorniLavorati };

  for (const [indice, data] of date.entries()) {
    const riga = PRIMA_RIGA_GIORNI + indice;
    const giorno = giorni.get(data) ?? calcoli.giornoVuoto(data);
    const calendario = calcoli.tipoGiorno(data, patrono);
    const rosso = calendario.tipo === "feriale" ? null : ROSSO;
    const stile = (nome) => (rosso ? { ...STILI[nome], sfondo: rosso } : STILI[nome]);

    const { dalle, alle } = calcoli.estremi(giorno.intervalli);
    const attivita = testoAttivita(giorno, tipiAssenza, calendario.nome);
    const localita = giorno.intervalli?.length ? giorno.localita ?? "" : "";
    const progetti = progettiConOre(giorno);
    const occupate = Math.max(
      righeOccupate(attivita, CARATTERI_PER_RIGA.attivita),
      righeOccupate(localita, CARATTERI_PER_RIGA.localita),
      righeOccupate(progetti, CARATTERI_PER_RIGA.progetto)
    );

    righe.push({
      altezza: occupate > 1 ? 15 * occupate : undefined,
      celle: [
        { v: serialeData(data), stile: stile("data") },
        { v: orario(dalle), stile: stile("orario") },
        { v: orario(alle), stile: stile("orario") },
        // Come nel modello la formula c'è sempre, anche nei giorni vuoti.
        { f: `C${riga}-B${riga}`, v: frazioneGiorno(calcoli.minutiLavorati(giorno.intervalli)), stile: stile("orario") },
        { v: attivita, stile: stile("attivita") },
        { v: localita, stile: stile("localita") },
        { v: progetti, stile: stile("progetto") },
      ],
    });
  }

  righe.push({
    altezza: 30,
    celle: [
      { v: "TOTALE ORE LAVORATE NEL MESE", stile: STILI.etichettaTotale },
      null,
      null,
      { f: `SUM(D${PRIMA_RIGA_GIORNI}:D${ultimaRigaGiorni})`, v: frazioneGiorno(totaleMinuti), stile: STILI.totale },
    ],
  });

  return {
    nome: nomeFoglio,
    colonne: COLONNE,
    righe,
    unite: ["A1:G1", "B2:G2", "B3:G3", "B4:G4", "B5:G5", "B6:G6", "B7:G7", "B8:G8"],
    adattaPagina: true,
    margini: { sinistra: 0.41, destra: 0.41, sopra: 0.52, sotto: 0.52 },
  };
}
