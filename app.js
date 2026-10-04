import * as dati from "./dati.js";
import * as calcoli from "./calcoli.js";
import * as esportazione from "./esportazione.js";
import { nomeDelMese, nomeFoglioMese } from "./modello.js";

// La pagina è il foglio del mese, come il timesheet Excel dell'ufficio: si
// scrive nelle celle e ogni riga si salva da sola. Intorno, solo il mese, i
// comandi e, per l'amministrazione, il riepilogo dei file dei dipendenti.

// --- elementi ------------------------------------------------------------

const elemento = (id) => document.getElementById(id);

const elencoErrori = elemento("errori");
const elencoAvvisi = elemento("avvisi");
const titoloMese = elemento("titolo-mese");
const statoSalvataggio = elemento("stato-salvataggio");
const bottoneEsporta = elemento("esporta-anno");
const bottoneUfficio = elemento("apri-ufficio");

const vistaFoglio = elemento("vista-foglio");
const vistaUfficio = elemento("vista-ufficio");
const foglio = elemento("foglio");
const righeGiorni = elemento("righe-giorni");
const campiTesta = [...document.querySelectorAll(".campo-testa")];
const campoNome = elemento("profilo-nome");
const giorniLavorati = elemento("giorni-lavorati");
const etichettaMese = elemento("etichetta-mese");
const totaleMese = elemento("totale-mese");
const elencoSuggerimenti = elemento("suggerimenti");

const dialogoImpostazioni = elemento("dialogo-impostazioni");
const formAbituale = elemento("form-abituale");
const campoDalle = elemento("abituale-dalle");
const campoAlle = elemento("abituale-alle");
const campoLocalita = elemento("abituale-localita");
const campoPatrono = elemento("abituale-patrono");
const erroriImpostazioni = elemento("errori-impostazioni");
const notaBackup = elemento("nota-backup");
const interruttoreUfficio = elemento("modalita-ufficio");

const erroriFile = elemento("errori-file");
const campoMeseRiepilogo = elemento("campo-mese-riepilogo");
const sceltaMeseRiepilogo = elemento("mese-riepilogo");
const contenitoreRiepilogo = elemento("contenitore-riepilogo");
const tabellaRiepilogo = elemento("tabella-riepilogo");
const bottoneScaricaRiepilogo = elemento("scarica-riepilogo");
const bottoneSvuotaRiepilogo = elemento("svuota-riepilogo");

const dialogoConferma = elemento("dialogo-conferma");
const titoloConferma = elemento("titolo-conferma");
const dettaglioConferma = elemento("dettaglio-conferma");
const bottoneConferma = elemento("bottone-conferma");

const TIPO_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
// Le celle di una riga, nell'ordine delle colonne del foglio.
const COLONNE = ["dalle", "alle", "attivita", "localita", "progetto"];
const ETICHETTE = {
  dalle: "dalle",
  alle: "alle",
  attivita: "Attività",
  localita: "Località di svolgimento",
  progetto: "Progetto",
};
const ATTESA_SALVATAGGIO = 600;

const dataLunga = new Intl.DateTimeFormat("it-IT", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const numeroGiorni = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 });

// --- stato ---------------------------------------------------------------

let meseVisualizzato = calcoli.meseCorrente();
// Salvataggi in attesa mentre si scrive: riga (o campo dell'intestazione) → timer.
const inAttesa = new Map();
// Sezione Ufficio: i file letti (già uniti, uno per dipendente) e il mese scelto.
let fileUfficio = null;
let meseUfficio = null;

// --- mattoni -------------------------------------------------------------

function dataLocale(iso) {
  const [anno, mese, giorno] = iso.split("-").map(Number);
  return new Date(anno, mese - 1, giorno);
}

function crea(tag, classe, testo) {
  const nodo = document.createElement(tag);
  if (classe) nodo.className = classe;
  if (testo !== undefined) nodo.textContent = testo;
  return nodo;
}

function mostraErrori(messaggi, elenco = elencoErrori) {
  elenco.replaceChildren(...messaggi.map((messaggio) => crea("li", "", messaggio)));
  elenco.hidden = messaggi.length === 0;
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

let timerStato = null;
function segnalaSalvato() {
  statoSalvataggio.textContent = "Salvato";
  clearTimeout(timerStato);
  timerStato = setTimeout(() => (statoSalvataggio.textContent = ""), 2000);
}

/** Le celle di testo crescono con il contenuto, come le celle «a capo» di Excel. */
function adatta(cella) {
  // Con il foglio nascosto non c'è niente da misurare: ci si pensa quando torna visibile.
  if (cella.tagName !== "TEXTAREA" || vistaFoglio.hidden) return;
  cella.style.height = "auto";
  cella.style.height = `${cella.scrollHeight}px`;
}

// Il patrono si scrive all'italiana, «24/06»; nell'archivio sta come «06-24».
function patronoLeggibile(patrono) {
  return patrono ? patrono.split("-").reverse().join("/") : "";
}

function patronoDaTesto(testo) {
  const trovato = /^(\d{1,2})[/.-](\d{1,2})$/.exec(testo.trim());
  if (!trovato) return testo.trim();
  return `${trovato[2].padStart(2, "0")}-${trovato[1].padStart(2, "0")}`;
}

// --- il foglio -----------------------------------------------------------

function celle(riga) {
  return Object.fromEntries([...riga.querySelectorAll(".cella")].map((cella) => [cella.dataset.colonna, cella]));
}

function valoriRiga(riga) {
  return Object.fromEntries(Object.entries(celle(riga)).map(([colonna, cella]) => [colonna, cella.value]));
}

function creaCella(colonna, valore, etichettaGiorno) {
  const orario = colonna === "dalle" || colonna === "alle";
  const cella = crea(orario ? "input" : "textarea", `cella ${colonna}${orario ? " orario" : ""}`);
  cella.dataset.colonna = colonna;
  cella.value = valore;
  cella.setAttribute("aria-label", `${ETICHETTE[colonna]}, ${etichettaGiorno}`);
  cella.spellcheck = colonna === "attivita";
  if (orario) {
    cella.inputMode = "numeric";
    cella.autocomplete = "off";
  } else {
    cella.rows = 1;
  }
  const td = crea("td");
  td.append(cella);
  return td;
}

function testoOre(giorno) {
  if (!giorno.dalle || !giorno.alle) return { testo: "", sbagliate: false };
  const minuti = calcoli.minutiLavorati(giorno);
  if (!minuti) return { testo: "alle < dalle", sbagliate: true };
  return { testo: calcoli.durataInTesto(minuti), sbagliate: false };
}

function disegnaOre(riga, giorno) {
  const cella = riga.querySelector(".ore");
  const { testo, sbagliate } = testoOre(giorno);
  cella.textContent = testo;
  cella.classList.toggle("sbagliate", sbagliate);
  cella.title = sbagliate ? "L'orario di fine viene prima di quello di inizio." : "";
}

function disegnaTotali() {
  const { minuti } = calcoli.totaliMese(dati.giorniDelMese(meseVisualizzato));
  totaleMese.textContent = calcoli.durataInTesto(minuti);
  // Nel modello i giorni lavorati sono le ore del mese diviso otto.
  giorniLavorati.textContent = numeroGiorni.format(minuti / 60 / 8);
}

/** Nome e cognome si allargano con quello che c'è scritto, per restare centrati insieme. */
function allargaNome(campo) {
  if (campo.closest(".nome-cognome")) campo.size = Math.max(campo.value.length, campo.placeholder.length, 4) + 1;
}

function disegnaTesta() {
  const profilo = dati.profilo();
  for (const campo of campiTesta) {
    if (document.activeElement !== campo) campo.value = profilo[campo.dataset.campo] ?? "";
    allargaNome(campo);
  }
  const nomeMese = nomeDelMese(meseVisualizzato);
  titoloMese.textContent = nomeMese;
  document.title = `Timesheet · ${nomeMese}`;
  etichettaMese.textContent = `Mese: ${nomeFoglioMese(meseVisualizzato)}`;
  bottoneEsporta.textContent = `Esporta l'Excel del ${meseVisualizzato.slice(0, 4)}`;
}

function disegnaFoglio() {
  disegnaTesta();
  const oggi = calcoli.oggiIso();
  const { patrono } = dati.abituale();

  righeGiorni.replaceChildren(
    ...calcoli.dateDelMese(meseVisualizzato).map((data) => {
      const giorno = dati.giorno(data);
      const calendario = calcoli.tipoGiorno(data, patrono);
      const etichetta = dataLunga.format(dataLocale(data));
      const riga = crea("tr", calendario.tipo === "feriale" ? "feriale" : "festivo");
      riga.dataset.data = data;
      if (data === oggi) riga.classList.add("oggi");

      const intestazione = crea("th", "", etichetta);
      intestazione.scope = "row";
      if (calendario.nome) intestazione.title = calendario.nome;

      const [dalle, alle, attivita, localita, progetto] = COLONNE.map((colonna) =>
        creaCella(
          colonna,
          colonna === "dalle" || colonna === "alle" ? calcoli.orarioInTesto(giorno[colonna]) : giorno[colonna],
          etichetta
        )
      );
      // Un festivo lasciato vuoto porta nel file il nome della festa: lo si vede già qui.
      if (calendario.nome) attivita.firstChild.placeholder = calendario.nome;

      riga.append(intestazione, dalle, alle, crea("td", "ore"), attivita, localita, progetto);
      disegnaOre(riga, giorno);
      return riga;
    })
  );
  for (const cella of righeGiorni.querySelectorAll("textarea")) adatta(cella);
  disegnaTotali();
}

function rigaDi(data) {
  return righeGiorni.querySelector(`tr[data-data="${data}"]`);
}

// --- scrivere nelle celle ------------------------------------------------

function segnaOrariSbagliati(riga) {
  for (const colonna of ["dalle", "alle"]) {
    const cella = celle(riga)[colonna];
    const sbagliato = cella.value.trim() !== "" && calcoli.minutiDaOrario(cella.value) === null;
    if (sbagliato) {
      cella.setAttribute("aria-invalid", "true");
      cella.title = "Scrivi l'orario come 9:00 o 17:30.";
    } else {
      cella.removeAttribute("aria-invalid");
      cella.title = "";
    }
  }
}

/**
 * Salva una riga. Mentre si scrive (`definitivo` falso) un orario a metà non
 * è un errore: si aspetta che la cella venga lasciata. Quando la si lascia gli
 * orari si riscrivono in forma piena («9» → «9:00») e «ferie» diventa «FERIE».
 */
async function salvaRiga(riga, definitivo = true) {
  clearTimeout(inAttesa.get(riga));
  inAttesa.delete(riga);
  segnaOrariSbagliati(riga);
  const errori = await dati.salvaGiorno(riga.dataset.data, valoriRiga(riga));
  if (errori.length) {
    if (definitivo) mostraErrori(errori.map((e) => `${dataLunga.format(dataLocale(riga.dataset.data))}: ${e}`));
    return;
  }
  if (definitivo) {
    mostraErrori([]);
    const salvato = dati.giorno(riga.dataset.data);
    const presenti = celle(riga);
    for (const colonna of COLONNE) {
      const valore =
        colonna === "dalle" || colonna === "alle" ? calcoli.orarioInTesto(salvato[colonna]) : salvato[colonna];
      const cella = presenti[colonna];
      if (document.activeElement !== cella && cella.value !== valore) {
        cella.value = valore;
        adatta(cella);
      }
    }
  }
  disegnaOre(riga, dati.giorno(riga.dataset.data));
  disegnaTotali();
  segnalaSalvato();
}

function salvaPiuTardi(riga) {
  clearTimeout(inAttesa.get(riga));
  inAttesa.set(
    riga,
    setTimeout(() => salvaRiga(riga, false), ATTESA_SALVATAGGIO)
  );
}

async function salvaInAttesa() {
  for (const chiave of [...inAttesa.keys()]) {
    if (chiave instanceof HTMLTableRowElement) await salvaRiga(chiave, false);
    else await salvaCampoTesta(chiave);
  }
}

/**
 * In un giorno lavorativo, appena si scrive l'attività o il progetto in una
 * riga senza orari, orari e località si compilano con quelli abituali. Se poi
 * l'attività è un'assenza («FERIE»), o la riga torna vuota, si tolgono.
 */
function compilaAbituale(riga) {
  if (!riga.classList.contains("feriale")) return;
  const { dalle, alle, attivita, localita, progetto } = celle(riga);
  const scritto = attivita.value.trim() || progetto.value.trim();
  const abituale = dati.abituale();
  // Senza una località abituale nelle impostazioni vale quella scritta più spesso.
  const localitaAbituale = abituale.localita || dati.suggerimenti("localita", 1)[0] || "";

  if (riga.dataset.automatica === "si") {
    if (!scritto || calcoli.assenza(attivita.value)) {
      dalle.value = "";
      alle.value = "";
      if (localita.value === localitaAbituale) localita.value = "";
      adatta(localita);
      delete riga.dataset.automatica;
    }
    return;
  }
  if (!scritto || dalle.value.trim() || alle.value.trim() || calcoli.assenza(attivita.value)) return;
  // «F» potrebbe diventare «FERIE»: l'assenza si riconosce solo a parola finita.
  if (calcoli.ASSENZE.some((assenza) => assenza.startsWith(attivita.value.trim().toUpperCase())) && !progetto.value.trim()) {
    return;
  }
  dalle.value = calcoli.orarioInTesto(abituale.dalle);
  alle.value = calcoli.orarioInTesto(abituale.alle);
  if (!localita.value.trim() && localitaAbituale) {
    localita.value = localitaAbituale;
    adatta(localita);
  }
  riga.dataset.automatica = "si";
}

function sposta(cella, passo) {
  const riga = cella.closest("tr");
  const arrivo = passo > 0 ? riga.nextElementSibling : riga.previousElementSibling;
  const destinazione = arrivo?.querySelector(`.cella[data-colonna="${cella.dataset.colonna}"]`);
  if (!destinazione) return;
  destinazione.focus();
  if (destinazione.tagName === "INPUT") destinazione.select();
  else destinazione.setSelectionRange(destinazione.value.length, destinazione.value.length);
}

righeGiorni.addEventListener("focusin", (evento) => {
  const cella = evento.target.closest(".cella");
  if (cella) cella.dataset.iniziale = cella.value;
});

righeGiorni.addEventListener("input", (evento) => {
  const cella = evento.target.closest(".cella");
  if (!cella) return;
  const riga = cella.closest("tr");
  adatta(cella);
  if (["dalle", "alle", "localita"].includes(cella.dataset.colonna)) delete riga.dataset.automatica;
  if (cella.dataset.colonna === "attivita" || cella.dataset.colonna === "progetto") compilaAbituale(riga);
  mostraSuggerimenti(cella);
  salvaPiuTardi(riga);
});

righeGiorni.addEventListener("change", (evento) => {
  const cella = evento.target.closest(".cella");
  if (!cella) return;
  const riga = cella.closest("tr");
  if (cella.dataset.colonna === "attivita" || cella.dataset.colonna === "progetto") compilaAbituale(riga);
  salvaRiga(riga);
});

righeGiorni.addEventListener("focusout", (evento) => {
  if (evento.target.closest(".cella")) nascondiSuggerimenti();
});

righeGiorni.addEventListener("keydown", (evento) => {
  const cella = evento.target.closest(".cella");
  if (!cella || evento.isComposing) return;
  if (gestisciTastiSuggerimenti(evento, cella)) return;

  const testo = cella.tagName === "TEXTAREA";
  const modificatori = evento.ctrlKey || evento.metaKey;
  if (evento.key === "Enter" && evento.altKey && testo) {
    // Alt+Invio va a capo nella cella, come in Excel.
    evento.preventDefault();
    cella.setRangeText("\n", cella.selectionStart, cella.selectionEnd, "end");
    cella.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (evento.key === "Enter" && !evento.shiftKey && !modificatori) {
    evento.preventDefault();
    sposta(cella, 1);
  } else if (evento.key === "ArrowDown" && !modificatori && (!testo || cella.selectionEnd === cella.value.length)) {
    evento.preventDefault();
    sposta(cella, 1);
  } else if (evento.key === "ArrowUp" && !modificatori && (!testo || cella.selectionStart === 0)) {
    evento.preventDefault();
    sposta(cella, -1);
  } else if (evento.key === "Escape" && cella.dataset.iniziale !== undefined) {
    cella.value = cella.dataset.iniziale;
    adatta(cella);
    salvaRiga(cella.closest("tr"));
  }
});

// --- suggerimenti --------------------------------------------------------

// Quello che si è già scritto in una colonna torna come suggerimento, perché
// attività, località e progetti si ripetono da un giorno all'altro.
function fontiSuggerimenti(colonna) {
  const usati = dati.suggerimenti(colonna);
  if (colonna === "attivita") return [...calcoli.ASSENZE, ...usati.filter((v) => !calcoli.ASSENZE.includes(v))];
  if (colonna === "localita") {
    const abituale = dati.abituale().localita;
    return abituale && !usati.includes(abituale) ? [abituale, ...usati] : usati;
  }
  return usati;
}

let cellaSuggerita = null;

function mostraSuggerimenti(cella) {
  if (cella.tagName !== "TEXTAREA") return nascondiSuggerimenti();
  const cercato = cella.value.trim().toLowerCase();
  if (!cercato) return nascondiSuggerimenti();
  const trovati = fontiSuggerimenti(cella.dataset.colonna)
    .filter((voce) => voce.toLowerCase().includes(cercato) && voce.toLowerCase() !== cercato)
    .sort((a, b) => Number(!a.toLowerCase().startsWith(cercato)) - Number(!b.toLowerCase().startsWith(cercato)))
    .slice(0, 8);
  if (!trovati.length) return nascondiSuggerimenti();

  cellaSuggerita = cella;
  elencoSuggerimenti.replaceChildren(
    ...trovati.map((voce) => {
      const opzione = crea("li", "", voce);
      opzione.setAttribute("role", "option");
      opzione.setAttribute("aria-selected", "false");
      return opzione;
    })
  );
  const posto = cella.getBoundingClientRect();
  elencoSuggerimenti.style.left = `${posto.left + window.scrollX}px`;
  elencoSuggerimenti.style.top = `${posto.bottom + window.scrollY}px`;
  elencoSuggerimenti.style.minWidth = `${posto.width}px`;
  elencoSuggerimenti.style.maxWidth = `${Math.max(posto.width, 420)}px`;
  elencoSuggerimenti.hidden = false;
}

function nascondiSuggerimenti() {
  elencoSuggerimenti.hidden = true;
  cellaSuggerita = null;
}

function scegliSuggerimento(voce) {
  const cella = cellaSuggerita;
  if (!cella) return;
  cella.value = voce;
  adatta(cella);
  nascondiSuggerimenti();
  const riga = cella.closest("tr");
  compilaAbituale(riga);
  salvaRiga(riga);
}

/** Frecce, Invio ed Esc quando l'elenco dei suggerimenti è aperto; true se il tasto è suo. */
function gestisciTastiSuggerimenti(evento, cella) {
  if (elencoSuggerimenti.hidden || cellaSuggerita !== cella) return false;
  const opzioni = [...elencoSuggerimenti.children];
  const attuale = opzioni.findIndex((o) => o.getAttribute("aria-selected") === "true");
  const seleziona = (indice) => {
    opzioni.forEach((o, i) => o.setAttribute("aria-selected", String(i === indice)));
    opzioni[indice]?.scrollIntoView({ block: "nearest" });
  };
  if (evento.key === "ArrowDown") {
    evento.preventDefault();
    seleziona(Math.min(attuale + 1, opzioni.length - 1));
    return true;
  }
  if (evento.key === "ArrowUp") {
    evento.preventDefault();
    if (attuale <= 0) seleziona(-1);
    else seleziona(attuale - 1);
    return true;
  }
  if ((evento.key === "Enter" || evento.key === "Tab") && attuale >= 0) {
    if (evento.key === "Enter") evento.preventDefault();
    scegliSuggerimento(opzioni[attuale].textContent);
    return evento.key === "Enter";
  }
  if (evento.key === "Escape") {
    evento.preventDefault();
    nascondiSuggerimenti();
    return true;
  }
  return false;
}

// Il clic sceglie senza togliere il fuoco alla cella.
elencoSuggerimenti.addEventListener("mousedown", (evento) => {
  const opzione = evento.target.closest("li");
  if (!opzione) return;
  evento.preventDefault();
  scegliSuggerimento(opzione.textContent);
});

window.addEventListener("resize", () => {
  nascondiSuggerimenti();
  for (const cella of righeGiorni.querySelectorAll("textarea")) adatta(cella);
});

// --- intestazione --------------------------------------------------------

async function salvaCampoTesta(campo) {
  clearTimeout(inAttesa.get(campo));
  inAttesa.delete(campo);
  await dati.salvaProfilo(campo.dataset.campo, campo.value);
  segnalaSalvato();
}

for (const campo of campiTesta) {
  campo.addEventListener("input", () => {
    allargaNome(campo);
    clearTimeout(inAttesa.get(campo));
    inAttesa.set(campo, setTimeout(() => salvaCampoTesta(campo), ATTESA_SALVATAGGIO));
  });
  campo.addEventListener("change", async () => {
    await salvaCampoTesta(campo);
    campo.value = dati.profilo()[campo.dataset.campo];
    disegnaAvvisi();
  });
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") campo.blur();
  });
}

// --- mese ----------------------------------------------------------------

async function vaiAlMese(mese) {
  await salvaInAttesa();
  nascondiSuggerimenti();
  meseVisualizzato = mese;
  disegnaFoglio();
}

function mostraOggi() {
  rigaDi(calcoli.oggiIso())?.scrollIntoView({ block: "center" });
}

elemento("mese-precedente").addEventListener("click", () =>
  vaiAlMese(calcoli.meseSpostato(meseVisualizzato, -1))
);
elemento("mese-successivo").addEventListener("click", () =>
  vaiAlMese(calcoli.meseSpostato(meseVisualizzato, 1))
);
elemento("vai-a-oggi").addEventListener("click", async () => {
  await vaiAlMese(calcoli.meseCorrente());
  mostraVista("foglio");
  mostraOggi();
});

// --- esportazione --------------------------------------------------------

bottoneEsporta.addEventListener("click", async () => {
  await salvaInAttesa();
  if (!dati.profiloCompleto()) {
    mostraErrori(["Scrivi nome e cognome nell'intestazione del foglio: finiscono nel file e nel suo nome."]);
    mostraVista("foglio");
    campoNome.focus();
    return;
  }
  const anno = meseVisualizzato.slice(0, 4);
  const profilo = dati.profilo();
  scarica(
    esportazione.fileDellAnno({
      profilo,
      anno,
      giorni: dati.tuttiIGiorni(),
      patrono: dati.abituale().patrono,
    }),
    esportazione.nomeFileAnno(profilo, anno),
    TIPO_XLSX
  );
});

// --- avvisi --------------------------------------------------------------

function disegnaAvvisi() {
  const avvisi = [];
  const giorni = dati.giorniDalBackup();
  if (dati.tuttiIGiorni().length >= 10 && (giorni === null || giorni > 30)) {
    const voce = crea(
      "li",
      "",
      giorni === null
        ? "I dati stanno solo in questo browser e non hai ancora fatto un backup."
        : `L'ultimo backup è di ${giorni} giorni fa.`
    );
    const bottone = crea("button", "", "Scarica il backup");
    bottone.type = "button";
    bottone.addEventListener("click", scaricaBackup);
    voce.append(bottone);
    avvisi.push(voce);
  }
  elencoAvvisi.replaceChildren(...avvisi);
  elencoAvvisi.hidden = avvisi.length === 0;
}

// --- impostazioni --------------------------------------------------------

function disegnaBackup() {
  const giorni = dati.giorniDalBackup();
  notaBackup.textContent =
    giorni === null
      ? "Nessun backup finora."
      : `Ultimo backup: ${giorni === 0 ? "oggi" : giorni === 1 ? "ieri" : `${giorni} giorni fa`}.`;
}

elemento("apri-impostazioni").addEventListener("click", () => {
  const abituale = dati.abituale();
  campoDalle.value = calcoli.orarioInTesto(abituale.dalle);
  campoAlle.value = calcoli.orarioInTesto(abituale.alle);
  campoLocalita.value = abituale.localita;
  campoPatrono.value = patronoLeggibile(abituale.patrono);
  interruttoreUfficio.checked = dati.preferenza("ufficio") === true;
  mostraErrori([], erroriImpostazioni);
  disegnaBackup();
  dialogoImpostazioni.showModal();
});

elemento("chiudi-impostazioni").addEventListener("click", () => dialogoImpostazioni.close());

formAbituale.addEventListener("submit", async (evento) => {
  evento.preventDefault();
  const errori = await dati.salvaAbituale({
    dalle: campoDalle.value,
    alle: campoAlle.value,
    localita: campoLocalita.value,
    patrono: patronoDaTesto(campoPatrono.value),
  });
  mostraErrori(errori, erroriImpostazioni);
  if (errori.length) return;
  dialogoImpostazioni.close();
  await salvaInAttesa();
  disegnaFoglio();
});

async function scaricaBackup() {
  await salvaInAttesa();
  scarica(JSON.stringify(dati.esportaBackup(), null, 2), dati.nomeFileBackup(), "application/json");
  await dati.segnaBackup();
  disegnaBackup();
  disegnaAvvisi();
}

elemento("scarica-backup").addEventListener("click", scaricaBackup);

elemento("carica-backup").addEventListener("change", async (evento) => {
  const file = evento.target.files?.[0];
  evento.target.value = "";
  if (!file) return;
  const confermato = await chiediConferma(
    "Ripristinare dal backup?",
    `«${file.name}» sostituirà l'intestazione, le impostazioni e tutte le righe scritte finora.`,
    "Ripristina"
  );
  if (!confermato) return;
  const contenuto = await leggiJson(file);
  const errori = contenuto
    ? await dati.importaBackup(contenuto)
    : ["Il file non è leggibile: non contiene dati in formato JSON."];
  mostraErrori(errori, erroriImpostazioni);
  if (errori.length) return;
  dialogoImpostazioni.close();
  inAttesa.clear();
  disegnaFoglio();
  disegnaAvvisi();
});

interruttoreUfficio.addEventListener("change", async () => {
  await dati.impostaPreferenza("ufficio", interruttoreUfficio.checked);
  bottoneUfficio.hidden = !interruttoreUfficio.checked;
  if (!interruttoreUfficio.checked) mostraVista("foglio");
});

// --- ufficio -------------------------------------------------------------

function mostraVista(nome) {
  vistaFoglio.hidden = nome !== "foglio";
  vistaUfficio.hidden = nome !== "ufficio";
  if (nome === "ufficio") disegnaUfficio();
  else for (const cella of righeGiorni.querySelectorAll("textarea")) adatta(cella);
}

bottoneUfficio.addEventListener("click", async () => {
  await salvaInAttesa();
  mostraVista(vistaUfficio.hidden ? "ufficio" : "foglio");
});
elemento("torna-al-foglio").addEventListener("click", () => mostraVista("foglio"));

function disegnaUfficio() {
  const pieno = Boolean(fileUfficio?.file.length);
  for (const nodo of [campoMeseRiepilogo, contenitoreRiepilogo, bottoneScaricaRiepilogo, bottoneSvuotaRiepilogo]) {
    nodo.hidden = !pieno;
  }
  if (!pieno) return;

  const mesi = esportazione.mesiConDati(fileUfficio.file);
  if (!mesi.includes(meseUfficio)) meseUfficio = mesi[0] ?? `${fileUfficio.anno}-01`;
  sceltaMeseRiepilogo.replaceChildren(
    ...calcoli.mesiDellAnno(fileUfficio.anno).map((mese) => {
      const opzione = new Option(nomeDelMese(mese) + (mesi.includes(mese) ? "" : " (vuoto)"), mese);
      opzione.selected = mese === meseUfficio;
      return opzione;
    })
  );

  const { righe } = esportazione.riepilogoUfficio(fileUfficio.file, meseUfficio);
  const testa = crea("thead");
  const rigaTesta = crea("tr");
  for (const testo of ["Dipendente", "Giorni con ore", "Ore lavorate", "Giorni lavorati (ore ÷ 8)"]) {
    const cella = crea("th", "", testo);
    cella.scope = "col";
    rigaTesta.append(cella);
  }
  testa.append(rigaTesta);

  const corpo = crea("tbody");
  let giorniTotali = 0;
  let minutiTotali = 0;
  for (const riga of righe) {
    const tr = crea("tr");
    const nome = crea("td", "", `${riga.profilo.cognome} ${riga.profilo.nome}`.trim());
    if (riga.profilo.posizione) nome.append(crea("small", "", riga.profilo.posizione));
    tr.append(
      nome,
      crea("td", "", String(riga.totali.giorniConOre)),
      crea("td", "", calcoli.durataInTesto(riga.totali.minuti)),
      crea("td", "", numeroGiorni.format(riga.totali.minuti / 60 / 8))
    );
    giorniTotali += riga.totali.giorniConOre;
    minutiTotali += riga.totali.minuti;
    corpo.append(tr);
  }

  const piede = crea("tfoot");
  const rigaPiede = crea("tr");
  rigaPiede.append(
    crea("td", "", `Totale · ${righe.length} ${righe.length === 1 ? "dipendente" : "dipendenti"}`),
    crea("td", "", String(giorniTotali)),
    crea("td", "", calcoli.durataInTesto(minutiTotali)),
    crea("td", "", numeroGiorni.format(minutiTotali / 60 / 8))
  );
  piede.append(rigaPiede);
  tabellaRiepilogo.replaceChildren(testa, corpo, piede);
}

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

  mostraErrori(errori, erroriFile);
  disegnaUfficio();
});

sceltaMeseRiepilogo.addEventListener("change", () => {
  meseUfficio = sceltaMeseRiepilogo.value;
  disegnaUfficio();
});

bottoneSvuotaRiepilogo.addEventListener("click", () => {
  fileUfficio = null;
  meseUfficio = null;
  mostraErrori([], erroriFile);
  disegnaUfficio();
});

bottoneScaricaRiepilogo.addEventListener("click", () => {
  if (!fileUfficio) return;
  scarica(
    esportazione.fileRiepilogo(esportazione.riepilogoUfficio(fileUfficio.file, meseUfficio)),
    esportazione.nomeFileRiepilogo(meseUfficio),
    TIPO_XLSX
  );
});

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

// Quello che si sta scrivendo si salva anche se la finestra si chiude o si nasconde.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") salvaInAttesa();
});
window.addEventListener("beforeunload", (evento) => {
  if (inAttesa.size) {
    salvaInAttesa();
    evento.preventDefault();
  }
});

nascondiSeGiaInstallata();

// --- avvio ---------------------------------------------------------------

try {
  await dati.inizializza();
} catch (errore) {
  mostraErrori([
    `Impossibile aprire l'archivio del browser (${errore.message}). In una finestra anonima o con i dati del sito bloccati la app non può salvare.`,
  ]);
  throw errore;
}
bottoneUfficio.hidden = dati.preferenza("ufficio") !== true;
disegnaFoglio();
disegnaAvvisi();
mostraOggi();
