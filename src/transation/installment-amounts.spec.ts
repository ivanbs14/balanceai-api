import { BadRequestException } from "@nestjs/common";
import { allocateInstallmentAmounts } from "./installment-amounts";

describe("allocateInstallmentAmounts", () => {
  it.each([
    ["100.00", 3, ["33.34", "33.33", "33.33"]],
    ["0.05", 3, ["0.02", "0.02", "0.01"]],
    ["90.00", 3, ["30.00", "30.00", "30.00"]],
    ["-0.05", 3, ["-0.02", "-0.02", "-0.01"]],
  ])("allocates %s over %i installments", (total, count, expected) => {
    const amounts = allocateInstallmentAmounts(total, count);
    expect(amounts.map((amount) => amount.toFixed(2))).toEqual(expected);
    expect(
      amounts
        .reduce((sum, amount) => sum.plus(amount), amounts[0].mul(0))
        .toFixed(2),
    ).toBe(total);
  });

  it.each(["0.001", "100000000.00", "not-money"])(
    "rejects unrepresentable amount %s",
    (total) => {
      expect(() => allocateInstallmentAmounts(total, 3)).toThrow(
        BadRequestException,
      );
    },
  );

  it.each([0, -1, 1.5, Number.NaN])("rejects invalid count %s", (count) => {
    expect(() => allocateInstallmentAmounts("100.00", count)).toThrow(
      BadRequestException,
    );
  });
});
