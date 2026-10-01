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

const configurazione = {
  azienda: "Prova Srl",
  attivita: [
    { nome: "Progetto A", attiva: true },
    { nome: "Amministrazione", attiva: true },
    { nome: "Vecchia commessa", attiva: false },
  ],
  assenze: [
    { codice: "FE", nome: "Ferie" },
    { codice: "PE", nome: "Permesso" },
  ],
  patrono: "",
};

const giorni = [
  {
    data: "2026-10-01",
    intervalli: [
      { entrata: "08:30", uscita: "12:30" },
      { entrata: "13:30", uscita: "17:30" },
      { entrata: "18:00", uscita: "19:00" },
    ],
    attivita: [
      { attivita: "Progetto A", minuti: 360, descrizione: "analisi & test" },
      { attivita: "Amministrazione", minuti: 180, descrizione: "" },
    ],
    assenze: [],
    straordinario: { minuti: 60, nota: "consegna" },
    note: "",
  },
  {
    data: "2026-10-02",
    intervalli: [],
    attivita: [],
    assenze: [{ tipo: "FE", minuti: 480 }],
    straordinario: null,
    note: "ponte",
  },
  {
    data: "2026-09-30",
    intervalli: [{ entrata: "09:00", uscita: "17:00" }],
    attivita: [],
    assenze: [],
    straordinario: null,
    note: "",
  },
];

test("il file del mese si rilegge identico, anche dopo un salvataggio da Excel", async () => {
  const profilo = { nome: "Mario", cognome: "Rossi", matricola: "007" };
  const byte = esportazione.fileDelMese({ configurazione, profilo, mese: "2026-10", giorni });
  assert.equal(esportazione.nomeFileMese(profilo, "2026-10"), "Rossi_Mario_2026-10.xlsx");

  for (const versione of [byte, zipCompresso(comeRisalvatoDaExcel(await xlsx.leggiZip(byte)))]) {
    const letto = await esportazione.leggiFileMese(versione, "prova.xlsx");
    assert.equal(letto.mese, "2026-10");
    assert.equal(letto.azienda, "Prova Srl");
    assert.deepEqual(letto.profilo, profilo);
    assert.deepEqual(letto.tipiAssenza, configurazione.assenze);
    assert.deepEqual([...letto.giorni.keys()], ["2026-10-01", "2026-10-02"]);
    assert.deepEqual(letto.giorni.get("2026-10-01"), giorni[0]);
    assert.deepEqual(letto.giorni.get("2026-10-02"), giorni[1]);
  }
});

test("il foglio visibile ha totali, colonne delle attività e festivi", async () => {
  const byte = esportazione.fileDelMese({
    configurazione,
    profilo: { nome: "Mario", cognome: "Rossi", matricola: "007" },
    mese: "2026-10",
    giorni,
  });
  const [visibile, dati] = await xlsx.leggiXlsx(byte);
  assert.equal(visibile.nome, "Timesheet");
  assert.equal(dati.nascosto, true);

  const intestazione = visibile.righe[4];
  // La commessa disattivata e mai usata non ha colonna.
  assert.deepEqual(intestazione.slice(6, 9), ["Ore lavorate", "Progetto A", "Amministrazione"]);
  assert.equal(intestazione.includes("Vecchia commessa"), false);

  const primoOttobre = visibile.righe[5];
  assert.equal(primoOttobre[1], "gio");
  assert.equal(primoOttobre[6], 540 / 1440);
  assert.match(primoOttobre.at(-1), /Altri intervalli: 18:00–19:00/);
  assert.match(primoOttobre.at(-1), /Straordinario: consegna/);

  const quattroOttobre = visibile.righe[8];
  assert.match(quattroOttobre.at(-1), /San Francesco/);

  const totali = visibile.righe[5 + 31];
  assert.equal(totali[0], "Totale");
  assert.equal(totali[6], 540 / 1440);
  assert.equal(totali[7], 360 / 1440);
});

test("i file non prodotti dalla app vengono rifiutati con un messaggio chiaro", async () => {
  const estraneo = xlsx.creaXlsx([{ nome: "Foglio1", righe: [["ciao"]] }]);
  await assert.rejects(esportazione.leggiFileMese(estraneo, "a.xlsx"), /manca il foglio dei dati/);
  await assert.rejects(
    esportazione.leggiFileMese(new TextEncoder().encode("non sono uno zip"), "b.xlsx"),
    /non è un file Excel leggibile/
  );
});

test("il riepilogo unisce i dipendenti e rifiuta mesi diversi", async () => {
  const leggi = async (profilo, mese, delMese) =>
    esportazione.leggiFileMese(
      esportazione.fileDelMese({ configurazione, profilo, mese, giorni: delMese })
    );
  const mario = await leggi({ nome: "Mario", cognome: "Rossi", matricola: "1" }, "2026-10", giorni);
  const anna = await leggi({ nome: "Anna", cognome: "Bianchi", matricola: "2" }, "2026-10", [
    {
      data: "2026-10-05",
      intervalli: [{ entrata: "09:00", uscita: "13:00" }],
      attivita: [{ attivita: "Progetto A", minuti: 240, descrizione: "" }],
      assenze: [{ tipo: "PE", minuti: 240 }],
      straordinario: null,
      note: "",
    },
  ]);
  const settembre = await leggi({ nome: "Mario", cognome: "Rossi", matricola: "1" }, "2026-09", giorni);

  const [riepilogo, errori] = esportazione.riepilogoUfficio([mario, anna, mario]);
  assert.deepEqual(errori, []);
  assert.equal(riepilogo.righe.length, 2);
  assert.equal(riepilogo.righe[0].profilo.cognome, "Bianchi");
  assert.deepEqual(
    riepilogo.tipiAssenza.map((t) => t.codice),
    ["FE", "PE"]
  );
  assert.equal(riepilogo.righe[1].totali.presenza, 540);

  const [, mesiDiversi] = esportazione.riepilogoUfficio([mario, settembre]);
  assert.match(mesiDiversi[0], /mesi diversi/);

  const fogli = await xlsx.leggiXlsx(esportazione.fileRiepilogo(riepilogo, configurazione));
  assert.deepEqual(
    fogli.map((f) => f.nome),
    ["Riepilogo", "Bianchi Anna", "Rossi Mario"]
  );
  assert.equal(fogli[0].righe[4][0], "Bianchi Anna");
  assert.equal(fogli[0].righe[5][3], 540 / 1440);
});
