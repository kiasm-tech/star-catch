/** A deterministic writer: narrates each visual from its own elements and the facts. Offline, and in every test. */
import type { FactGroup, Visual } from "@kiasm-tech/star-catch-contracts";
import type { ScriptWriter, WriteRequest, WrittenSentence } from "../ports/script-writer.js";
import { deCode, plainTitle } from "../visuals/words.js";

export { deCode };

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => NUMBER_WORDS[n] ?? "many";
const mark = (id: string) => `<mark name="${id}"/>`;
const list = (parts: string[], last = "and") => (parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} ${last} ${parts.at(-1)}`);
/** Capitalises the first spoken letter, after any marks. */
const capital = (text: string) => text.replace(/^((?:<mark name="[^"]*"\/>)*)(\S)/, (_m, marks: string, first: string) => marks + first.toUpperCase());

const end = (text: string) => (/[.!?…]$/.test(text) ? text : `${text}.`);
const words = (name: string) => name.replace(/_/g, " ");

class Sources {
  private readonly known: Set<string>;

  constructor(private readonly request: WriteRequest) {
    this.known = new Set(["pr:title", ...request.sentences.map((s) => s.id), ...request.facts.flatMap((f) => f.sources)]);
  }

  /** The ids a fact group (and key) cites. */
  facts(group: FactGroup, key?: string): string[] {
    return [...new Set(this.request.facts.filter((f) => f.group === group && (key === undefined || f.key === key)).flatMap((f) => f.sources))];
  }

  /** The unit or sentence ids an element id carries: `unit:<id>`, `message:<a>-><b>`, `before:<sentence>`. */
  of(elementId: string): string[] {
    const rest = elementId.slice(elementId.indexOf(":") + 1);
    if (rest === "title") return ["pr:title"];
    return rest.split("->").filter((id) => this.known.has(id));
  }

  /** The sentence a visual quoted (clipped or whole). */
  quoted(text: string): string[] {
    const plain = deCode(text.replace(/…$/, ""));
    const found = this.request.sentences.find((s) => deCode(s.text).replace(/\s+/g, " ").startsWith(plain));
    return found ? [found.id] : [];
  }
}

const ACTOR_PHRASE: Record<string, string> = {
  User: "a user",
  "API client": "an API client",
  Scheduler: "the scheduler",
  Operator: "an operator",
  "Calling code": "calling code",
};

const RISK_SOURCE: Record<string, [FactGroup, string?]> = {
  "risk:migration": ["rollout", "migration"],
  "risk:breaking": ["contracts", "breaking"],
  "risk:flag": ["rollout", "gated"],
  "risk:config": ["rollout", "config"],
  "risk:untested": ["quality", "untested"],
  "risk:rules": ["rules"],
  "risk:contracts": ["contracts", "changed"],
};

function narrate(visual: Visual, request: WriteRequest, src: Sources): WrittenSentence[] {
  const say = (text: string, sources: string[]): WrittenSentence => ({ text: end(text), sources: [...new Set(sources)] });
  switch (visual.type) {
    case "titleCard":
    case "recap": {
      const title = plainTitle(deCode(request.pr.title));
      return [say(visual.type === "recap" ? `In short: ${title.charAt(0).toLowerCase()}${title.slice(1)}` : title, ["pr:title"])];
    }
    case "beforeAfterSplit":
      return [...visual.data.before.items, ...visual.data.after.items].map((i) => say(`${mark(i.id)}${capital(deCode(i.text))}`, src.of(i.id)));
    case "componentMap": {
      const focus = visual.data.nodes.filter((n) => n.focus);
      if (focus.length > 0) return [say(`Review first: ${list(focus.map((n) => `${mark(n.id)}${n.label}`))}`, src.facts("shape", "components"))];
      return [say(`This change touches ${list(visual.data.nodes.filter((n) => n.changed).map((n) => `${mark(n.id)}${n.label}`))}`, src.facts("shape", "components"))];
    }
    case "architectureMorph": {
      const by = (state: string) => visual.data.nodes.filter((n) => n.state === state);
      const sources = [...src.facts("shape", "added"), ...src.facts("shape", "removed")];
      return [
        ...(by("added").length ? [say(`It adds ${list(by("added").map((n) => `${mark(n.id)}${n.label}`))}`, sources)] : []),
        ...(by("removed").length ? [say(`It removes ${list(by("removed").map((n) => `${mark(n.id)}${n.label}`))}`, sources)] : []),
        ...(by("kept").length
          ? [say(`${capital(list(by("kept").map((n) => `${mark(n.id)}${n.label}`)))} ${by("kept").length === 1 ? "works" : "work"} with it`, [...sources, ...by("kept").flatMap((n) => src.of(n.id))])]
          : []),
      ];
    }
    case "contractCard":
      return [say(`${capital(list(visual.data.items.map((i) => `${mark(i.id)}${i.label}`)))} ${visual.data.items.length === 1 ? "changes" : "change"} what callers send or get back`, src.facts("contracts", "changed"))];
    case "dataModelDiff":
      return visual.data.entities.flatMap((e) =>
        e.fields.length > 0
          ? e.fields.map((f, i) => say(`${mark(f.id)}The ${words(f.name)} field of ${i === 0 ? mark(e.id) : ""}${words(e.label)} is ${f.change}`, src.facts("data")))
          : [say(`${mark(e.id)}${capital(words(e.label))} is ${e.change}`, src.facts("data"))],
      );
    case "systemSequenceDiagram": {
      const actor = visual.data.participants.find((p) => p.role === "actor")!.label;
      const business = request.cut === "business";
      const who = ACTOR_PHRASE[actor] ?? actor;
      const messages = visual.data.messages.map((m) => {
        const opens = /^opens\b/.test(m.label);
        const text = business
          ? opens
            ? `${who} ${actor === "You" ? m.label.replace(/^opens\b/, "open") : m.label}`
            : deCode(m.label)
          : opens
            ? `${who} ${m.label}`
            : `${who} sends ${m.label}`;
        return say(`${mark(m.id)}${capital(text)}`, src.of(m.id).length ? src.of(m.id) : ["pr:title"]);
      });
      const entry = visual.data.messages.flatMap((m) => src.of(m.id));
      if (visual.data.outcomes.length === 0) return messages;
      if (business) return [...messages, ...visual.data.outcomes.map((o) => say(`${mark(o.id)}${capital(deCode(o.label))}`, src.of(o.id)))];
      return [...messages, say(`It answers ${list(visual.data.outcomes.map((o) => `${mark(o.id)}${o.label}`), "or")}`, entry.length ? entry : ["pr:title"])];
    }
    case "sequenceDiagram": {
      const name = new Map(visual.data.participants.map((p) => [p.id, p.label]));
      return visual.data.messages.map((m) => say(`${mark(m.id)}${capital(name.get(m.from)!)} calls ${m.label} in ${name.get(m.to)}`, src.of(m.id)));
    }
    case "decisionDiagram": {
      const { subject, before, after } = visual.data;
      const sources = src.facts("rules", "conditionChanged");
      if (request.cut === "business") return [say(`${mark(after.id)}${capital(deCode(after.condition))}`, [...src.quoted(after.condition), ...sources])];
      const evidence = new Set(request.facts.filter((f) => f.group === "evidence").flatMap((f) => (Array.isArray(f.value) ? f.value : [])));
      const number = (text: string | undefined) => text?.match(/\d+(?:\.\d+)?/)?.[0];
      const [was, now] = [number(before?.condition), number(after.condition)];
      if (before && was && now && evidence.has(was) && evidence.has(now)) {
        return [say(`The rule for ${subject.label} changed from ${mark(before.id)}${was} to ${mark(after.id)}${now}`, sources)];
      }
      return [say(`${before ? mark(before.id) : ""}${mark(after.id)}The condition that decides ${subject.label} changed`, sources)];
    }
    case "impactRings": {
      const items = visual.data.rings.flatMap((r) => r.items);
      return [say(`${capital(count(items.length))} ${items.length === 1 ? "part depends" : "parts depend"} on ${visual.data.center.label}: ${list(items.map((i) => `${mark(i.id)}${i.label}`))}`, src.facts("reach", "callers"))];
    }
    case "checklist": {
      if (visual.data.items.every((i) => i.id.startsWith("todo:"))) return visual.data.items.map((i) => say(`${mark(i.id)}${capital(deCode(i.label))}`, src.of(i.id)));
      const total = visual.data.items.length + visual.data.more;
      const more = visual.data.more > 0 ? `, and ${count(visual.data.more)} more` : "";
      return [say(`${capital(count(total))} ${total === 1 ? "test checks" : "tests check"} it: ${list(visual.data.items.map((i) => `${mark(i.id)}${i.label}`))}${more}`, src.facts("quality", "tests"))];
    }
    case "riskCards":
      return visual.data.cards.flatMap((c) => {
        const [group, key] = RISK_SOURCE[c.id] ?? ["rollout"];
        return [say(`${mark(c.id)}${capital(deCode(c.risk))}`, [...src.facts(group, key), ...src.quoted(c.risk)]), ...(c.mitigation ? [say(deCode(c.mitigation), src.quoted(c.mitigation))] : [])];
      });
    case "userJourney":
      return visual.data.steps.map((s) => say(`${mark(s.id)}${capital(/^opens\b/.test(s.label) ? `someone ${s.label}` : deCode(s.label))}`, src.of(s.id)));
    case "featureMap":
      return [say(`It affects ${list(visual.data.areas.map((a) => `${mark(a.id)}${a.label}`))}`, [...visual.data.areas.flatMap((a) => src.of(a.id)), ...src.facts("interactions", "entryPoints")])];
    case "metricCard":
      return [say(`${mark(visual.data.id)}${capital(deCode(visual.data.label))}`, [visual.data.source])];
    case "stateMachine":
    case "dataFlow":
      return [];
  }
}

export const templateWriter: ScriptWriter = {
  id: "template@1",
  write: async (request) => narrate(request.visual, request, new Sources(request)),
};
