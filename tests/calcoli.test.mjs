import { test } from "node:test";
import assert from "node:assert/strict";
import * as calcoli from "../calcoli.js";

test("gli orari si leggono nelle forme in cui si scrivono", () => {
  assert.equal(calcoli.minutiDaOrario("8:30"), 510);
  assert.equal(calcoli.minutiDaOrario("08.30"), 510);
  assert.equal(calcoli.minutiDaOrario("0830"), 510);
  assert.equal(calcoli.minutiDaOrario("17"), 1020);
  assert.equal(calcoli.minutiDaOrario("24:00"), null);
  assert.equal(calcoli.minutiDaOrario("8:60"), null);
  assert.equal(calcoli.minutiDaOrario(""), null);
  assert.equal(calcoli.orarioDaMinuti(510), "08:30");
});

test("le durate si scrivono in ore e minuti, gli orari senza lo zero davanti", () => {
  assert.equal(calcoli.durataInTesto(450), "7:30");
  assert.equal(calcoli.durataInTesto(0), "0:00");
  assert.equal(calcoli.durataInTesto(-30), "−0:30");
  assert.equal(calcoli.orarioInTesto("09:00"), "9:00");
  assert.equal(calcoli.orarioInTesto("17:30"), "17:30");
  assert.equal(calcoli.orarioInTesto(""), "");
});

test("ore lavorate di una riga: alle meno dalle, come la formula del foglio", () => {
  const riga = (dalle, alle) => ({ ...calcoli.giornoVuoto("2026-10-01"), dalle, alle });
  assert.equal(calcoli.minutiLavorati(riga("09:00", "17:00")), 480);
  assert.equal(calcoli.minutiLavorati(riga("09:00", "")), 0);
  assert.equal(calcoli.minutiLavorati(riga("17:00", "09:00")), 0);
  assert.equal(calcoli.minutiLavorati(undefined), 0);

  const totali = calcoli.totaliMese([riga("09:00", "17:00"), riga("09:00", "13:30"), riga("", "")]);
  assert.deepEqual(totali, { minuti: 480 + 270, giorniConOre: 2 });
});

test("una riga con la sola località è vuota", () => {
  assert.equal(calcoli.giornoSenzaDati({ ...calcoli.giornoVuoto("2026-10-01"), localita: "Sede" }), true);
  assert.equal(calcoli.giornoSenzaDati({ ...calcoli.giornoVuoto("2026-10-01"), attivita: "x" }), false);
  assert.equal(calcoli.giornoSenzaDati({ ...calcoli.giornoVuoto("2026-10-01"), dalle: "09:00" }), false);
});

test("le assenze si riconoscono e si scrivono in maiuscolo", () => {
  assert.equal(calcoli.assenza(" ferie "), "FERIE");
  assert.equal(calcoli.assenza("Malattia"), "MALATTIA");
  assert.equal(calcoli.assenza("ferie e riunione"), null);
});

test("calendario: Pasqua, festività e giorni della settimana", () => {
  assert.equal(calcoli.pasqua(2026), "2026-04-05");
  assert.equal(calcoli.pasqua(2027), "2027-03-28");
  assert.equal(calcoli.pasqua(2025), "2025-04-20");

  const feste2026 = calcoli.festivita(2026);
  assert.equal(feste2026.get("2026-04-06"), "Lunedì dell'Angelo");
  assert.equal(feste2026.get("2026-10-04"), "San Francesco d'Assisi");
  assert.equal(calcoli.festivita(2025).has("2025-10-04"), false);
  assert.equal(calcoli.festivita(2026, "06-24").get("2026-06-24"), "Santo patrono");
  assert.equal(calcoli.festivita(2026, "02-30").has("2026-02-30"), false);

  assert.equal(calcoli.giornoSettimana("2026-10-05"), 0);
  assert.equal(calcoli.giornoSettimana("2026-10-04"), 6);
  assert.deepEqual(calcoli.tipoGiorno("2026-10-03"), { tipo: "sabato", nome: "" });
  assert.deepEqual(calcoli.tipoGiorno("2026-12-08"), {
    tipo: "festivo",
    nome: "Immacolata Concezione",
  });
  assert.equal(calcoli.tipoGiorno("2026-10-01").tipo, "feriale");
});

test("date e mesi", () => {
  assert.equal(calcoli.giorniNelMese("2028-02"), 29);
  assert.equal(calcoli.dateDelMese("2026-02").length, 28);
  assert.equal(calcoli.meseSpostato("2026-12", 1), "2027-01");
  assert.equal(calcoli.meseSpostato("2026-01", -1), "2025-12");
  assert.equal(calcoli.dataValida("2026-02-30"), null);
  assert.equal(calcoli.dataValida("2026-02-28"), "2026-02-28");
  assert.equal(calcoli.meseValido("2026-13"), null);
  assert.deepEqual(calcoli.mesiDellAnno("2026").slice(0, 2), ["2026-01", "2026-02"]);
  assert.equal(calcoli.mesiDellAnno("2026").length, 12);
});
