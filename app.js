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
const righeProgetti = elemento("righe-progetti");
const righeAssenze = elemento("righe-assenze");
const sintesiPresenza = elemento("sintesi-presenza");
const sintesiProgetti = elemento("sintesi-progetti");
const senzaProgetti = elemento("senza-progetti");
const bottoneAggiungiProgetto = elemento("aggiungi-progetto");
const bottoneAssegnaResto = elemento("assegna-resto");
const campoDescrizione = elemento("descrizione-giorno");
const sceltaLocalita = elemento("localita-giorno");
const campoLocalitaAltro = elemento("localita-altro");
const campoStraordinarioOre = elemento("straordinario-ore");
const campoStraordinarioNota = elemento("straordinario-nota");
const esitoSalvataggio = elemento("esito-salvataggio");

const etichettaMese = elemento("mese-corrente");
const oreMese = elemento("ore-mese");
const scomposizioneMese = elemento("scomposizione-mese");
const bottoneEsportaAnno = elemento("esporta-anno");
const statoInvio = elemento("stato-invio");
const kpiGiorni = elemento("kpi-giorni");
const kpiAssenze = elemento("kpi-assenze");
const kpiStraordinari = elemento("kpi-straordinari");
const progettiMese = elemento("progetti-mese");
const elencoGiorni = elemento("elenco-giorni");

const formProfilo = elemento("form-profilo");
const campoNome = elemento("profilo-nome");
const campoCognome = elemento("profilo-cognome");
const campoPosizione = elemento("profilo-posizione");
const sceltaLocalitaProfilo = elemento("profilo-localita");
const campoMatricola = elemento("profilo-matricola");
const orePrevisteContenitore = elemento("ore-previste");
const pannelloBackup = elemento("pannello-backup");
const notaBackup = elemento("nota-backup");
const campoAzienda = elemento("azienda");
const campoPatrono = elemento("patrono");
const elencoProgettiConfig = elemento("elenco-progetti");
const elencoLocalitaConfig = elemento("elenco-localita");
const elencoAssenzeConfig = elemento("elenco-assenze");
const sceltaTema = elemento("scelta-tema");
const interruttoreUfficio = elemento("modalita-ufficio");

const sintesiConfigurazione = elemento("sintesi-configurazione");
const erroriFile = elemento("errori-file");
const campoMeseRiepilogo = elemento("campo-mese-riepilogo");
const sceltaMeseRiepilogo = elemento("mese-riepilogo");
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
// Valore dell'opzione «Altro…» della località: una trasferta, scritta a mano.
const ALTRA_LOCALITA = "__altra-localita__";

const giornoEsteso = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" });
const giornoCompleto = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
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
// Sezione Ufficio: i file letti (già uniti, uno per dipendente) e il mese scelto.
let fileUfficio = null;
let meseUfficio = null;
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

function riempiSelettore(select, opzioni, scelta) {
  select.replaceChildren(
    ...opzioni.map(({ valore, testo }) => {
      const opzione = new Option(testo, valore);
      opzione.selected = valore === scelta;
      return opzione;
    })
  );
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
    `Orari, attività, progetti e assenze di ${giornoEsteso.format(dataLocale(dataEditor))} verranno cancellati.`,
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

function selettore(classe, opzioni, scelta) {
  const select = document.createElement("select");
  select.className = classe;
  riempiSelettore(select, opzioni, scelta);
  return select;
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

function opzioniProgetti(scelta) {
  // I progetti disattivati restano selezionabili solo dove sono già usati.
  return dati
    .elencoProgetti()
    .filter((progetto) => progetto.attivo || progetto.nome === scelta)
    .map((progetto) => ({ valore: progetto.nome, testo: progetto.nome }));
}

function rigaProgetto(voce = { progetto: "", durata: "" }) {
  const riga = crea("li", "riga riga-scelta");
  const durata = voce.minuti ? calcoli.durataInTesto(voce.minuti) : voce.durata ?? "";
  riga.append(
    campo("Progetto", selettore("progetto", opzioniProgetti(voce.progetto), voce.progetto)),
    campo("Ore", input("text", "ore", durata, { inputmode: "decimal", placeholder: "2:30", autocomplete: "off" })),
    bottoneTogli("Togli il progetto")
  );
  return riga;
}

function rigaAssenza(voce = { tipo: "", durata: "" }) {
  const riga = crea("li", "riga riga-scelta");
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

/** La località di una giornata: dall'elenco, oppure «Altro…» con il nome scritto a mano. */
function caricaLocalita(localita) {
  const elenco = dati.elencoLocalita();
  const scelta = localita || dati.localitaPredefinita();
  const nellElenco = elenco.includes(scelta);
  riempiSelettore(
    sceltaLocalita,
    [
      ...elenco.map((nome) => ({ valore: nome, testo: nome })),
      { valore: ALTRA_LOCALITA, testo: "Altro… (trasferta)" },
    ],
    nellElenco || !scelta ? scelta : ALTRA_LOCALITA
  );
  campoLocalitaAltro.value = nellElenco ? "" : scelta;
  campoLocalitaAltro.hidden = sceltaLocalita.value !== ALTRA_LOCALITA;
}

function caricaEditor(data) {
  dataEditor = data;
  editorModificato = false;
  const giorno = dati.giorno(data);
  const oggi = calcoli.oggiIso();
  const calendario = calcoli.tipoGiorno(data, dati.configurazione().patrono);

  titoloEditor.textContent =
    data === oggi ? "La giornata di oggi" : maiuscola(giornoCompleto.format(dataLocale(data)));
  sottotitoloEditor.textContent =
    calendario.nome || (calendario.tipo === "feriale" ? "" : maiuscola(calendario.tipo));
  sottotitoloEditor.hidden = !sottotitoloEditor.textContent;

  righeIntervalli.replaceChildren(...giorno.intervalli.map(rigaIntervallo));
  campoDescrizione.value = giorno.descrizione ?? "";
  caricaLocalita(giorno.localita);
  righeProgetti.replaceChildren(...giorno.progetti.map(rigaProgetto));
  righeAssenze.replaceChildren(...giorno.assenze.map(rigaAssenza));
  campoStraordinarioOre.value = giorno.straordinario ? calcoli.durataInTesto(giorno.straordinario.minuti) : "";
  campoStraordinarioNota.value = giorno.straordinario?.nota ?? "";
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
    progetti: [...righeProgetti.children]
      .map((riga) => ({ progetto: valore(riga, "progetto"), durata: valore(riga, "ore") }))
      .filter((voce) => voce.durata),
    descrizione: campoDescrizione.value,
    localita: sceltaLocalita.value === ALTRA_LOCALITA ? campoLocalitaAltro.value.trim() : sceltaLocalita.value,
    assenze: [...righeAssenze.children]
      .map((riga) => ({ tipo: valore(riga, "tipo"), durata: valore(riga, "ore") }))
      .filter((voce) => voce.durata),
    straordinario: { durata: campoStraordinarioOre.value.trim(), nota: campoStraordinarioNota.value.trim() },
  };
}

function oreRipartite(giorno) {
  return giorno.progetti.reduce((totale, voce) => totale + (calcoli.minutiDaDurata(voce.durata) ?? 0), 0);
}

function aggiornaSintesiEditor() {
  const giorno = leggiEditor();
  const adesso = dataEditor === calcoli.oggiIso() ? minutiAdesso() : null;
  const lavorate = calcoli.minutiLavorati(giorno.intervalli, adesso);
  const pause = calcoli.pause(giorno.intervalli);
  const assegnate = oreRipartite(giorno);
  const resto = lavorate - assegnate;

  const parti = [`Ore lavorate <strong>${calcoli.durataInTesto(lavorate)}</strong>`];
  if (pause.length) {
    const totalePause = pause.reduce((totale, pausa) => totale + pausa.minuti, 0);
    parti.push(`pausa ${calcoli.durataInTesto(totalePause)} compresa`);
  }
  sintesiPresenza.innerHTML = parti.join(" · ");

  const progettiDisponibili = dati.elencoProgetti().some((progetto) => progetto.attivo);
  senzaProgetti.hidden = progettiDisponibili || righeProgetti.children.length > 0;
  bottoneAggiungiProgetto.hidden = !progettiDisponibili;

  if (!lavorate && !assegnate) {
    sintesiProgetti.textContent = "";
  } else if (resto === 0) {
    sintesiProgetti.innerHTML = `Tutte le ore ripartite: <strong>${calcoli.durataInTesto(assegnate)}</strong>`;
  } else {
    const testo =
      resto > 0
        ? `da ripartire <strong>${calcoli.durataInTesto(resto)}</strong>`
        : `<strong>${calcoli.durataInTesto(-resto)}</strong> più delle ore lavorate`;
    sintesiProgetti.innerHTML = `Ripartite ${calcoli.durataInTesto(assegnate)} · <span class="da-ripartire">${testo}</span>`;
  }
  bottoneAssegnaResto.hidden = !(resto > 0 && progettiDisponibili);
  if (resto > 0) bottoneAssegnaResto.textContent = `Assegna il resto (${calcoli.durataInTesto(resto)})`;
}

function segnaModifica() {
  editorModificato = true;
  esitoSalvataggio.textContent = "";
  aggiornaSintesiEditor();
}

editor.addEventListener("input", segnaModifica);
editor.addEventListener("change", segnaModifica);

sceltaLocalita.addEventListener("change", () => {
  campoLocalitaAltro.hidden = sceltaLocalita.value !== ALTRA_LOCALITA;
  if (!campoLocalitaAltro.hidden) campoLocalitaAltro.focus();
});

elemento("aggiungi-intervallo").addEventListener("click", () => {
  const riga = rigaIntervallo();
  righeIntervalli.append(riga);
  riga.querySelector("input").focus();
  segnaModifica();
});

bottoneAggiungiProgetto.addEventListener("click", () => {
  const usati = new Set([...righeProgetti.querySelectorAll(".progetto")].map((s) => s.value));
  const primo = opzioniProgetti("").find((opzione) => !usati.has(opzione.valore)) ?? opzioniProgetti("")[0];
  const riga = rigaProgetto({ progetto: primo?.valore ?? "", durata: "" });
  righeProgetti.append(riga);
  riga.querySelector("select").focus();
  segnaModifica();
});

bottoneAssegnaResto.addEventListener("click", () => {
  const giorno = leggiEditor();
  const adesso = dataEditor === calcoli.oggiIso() ? minutiAdesso() : null;
  const resto = calcoli.minutiLavorati(giorno.intervalli, adesso) - oreRipartite(giorno);
  if (resto <= 0) return;

  // Una riga già scelta ma ancora senza ore riceve il resto; altrimenti se ne aggiunge una.
  const vuota = [...righeProgetti.children].find((riga) => !riga.querySelector(".ore").value.trim());
  if (vuota) {
    vuota.querySelector(".ore").value = calcoli.durataInTesto(resto);
  } else {
    const ultimo = righeProgetti.lastElementChild?.querySelector(".progetto")?.value;
    righeProgetti.append(
      rigaProgetto({
        progetto: ultimo ?? opzioniProgetti("")[0]?.valore ?? "",
        durata: calcoli.durataInTesto(resto),
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
  const riga = rigaAssenza({
    tipo: dati.elencoAssenze()[0]?.codice ?? "",
    durata: previste ? calcoli.durataInTesto(previste) : "",
  });
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
  const stato = dati.statoAnno(dataEditor.slice(0, 4));
  esitoSalvataggio.textContent = stato?.modificatoDopo
    ? "Salvata. Il file dell'anno era già stato esportato: esportalo di nuovo."
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
  const lavorate = calcoli.minutiLavorati(giorno.intervalli, minutiAdesso());

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
  if (lavorate) parti.push(`Ore lavorate oggi ${calcoli.durataInTesto(lavorate)}`);
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
    avviso("Inserisci nome e cognome: finiscono nel timesheet Excel.", "Apri", () => mostraVista("impostazioni"));
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
  const anno = mese.slice(0, 4);
  const oggi = calcoli.oggiIso();
  const configurazione = dati.configurazione();
  const giorni = dati.giorniDelMese(mese);
  const perData = new Map(giorni.map((giorno) => [giorno.data, giorno]));
  const totali = calcoli.totaliMese(giorni);

  etichettaMese.textContent = maiuscola(meseLungo.format(dataLocale(`${mese}-01`)));
  oreMese.textContent = calcoli.durataInTesto(totali.lavorate);
  const resto = totali.lavorate - totali.progetti;
  scomposizioneMese.textContent = totali.lavorate
    ? `Ripartite sui progetti ${calcoli.durataInTesto(totali.progetti)}` +
      (resto > 0 ? ` · da ripartire ${calcoli.durataInTesto(resto)}` : "")
    : "";

  kpiGiorni.textContent = String(totali.giorniPresenza);
  kpiAssenze.textContent = calcoli.durataInTesto(totali.assenze);
  kpiStraordinari.textContent = calcoli.durataInTesto(totali.straordinario);

  bottoneEsportaAnno.textContent = `Esporta l'Excel del ${anno}`;
  const stato = dati.statoAnno(anno);
  statoInvio.classList.toggle("da-rifare", Boolean(stato?.modificatoDopo));
  statoInvio.textContent = !stato
    ? `Il timesheet del ${anno} non è ancora stato esportato.`
    : stato.modificatoDopo
      ? `Modificato dopo l'esportazione del ${momento.format(new Date(stato.esportato))}: esportalo di nuovo e rimanda il file.`
      : `Esportato il ${momento.format(new Date(stato.esportato))}.`;

  // Ore per progetto, dal più grande.
  const perProgetto = [...totali.perProgetto].sort((a, b) => b[1] - a[1]);
  const massimo = perProgetto[0]?.[1] ?? 0;
  progettiMese.replaceChildren(
    ...(perProgetto.length
      ? perProgetto.map(([nome, minuti]) => {
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
      : [crea("li", "senza-dati", "Nessuna ora ripartita sui progetti in questo mese.")])
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
      const { dalle, alle } = calcoli.estremi(giorno.intervalli);
      const orari = dalle ? [`${dalle}–${alle ?? "…"}`, giorno.localita].filter(Boolean).join(" · ") : "";
      corpo.append(crea("span", orari ? "orari-giorno" : "orari-giorno tenue", orari || calendario.nome || "—"));
      if (giorno.descrizione) corpo.append(crea("span", "riassunto-giorno", giorno.descrizione));

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
      } else if (totaliGiorno.lavorate && totaliGiorno.daRipartire !== 0 && configurazione.progetti.length) {
        dettagli.append(
          etichetta(
            totaliGiorno.daRipartire > 0
              ? `Da ripartire ${calcoli.durataInTesto(totaliGiorno.daRipartire)}`
              : "Progetti oltre le ore lavorate",
            "attenzione"
          )
        );
      }
      if (lavorativo && data < oggi && !giorno.intervalli.length && !giorno.assenze.length) {
        dettagli.append(etichetta("Da completare", "attenzione"));
      }
      if (dettagli.children.length) corpo.append(dettagli);

      const ore = crea("span", "ore-giorno", totaliGiorno.lavorate ? calcoli.durataInTesto(totaliGiorno.lavorate) : "");
      bottone.append(colonnaData, corpo, ore);
      bottone.setAttribute(
        "aria-label",
        `${giornoEsteso.format(dataLocale(data))}${orari ? `, ${orari}` : ""}` +
          (totaliGiorno.lavorate ? `, ${calcoli.durataInTesto(totaliGiorno.lavorate)} ore` : "")
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

bottoneEsportaAnno.addEventListener("click", async () => {
  const anno = meseVisualizzato.slice(0, 4);
  if (!dati.profiloCompleto()) {
    return mostraErrori(["Prima inserisci nome e cognome in Impostazioni: finiscono nel file."]);
  }
  const giorni = dati.giorniDellAnno(anno);
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
      "Esportare un anno vuoto?",
      `Nel ${anno} non c'è nessuna giornata registrata.`,
      "Esporta"
    );
    if (!confermato) return;
  }

  const profilo = dati.profilo();
  const byte = esportazione.fileDellAnno({ configurazione: dati.configurazione(), profilo, anno, giorni });
  scarica(byte, esportazione.nomeFileAnno(profilo, anno), TIPO_XLSX);
  await dati.segnaEsportato(anno);
  mostraErrori([]);
  disegna();
});

// --- impostazioni --------------------------------------------------------

function disegnaProfilo() {
  const profilo = dati.profilo();
  campoNome.value = profilo.nome;
  campoCognome.value = profilo.cognome;
  campoPosizione.value = profilo.posizione;
  campoMatricola.value = profilo.matricola;
  disegnaLocalitaProfilo();
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

function disegnaLocalitaProfilo() {
  const scelta = dati.profilo().localita;
  const elenco = dati.elencoLocalita();
  // Una località abituale tolta dall'elenco resta scelta finché non se ne indica un'altra.
  const voci = scelta && !elenco.includes(scelta) ? [...elenco, scelta] : elenco;
  riempiSelettore(
    sceltaLocalitaProfilo,
    voci.map((nome) => ({ valore: nome, testo: nome })),
    scelta || elenco[0]
  );
}

formProfilo.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const errori = await dati.salvaProfilo({
    nome: campoNome.value,
    cognome: campoCognome.value,
    posizione: campoPosizione.value,
    localita: sceltaLocalitaProfilo.value,
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

  const progetti = dati.elencoProgetti();
  elencoProgettiConfig.replaceChildren(
    ...(progetti.length
      ? progetti.map((progetto) => {
          const voce = crea("li");
          const nome = crea("span", "nome-categoria", progetto.nome);
          nome.classList.toggle("disattivata", !progetto.attivo);
          const azioni = crea("span", "azioni-elenco");
          azioni.append(
            creaBottone("Rinomina", "minimo", () =>
              avviaRinomina(voce, progetto.nome, (nuovo) => dati.rinominaProgetto(progetto.nome, nuovo))
            ),
            creaBottone(progetto.attivo ? "Disattiva" : "Riattiva", "minimo", async () =>
              applica(await dati.impostaAttivoProgetto(progetto.nome, !progetto.attivo))
            )
          );
          if (!progetto.usato) {
            azioni.append(
              creaBottone("Elimina", "minimo pericolo", async () => applica(await dati.eliminaProgetto(progetto.nome)))
            );
          }
          voce.append(nome, azioni);
          return voce;
        })
      : [crea("li", "senza-dati", "Nessun progetto: aggiungine uno o importa la configurazione.")])
  );

  elencoLocalitaConfig.replaceChildren(
    ...dati.elencoLocalita().map((nomeLocalita) => {
      const voce = crea("li");
      const azioni = crea("span", "azioni-elenco");
      azioni.append(
        creaBottone("Elimina", "minimo pericolo", async () => applica(await dati.eliminaLocalita(nomeLocalita)))
      );
      voce.append(crea("span", "nome-categoria", nomeLocalita), azioni);
      return voce;
    })
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

elemento("form-progetto").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const campoNuovo = elemento("nuovo-progetto");
  if (await applica(await dati.aggiungiProgetto(campoNuovo.value))) campoNuovo.value = "";
});

elemento("form-localita").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const campoNuova = elemento("nuova-localita");
  if (await applica(await dati.aggiungiLocalita(campoNuova.value))) {
    campoNuova.value = "";
    disegnaLocalitaProfilo();
  }
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

  if (dati.elencoProgetti().length) {
    const confermato = await chiediConferma(
      "Sostituire la configurazione?",
      `Ente, progetti, località e codici di assenza verranno presi da «${file.name}». I progetti già usati nelle tue giornate restano, disattivati se il file non li contiene.`,
      "Sostituisci"
    );
    if (!confermato) return;
  }
  if (await applica(await dati.importaConfigurazione(contenuto))) {
    disegnaLocalitaProfilo();
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
  const attivi = configurazione.progetti.filter((progetto) => progetto.attivo).length;
  sintesiConfigurazione.textContent =
    `${configurazione.azienda || "Ente non indicato"} · ${attivi} ${attivi === 1 ? "progetto attivo" : "progetti attivi"} · ` +
    `${configurazione.localita.length} località · ${configurazione.assenze.length} codici di assenza` +
    (configurazione.patrono ? ` · patrono il ${patronoLeggibile(configurazione.patrono)}` : "");

  const pieno = Boolean(fileUfficio?.file.length);
  for (const nodo of [campoMeseRiepilogo, titoloMeseRiepilogo, contenitoreRiepilogo, bottoneScaricaRiepilogo, bottoneSvuotaRiepilogo]) {
    nodo.hidden = !pieno;
  }
  if (!pieno) return;

  const mesi = esportazione.mesiConDati(fileUfficio.file);
  if (!mesi.includes(meseUfficio)) meseUfficio = mesi[0] ?? `${fileUfficio.anno}-01`;
  riempiSelettore(
    sceltaMeseRiepilogo,
    calcoli.mesiDellAnno(fileUfficio.anno).map((mese) => ({
      valore: mese,
      testo: maiuscola(meseLungo.format(dataLocale(`${mese}-01`))) + (mesi.includes(mese) ? "" : " (vuoto)"),
    })),
    meseUfficio
  );

  const { righe, tipiAssenza, progetti } = esportazione.riepilogoUfficio(fileUfficio.file, meseUfficio);
  titoloMeseRiepilogo.textContent = `${maiuscola(meseLungo.format(dataLocale(`${meseUfficio}-01`)))} · ${righe.length} ${
    righe.length === 1 ? "dipendente" : "dipendenti"
  }`;

  const intestazioni = [
    "Dipendente",
    "Giorni",
    "Ore lavorate",
    ...tipiAssenza.map((tipo) => tipo.codice),
    "Straord.",
    ...progetti,
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
  const somme = { giorni: 0, lavorate: 0, straordinario: 0, assenze: new Map(), progetti: new Map() };
  for (const riga of righe) {
    const tr = crea("tr");
    const nome = crea("td", "", `${riga.profilo.cognome} ${riga.profilo.nome}`.trim());
    const sotto = [riga.profilo.posizione, riga.profilo.matricola && `matr. ${riga.profilo.matricola}`].filter(Boolean);
    if (sotto.length) nome.append(crea("small", "", sotto.join(" · ")));
    tr.append(nome, crea("td", "", String(riga.totali.giorniPresenza)), crea("td", "", durata(riga.totali.lavorate)));
    for (const tipo of tipiAssenza) {
      const minuti = riga.totali.perAssenza.get(tipo.codice) ?? 0;
      somme.assenze.set(tipo.codice, (somme.assenze.get(tipo.codice) ?? 0) + minuti);
      tr.append(crea("td", "", durata(minuti)));
    }
    tr.append(crea("td", "", durata(riga.totali.straordinario)));
    for (const nomeProgetto of progetti) {
      const minuti = riga.totali.perProgetto.get(nomeProgetto) ?? 0;
      somme.progetti.set(nomeProgetto, (somme.progetti.get(nomeProgetto) ?? 0) + minuti);
      tr.append(crea("td", "", durata(minuti)));
    }
    somme.giorni += riga.totali.giorniPresenza;
    somme.lavorate += riga.totali.lavorate;
    somme.straordinario += riga.totali.straordinario;
    corpo.append(tr);
  }

  const piede = crea("tfoot");
  const rigaPiede = crea("tr");
  rigaPiede.append(
    crea("td", "", "Totale"),
    crea("td", "", String(somme.giorni)),
    crea("td", "", durata(somme.lavorate)),
    ...tipiAssenza.map((tipo) => crea("td", "", durata(somme.assenze.get(tipo.codice)))),
    crea("td", "", durata(somme.straordinario)),
    ...progetti.map((nomeProgetto) => crea("td", "", durata(somme.progetti.get(nomeProgetto))))
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
  const scelti = [...(evento.target.files ?? [])];
  evento.target.value = "";
  if (!scelti.length) return;

  const errori = [];
  const letti = [];
  for (const singolo of scelti) {
    try {
      letti.push(await esportazione.leggiFile(new Uint8Array(await singolo.arrayBuffer()), `«${singolo.name}»`));
    } catch (errore) {
      errori.push(errore.message);
    }
  }

  const [uniti, erroriUnione] = esportazione.unisciFile([...(fileUfficio?.file ?? []), ...letti]);
  if (erroriUnione.length) errori.push(...erroriUnione);
  else fileUfficio = uniti;

  erroriFile.replaceChildren(...errori.map((messaggio) => crea("li", "", messaggio)));
  erroriFile.hidden = errori.length === 0;
  disegna();
});

sceltaMeseRiepilogo.addEventListener("change", () => {
  meseUfficio = sceltaMeseRiepilogo.value;
  disegna();
});

bottoneSvuotaRiepilogo.addEventListener("click", () => {
  fileUfficio = null;
  meseUfficio = null;
  erroriFile.hidden = true;
  disegna();
});

bottoneScaricaRiepilogo.addEventListener("click", () => {
  if (!fileUfficio) return;
  scarica(
    esportazione.fileRiepilogo(esportazione.riepilogoUfficio(fileUfficio.file, meseUfficio), dati.configurazione()),
    esportazione.nomeFileRiepilogo(meseUfficio),
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
