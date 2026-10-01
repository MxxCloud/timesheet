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

test("le durate accettano ore e minuti oppure ore decimali", () => {
  assert.equal(calcoli.minutiDaDurata("7:30"), 450);
  assert.equal(calcoli.minutiDaDurata("7,5"), 450);
  assert.equal(calcoli.minutiDaDurata("7.5"), 450);
  assert.equal(calcoli.minutiDaDurata("7"), 420);
  assert.equal(calcoli.minutiDaDurata("0:15"), 15);
  assert.equal(calcoli.minutiDaDurata("25"), null);
  assert.equal(calcoli.minutiDaDurata("1:75"), null);
  assert.equal(calcoli.minutiDaDurata("tre"), null);
  assert.equal(calcoli.durataInTesto(450), "7:30");
  assert.equal(calcoli.durataInTesto(0), "0:00");
  assert.equal(calcoli.durataInTesto(-30), "−0:30");
});

test("gli intervalli vengono ordinati e le sovrapposizioni rifiutate", () => {
  const [ordinati, errori] = calcoli.validaIntervalli([
    { entrata: "13:30", uscita: "17:30" },
    { entrata: "8:30", uscita: "12:30" },
  ]);
  assert.deepEqual(errori, []);
  assert.deepEqual(ordinati, [
    { entrata: "08:30", uscita: "12:30" },
    { entrata: "13:30", uscita: "17:30" },
  ]);

  const [, sovrapposti] = calcoli.validaIntervalli([
    { entrata: "8:30", uscita: "12:30" },
    { entrata: "12:00", uscita: "17:00" },
  ]);
  assert.equal(sovrapposti.length, 1);
  assert.match(sovrapposti[0], /sovrappongono/);

  const [, rovesciato] = calcoli.validaIntervalli([{ entrata: "12:00", uscita: "8:00" }]);
  assert.match(rovesciato[0], /dopo l'entrata/);
});

test("solo l'ultimo intervallo può restare aperto, e solo se ammesso", () => {
  const aperto = [
    { entrata: "8:30", uscita: "12:30" },
    { entrata: "13:30", uscita: null },
  ];
  assert.deepEqual(calcoli.validaIntervalli(aperto, { apertoAmmesso: true })[1], []);
  assert.equal(calcoli.validaIntervalli(aperto)[1].length, 1);

  const apertoInMezzo = [
    { entrata: "8:30", uscita: null },
    { entrata: "13:30", uscita: "17:00" },
  ];
  assert.equal(calcoli.validaIntervalli(apertoInMezzo, { apertoAmmesso: true })[1].length, 1);
});

test("presenza, pause e intervallo aperto", () => {
  const intervalli = [
    { entrata: "08:30", uscita: "12:30" },
    { entrata: "13:30", uscita: null },
  ];
  assert.equal(calcoli.minutiPresenza(intervalli), 240);
  assert.equal(calcoli.minutiPresenza(intervalli, calcoli.minutiDaOrario("15:00")), 330);
  assert.deepEqual(calcoli.intervalloAperto(intervalli), { entrata: "13:30", uscita: null });

  const chiusi = [
    { entrata: "08:30", uscita: "12:30" },
    { entrata: "13:30", uscita: "17:30" },
  ];
  assert.deepEqual(calcoli.pause(chiusi), [{ inizio: "12:30", fine: "13:30", minuti: 60 }]);
});

test("i totali del giorno e del mese", () => {
  const giorni = [
    {
      data: "2026-10-01",
      intervalli: [
        { entrata: "08:30", uscita: "12:30" },
        { entrata: "13:30", uscita: "17:30" },
      ],
      attivita: [
        { attivita: "Progetto A", minuti: 300, descrizione: "" },
        { attivita: "Amministrazione", minuti: 120, descrizione: "" },
      ],
      assenze: [],
      straordinario: { minuti: 60, nota: "chiusura" },
      note: "",
    },
    {
      data: "2026-10-02",
      intervalli: [],
      attivita: [],
      assenze: [{ tipo: "FE", minuti: 480 }],
      straordinario: null,
      note: "",
    },
    {
      data: "2026-10-05",
      intervalli: [{ entrata: "09:00", uscita: "13:00" }],
      attivita: [{ attivita: "Progetto A", minuti: 240, descrizione: "" }],
      assenze: [{ tipo: "PE", minuti: 240 }],
      straordinario: null,
      note: "",
    },
  ];

  assert.deepEqual(calcoli.totaliGiorno(giorni[0]), {
    presenza: 480,
    attivita: 420,
    assenze: 0,
    straordinario: 60,
    daRipartire: 60,
  });

  const mese = calcoli.totaliMese(giorni);
  assert.equal(mese.presenza, 720);
  assert.equal(mese.attivita, 660);
  assert.equal(mese.assenze, 720);
  assert.equal(mese.straordinario, 60);
  assert.equal(mese.giorniPresenza, 2);
  assert.equal(mese.giorniAssenza, 2);
  assert.equal(mese.perAttivita.get("Progetto A"), 540);
  assert.equal(mese.perAssenza.get("FE"), 480);
  assert.equal(mese.perAssenza.get("PE"), 240);
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
});
