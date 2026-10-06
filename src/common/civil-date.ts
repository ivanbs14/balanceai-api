import { BadRequestException } from "@nestjs/common";

export function civilUtc(year: number, monthIndex: number, day: number): Date {
  const result = new Date(0);
  result.setUTCFullYear(year, monthIndex, day);
  result.setUTCHours(0, 0, 0, 0);
  return result;
}

export function parseCivilDate(value: string): Date {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(value)) {
    throw new BadRequestException("Data inválida. Use YYYY-MM-DD.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const parsed = civilUtc(year, month - 1, day);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new BadRequestException("Data civil inexistente.");
  }
  return parsed;
}

export function parseCompetence(value: string): {
  year: number;
  month: number;
} {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) {
    throw new BadRequestException("Competência inválida. Use YYYY-MM.");
  }
  return { year: Number(value.slice(0, 4)), month: Number(value.slice(5, 7)) };
}

export function utcMonthBounds(value: string) {
  const { year, month } = parseCompetence(value);
  return {
    start: civilUtc(year, month - 1, 1),
    end: civilUtc(year, month, 1),
  };
}

export function addCivilMonths(value: Date, count: number): Date {
  const year = value.getUTCFullYear();
  const month = value.getUTCMonth() + count;
  const lastDay = civilUtc(year, month + 1, 0).getUTCDate();
  return civilUtc(year, month, Math.min(value.getUTCDate(), lastDay));
}
