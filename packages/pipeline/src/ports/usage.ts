/** Tokens one model call used, and what it was for. */
export interface TokenCall {
  /** What the call was for: `classify` or `write`. */
  step: string;
  model: string;
  input: number;
  output: number;
}

/** Calls summed by step and model. */
export interface TokenUsage extends TokenCall {
  calls: number;
}

/** Collects the calls of the job that is running; one job at a time. */
export interface UsageMeter {
  record(call: TokenCall): void;
  /** Everything recorded since the last take, summed; starts counting afresh. */
  take(): TokenUsage[];
}

/** A meter that sums in memory. */
export function memoryMeter(): UsageMeter {
  let calls: TokenCall[] = [];
  return {
    record: (call) => void calls.push(call),
    take() {
      const totals = new Map<string, TokenUsage>();
      for (const c of calls) {
        const key = `${c.step}\0${c.model}`;
        const t = totals.get(key) ?? { step: c.step, model: c.model, calls: 0, input: 0, output: 0 };
        totals.set(key, { ...t, calls: t.calls + 1, input: t.input + c.input, output: t.output + c.output });
      }
      calls = [];
      return [...totals.values()];
    },
  };
}
