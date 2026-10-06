import {
  parseCivilDate,
  parseCompetence,
  utcMonthBounds,
  addCivilMonths,
} from "./civil-date";

describe("datas civis e competências", () => {
  it("mantém fronteiras UTC, fevereiro e virada do ano", () => {
    expect(parseCivilDate("2027-01-01").toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect(utcMonthBounds("2026-12").end.toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect(addCivilMonths(parseCivilDate("2028-01-31"), 1).toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
    expect(addCivilMonths(parseCivilDate("2027-01-31"), 1).toISOString()).toBe(
      "2027-02-28T00:00:00.000Z",
    );
  });

  it("rejeita datas e competências inexistentes", () => {
    for (const value of [
      "2026-02-29",
      "2026-13-01",
      "2026-00-01",
      "2026-04-31",
      "2026-01-01T00:00:00Z",
    ]) {
      expect(() => parseCivilDate(value)).toThrow();
    }
    for (const value of ["2026-00", "2026-13", "2026-1"]) {
      expect(() => parseCompetence(value)).toThrow();
    }
  });
});
