import { describe, expect, it } from "vitest";
import { memoryMeter } from "./usage.js";

describe("memoryMeter", () => {
  it("sums calls by step and model, and starts afresh after each take", () => {
    const meter = memoryMeter();
    meter.record({ step: "classify", model: "luna", input: 100, output: 10 });
    meter.record({ step: "write", model: "luna", input: 50, output: 20 });
    meter.record({ step: "write", model: "luna", input: 30, output: 5 });
    expect(meter.take()).toEqual([
      { step: "classify", model: "luna", calls: 1, input: 100, output: 10 },
      { step: "write", model: "luna", calls: 2, input: 80, output: 25 },
    ]);
    expect(meter.take()).toEqual([]);
  });
});
