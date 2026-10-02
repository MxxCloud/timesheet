import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import * as xlsx from "../xlsx.js";
import * as esportazione from "../esportazione.js";

test("crc32 coincide con il valore di riferimento", () => {
  assert.equal(xlsx.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
});

test("lettere delle colonne e numeri di serie delle date", () => {
  assert.equal(xlsx.lettereColonna(0), "A");
  assert.equal(xlsx.lettereColonna(25), "Z");
  assert.equal(xlsx.lettereColonna(26), "AA");
  assert.equal(xlsx.lettereColonna(701), "ZZ");
  assert.equal(xlsx.serialeData("2026-10-01"), 46296);
  assert.equal(xlsx.serialeData("1900-03-01"), 61);
});

test("un file scritto si rilegge con valori, testi e foglio nascosto", async () => {
  const byte = xlsx.creaXlsx([
    {
      nome: "Prova",
      righe: [
        ["Testo & <simboli>", 42, { v: 0.5, stile: { formato: "[h]:mm", grassetto: true } }],
        [],
        [null, { f: "SUM(B1:B1)", v: 42 }, " spazi "],
      ],
      unite: ["A2:C2"],
      colonne: [20, 10],
    },
    { nome: "nascosto", nascosto: true, righe: [["a", 1]] },
  ]);
  const fogli = await xlsx.leggiXlsx(byte);
  assert.equal(fogli.length, 2);
  assert.equal(fogli[0].nome, "Prova");
  assert.equal(fogli[0].nascosto, false);
  assert.deepEqual(fogli[0].righe[0], ["Testo & <simboli>", 42, 0.5]);
  assert.deepEqual(fogli[0].righe[2], [null, 42, " spazi "]);
  assert.equal(fogli[1].nascosto, true);
  assert.deepEqual(fogli[1].righe[0], ["a", 1]);
});

/** Ricomprime ogni parte con deflate e mette i testi fra le stringhe condivise, come fa Excel. */
function comeRisalvatoDaExcel(file) {
  const codifica = new TextEncoder();
  const decodifica = new TextDecoder();
  const condivise = [];
  const parti = [];
  for (const [nome, contenuto] of file) {
    let testo = decodifica.decode(contenuto);
    if (nome.startsWith("xl/worksheets/")) {
      testo = testo.replace(
        /<c r="([A-Z]+\d+)"( s="\d+")? t="inlineStr"><is><t[^>]*>([\s\S]*?)<\/t><\/is><\/c>/g,
        (_, rif, stile = "", valore) => {
          condivise.push(valore);
          return `<x:c r="${rif}"${stile} t="s"><x:v>${condivise.length - 1}</x:v></x:c>`;
        }
      );
    }
    parti.push({ nome, contenuto: codifica.encode(testo) });
  }
  parti.push({
    nome: "xl/sharedStrings.xml",
    contenuto: codifica.encode(
      `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${condivise
        .map((t) => `<si><r><t>${t.slice(0, 1)}</t></r><r><t>${t.slice(1)}</t></r></si>`)
        .join("")}</sst>`
    ),
  });
  return parti;
}

/** Uno ZIP con le parti compresse, scritto a mano per provare la lettura con deflate. */
function zipCompresso(parti) {
  const pezzi = [];
  const centrale = [];
  let posizione = 0;
  const codifica = new TextEncoder();
  for (const { nome, contenuto } of parti) {
    const nomeByte = codifica.encode(nome);
    const compresso = deflateRawSync(contenuto);
    const locale = Buffer.alloc(30);
    locale.writeUInt32LE(0x04034b50, 0);
    locale.writeUInt16LE(8, 8);
    locale.writeUInt32LE(xlsx.crc32(contenuto), 14);
    locale.writeUInt32LE(compresso.length, 18);
    locale.writeUInt32LE(contenuto.length, 22);
    locale.writeUInt16LE(nomeByte.length, 26);
    const voce = Buffer.alloc(46);
    voce.writeUInt32LE(0x02014b50, 0);
    voce.writeUInt16LE(8, 10);
    voce.writeUInt32LE(xlsx.crc32(contenuto), 16);
    voce.writeUInt32LE(compresso.length, 20);
    voce.writeUInt32LE(contenuto.length, 24);
    voce.writeUInt16LE(nomeByte.length, 28);
    voce.writeUInt32LE(posizione, 42);
    pezzi.push(locale, nomeByte, compresso);
    centrale.push(voce, nomeByte);
    posizione += 30 + nomeByte.length + compresso.length;
  }
  const dimensione = centrale.reduce((s, b) => s + b.length, 0);
  const fine = Buffer.alloc(22);
  fine.writeUInt32LE(0x06054b50, 0);
  fine.writeUInt16LE(parti.length, 8);
  fine.writeUInt16LE(parti.length, 10);
  fine.writeUInt32LE(dimensione, 12);
  fine.writeUInt32LE(posizione, 16);
  return new Uint8Array(Buffer.concat([...pezzi, ...centrale, fine]));
}

test("carattere e bordi per lato finiscono negli stili", async () => {
  const byte = xlsx.creaXlsx([
    {
      nome: "Stili",
      righe: [[{ v: "Titolo", stile: { carattere: "Arial", grassetto: true, bordo: { sinistra: "medium", sopra: "medium" } } }]],
      adattaPagina: true,
    },
  ]);
  const parti = await xlsx.leggiZip(byte);
  const stili = new TextDecoder().decode(parti.get("xl/styles.xml"));
  assert.match(stili, /<b\/><sz val="11"\/><name val="Arial"\/>/);
  assert.match(stili, /<left style="medium">.*<right\/><top style="medium">/);
  const foglio = new TextDecoder().decode(parti.get("xl/worksheets/sheet1.xml"));
  assert.match(foglio, /fitToWidth="1" fitToHeight="1"/);
});

const configurazione = {
  azienda: "Ente di Prova",
  progetti: [
    { nome: "Progetto A", attivo: true },
    { nome: "Amministrazione", attivo: true },
  ],
  localita: ["Sede", "Smart working"],
  assenze: [
    { codice: "FE", nome: "Ferie" },
    { codice: "PE", nome: "Permesso" },
  ],
  patrono: "",
};

const profilo = { nome: "Mario", cognome: "Rossi", matricola: "007", posizione: "Ricercatore" };

const giorni = [
  {
    data: "2026-10-01",
    intervalli: [
      { entrata: "09:00", uscita: "13:00" },
      { entrata: "14:00", uscita: "18:00" },
    ],
    progetti: [
      { progetto: "Progetto A", minuti: 360 },
      { progetto: "Amministrazione", minuti: 180 },
    ],
    descrizione: "Analisi dei dati & riunione con il partner",
    localita: "Sede",
    assenze: [],
    straordinario: { minuti: 60, nota: "consegna" },
  },
  {
    data: "2026-10-02",
    intervalli: [],
    progetti: [],
    descrizione: "",
    localita: "",
    assenze: [{ tipo: "FE", minuti: 480 }],
    straordinario: null,
  },
  {
    data: "2026-10-05",
    intervalli: [{ entrata: "09:00", uscita: "13:00" }],
    progetti: [{ progetto: "Progetto A", minuti: 240 }],
    descrizione: "Relazione",
    localita: "Roma, trasferta",
    assenze: [{ tipo: "PE", minuti: 240 }],
    straordinario: null,
  },
  {
    data: "2025-12-30",
    intervalli: [{ entrata: "09:00", uscita: "17:00" }],
    progetti: [],
    descrizione: "Dell'anno prima",
    localita: "Sede",
    assenze: [],
    straordinario: null,
  },
];

test("il file dell'anno ha i dodici fogli del modello e i dati nascosti", async () => {
  const byte = esportazione.fileDellAnno({ configurazione, profilo, anno: "2026", giorni });
  assert.equal(esportazione.nomeFileAnno(profilo, "2026"), "Rossi_Mario_TIME_SHEET_2026.xlsx");

  const fogli = await xlsx.leggiXlsx(byte);
  assert.deepEqual(
    fogli.map((f) => f.nome),
    [
      "GENNAIO 2026", "FEBBRAIO 2026", "MARZO 2026", "APRILE 2026", "MAGGIO 2026", "GIUGNO 2026",
      "LUGLIO 2026", "AGOSTO 2026", "SETTEMBRE 2026", "OTTOBRE 2026", "NOVEMBRE 2026", "DICEMBRE 2026",
      "dati",
    ]
  );
  assert.equal(fogli.at(-1).nascosto, true);

  const ottobre = fogli[9].righe;
  assert.equal(ottobre[0][0], "Time sheet");
  assert.deepEqual(ottobre[2].slice(0, 2), ["Ente:", "Ente di Prova"]);
  assert.equal(ottobre[3][0], "Progetto:");
  assert.deepEqual(ottobre[4].slice(0, 2), ["Nome e cognome:", "Mario Rossi"]);
  assert.deepEqual(ottobre[5].slice(0, 2), ["Posizione/funzione:", "Ricercatore"]);
  assert.equal(ottobre[6][0], "giorni lavorati:");
  assert.equal(ottobre[6][1], (13 * 60) / 1440 / 8);
  assert.equal(ottobre[7][0], "Mese: OTTOBRE 2026");
  assert.deepEqual(ottobre[10], [null, "dalle", "alle", "Ore lavorate", "Attività", "Località di svolgimento", "Progetto"]);

  // 1 ottobre: dalle–alle con la pausa compresa, progetti con le ore.
  assert.deepEqual(ottobre[11], [
    xlsx.serialeData("2026-10-01"),
    540 / 1440,
    1080 / 1440,
    540 / 1440,
    "Analisi dei dati & riunione con il partner",
    "Sede",
    "Progetto A (6:00), Amministrazione (3:00)",
  ]);
  // Ferie a giornata intera: il nome in maiuscolo, il resto vuoto.
  assert.deepEqual(ottobre[12].slice(1), [null, null, 0, "FERIE", null, null]);
  // Domenica 4 ottobre, San Francesco: il nome della festa.
  assert.equal(ottobre[14][4], "San Francesco d'Assisi");
  // Permesso di qualche ora in una giornata lavorata: in coda alla descrizione.
  assert.equal(ottobre[15][4], "Relazione — permesso 4:00");
  assert.equal(ottobre[15][5], "Roma, trasferta");

  assert.equal(ottobre[11 + 31][0], "TOTALE ORE LAVORATE NEL MESE");
  assert.equal(ottobre[11 + 31][3], (13 * 60) / 1440);
  assert.equal(fogli[1].righe[11 + 28][0], "TOTALE ORE LAVORATE NEL MESE");

  const parti = await xlsx.leggiZip(byte);
  const xmlOttobre = new TextDecoder().decode(parti.get("xl/worksheets/sheet10.xml"));
  assert.match(xmlOttobre, /<f>C12-B12<\/f>/);
  assert.match(xmlOttobre, /<f>SUM\(D12:D42\)<\/f>/);
  assert.match(xmlOttobre, /<f>D43\/8<\/f>/);
  const xmlFebbraio = new TextDecoder().decode(parti.get("xl/worksheets/sheet2.xml"));
  assert.match(xmlFebbraio, /<f>SUM\(D12:D39\)<\/f>/);
  assert.match(xmlFebbraio, /<f>D40\/8<\/f>/);
});

test("il file dell'anno si rilegge identico, anche dopo un salvataggio da Excel", async () => {
  const byte = esportazione.fileDellAnno({ configurazione, profilo, anno: "2026", giorni });
  for (const versione of [byte, zipCompresso(comeRisalvatoDaExcel(await xlsx.leggiZip(byte)))]) {
    const letto = await esportazione.leggiFile(versione, "prova.xlsx");
    assert.equal(letto.anno, "2026");
    assert.equal(letto.azienda, "Ente di Prova");
    assert.deepEqual(letto.profilo, profilo);
    assert.deepEqual(letto.tipiAssenza, configurazione.assenze);
    assert.deepEqual([...letto.giorni.keys()], ["2026-10-01", "2026-10-02", "2026-10-05"]);
    for (const originale of giorni.slice(0, 3)) {
      assert.deepEqual(letto.giorni.get(originale.data), originale);
    }
  }
});

test("i file non prodotti dalla app vengono rifiutati con un messaggio chiaro", async () => {
  const estraneo = xlsx.creaXlsx([{ nome: "Foglio1", righe: [["ciao"]] }]);
  await assert.rejects(esportazione.leggiFile(estraneo, "a.xlsx"), /manca il foglio dei dati/);
  await assert.rejects(
    esportazione.leggiFile(new TextEncoder().encode("non sono uno zip"), "b.xlsx"),
    /non è un file Excel leggibile/
  );
});

test("il riepilogo unisce i dipendenti, sceglie il mese e rifiuta anni diversi", async () => {
  const leggi = async (persona, anno, delAnno) =>
    esportazione.leggiFile(
      esportazione.fileDellAnno({ configurazione, profilo: persona, anno, giorni: delAnno })
    );
  const mario = await leggi(profilo, "2026", giorni);
  const anna = await leggi({ nome: "Anna", cognome: "Bianchi", matricola: "008", posizione: "" }, "2026", [
    {
      data: "2026-09-30",
      intervalli: [{ entrata: "09:00", uscita: "17:00" }],
      progetti: [{ progetto: "Amministrazione", minuti: 480 }],
      descrizione: "",
      localita: "Smart working",
      assenze: [],
      straordinario: null,
    },
    {
      data: "2026-10-05",
      intervalli: [{ entrata: "09:00", uscita: "13:00" }],
      progetti: [{ progetto: "Progetto A", minuti: 240 }],
      descrizione: "",
      localita: "Sede",
      assenze: [{ tipo: "PE", minuti: 240 }],
      straordinario: null,
    },
  ]);
  const marioAnnoPrima = await leggi(profilo, "2025", giorni);

  const [uniti, errori] = esportazione.unisciFile([mario, anna, mario]);
  assert.deepEqual(errori, []);
  assert.equal(uniti.anno, "2026");
  assert.deepEqual(
    uniti.file.map((f) => f.profilo.cognome),
    ["Bianchi", "Rossi"]
  );
  assert.deepEqual(esportazione.mesiConDati(uniti.file), ["2026-10", "2026-09"]);

  const ottobre = esportazione.riepilogoUfficio(uniti.file, "2026-10");
  assert.deepEqual(ottobre.tipiAssenza.map((t) => t.codice), ["FE", "PE"]);
  assert.equal(ottobre.righe[1].totali.lavorate, 540 + 240);
  assert.equal(ottobre.righe[0].totali.perProgetto.get("Progetto A"), 240);

  const settembre = esportazione.riepilogoUfficio(uniti.file, "2026-09");
  assert.equal(settembre.righe[0].totali.lavorate, 480);
  assert.equal(settembre.righe[1].totali.lavorate, 0);

  const [, anniDiversi] = esportazione.unisciFile([mario, marioAnnoPrima]);
  assert.match(anniDiversi[0], /anni diversi/);

  const fogli = await xlsx.leggiXlsx(esportazione.fileRiepilogo(ottobre, configurazione));
  assert.deepEqual(
    fogli.map((f) => f.nome),
    ["Riepilogo", "Bianchi Anna", "Rossi Mario"]
  );
  assert.equal(fogli[0].righe[4][0], "Bianchi Anna");
  assert.equal(fogli[0].righe[5][3], 780 / 1440);
  assert.equal(fogli[2].righe[7][0], "Mese: OTTOBRE 2026");
});
