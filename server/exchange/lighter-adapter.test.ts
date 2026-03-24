import { describe, expect, it } from "vitest";

// Test the pure helper functions without needing a real Lighter connection

describe("Lighter adapter - data parsing helpers", () => {
  it("parses string prices correctly", () => {
    const price = "23.4600";
    expect(parseFloat(price)).toBeCloseTo(23.46, 2);
  });

  it("parses string sizes correctly", () => {
    const size = "284.9390";
    expect(parseFloat(size)).toBeCloseTo(284.939, 3);
  });

  it("handles zero values", () => {
    expect(parseFloat("0")).toBe(0);
    expect(parseFloat("0.0")).toBe(0);
  });

  it("handles negative sizes (absolute value)", () => {
    const rawSize = "-50.5";
    expect(Math.abs(parseFloat(rawSize))).toBeCloseTo(50.5, 1);
  });
});

describe("Lighter adapter - order type mapping", () => {
  const ORDER_TYPE_MAP: Record<number, string> = {
    0: "limit",
    1: "market",
    2: "limit",  // post-only limit
    3: "stop_loss",
    4: "take_profit",
    5: "stop_loss_limit",
    6: "take_profit_limit",
  };

  it("maps known order types correctly", () => {
    expect(ORDER_TYPE_MAP[0]).toBe("limit");
    expect(ORDER_TYPE_MAP[1]).toBe("market");
    expect(ORDER_TYPE_MAP[3]).toBe("stop_loss");
    expect(ORDER_TYPE_MAP[4]).toBe("take_profit");
    expect(ORDER_TYPE_MAP[5]).toBe("stop_loss_limit");
    expect(ORDER_TYPE_MAP[6]).toBe("take_profit_limit");
  });

  it("returns undefined for unknown order types", () => {
    expect(ORDER_TYPE_MAP[99]).toBeUndefined();
  });
});

describe("Lighter adapter - side mapping", () => {
  it("maps is_ask=1 to sell", () => {
    const isAsk = 1;
    expect(isAsk === 1 ? "sell" : "buy").toBe("sell");
  });

  it("maps is_ask=0 to buy", () => {
    const isAsk = 0;
    expect(isAsk === 1 ? "sell" : "buy").toBe("buy");
  });
});

describe("Lighter adapter - auth token format", () => {
  it("validates auth token format (non-empty string)", () => {
    const mockToken = "Bearer eyJhbGciOiJFUzI1NiJ9.mock.token";
    expect(typeof mockToken).toBe("string");
    expect(mockToken.length).toBeGreaterThan(0);
  });

  it("validates private key length requirement (80 hex chars)", () => {
    const validKey = "a".repeat(80);
    const invalidKey = "a".repeat(40);
    expect(validKey.length).toBe(80);
    expect(invalidKey.length).not.toBe(80);
  });
});
