import * as dati from "./dati.js";
import * as calcoli from "./calcoli.js";
import * as esportazione from "./esportazione.js";

// --- elementi ------------------------------------------------------------

const elemento = (id) => document.getElementById(id);

const elencoErrori = elemento("errori");
const elencoAvvisi = elemento("avvisi");
const barraInferiore = document.querySelector(".barra-inferiore");

const dataOggi = elemento("data-oggi");
const statoTimbratura = elemento("stato-timbratura");
const bottoneTimbra = elemento("timbra");
const riassuntoOggi = elemento("riassunto-oggi");
const postoEditorOggi = elemento("posto-editor-oggi");
const postoEditorGiorno = elemento("posto-editor-giorno");

const editor = elemento("editor");
const titoloEditor = elemento("titolo-editor");
const sottotitoloEditor = elemento("sottotitolo-editor");
const righeIntervalli = elemento("righe-intervalli");
const righeAttivita = elemento("righe-attivita");
const righeAssenze = elemento("righe-assenze");
const sintesiPresenza = elemento("sintesi-presenza");
const sintesiAttivita = elemento("sintesi-attivita");
const senzaAttivita = elemento("senza-attivita");
const bottoneAggiungiAttivita = elemento("aggiungi-attivita");
const bottoneAssegnaResto = elemento("assegna-resto");
const campoStraordinarioOre = elemento("straordinario-ore");
const campoStraordinarioNota = elemento("straordinario-nota");
const campoNoteGiorno = elemento("note-giorno");
const esitoSalvataggio = elemento("esito-salvataggio");

const etichettaMese = elemento("mese-corrente");
const oreMese = elemento("ore-mese");
const scomposizioneMese = elemento("scomposizione-mese");
const statoInvio = elemento("stato-invio");
const kpiGiorni = elemento("kpi-giorni");
const kpiAssenze = elemento("kpi-assenze");
const kpiStraordinari = elemento("kpi-straordinari");
const attivitaMese = elemento("attivita-mese");
const elencoGiorni = elemento("elenco-giorni");

const formProfilo = elemento("form-profilo");
const campoNome = elemento("profilo-nome");
const campoCognome = elemento("profilo-cognome");
const campoMatricola = elemento("profilo-matricola");
const orePrevisteContenitore = elemento("ore-previste");
const pannelloBackup = elemento("pannello-backup");
const notaBackup = elemento("nota-backup");
const campoAzienda = elemento("azienda");
const campoPatrono = elemento("patrono");
const elencoAttivitaConfig = elemento("elenco-attivita");
const elencoAssenzeConfig = elemento("elenco-assenze");
const sceltaTema = elemento("scelta-tema");
const interruttoreUfficio = elemento("modalita-ufficio");

const sintesiConfigurazione = elemento("sintesi-configurazione");
const erroriFile = elemento("errori-file");
const titoloMeseRiepilogo = elemento("titolo-mese-riepilogo");
const contenitoreRiepilogo = elemento("contenitore-riepilogo");
const tabellaRiepilogo = elemento("tabella-riepilogo");
const bottoneScaricaRiepilogo = elemento("scarica-riepilogo");
const bottoneSvuotaRiepilogo = elemento("svuota-riepilogo");

const dialogoConferma = elemento("dialogo-conferma");
const titoloConferma = elemento("titolo-conferma");
const dettaglioConferma = elemento("dettaglio-conferma");
const bottoneConferma = elemento("bottone-conferma");

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const GIORNI_BREVI = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

const giornoEsteso = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
const giornoCompleto = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const giornoCorto = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });
const meseLungo = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });
const momento = new Intl.DateTimeFormat("it-IT", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

// --- stato ---------------------------------------------------------------

let vistaAttiva = "oggi";
let meseVisualizzato = calcoli.meseCorrente();
let dataEditor = null;
let editorModificato = false;
let riepilogoCaricato = null;
let prossimoId = 0;

// --- mattoni -------------------------------------------------------------

function dataLocale(iso) {
  const [anno, mese, giorno] = iso.split("-").map(Number);
  return new Date(anno, mese - 1, giorno);
}

function maiuscola(testo) {
  return testo.charAt(0).toUpperCase() + testo.slice(1);
}

function minutiAdesso() {
  const adesso = new Date();
  return adesso.getHours() * 60 + adesso.getMinutes();
}

function mostraErrori(messaggi) {
  elencoErrori.replaceChildren(
    ...messaggi.map((messaggio) => {
      const voce = document.createElement("li");
      voce.textContent = messaggio;
      return voce;
    })
  );
  elencoErrori.hidden = messaggi.length === 0;
  if (messaggi.length) elencoErrori.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

async function applica(errori) {
  mostraErrori(errori);
  disegna();
  return errori.length === 0;
}

function crea(tag, classe, testo) {
  const nodo = document.createElement(tag);
  if (classe) nodo.className = classe;
  if (testo !== undefined) nodo.textContent = testo;
  return nodo;
}

function creaBottone(testo, classe, azione) {
  const bottone = crea("button", classe, testo);
  bottone.type = "button";
  bottone.addEventListener("click", azione);
  return bottone;
}

function chiediConferma(titolo, dettaglio, conferma = "Conferma") {
  titoloConferma.textContent = titolo;
  dettaglioConferma.textContent = dettaglio;
  bottoneConferma.textContent = conferma;
  dialogoConferma.showModal();
  return new Promise((risolvi) => {
    dialogoConferma.addEventListener("close", () => risolvi(dialogoConferma.returnValue === "conferma"), {
      once: true,
    });
  });
}

function scarica(contenuto, nomeFile, tipo) {
  const indirizzo = URL.createObjectURL(new Blob([contenuto], { type: tipo }));
  const collegamento = document.createElement("a");
  collegamento.href = indirizzo;
  collegamento.download = nomeFile;
  document.body.append(collegamento);
  collegamento.click();
  collegamento.remove();
  // Revocare subito interrompe lo scaricamento in alcuni browser.
  setTimeout(() => URL.revokeObjectURL(indirizzo), 10_000);
}

async function leggiJson(file) {
  try {
    return JSON.parse(await file.text());
  } catch {
    return null;
  }
}

// --- viste e navigazione -------------------------------------------------

/** Lasciare l'editor con modifiche non salvate chiede conferma. */
async function puoiLasciareEditor() {
  if (!editorModificato) return true;
  const confermato = await chiediConferma(
    "Scartare le modifiche?",
    `Le modifiche alla giornata di ${giornoEsteso.format(dataLocale(dataEditor))} non sono state salvate.`,
    "Scarta"
  );
  if (confermato) editorModificato = false;
  return confermato;
}

async function mostraVista(nome) {
  if (nome !== vistaAttiva && !(await puoiLasciareEditor())) return false;
  vistaAttiva = nome;
  document.body.dataset.vista = nome;
  for (const vista of document.querySelectorAll(".vista")) {
    vista.classList.toggle("attiva", vista.id === `vista-${nome}`);
  }
  const voceNav = nome === "giorno" ? "mese" : nome;
  for (const voce of barraInferiore.querySelectorAll(".voce-nav")) {
    if (voce.dataset.vista === voceNav) voce.setAttribute("aria-current", "page");
    else voce.removeAttribute("aria-current");
  }
  if (nome === "oggi") collocaEditor(calcoli.oggiIso(), postoEditorOggi);
  mostraErrori([]);
  disegna();
  window.scrollTo({ top: 0 });
  return true;
}

barraInferiore.addEventListener("click", (evento) => {
  const voce = evento.target.closest(".voce-nav");
  if (voce) mostraVista(voce.dataset.vista);
});

async function apriGiorno(data) {
  if (data === dataEditor && vistaAttiva === "giorno") return;
  if (!(await puoiLasciareEditor())) return;
  vistaAttiva = null;
  collocaEditor(data, postoEditorGiorno);
  await mostraVista("giorno");
}

elemento("torna-al-mese").addEventListener("click", async () => {
  if (dataEditor) meseVisualizzato = calcoli.meseDi(dataEditor);
  await mostraVista("mese");
});

elemento("svuota-giorno").addEventListener("click", async () => {
  const confermato = await chiediConferma(
    "Svuotare la giornata?",
    `Presenze, attività, assenze e note di ${giornoEsteso.format(dataLocale(dataEditor))} verranno cancellate.`,
    "Svuota"
  );
  if (!confermato) return;
  const errori = await dati.salvaGiorno(dataEditor, calcoli.giornoVuoto(dataEditor));
  if (errori.length) return mostraErrori(errori);
  editorModificato = false;
  caricaEditor(dataEditor);
  disegna();
});

// --- editor della giornata -----------------------------------------------

function collocaEditor(data, posto) {
  posto.append(editor);
  if (data !== dataEditor || !editorModificato) caricaEditor(data);
}

function campo(etichetta, controllo, classe = "campo") {
  const contenitore = crea("div", classe);
  controllo.id = `campo-${++prossimoId}`;
  const label = crea("label", "", etichetta);
  label.htmlFor = controllo.id;
  contenitore.append(label, controllo);
  return contenitore;
}

function input(tipo, classe, valore = "", attributi = {}) {
  const nodo = document.createElement("input");
  nodo.type = tipo;
  nodo.className = classe;
  nodo.value = valore;
  for (const [nome, valoreAttributo] of Object.entries(attributi)) nodo.setAttribute(nome, valoreAttributo);
  return nodo;
}

function bottoneTogli(etichetta) {
  const bottone = creaBottone("×", "togli", (evento) => {
    evento.currentTarget.closest("li").remove();
    segnaModifica();
  });
  bottone.setAttribute("aria-label", etichetta);
  return bottone;
}

function rigaIntervallo(intervallo = { entrata: "", uscita: "" }) {
  const riga = crea("li", "riga");
  riga.append(
    campo("Entrata", input("time", "entrata", intervallo.entrata ?? "", { step: "60" })),
    campo("Uscita", input("time", "uscita", intervallo.uscita ?? "", { step: "60" })),
    bottoneTogli("Togli l'intervallo")
  );
  return riga;
}

function selettore(classe, opzioni, scelta) {
  const select = document.createElement("select");
  select.className = classe;
  for (const { valore, testo } of opzioni) {
    const opzione = new Option(testo, valore);
    opzione.selected = valore === scelta;
    select.append(opzione);
  }
  return select;
}

function opzioniAttivita(scelta) {
  // Le attività disattivate restano selezionabili solo dove sono già usate.
  return dati
    .elencoAttivita()
    .filter((attivita) => attivita.attiva || attivita.nome === scelta)
    .map((attivita) => ({ valore: attivita.nome, testo: attivita.nome }));
}

function rigaAttivita(voce = { attivita: "", durata: "", descrizione: "" }) {
  const riga = crea("li", "riga riga-attivita");
  const durata = voce.minuti ? calcoli.durataInTesto(voce.minuti) : voce.durata ?? "";
  riga.append(
    campo("Attività", selettore("attivita", opzioniAttivita(voce.attivita), voce.attivita)),
    campo("Ore", input("text", "ore", durata, { inputmode: "decimal", placeholder: "2:30", autocomplete: "off" })),
    campo(
      "Descrizione",
      input("text", "testo-descrizione", voce.descrizione ?? "", { maxlength: "200" }),
      "campo descrizione"
    ),
    bottoneTogli("Togli l'attività")
  );
  return riga;
}

function rigaAssenza(voce = { tipo: "", durata: "" }) {
  const riga = crea("li", "riga riga-assenza");
  const opzioni = dati.elencoAssenze().map((assenza) => ({
    valore: assenza.codice,
    testo: `${assenza.codice} — ${assenza.nome}`,
  }));
  const durata = voce.minuti ? calcoli.durataInTesto(voce.minuti) : voce.durata ?? "";
  riga.append(
    campo("Tipo", selettore("tipo", opzioni, voce.tipo)),
    campo("Ore", input("text", "ore", durata, { inputmode: "decimal", placeholder: "8:00", autocomplete: "off" })),
    bottoneTogli("Togli l'assenza")
  );
  return riga;
}

function caricaEditor(data) {
  dataEditor = data;
  editorModificato = false;
  const giorno = dati.giorno(data);
  const oggi = calcoli.oggiIso();
  const calendario = calcoli.tipoGiorno(data, dati.configurazione().patrono);

  const testoData = data === oggi ? "La giornata di oggi" : giornoCompleto.format(dataLocale(data));
  titoloEditor.textContent = maiuscola(testoData);
  sottotitoloEditor.textContent =
    calendario.nome || (calendario.tipo === "feriale" ? "" : maiuscola(calendario.tipo));
  sottotitoloEditor.hidden = !sottotitoloEditor.textContent;

  righeIntervalli.replaceChildren(...giorno.intervalli.map(rigaIntervallo));
  righeAttivita.replaceChildren(...giorno.attivita.map(rigaAttivita));
  righeAssenze.replaceChildren(...giorno.assenze.map(rigaAssenza));
  campoStraordinarioOre.value = giorno.straordinario ? calcoli.durataInTesto(giorno.straordinario.minuti) : "";
  campoStraordinarioNota.value = giorno.straordinario?.nota ?? "";
  campoNoteGiorno.value = giorno.note ?? "";
  esitoSalvataggio.textContent = "";
  aggiornaSintesiEditor();
}

/** La giornata come sta nel modulo, con le durate ancora in testo. Le righe lasciate vuote non contano. */
function leggiEditor() {
  const valore = (riga, classe) => riga.querySelector(`.${classe}`).value.trim();
  return {
    intervalli: [...righeIntervalli.children]
      .map((riga) => ({ entrata: valore(riga, "entrata"), uscita: valore(riga, "uscita") || null }))
      .filter((intervallo) => intervallo.entrata || intervallo.uscita),
    attivita: [...righeAttivita.children]
      .map((riga) => ({
        attivita: valore(riga, "attivita"),
        durata: valore(riga, "ore"),
        descrizione: valore(riga, "testo-descrizione"),
      }))
      .filter((voce) => voce.durata || voce.descrizione),
    assenze: [...righeAssenze.children]
      .map((riga) => ({ tipo: valore(riga, "tipo"), durata: valore(riga, "ore") }))
      .filter((voce) => voce.durata),
    straordinario: { durata: campoStraordinarioOre.value.trim(), nota: campoStraordinarioNota.value.trim() },
    note: campoNoteGiorno.value,
  };
}

function aggiornaSintesiEditor() {
  const giorno = leggiEditor();
  const adesso = dataEditor === calcoli.oggiIso() ? minutiAdesso() : null;
  const presenza = calcoli.minutiPresenza(giorno.intervalli, adesso);
  const pause = calcoli.pause(giorno.intervalli);
  const assegnate = giorno.attivita.reduce(
    (totale, voce) => totale + (calcoli.minutiDaDurata(voce.durata) ?? 0),
    0
  );
  const resto = presenza - assegnate;

  const parti = [`Presenza <strong>${calcoli.durataInTesto(presenza)}</strong>`];
  if (pause.length) {
    const totalePause = pause.reduce((totale, pausa) => totale + pausa.minuti, 0);
    parti.push(`pause ${calcoli.durataInTesto(totalePause)}`);
  }
  sintesiPresenza.innerHTML = parti.join(" · ");

  const attivitaDisponibili = dati.elencoAttivita().some((attivita) => attivita.attiva);
  senzaAttivita.hidden = attivitaDisponibili || righeAttivita.children.length > 0;
  bottoneAggiungiAttivita.hidden = !attivitaDisponibili;

  if (!presenza && !assegnate) {
    sintesiAttivita.textContent = "";
  } else if (resto === 0) {
    sintesiAttivita.innerHTML = `Tutte le ore ripartite: <strong>${calcoli.durataInTesto(assegnate)}</strong>`;
  } else {
    const testo =
      resto > 0
        ? `da ripartire <strong>${calcoli.durataInTesto(resto)}</strong>`
        : `<strong>${calcoli.durataInTesto(-resto)}</strong> più della presenza`;
    sintesiAttivita.innerHTML = `Assegnate ${calcoli.durataInTesto(assegnate)} · <span class="da-ripartire">${testo}</span>`;
  }
  bottoneAssegnaResto.hidden = !(resto > 0 && attivitaDisponibili);
  if (resto > 0) bottoneAssegnaResto.textContent = `Assegna il resto (${calcoli.durataInTesto(resto)})`;
}

function segnaModifica() {
  editorModificato = true;
  esitoSalvataggio.textContent = "";
  aggiornaSintesiEditor();
}

editor.addEventListener("input", segnaModifica);
editor.addEventListener("change", segnaModifica);

elemento("aggiungi-intervallo").addEventListener("click", () => {
  const riga = rigaIntervallo();
  righeIntervalli.append(riga);
  riga.querySelector("input").focus();
  segnaModifica();
});

bottoneAggiungiAttivita.addEventListener("click", () => {
  const usate = new Set([...righeAttivita.querySelectorAll(".attivita")].map((s) => s.value));
  const prima = opzioniAttivita("").find((opzione) => !usate.has(opzione.valore)) ?? opzioniAttivita("")[0];
  const riga = rigaAttivita({ attivita: prima?.valore ?? "", durata: "", descrizione: "" });
  righeAttivita.append(riga);
  riga.querySelector("select").focus();
  segnaModifica();
});

bottoneAssegnaResto.addEventListener("click", () => {
  const giorno = leggiEditor();
  const adesso = dataEditor === calcoli.oggiIso() ? minutiAdesso() : null;
  const resto =
    calcoli.minutiPresenza(giorno.intervalli, adesso) -
    giorno.attivita.reduce((totale, voce) => totale + (calcoli.minutiDaDurata(voce.durata) ?? 0), 0);
  if (resto <= 0) return;

  // Una riga già scelta ma ancora senza ore riceve il resto; altrimenti se ne aggiunge una.
  const vuota = [...righeAttivita.children].find((riga) => !riga.querySelector(".ore").value.trim());
  if (vuota) {
    vuota.querySelector(".ore").value = calcoli.durataInTesto(resto);
  } else {
    const ultima = righeAttivita.lastElementChild?.querySelector(".attivita")?.value;
    righeAttivita.append(
      rigaAttivita({
        attivita: ultima ?? opzioniAttivita("")[0]?.valore ?? "",
        durata: calcoli.durataInTesto(resto),
        descrizione: "",
      })
    );
  }
  segnaModifica();
});

elemento("aggiungi-assenza").addEventListener("click", () => {
  const riga = rigaAssenza();
  righeAssenze.append(riga);
  riga.querySelector("select").focus();
  segnaModifica();
});

elemento("giornata-intera").addEventListener("click", () => {
  const previste = dati.orePreviste(dataEditor);
  const riga = rigaAssenza({ tipo: dati.elencoAssenze()[0]?.codice ?? "", durata: previste ? calcoli.durataInTesto(previste) : "" });
  righeAssenze.append(riga);
  (previste ? riga.querySelector("select") : riga.querySelector(".ore")).focus();
  segnaModifica();
});

editor.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const errori = await dati.salvaGiorno(dataEditor, leggiEditor());
  if (errori.length) return mostraErrori(errori);
  mostraErrori([]);
  caricaEditor(dataEditor);
  const stato = dati.statoMese(calcoli.meseDi(dataEditor));
  esitoSalvataggio.textContent = stato?.modificatoDopo
    ? "Salvata. Il mese era già stato esportato: esportalo di nuovo."
    : "Salvata.";
  disegna();
});

elemento("annulla-giorno").addEventListener("click", () => {
  caricaEditor(dataEditor);
  mostraErrori([]);
});

// --- oggi ----------------------------------------------------------------

function disegnaOggi() {
  const oggi = calcoli.oggiIso();
  // A mezzanotte la vista passa al giorno nuovo, ma non sotto le mani di chi sta scrivendo.
  if (vistaAttiva === "oggi" && dataEditor !== oggi && !editorModificato) collocaEditor(oggi, postoEditorOggi);

  dataOggi.textContent = giornoCompleto.format(dataLocale(oggi));
  const giorno = dati.giorno(oggi);
  const aperto = calcoli.intervalloAperto(giorno.intervalli);
  const presenza = calcoli.minutiPresenza(giorno.intervalli, minutiAdesso());

  if (aperto) {
    statoTimbratura.innerHTML = `Al lavoro dalle <strong>${aperto.entrata}</strong>`;
    bottoneTimbra.textContent = "Esci";
    bottoneTimbra.classList.add("esci");
  } else {
    const ultima = giorno.intervalli.at(-1);
    statoTimbratura.innerHTML = ultima
      ? `Uscita alle <strong>${ultima.uscita}</strong>`
      : "Non hai ancora timbrato oggi.";
    bottoneTimbra.textContent = "Entra";
    bottoneTimbra.classList.remove("esci");
  }

  const parti = [];
  if (presenza) parti.push(`Presenza oggi ${calcoli.durataInTesto(presenza)}`);
  const calendario = calcoli.tipoGiorno(oggi, dati.configurazione().patrono);
  if (calendario.nome) parti.push(calendario.nome);
  riassuntoOggi.textContent = parti.join(" · ");
}

bottoneTimbra.addEventListener("click", async () => {
  const oggi = calcoli.oggiIso();
  const base = dataEditor === oggi && editorModificato ? leggiEditor() : null;
  const errori = await dati.timbra(new Date(), base);
  if (errori.length) return mostraErrori(errori);
  mostraErrori([]);
  editorModificato = false;
  if (vistaAttiva === "oggi") caricaEditor(oggi);
  disegna();
});

// Il conteggio delle ore di chi è al lavoro cresce da solo.
setInterval(() => {
  if (document.hidden) return;
  if (vistaAttiva === "oggi") {
    disegnaOggi();
    if (dataEditor === calcoli.oggiIso()) aggiornaSintesiEditor();
  }
}, 30_000);

// --- avvisi --------------------------------------------------------------

function disegnaAvvisi() {
  const avvisi = [];
  const avviso = (testo, azione, eseguire) => {
    const voce = crea("li", "", testo);
    if (azione) voce.append(creaBottone(azione, "", eseguire));
    avvisi.push(voce);
  };

  if (!dati.profiloCompleto() && vistaAttiva !== "impostazioni") {
    avviso("Inserisci nome e cognome: finiscono nel file Excel del mese.", "Apri", () => mostraVista("impostazioni"));
  }
  for (const data of dati.giorniConUscitaMancante().slice(0, 3)) {
    avviso(`Manca l'orario di uscita di ${giornoEsteso.format(dataLocale(data))}.`, "Sistema", () => apriGiorno(data));
  }
  const giorniRegistrati = dati.tuttiIGiorni().length;
  const dalBackup = dati.giorniDalBackup();
  if (giorniRegistrati >= 10 && (dalBackup === null || dalBackup > 30)) {
    avviso(
      dalBackup === null ? "Non hai ancora fatto un backup dei dati." : `L'ultimo backup è di ${dalBackup} giorni fa.`,
      "Fai il backup",
      async () => {
        if (await mostraVista("impostazioni")) {
          pannelloBackup.open = true;
          pannelloBackup.scrollIntoView({ behavior: "smooth" });
        }
      }
    );
  }
  elencoAvvisi.replaceChildren(...avvisi);
  elencoAvvisi.hidden = avvisi.length === 0;
}

// --- mese ----------------------------------------------------------------

function etichetta(testo, classe = "") {
  return crea("span", `etichetta ${classe}`.trim(), testo);
}

function disegnaMese() {
  const mese = meseVisualizzato;
  const oggi = calcoli.oggiIso();
  const configurazione = dati.configurazione();
  const giorni = dati.giorniDelMese(mese);
  const perData = new Map(giorni.map((giorno) => [giorno.data, giorno]));
  const totali = calcoli.totaliMese(giorni);

  etichettaMese.textContent = maiuscola(meseLungo.format(dataLocale(`${mese}-01`)));
  oreMese.textContent = calcoli.durataInTesto(totali.presenza);
  const resto = totali.presenza - totali.attivita;
  scomposizioneMese.textContent = totali.presenza
    ? `Assegnate ad attività ${calcoli.durataInTesto(totali.attivita)}` +
      (resto > 0 ? ` · da ripartire ${calcoli.durataInTesto(resto)}` : "")
    : "";

  kpiGiorni.textContent = String(totali.giorniPresenza);
  kpiAssenze.textContent = calcoli.durataInTesto(totali.assenze);
  kpiStraordinari.textContent = calcoli.durataInTesto(totali.straordinario);

  const stato = dati.statoMese(mese);
  statoInvio.classList.toggle("da-rifare", Boolean(stato?.modificatoDopo));
  statoInvio.textContent = !stato
    ? "Il file non è ancora stato esportato."
    : stato.modificatoDopo
      ? `Modificato dopo l'esportazione del ${momento.format(new Date(stato.inviato))}: esportalo di nuovo e rimanda il file.`
      : `Esportato il ${momento.format(new Date(stato.inviato))}.`;

  // Ore per attività, dalla più grande.
  const perAttivita = [...totali.perAttivita].sort((a, b) => b[1] - a[1]);
  const massimo = perAttivita[0]?.[1] ?? 0;
  attivitaMese.replaceChildren(
    ...(perAttivita.length
      ? perAttivita.map(([nome, minuti]) => {
          const voce = crea("li");
          const traccia = crea("span", "traccia");
          const riempimento = crea("span", "riempimento");
          riempimento.style.display = "block";
          riempimento.style.width = `${(minuti / massimo) * 100}%`;
          traccia.append(riempimento);
          const nomeBarra = crea("span", "etichetta-barra", nome);
          nomeBarra.title = nome;
          voce.append(nomeBarra, traccia, crea("span", "valore-barra", calcoli.durataInTesto(minuti)));
          return voce;
        })
      : [crea("li", "senza-dati", "Nessuna ora assegnata ad attività in questo mese.")])
  );

  const codici = new Map(configurazione.assenze.map((assenza) => [assenza.codice, assenza.nome]));
  elencoGiorni.replaceChildren(
    ...calcoli.dateDelMese(mese).map((data) => {
      const giorno = perData.get(data) ?? calcoli.giornoVuoto(data);
      const calendario = calcoli.tipoGiorno(data, configurazione.patrono);
      const totaliGiorno = calcoli.totaliGiorno(giorno);
      const lavorativo = calendario.tipo === "feriale" && dati.orePreviste(data) > 0;

      const voce = crea("li", "giorno-mese");
      voce.classList.toggle("non-lavorativo", !lavorativo);
      voce.classList.toggle("oggi", data === oggi);

      const bottone = document.createElement("button");
      bottone.type = "button";
      bottone.addEventListener("click", () => apriGiorno(data));

      const colonnaData = crea("span", "data-giorno");
      colonnaData.append(
        crea("span", "nome-giorno", GIORNI_BREVI[calcoli.giornoSettimana(data)]),
        crea("span", "numero-giorno", String(Number(data.slice(8))))
      );

      const corpo = crea("span", "corpo-giorno");
      const orari = giorno.intervalli.map((i) => `${i.entrata}–${i.uscita ?? "…"}`).join(" · ");
      corpo.append(crea("span", orari ? "orari-giorno" : "orari-giorno tenue", orari || calendario.nome || "—"));

      const dettagli = crea("span", "dettagli-giorno");
      if (orari && calendario.nome) dettagli.append(etichetta(calendario.nome));
      for (const assenza of giorno.assenze) {
        const etichettaAssenza = etichetta(`${assenza.tipo} ${calcoli.durataInTesto(assenza.minuti)}`, "assenza");
        etichettaAssenza.title = codici.get(assenza.tipo) ?? assenza.tipo;
        dettagli.append(etichettaAssenza);
      }
      if (giorno.straordinario) {
        dettagli.append(etichetta(`Straord. ${calcoli.durataInTesto(giorno.straordinario.minuti)}`));
      }
      if (calcoli.intervalloAperto(giorno.intervalli) && data < oggi) {
        dettagli.append(etichetta("Manca l'uscita", "attenzione"));
      } else if (totaliGiorno.presenza && totaliGiorno.daRipartire !== 0 && configurazione.attivita.length) {
        dettagli.append(
          etichetta(
            totaliGiorno.daRipartire > 0
              ? `Da ripartire ${calcoli.durataInTesto(totaliGiorno.daRipartire)}`
              : "Attività oltre la presenza",
            "attenzione"
          )
        );
      }
      if (lavorativo && data < oggi && !giorno.intervalli.length && !giorno.assenze.length) {
        dettagli.append(etichetta("Da completare", "attenzione"));
      }
      if (giorno.note) dettagli.append(etichetta("Nota"));
      if (dettagli.children.length) corpo.append(dettagli);

      const ore = crea("span", "ore-giorno", totaliGiorno.presenza ? calcoli.durataInTesto(totaliGiorno.presenza) : "");
      bottone.append(colonnaData, corpo, ore);
      bottone.setAttribute(
        "aria-label",
        `${giornoEsteso.format(dataLocale(data))}${orari ? `, ${orari}` : ""}` +
          (totaliGiorno.presenza ? `, ${calcoli.durataInTesto(totaliGiorno.presenza)} ore` : "")
      );
      voce.append(bottone);
      return voce;
    })
  );
}

elemento("mese-precedente").addEventListener("click", () => {
  meseVisualizzato = calcoli.meseSpostato(meseVisualizzato, -1);
  disegna();
});

elemento("mese-successivo").addEventListener("click", () => {
  meseVisualizzato = calcoli.meseSpostato(meseVisualizzato, 1);
  disegna();
});

elemento("esporta-mese").addEventListener("click", async () => {
  const mese = meseVisualizzato;
  if (!dati.profiloCompleto()) {
    return mostraErrori(["Prima inserisci nome e cognome in Impostazioni: finiscono nel file."]);
  }
  const giorni = dati.giorniDelMese(mese);
  const senzaUscita = giorni.filter((giorno) => calcoli.intervalloAperto(giorno.intervalli));
  if (senzaUscita.length) {
    return mostraErrori(
      senzaUscita.map(
        (giorno) =>
          `Manca l'orario di uscita di ${giornoEsteso.format(dataLocale(giorno.data))}: completalo prima di esportare.`
      )
    );
  }
  if (!giorni.length) {
    const confermato = await chiediConferma(
      "Esportare un mese vuoto?",
      "In questo mese non c'è nessuna giornata registrata.",
      "Esporta"
    );
    if (!confermato) return;
  }

  const profilo = dati.profilo();
  const byte = esportazione.fileDelMese({ configurazione: dati.configurazione(), profilo, mese, giorni });
  scarica(byte, esportazione.nomeFileMese(profilo, mese), TIPO_XLSX);
  await dati.segnaInviato(mese);
  mostraErrori([]);
  disegna();
});

// --- impostazioni --------------------------------------------------------

function disegnaProfilo() {
  const profilo = dati.profilo();
  campoNome.value = profilo.nome;
  campoCognome.value = profilo.cognome;
  campoMatricola.value = profilo.matricola;
  orePrevisteContenitore.replaceChildren(
    ...GIORNI_BREVI.map((nome, indice) => {
      const minuti = profilo.orePreviste[indice] ?? 0;
      const testo = !minuti ? "" : minuti % 60 ? calcoli.durataInTesto(minuti) : String(minuti / 60);
      const controllo = input("text", "ore-previste-giorno", testo, {
        inputmode: "decimal",
        placeholder: "0",
        autocomplete: "off",
      });
      return campo(nome, controllo);
    })
  );
}

formProfilo.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const errori = await dati.salvaProfilo({
    nome: campoNome.value,
    cognome: campoCognome.value,
    matricola: campoMatricola.value,
    orePreviste: [...orePrevisteContenitore.querySelectorAll("input")].map((campoOre) => campoOre.value),
  });
  if (await applica(errori)) {
    disegnaProfilo();
    const esito = crea("span", "esito", "Salvato.");
    formProfilo.querySelector(".azioni-form").append(esito);
    setTimeout(() => esito.remove(), 2500);
  }
});

function avviaRinomina(voce, valore, salva) {
  const campoNuovo = input("text", "campo-rinomina", valore, { maxlength: "60" });
  campoNuovo.setAttribute("aria-label", "Nuovo nome");
  const conferma = async () => {
    if (await applica(await salva(campoNuovo.value))) disegna();
  };
  campoNuovo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") conferma();
    if (evento.key === "Escape") disegna();
  });
  voce.replaceChildren(campoNuovo, creaBottone("Salva", "minimo", conferma), creaBottone("Annulla", "minimo", disegna));
  campoNuovo.focus();
  campoNuovo.select();
}

function disegnaConfigurazione() {
  const configurazione = dati.configurazione();
  if (document.activeElement !== campoAzienda) campoAzienda.value = configurazione.azienda;
  if (document.activeElement !== campoPatrono) campoPatrono.value = patronoLeggibile(configurazione.patrono);

  const attivita = dati.elencoAttivita();
  elencoAttivitaConfig.replaceChildren(
    ...(attivita.length
      ? attivita.map((voceAttivita) => {
          const voce = crea("li");
          const nome = crea("span", "nome-categoria", voceAttivita.nome);
          nome.classList.toggle("disattivata", !voceAttivita.attiva);
          const azioni = crea("span", "azioni-elenco");
          azioni.append(
            creaBottone("Rinomina", "minimo", () =>
              avviaRinomina(voce, voceAttivita.nome, (nuovo) => dati.rinominaAttivita(voceAttivita.nome, nuovo))
            ),
            creaBottone(voceAttivita.attiva ? "Disattiva" : "Riattiva", "minimo", async () =>
              applica(await dati.impostaAttivaAttivita(voceAttivita.nome, !voceAttivita.attiva))
            )
          );
          if (!voceAttivita.usata) {
            azioni.append(
              creaBottone("Elimina", "minimo pericolo", async () => applica(await dati.eliminaAttivita(voceAttivita.nome)))
            );
          }
          voce.append(nome, azioni);
          return voce;
        })
      : [crea("li", "senza-dati", "Nessuna attività: aggiungine una o importa la configurazione.")])
  );

  elencoAssenzeConfig.replaceChildren(
    ...dati.elencoAssenze().map((assenza) => {
      const voce = crea("li");
      const nome = crea("span", "nome-categoria");
      nome.append(crea("span", "codice", assenza.codice), assenza.nome);
      const azioni = crea("span", "azioni-elenco");
      azioni.append(
        creaBottone("Rinomina", "minimo", () =>
          avviaRinomina(voce, assenza.nome, (nuovo) => dati.rinominaAssenza(assenza.codice, nuovo))
        )
      );
      if (!assenza.usata) {
        azioni.append(
          creaBottone("Elimina", "minimo pericolo", async () => applica(await dati.eliminaAssenza(assenza.codice)))
        );
      }
      voce.append(nome, azioni);
      return voce;
    })
  );
}

// Il patrono si scrive all'italiana, «24/06»; nell'archivio e nei file sta come «06-24».
function patronoLeggibile(patrono) {
  return patrono ? patrono.split("-").reverse().join("/") : "";
}

function patronoDaTesto(testo) {
  const trovato = /^(\d{1,2})[/.-](\d{1,2})$/.exec(testo.trim());
  if (!trovato) return testo.trim();
  return `${trovato[2].padStart(2, "0")}-${trovato[1].padStart(2, "0")}`;
}

elemento("form-azienda").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  await applica(await dati.salvaDatiAzienda(campoAzienda.value, patronoDaTesto(campoPatrono.value)));
});

elemento("form-attivita").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const campoNuova = elemento("nuova-attivita");
  if (await applica(await dati.aggiungiAttivita(campoNuova.value))) campoNuova.value = "";
});

elemento("form-assenza").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const codice = elemento("nuovo-codice");
  const nome = elemento("nuovo-nome-assenza");
  if (await applica(await dati.aggiungiAssenza(codice.value, nome.value))) {
    codice.value = "";
    nome.value = "";
  }
});

elemento("importa-configurazione").addEventListener("change", async (evento) => {
  const file = evento.target.files?.[0];
  evento.target.value = "";
  if (!file) return;
  const contenuto = await leggiJson(file);
  if (!contenuto) return mostraErrori(["Il file non è leggibile: non contiene una configurazione."]);

  if (dati.elencoAttivita().length) {
    const confermato = await chiediConferma(
      "Sostituire la configurazione?",
      `Attività, codici di assenza e azienda verranno presi da «${file.name}». Le attività già usate nelle tue giornate restano, disattivate se il file non le contiene.`,
      "Sostituisci"
    );
    if (!confermato) return;
  }
  if (await applica(await dati.importaConfigurazione(contenuto))) {
    if (dataEditor && !editorModificato) caricaEditor(dataEditor);
  }
});

function disegnaBackup() {
  const giorni = dati.giorniDalBackup();
  const quante = dati.tuttiIGiorni().length;
  notaBackup.classList.toggle("avviso", quante > 0 && (giorni === null || giorni > 30));
  notaBackup.innerHTML =
    giorni === null
      ? quante
        ? "<strong>Non hai ancora fatto un backup.</strong>"
        : "Nessun backup finora."
      : `Ultimo backup: ${giorni === 0 ? "oggi" : giorni === 1 ? "ieri" : `${giorni} giorni fa`}.`;
}

elemento("scarica-backup").addEventListener("click", async () => {
  scarica(JSON.stringify(dati.esportaBackup(), null, 2), dati.nomeFileBackup(), "application/json");
  await dati.segnaBackup();
  disegna();
});

elemento("carica-backup").addEventListener("change", async (evento) => {
  const file = evento.target.files?.[0];
  evento.target.value = "";
  if (!file) return;
  const confermato = await chiediConferma(
    "Ripristinare dal backup?",
    `«${file.name}» sostituirà profilo, configurazione e tutte le giornate registrate ora.`,
    "Ripristina"
  );
  if (!confermato) return;
  const contenuto = await leggiJson(file);
  if (!contenuto) return mostraErrori(["Il file non è leggibile: non contiene dati in formato JSON."]);
  editorModificato = false;
  if (await applica(await dati.importaBackup(contenuto))) {
    disegnaProfilo();
    if (dataEditor) caricaEditor(dataEditor);
  }
});

// Il tema: "sistema" non scrive nulla sul documento, e valgono le preferenze del dispositivo.
function applicaTema(tema) {
  if (tema === "chiaro" || tema === "scuro") document.documentElement.dataset.tema = tema;
  else delete document.documentElement.dataset.tema;
  const scelto =
    sceltaTema.querySelector(`input[value="${tema}"]`) ?? sceltaTema.querySelector('input[value="sistema"]');
  scelto.checked = true;
}

function temaSalvato() {
  try {
    return localStorage.getItem("tema") ?? "sistema";
  } catch {
    return "sistema";
  }
}

sceltaTema.addEventListener("change", (evento) => {
  const tema = evento.target.value;
  applicaTema(tema);
  try {
    if (tema === "sistema") localStorage.removeItem("tema");
    else localStorage.setItem("tema", tema);
  } catch {
    // La scelta vale comunque per questa sessione.
  }
});

interruttoreUfficio.addEventListener("change", async () => {
  await dati.impostaPreferenza("ufficio", interruttoreUfficio.checked);
  disegna();
});

// --- ufficio -------------------------------------------------------------

function disegnaUfficio() {
  const configurazione = dati.configurazione();
  const attive = configurazione.attivita.filter((attivita) => attivita.attiva).length;
  sintesiConfigurazione.textContent =
    `${configurazione.azienda || "Azienda non indicata"} · ${attive} ${attive === 1 ? "attività attiva" : "attività attive"} · ` +
    `${configurazione.assenze.length} codici di assenza` +
    (configurazione.patrono ? ` · patrono il ${patronoLeggibile(configurazione.patrono)}` : "");

  const pieno = Boolean(riepilogoCaricato?.righe.length);
  titoloMeseRiepilogo.hidden = !pieno;
  contenitoreRiepilogo.hidden = !pieno;
  bottoneScaricaRiepilogo.hidden = !pieno;
  bottoneSvuotaRiepilogo.hidden = !pieno;
  if (!pieno) return;

  const { mese, righe, tipiAssenza, attivita } = riepilogoCaricato;
  titoloMeseRiepilogo.textContent = `${maiuscola(meseLungo.format(dataLocale(`${mese}-01`)))} · ${righe.length} ${
    righe.length === 1 ? "dipendente" : "dipendenti"
  }`;

  const intestazioni = [
    "Dipendente",
    "Giorni",
    "Ore lavorate",
    ...tipiAssenza.map((tipo) => tipo.codice),
    "Straord.",
    ...attivita,
  ];
  const testa = crea("thead");
  const rigaTesta = crea("tr");
  for (const [indice, testo] of intestazioni.entries()) {
    const cella = crea("th", "", testo);
    cella.scope = "col";
    const tipo = tipiAssenza[indice - 3];
    if (tipo?.nome) cella.title = tipo.nome;
    rigaTesta.append(cella);
  }
  testa.append(rigaTesta);

  const durata = (minuti) => (minuti ? calcoli.durataInTesto(minuti) : "—");
  const corpo = crea("tbody");
  const somme = { giorni: 0, presenza: 0, straordinario: 0, assenze: new Map(), attivita: new Map() };
  for (const riga of righe) {
    const tr = crea("tr");
    const nome = crea("td", "", `${riga.profilo.cognome} ${riga.profilo.nome}`.trim());
    if (riga.profilo.matricola) nome.append(crea("small", "", `matr. ${riga.profilo.matricola}`));
    tr.append(nome, crea("td", "", String(riga.totali.giorniPresenza)), crea("td", "", durata(riga.totali.presenza)));
    for (const tipo of tipiAssenza) {
      const minuti = riga.totali.perAssenza.get(tipo.codice) ?? 0;
      somme.assenze.set(tipo.codice, (somme.assenze.get(tipo.codice) ?? 0) + minuti);
      tr.append(crea("td", "", durata(minuti)));
    }
    tr.append(crea("td", "", durata(riga.totali.straordinario)));
    for (const nomeAttivita of attivita) {
      const minuti = riga.totali.perAttivita.get(nomeAttivita) ?? 0;
      somme.attivita.set(nomeAttivita, (somme.attivita.get(nomeAttivita) ?? 0) + minuti);
      tr.append(crea("td", "", durata(minuti)));
    }
    somme.giorni += riga.totali.giorniPresenza;
    somme.presenza += riga.totali.presenza;
    somme.straordinario += riga.totali.straordinario;
    corpo.append(tr);
  }

  const piede = crea("tfoot");
  const rigaPiede = crea("tr");
  rigaPiede.append(
    crea("td", "", "Totale"),
    crea("td", "", String(somme.giorni)),
    crea("td", "", durata(somme.presenza)),
    ...tipiAssenza.map((tipo) => crea("td", "", durata(somme.assenze.get(tipo.codice)))),
    crea("td", "", durata(somme.straordinario)),
    ...attivita.map((nomeAttivita) => crea("td", "", durata(somme.attivita.get(nomeAttivita))))
  );
  piede.append(rigaPiede);
  tabellaRiepilogo.replaceChildren(testa, corpo, piede);
}

elemento("scarica-configurazione").addEventListener("click", () => {
  scarica(
    JSON.stringify(dati.esportaConfigurazione(), null, 2),
    "configurazione-ufficio.json",
    "application/json"
  );
});

elemento("importa-file").addEventListener("change", async (evento) => {
  const file = [...(evento.target.files ?? [])];
  evento.target.value = "";
  if (!file.length) return;

  const errori = [];
  const letti = [];
  for (const singolo of file) {
    try {
      letti.push(await esportazione.leggiFileMese(new Uint8Array(await singolo.arrayBuffer()), `«${singolo.name}»`));
    } catch (errore) {
      errori.push(errore.message);
    }
  }

  const [riepilogo, erroriRiepilogo] = esportazione.riepilogoUfficio([...(riepilogoCaricato?.righe ?? []), ...letti]);
  if (erroriRiepilogo.length) errori.push(...erroriRiepilogo);
  else riepilogoCaricato = riepilogo;

  erroriFile.replaceChildren(...errori.map((messaggio) => crea("li", "", messaggio)));
  erroriFile.hidden = errori.length === 0;
  disegna();
});

bottoneSvuotaRiepilogo.addEventListener("click", () => {
  riepilogoCaricato = null;
  erroriFile.hidden = true;
  disegna();
});

bottoneScaricaRiepilogo.addEventListener("click", () => {
  if (!riepilogoCaricato) return;
  scarica(
    esportazione.fileRiepilogo(riepilogoCaricato, dati.configurazione()),
    esportazione.nomeFileRiepilogo(riepilogoCaricato.mese),
    TIPO_XLSX
  );
});

// --- disegno complessivo -------------------------------------------------

function disegna() {
  const ufficio = dati.preferenza("ufficio") === true;
  interruttoreUfficio.checked = ufficio;
  barraInferiore.querySelector('[data-vista="ufficio"]').hidden = !ufficio;

  disegnaAvvisi();
  if (vistaAttiva === "oggi") disegnaOggi();
  if (vistaAttiva === "mese") disegnaMese();
  if (vistaAttiva === "impostazioni") {
    disegnaConfigurazione();
    disegnaBackup();
  }
  if (vistaAttiva === "ufficio") disegnaUfficio();
  if (dataEditor) aggiornaSintesiEditor();
}

// --- installazione e funzionamento offline -------------------------------

const bottoneInstalla = elemento("installa");
const istruzioniInstalla = elemento("istruzioni-installa");
let invitoInstallazione = null;
let statoOffline = "non supportato da questo browser";

// La registrazione va tentata subito: il browser valuta l'idoneità
// all'installazione solo dopo che un service worker è attivo.
if ("serviceWorker" in navigator) {
  statoOffline = "registrazione in corso";
  navigator.serviceWorker
    .register("./sw.js")
    .then((registrazione) => {
      statoOffline = registrazione.active ? "attivo" : "in attivazione";
    })
    .catch((errore) => {
      statoOffline = `non riuscita (${errore.message})`;
    });
}

window.addEventListener("beforeinstallprompt", (evento) => {
  evento.preventDefault();
  invitoInstallazione = evento;
  istruzioniInstalla.hidden = true;
});

bottoneInstalla.addEventListener("click", async () => {
  if (invitoInstallazione) {
    bottoneInstalla.hidden = true;
    invitoInstallazione.prompt();
    await invitoInstallazione.userChoice;
    invitoInstallazione = null;
    return;
  }
  istruzioniInstalla.textContent =
    'Dal menu del browser scegli "Installa app" (in Chrome ed Edge è anche l\'icona nella barra dell\'indirizzo). ' +
    `Se la voce non c'è, riporta questa riga: offline ${statoOffline} · ` +
    `${navigator.serviceWorker?.controller ? "pagina controllata" : "pagina NON controllata"} · ` +
    `invito automatico ${invitoInstallazione ? "ricevuto" : "mai arrivato"}`;
  istruzioniInstalla.hidden = false;
});

function nascondiSeGiaInstallata() {
  const avviata = window.matchMedia("(display-mode: standalone)").matches;
  bottoneInstalla.hidden = avviata;
  if (avviata) istruzioniInstalla.hidden = true;
}

window.addEventListener("appinstalled", () => {
  bottoneInstalla.hidden = true;
  istruzioniInstalla.hidden = true;
  invitoInstallazione = null;
});

// Chi chiude la scheda con modifiche non salvate riceve l'avviso del browser.
window.addEventListener("beforeunload", (evento) => {
  if (editorModificato) evento.preventDefault();
});

nascondiSeGiaInstallata();

// --- avvio ---------------------------------------------------------------

applicaTema(temaSalvato());
try {
  await dati.inizializza();
} catch (errore) {
  mostraErrori([
    `Impossibile aprire l'archivio del browser (${errore.message}). In una finestra anonima o con i dati del sito bloccati la app non può salvare.`,
  ]);
  throw errore;
}
disegnaProfilo();
// Alla prima apertura si comincia da chi sei: senza nome il file Excel non si può fare.
const primaVolta = !dati.profiloCompleto() && dati.tuttiIGiorni().length === 0;
vistaAttiva = null;
await mostraVista(primaVolta ? "impostazioni" : "oggi");
