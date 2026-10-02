// Scrittura e lettura di file Excel (.xlsx) senza librerie.
//
// Un .xlsx è uno ZIP di file XML. In scrittura basta lo ZIP più semplice, con
// i file memorizzati senza compressione: Excel, LibreOffice e Fogli Google li
// aprono come gli altri, e il codice resta piccolo. In lettura invece bisogna
// accettare anche i file compressi, perché un file risalvato da Excel lo è: si
// scompatta con DecompressionStream, che hanno sia i browser sia Node.
//
// Il modulo non sa nulla di timesheet: riceve fogli fatti di righe e celle.

const codificatore = new TextEncoder();
const decodificatore = new TextDecoder();

// --- ZIP -----------------------------------------------------------------

const TABELLA_CRC = (() => {
  const tabella = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabella[n] = c >>> 0;
  }
  return tabella;
})();

export function crc32(byte) {
  let c = 0xffffffff;
  for (let indice = 0; indice < byte.length; indice++) {
    c = TABELLA_CRC[(c ^ byte[indice]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// 1 gennaio 1980, la data più bassa che il formato ZIP sa scrivere: una data
// fissa rende identici due file con lo stesso contenuto.
const DATA_DOS = (0 << 9) | (1 << 5) | 1;
const UTF8 = 0x0800;

/** file: [{ nome, contenuto: Uint8Array | string }] → ZIP senza compressione. */
export function creaZip(file) {
  const parti = [];
  const centrale = [];
  let posizione = 0;

  for (const { nome, contenuto } of file) {
    const nomeByte = codificatore.encode(nome);
    const dati = typeof contenuto === "string" ? codificatore.encode(contenuto) : contenuto;
    const controllo = crc32(dati);

    const locale = new DataView(new ArrayBuffer(30));
    locale.setUint32(0, 0x04034b50, true);
    locale.setUint16(4, 20, true);
    locale.setUint16(6, UTF8, true);
    locale.setUint16(8, 0, true);
    locale.setUint16(10, 0, true);
    locale.setUint16(12, DATA_DOS, true);
    locale.setUint32(14, controllo, true);
    locale.setUint32(18, dati.length, true);
    locale.setUint32(22, dati.length, true);
    locale.setUint16(26, nomeByte.length, true);
    locale.setUint16(28, 0, true);

    const voce = new DataView(new ArrayBuffer(46));
    voce.setUint32(0, 0x02014b50, true);
    voce.setUint16(4, 20, true);
    voce.setUint16(6, 20, true);
    voce.setUint16(8, UTF8, true);
    voce.setUint16(10, 0, true);
    voce.setUint16(12, 0, true);
    voce.setUint16(14, DATA_DOS, true);
    voce.setUint32(16, controllo, true);
    voce.setUint32(20, dati.length, true);
    voce.setUint32(24, dati.length, true);
    voce.setUint16(28, nomeByte.length, true);
    voce.setUint32(42, posizione, true);

    parti.push(new Uint8Array(locale.buffer), nomeByte, dati);
    centrale.push(new Uint8Array(voce.buffer), nomeByte);
    posizione += 30 + nomeByte.length + dati.length;
  }

  const dimensioneCentrale = centrale.reduce((totale, parte) => totale + parte.length, 0);
  const fine = new DataView(new ArrayBuffer(22));
  fine.setUint32(0, 0x06054b50, true);
  fine.setUint16(8, file.length, true);
  fine.setUint16(10, file.length, true);
  fine.setUint32(12, dimensioneCentrale, true);
  fine.setUint32(16, posizione, true);

  return unisci([...parti, ...centrale, new Uint8Array(fine.buffer)]);
}

function unisci(parti) {
  const totale = parti.reduce((somma, parte) => somma + parte.length, 0);
  const risultato = new Uint8Array(totale);
  let posizione = 0;
  for (const parte of parti) {
    risultato.set(parte, posizione);
    posizione += parte.length;
  }
  return risultato;
}

async function decomprimi(dati) {
  const flusso = new Blob([dati]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(flusso).arrayBuffer());
}

/** ZIP → Map nome → contenuto. Accetta file memorizzati e compressi (deflate). */
export async function leggiZip(byte) {
  const vista = new DataView(byte.buffer, byte.byteOffset, byte.byteLength);
  let fine = -1;
  // Il record finale è negli ultimi 22 byte, più un eventuale commento.
  for (let indice = byte.length - 22; indice >= Math.max(0, byte.length - 65557); indice--) {
    if (vista.getUint32(indice, true) === 0x06054b50) {
      fine = indice;
      break;
    }
  }
  if (fine < 0) throw new Error("Il file non è un documento Excel (.xlsx).");

  const quante = vista.getUint16(fine + 10, true);
  let posizione = vista.getUint32(fine + 16, true);
  const file = new Map();

  for (let numero = 0; numero < quante; numero++) {
    if (vista.getUint32(posizione, true) !== 0x02014b50) {
      throw new Error("Il file Excel è danneggiato.");
    }
    const metodo = vista.getUint16(posizione + 10, true);
    const compresso = vista.getUint32(posizione + 20, true);
    const lunghezzaNome = vista.getUint16(posizione + 28, true);
    const lunghezzaExtra = vista.getUint16(posizione + 30, true);
    const lunghezzaCommento = vista.getUint16(posizione + 32, true);
    const locale = vista.getUint32(posizione + 42, true);
    const nome = decodificatore.decode(byte.subarray(posizione + 46, posizione + 46 + lunghezzaNome));

    const inizioDati =
      locale + 30 + vista.getUint16(locale + 26, true) + vista.getUint16(locale + 28, true);
    const dati = byte.subarray(inizioDati, inizioDati + compresso);

    if (metodo === 0) file.set(nome, dati);
    else if (metodo === 8) file.set(nome, await decomprimi(dati));
    else throw new Error(`Compressione ${metodo} non supportata in «${nome}».`);

    posizione += 46 + lunghezzaNome + lunghezzaExtra + lunghezzaCommento;
  }
  return file;
}

// --- XML -----------------------------------------------------------------

function xml(testo) {
  return String(testo)
    // Caratteri di controllo che l'XML non ammette: Excel rifiuterebbe il file.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function daXml(testo) {
  return testo
    .replace(/&#x([0-9a-f]+);/gi, (_, esadecimale) => String.fromCodePoint(parseInt(esadecimale, 16)))
    .replace(/&#(\d+);/g, (_, decimale) => String.fromCodePoint(Number(decimale)))
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function attributi(testo) {
  const risultato = {};
  for (const [, nome, valore] of testo.matchAll(/([\w:]+)="([^"]*)"/g)) {
    risultato[nome] = daXml(valore);
  }
  return risultato;
}

const SPAZIO_MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const SPAZIO_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const INTESTAZIONE = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

// --- celle e riferimenti -------------------------------------------------

export function lettereColonna(indice) {
  let lettere = "";
  let numero = indice + 1;
  while (numero > 0) {
    const resto = (numero - 1) % 26;
    lettere = String.fromCharCode(65 + resto) + lettere;
    numero = Math.floor((numero - 1) / 26);
  }
  return lettere;
}

export function riferimento(riga, colonna) {
  return `${lettereColonna(colonna)}${riga + 1}`;
}

function indiceColonna(lettere) {
  let numero = 0;
  for (const lettera of lettere) numero = numero * 26 + (lettera.charCodeAt(0) - 64);
  return numero - 1;
}

/** Data ISO → numero di serie di Excel (giorni dal 30 dicembre 1899). */
export function serialeData(iso) {
  const [anno, mese, giorno] = iso.split("-").map(Number);
  return (Date.UTC(anno, mese - 1, giorno) - Date.UTC(1899, 11, 30)) / 86400000;
}

/** Minuti → frazione di giorno, come Excel rappresenta orari e durate. */
export function frazioneGiorno(minuti) {
  return minuti / 1440;
}

// --- stili ---------------------------------------------------------------

const FORMATI_PREDEFINITI = { General: 0, "0": 1, "0.00": 2 };

class Stili {
  constructor() {
    this.font = ['<font><sz val="11"/><name val="Calibri"/><family val="2"/></font>'];
    this.riempimenti = [
      '<fill><patternFill patternType="none"/></fill>',
      '<fill><patternFill patternType="gray125"/></fill>',
    ];
    this.bordi = ["<border><left/><right/><top/><bottom/><diagonal/></border>"];
    this.formati = new Map();
    this.combinazioni = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
    this.indici = new Map([["{}", 0]]);
  }

  static posizione(elenco, voce) {
    const trovata = elenco.indexOf(voce);
    if (trovata >= 0) return trovata;
    elenco.push(voce);
    return elenco.length - 1;
  }

  formato(codice) {
    if (!codice) return 0;
    if (codice in FORMATI_PREDEFINITI) return FORMATI_PREDEFINITI[codice];
    if (!this.formati.has(codice)) this.formati.set(codice, 164 + this.formati.size);
    return this.formati.get(codice);
  }

  /**
   * Un descrittore come { grassetto, carattere: "Arial", sfondo: "FFEEEEEE",
   * bordo: true, formato: "[h]:mm" } → indice. `bordo` è `true` per un bordo
   * sottile su tutti i lati, oppure { sinistra, destra, sopra, sotto } con
   * "thin" o "medium" per ciascun lato.
   */
  indice(stile) {
    if (!stile) return 0;
    const chiave = JSON.stringify(stile);
    if (this.indici.has(chiave)) return this.indici.get(chiave);

    const carattere = xml(stile.carattere ?? "Calibri");
    const font = Stili.posizione(
      this.font,
      "<font>" +
        (stile.grassetto ? "<b/>" : "") +
        (stile.corsivo ? "<i/>" : "") +
        `<sz val="${stile.dimensione ?? 11}"/>` +
        (stile.colore ? `<color rgb="${stile.colore}"/>` : "") +
        `<name val="${carattere}"/><family val="2"/></font>`
    );
    const riempimento = stile.sfondo
      ? Stili.posizione(
          this.riempimenti,
          `<fill><patternFill patternType="solid"><fgColor rgb="${stile.sfondo}"/><bgColor indexed="64"/></patternFill></fill>`
        )
      : 0;
    const lati = stile.bordo === true
      ? { sinistra: "thin", destra: "thin", sopra: "thin", sotto: "thin" }
      : stile.bordo || {};
    const lato = (nome, spessore) =>
      spessore ? `<${nome} style="${spessore}"><color auto="1"/></${nome}>` : `<${nome}/>`;
    const bordo = stile.bordo
      ? Stili.posizione(
          this.bordi,
          "<border>" +
            lato("left", lati.sinistra) +
            lato("right", lati.destra) +
            lato("top", lati.sopra) +
            lato("bottom", lati.sotto) +
            "<diagonal/></border>"
        )
      : 0;
    const formato = this.formato(stile.formato);

    const allineamento =
      stile.allinea || stile.verticale || stile.aCapo
        ? "<alignment" +
          (stile.allinea ? ` horizontal="${stile.allinea}"` : "") +
          ` vertical="${stile.verticale ?? "center"}"` +
          (stile.aCapo ? ' wrapText="1"' : "") +
          "/>"
        : "";

    this.combinazioni.push(
      `<xf numFmtId="${formato}" fontId="${font}" fillId="${riempimento}" borderId="${bordo}" xfId="0"` +
        ' applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"' +
        (allineamento ? ` applyAlignment="1">${allineamento}</xf>` : "/>")
    );
    const indice = this.combinazioni.length - 1;
    this.indici.set(chiave, indice);
    return indice;
  }

  xml() {
    const formati = [...this.formati].map(
      ([codice, id]) => `<numFmt numFmtId="${id}" formatCode="${xml(codice)}"/>`
    );
    return (
      INTESTAZIONE +
      `<styleSheet xmlns="${SPAZIO_MAIN}">` +
      (formati.length ? `<numFmts count="${formati.length}">${formati.join("")}</numFmts>` : "") +
      `<fonts count="${this.font.length}">${this.font.join("")}</fonts>` +
      `<fills count="${this.riempimenti.length}">${this.riempimenti.join("")}</fills>` +
      `<borders count="${this.bordi.length}">${this.bordi.join("")}</borders>` +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.combinazioni.length}">${this.combinazioni.join("")}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      "</styleSheet>"
    );
  }
}

// --- scrittura -----------------------------------------------------------

function cellaXml(cella, rif, stili) {
  if (cella === null || cella === undefined) return "";
  const descrittore = typeof cella === "object" ? cella : { v: cella };
  const stile = stili.indice(descrittore.stile);
  const s = stile ? ` s="${stile}"` : "";
  const valore = descrittore.v;

  if (descrittore.f) {
    const calcolato = typeof valore === "number" ? `<v>${valore}</v>` : "";
    return `<c r="${rif}"${s}><f>${xml(descrittore.f)}</f>${calcolato}</c>`;
  }
  if (typeof valore === "number" && Number.isFinite(valore)) {
    return `<c r="${rif}"${s}><v>${valore}</v></c>`;
  }
  if (valore === null || valore === undefined || valore === "") {
    return stile ? `<c r="${rif}"${s}/>` : "";
  }
  const testo = String(valore);
  const spazi = /^\s|\s$|\n/.test(testo) ? ' xml:space="preserve"' : "";
  return `<c r="${rif}"${s} t="inlineStr"><is><t${spazi}>${xml(testo)}</t></is></c>`;
}

function foglioXml(foglio, stili, primo) {
  const righe = foglio.righe ?? [];
  let colonneMassime = 1;
  const corpo = righe
    .map((grezza, indiceRiga) => {
      const riga = Array.isArray(grezza) ? { celle: grezza } : grezza ?? { celle: [] };
      colonneMassime = Math.max(colonneMassime, riga.celle.length);
      const celle = riga.celle
        .map((cella, indiceColonna) => cellaXml(cella, riferimento(indiceRiga, indiceColonna), stili))
        .join("");
      const altezza = riga.altezza ? ` ht="${riga.altezza}" customHeight="1"` : "";
      if (!celle && !altezza) return "";
      return `<row r="${indiceRiga + 1}"${altezza}>${celle}</row>`;
    })
    .join("");

  const dimensione = `A1:${riferimento(Math.max(0, righe.length - 1), colonneMassime - 1)}`;
  const blocco = foglio.bloccaRighe
    ? `<pane ySplit="${foglio.bloccaRighe}" topLeftCell="A${foglio.bloccaRighe + 1}" activePane="bottomLeft" state="frozen"/>`
    : "";
  const colonne = (foglio.colonne ?? [])
    .map((larghezza, indice) =>
      larghezza ? `<col min="${indice + 1}" max="${indice + 1}" width="${larghezza}" customWidth="1"/>` : ""
    )
    .join("");
  const unite = foglio.unite?.length
    ? `<mergeCells count="${foglio.unite.length}">${foglio.unite
        .map((intervallo) => `<mergeCell ref="${intervallo}"/>`)
        .join("")}</mergeCells>`
    : "";

  const adatta = foglio.adattaLarghezza || foglio.adattaPagina;
  const margini = { sinistra: 0.4, destra: 0.4, sopra: 0.5, sotto: 0.5, ...foglio.margini };

  return (
    INTESTAZIONE +
    `<worksheet xmlns="${SPAZIO_MAIN}" xmlns:r="${SPAZIO_REL}">` +
    (adatta ? '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' : "") +
    `<dimension ref="${dimensione}"/>` +
    `<sheetViews><sheetView workbookViewId="0"${primo ? ' tabSelected="1"' : ""}>${blocco}</sheetView></sheetViews>` +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (colonne ? `<cols>${colonne}</cols>` : "") +
    `<sheetData>${corpo}</sheetData>` +
    unite +
    `<pageMargins left="${margini.sinistra}" right="${margini.destra}" top="${margini.sopra}" ` +
    `bottom="${margini.sotto}" header="0.3" footer="0.3"/>` +
    `<pageSetup paperSize="9" orientation="${foglio.orizzontale ? "landscape" : "portrait"}"` +
    (foglio.adattaPagina ? ' fitToWidth="1" fitToHeight="1"' : "") +
    (foglio.adattaLarghezza && !foglio.adattaPagina ? ' fitToWidth="1" fitToHeight="0"' : "") +
    "/></worksheet>"
  );
}

export function nomeFoglioValido(nome) {
  const pulito = String(nome).replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31);
  return pulito || "Foglio";
}

/**
 * Crea un file .xlsx.
 * fogli: [{ nome, nascosto?, colonne?: [larghezza…], righe: [[cella…] | {altezza, celle}],
 *           unite?: ["A1:C1"], bloccaRighe?, orizzontale?, adattaLarghezza?, adattaPagina?,
 *           margini?: { sinistra, destra, sopra, sotto } in pollici }]
 * cella: testo | numero | null | { v, f?, stile? }
 */
export function creaXlsx(fogli, { autore = "Timesheet" } = {}) {
  const stili = new Stili();
  const nomi = fogli.map((foglio) => nomeFoglioValido(foglio.nome));
  const fogliXml = fogli.map((foglio, indice) => foglioXml(foglio, stili, indice === 0));
  const adesso = new Date().toISOString().replace(/\.\d+Z$/, "Z");

  const file = [
    {
      nome: "[Content_Types].xml",
      contenuto:
        INTESTAZIONE +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        fogli
          .map(
            (_, indice) =>
              `<Override PartName="/xl/worksheets/sheet${indice + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
          )
          .join("") +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
        "</Types>",
    },
    {
      nome: "_rels/.rels",
      contenuto:
        INTESTAZIONE +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
        "</Relationships>",
    },
    {
      nome: "docProps/core.xml",
      contenuto:
        INTESTAZIONE +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        `<dc:creator>${xml(autore)}</dc:creator>` +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${adesso}</dcterms:created>` +
        `<dcterms:modified xsi:type="dcterms:W3CDTF">${adesso}</dcterms:modified>` +
        "</cp:coreProperties>",
    },
    {
      nome: "docProps/app.xml",
      contenuto:
        INTESTAZIONE +
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Timesheet</Application></Properties>',
    },
    {
      nome: "xl/workbook.xml",
      contenuto:
        INTESTAZIONE +
        `<workbook xmlns="${SPAZIO_MAIN}" xmlns:r="${SPAZIO_REL}">` +
        '<bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
        fogli
          .map(
            (foglio, indice) =>
              `<sheet name="${xml(nomi[indice])}" sheetId="${indice + 1}"` +
              (foglio.nascosto ? ' state="hidden"' : "") +
              ` r:id="rId${indice + 1}"/>`
          )
          .join("") +
        // Le formule portano già il valore calcolato, ma il ricalcolo
        // all'apertura le tiene giuste se qualcuno modifica una cella.
        '</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    },
    {
      nome: "xl/_rels/workbook.xml.rels",
      contenuto:
        INTESTAZIONE +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        fogli
          .map(
            (_, indice) =>
              `<Relationship Id="rId${indice + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${indice + 1}.xml"/>`
          )
          .join("") +
        `<Relationship Id="rId${fogli.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        "</Relationships>",
    },
    ...fogliXml.map((contenuto, indice) => ({
      nome: `xl/worksheets/sheet${indice + 1}.xml`,
      contenuto,
    })),
    // Gli stili si scrivono per ultimi: si raccolgono mentre si scrivono i fogli.
    { nome: "xl/styles.xml", contenuto: stili.xml() },
  ];

  return creaZip(file);
}

// --- lettura -------------------------------------------------------------

function testoDi(frammento) {
  // Il testo di una stringa può essere spezzato in più «run» con stili diversi.
  return [...frammento.matchAll(/<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>/g)]
    .map(([, testo]) => daXml(testo))
    .join("");
}

function percorsoDa(destinazione) {
  if (destinazione.startsWith("/")) return destinazione.slice(1);
  return `xl/${destinazione}`;
}

/**
 * Legge un .xlsx e restituisce i fogli come tabelle di valori:
 * [{ nome, nascosto, righe: [[valore…]] }]. Numeri come numeri, testi come
 * testi; le formule restano il loro ultimo valore calcolato.
 */
export async function leggiXlsx(byte) {
  const file = await leggiZip(byte instanceof Uint8Array ? byte : new Uint8Array(byte));
  const leggi = (nome) => (file.has(nome) ? decodificatore.decode(file.get(nome)) : null);

  const cartella = leggi("xl/workbook.xml");
  if (!cartella) throw new Error("Il file non è un documento Excel (.xlsx).");

  const relazioni = new Map();
  for (const [, testo] of (leggi("xl/_rels/workbook.xml.rels") ?? "").matchAll(
    /<(?:\w+:)?Relationship\b([^>]*)\/?>/g
  )) {
    const valori = attributi(testo);
    relazioni.set(valori.Id, percorsoDa(valori.Target));
  }

  const condivise = [...(leggi("xl/sharedStrings.xml") ?? "").matchAll(
    /<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g
  )].map(([, frammento]) => testoDi(frammento));

  const fogli = [];
  for (const [, testo] of cartella.matchAll(/<(?:\w+:)?sheet\b([^>]*?)\/?>/g)) {
    const valori = attributi(testo);
    const id = Object.entries(valori).find(([nome]) => /(^|:)id$/.test(nome) && nome !== "sheetId")?.[1];
    const contenuto = leggi(relazioni.get(id) ?? "");
    if (contenuto === null) continue;
    fogli.push({
      nome: valori.name,
      nascosto: valori.state === "hidden" || valori.state === "veryHidden",
      righe: leggiRighe(contenuto, condivise),
    });
  }
  return fogli;
}

function leggiRighe(contenuto, condivise) {
  const righe = [];
  let prossimaRiga = 0;
  for (const [, intestazioneRiga, corpo] of contenuto.matchAll(
    /<(?:\w+:)?row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?row>)/g
  )) {
    const numero = attributi(intestazioneRiga).r;
    const indiceRiga = numero ? Number(numero) - 1 : prossimaRiga;
    prossimaRiga = indiceRiga + 1;
    const riga = [];
    let prossimaColonna = 0;

    for (const [, testoCella, interno = ""] of (corpo ?? "").matchAll(
      /<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g
    )) {
      const valori = attributi(testoCella);
      const colonna = valori.r ? indiceColonna(valori.r.replace(/\d+$/, "")) : prossimaColonna;
      prossimaColonna = colonna + 1;
      const v = /<(?:\w+:)?v\b[^>]*>([\s\S]*?)<\/(?:\w+:)?v>/.exec(interno)?.[1];

      let valore = null;
      if (valori.t === "s") valore = condivise[Number(v)] ?? null;
      else if (valori.t === "inlineStr") valore = testoDi(interno);
      else if (valori.t === "str" || valori.t === "e") valore = v === undefined ? null : daXml(v);
      else if (valori.t === "b") valore = v === "1";
      else if (v !== undefined) valore = Number(v);
      riga[colonna] = valore;
    }
    righe[indiceRiga] = Array.from(riga, (valore) => valore ?? null);
  }
  return Array.from(righe, (riga) => riga ?? []);
}
