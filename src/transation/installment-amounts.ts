import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

const MAX_CENTS = new Prisma.Decimal("9999999999");

export function allocateInstallmentAmounts(
  total: Prisma.Decimal.Value | Prisma.DecimalJsLike,
  count: number,
): Prisma.Decimal[] {
  if (!Number.isSafeInteger(count) || count < 1) {
    throw new BadRequestException(
      "A quantidade de parcelas deve ser um inteiro positivo.",
    );
  }

  let totalCents: Prisma.Decimal;
  try {
    const decimalInput =
      typeof total === "object" && !(total instanceof Prisma.Decimal)
        ? total.toFixed()
        : total;
    totalCents = new Prisma.Decimal(decimalInput).mul(100);
  } catch {
    throw new BadRequestException("O valor total informado é inválido.");
  }

  if (
    !totalCents.isFinite() ||
    !totalCents.isInteger() ||
    totalCents.abs().greaterThan(MAX_CENTS)
  ) {
    throw new BadRequestException(
      "O valor total deve caber em centavos com duas casas decimais.",
    );
  }

  const sign = totalCents.isNegative() ? -1 : 1;
  const absoluteCents = totalCents.abs();
  const baseCents = absoluteCents.dividedToIntegerBy(count).toNumber();
  const remainder = absoluteCents.mod(count).toNumber();

  return Array.from({ length: count }, (_, index) =>
    new Prisma.Decimal(sign * (baseCents + (index < remainder ? 1 : 0))).div(
      100,
    ),
  );
}
