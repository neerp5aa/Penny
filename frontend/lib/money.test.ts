import { describe, expect, it } from "vitest";

import { addCents, centsToInput, formatCad, parseCadToCents, percentageBasisPoints, subtractCents } from "./money";

describe("integer-cent money helpers", () => {
  it("adds and subtracts cents exactly", () => {
    expect(addCents(["126400", "50000"])).toBe("176400");
    expect(subtractCents("176400", "126516")).toBe("49884");
  });

  it("formats CAD without floating-point money arithmetic", () => {
    expect(formatCad("49884", true)).toBe("+$498.84");
    expect(formatCad("-2500")).toBe("−$25.00");
  });

  it("calculates a bounded percentage using integer basis points", () => {
    expect(percentageBasisPoints("125000", "250000")).toBe(50);
    expect(percentageBasisPoints("300000", "250000")).toBe(100);
    expect(percentageBasisPoints("10", "0")).toBe(0);
  });

  it("parses editable CAD without floating-point arithmetic", () => {
    expect(parseCadToCents("$1,234.5")).toBe(123450);
    expect(centsToInput("123450")).toBe("1234.50");
    expect(() => parseCadToCents("12.345")).toThrow();
  });
});
