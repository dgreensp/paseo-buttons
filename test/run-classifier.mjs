// Runs every case in classifier-cases.json through the real classifier (a `claude -p` call each,
// on the subscription). A case passes when there is one label per entry in `expect`, in order,
// and each label contains all of that entry's words, ignoring case. `expect: []` means no buttons.
// An optional `or` lists other acceptable expectations in the same form.
// Run with `npm run test:classifier`, which compiles the TypeScript first.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { classifyWithOffer } = require("../.test-build/server/classify.js");
const cases = JSON.parse(readFileSync(new URL("./classifier-cases.json", import.meta.url), "utf8"));

// All cases run at once; each is an independent call.
const results = await Promise.all(cases.map(({ message }) => classifyWithOffer(message)));
let failed = 0;
cases.forEach(({ message, expect, or: alternatives }, n) => {
  const { explanation, offer, labels } = results[n];
  const matches = (exp) =>
    labels.length === exp.length &&
    exp.every((words, i) => words.every((w) => labels[i].toLowerCase().includes(w.toLowerCase())));
  const ok = [expect, ...(alternatives ?? [])].some(matches);
  if (!ok) failed++;
  console.log(`${ok ? "pass" : "FAIL"}  ${JSON.stringify(labels)}  ${message.replace(/\s+/g, " ").slice(0, 70)}`);
  if (!ok) console.log(`      proposal: ${JSON.stringify(offer)}\n      explanation: ${explanation}`);
});
console.log(`${cases.length - failed}/${cases.length} passed`);
process.exit(failed ? 1 : 0);
