import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { LABEL_CAP, MAX_BUTTONS, MAX_LABEL } from "../shared/buttons";

// Decides whether an agent's final message proposes a next action, and the button labels, with a
// one-shot `claude -p` call on Haiku. It uses the machine's Claude Code login, so it counts
// against the subscription; ANTHROPIC_API_KEY is removed so it can never bill the API.
// --json-schema costs a second round trip but labels far more accurately than plain text
// (tested 2026-09-26: plain text kept "Hold off" and missed the main offer once).

const MODEL = "claude-haiku-4-5";
const TAIL_CHARS = 1500;
const TIMEOUT_MS = 30_000;

// The prompt is about a text, its writer and its reader, with no mention of chats, agents or
// buttons, and avoids the word "offer": asked to "find the offer", the model picked sentences that
// described someone else's offer (tested 2026-09-26). It tests grammar instead.
const SYSTEM_PROMPT = `You analyze the end of a message, given inside <input> tags: its writer addressing its reader. "You" in the message means the reader. Judge only the writer's own words: the writer may quote or report other people's words, offers or messages, and those are not the writer's. [code block] and [quoted text] mark code or quotations that were removed.

Decide whether the writer proposes something the writer will do next, once the reader agrees. A proposal passes all three tests:
- First person: the writer would act ("I", "me", "let me").
- Not done yet: future or conditional ("Want me to...", "Should I...", "Shall I...", "I could...", "I can...", "I'll ... if you like", "Say the word and I'll...", "Let me know if you want me to...").
- Waiting on the reader: it asks for or invites the reader's go-ahead. An announcement of what the writer will do anyway ("Next I'll run the tests.") is not a proposal.

Not proposals: reports of what someone else offered or did, anything in the past tense, discussion of options or wording, and questions asking the reader for information, feedback or opinions.

Answer in this order:
- "explanation": one or two sentences: which sentence, if any, passes the three tests, and why the most proposal-like other sentences fail.
- "proposal": that sentence or those sentences, copied word for word, or "".
- "options": every option the proposal gives the reader, each with a short label and "specificAction".

An option is a specific action when the writer would carry it out as soon as the reader chose it: a verb for what the writer would do and what it would do it to, specific enough to start without asking anything. Showing or explaining something counts ("Show the diff"). Not specific actions: moving on without saying to what, declining or deferring, catch-alls. A yes/no proposal has one option, the yes. Each option is everything the writer would do if the reader chose it: when a later step builds on an earlier one ("Want me to do A, and should I also do B?"), the options are A alone and A with B, and the second label names both steps.

Labels name the action in the imperative, at most ${MAX_LABEL} characters, using the proposal's own words where they work. "Commit" works; "Commit and push" is better if that is what the writer proposed; "Go ahead" or "Yes" is too vague. At most ${MAX_BUTTONS} specific actions.

<examples>
<example>
<input>The other team wrapped up by offering to migrate the photos folder, and they listed "Migrate photos" and "Delete duplicates" as next steps. They've moved on to other work now. If that works for you, I'll draft the migration plan here instead.</input>
<explanation>"If that works for you, I'll draft the migration plan here instead" is first person, not done yet, and waits on the reader. The first sentence reports another team's offer in the past tense, and its quoted labels are theirs, not the writer's.</explanation>
<output>{"proposal": "If that works for you, I'll draft the migration plan here instead.", "options": [{"label": "Draft the migration plan", "specificAction": true}]}</output>
</example>
<example>
<input>Good names for this would be "Archive old invoices" or "Export to CSV". Which wording do you prefer?</input>
<explanation>No sentence has the writer proposing to act: the first discusses possible names, and the question asks for an opinion.</explanation>
<output>{"proposal": "", "options": []}</output>
</example>
<example>
<input>The script now handles leap years. Should I add a test for February 29?

Thanks for bearing with the detour.</input>
<explanation>"Should I add a test for February 29?" is first person, not done yet, and asks for the go-ahead. The closing remark proposes nothing.</explanation>
<output>{"proposal": "Should I add a test for February 29?", "options": [{"label": "Add a leap-day test", "specificAction": true}]}</output>
</example>
<example>
<input>The chart colors are fixed. Want me to regenerate the quarterly report, and should I email it to the board as well?</input>
<explanation>"Want me to regenerate the quarterly report, and should I email it to the board as well?" is first person, not done yet, and asks for the go-ahead. Emailing builds on regenerating, so the options are regenerating alone, or regenerating and then emailing.</explanation>
<output>{"proposal": "Want me to regenerate the quarterly report, and should I email it to the board as well?", "options": [{"label": "Regenerate the report", "specificAction": true}, {"label": "Regenerate and email to the board", "specificAction": true}]}</output>
</example>
<example>
<input>I could also rename the variables for clarity, or we can leave them as they are.</input>
<explanation>"I could also rename the variables for clarity" is a first-person proposal waiting on the reader. Leaving them as they are is declining.</explanation>
<output>{"proposal": "I could also rename the variables for clarity, or we can leave them as they are.", "options": [{"label": "Rename the variables", "specificAction": true}, {"label": "Leave them", "specificAction": false}]}</output>
</example>
</examples>`;

const SCHEMA = JSON.stringify({
  type: "object",
  properties: {
    explanation: { type: "string" },
    proposal: { type: "string" },
    options: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, specificAction: { type: "boolean" } },
        required: ["label", "specificAction"],
        additionalProperties: false,
      },
    },
  },
  required: ["explanation", "proposal", "options"],
  additionalProperties: false,
});

// Replace fenced code blocks and blockquotes with placeholders, so the model cannot mistake quoted
// text (another agent's offer, an example) for the agent's own words, but still sees that
// something was there.
export function elideQuoted(message: string): string {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of message.split("\n")) {
    const trimmed = line.trimStart();
    if (fence) {
      if (trimmed.startsWith(fence)) fence = null;
      continue;
    }
    const opening = trimmed.match(/^(`{3,}|~{3,})/);
    if (opening) {
      fence = opening[1];
      out.push("[code block]");
    } else if (trimmed.startsWith(">")) {
      if (out.at(-1) !== "[quoted text]") out.push("[quoted text]");
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

function cleanLabels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((label): label is string => typeof label === "string")
    .map((label) => label.trim().slice(0, LABEL_CAP))
    .filter((label) => label !== "")
    .slice(0, MAX_BUTTONS);
}

// Button labels for the message, or [] for none. Throws if the call fails.
export async function classify(message: string): Promise<string[]> {
  return (await classifyWithOffer(message)).labels;
}

// Also returns the sentence the model took as the proposal, for tests and debugging.
export async function classifyWithOffer(
  message: string,
): Promise<{ explanation: string; offer: string; labels: string[] }> {
  const env: NodeJS.ProcessEnv = { ...process.env, MAX_THINKING_TOKENS: "0" };
  delete env.ANTHROPIC_API_KEY;
  const args = [
    "-p", "--model", MODEL, "--system-prompt", SYSTEM_PROMPT,
    "--tools", "", "--strict-mcp-config", "--no-session-persistence",
    // No user settings: keeps the global CLAUDE.md out (about 4,500 of 4,900 tokens, 2026-09-26).
    "--setting-sources", "",
    "--output-format", "json", "--json-schema", SCHEMA,
  ];
  // A login shell finds `claude` the way Paseo itself does; a scratch cwd keeps any project's
  // settings and CLAUDE.md out of the call.
  const child = spawn("bash", ["-lc", 'exec claude "$@"', "claude", ...args], {
    cwd: tmpdir(),
    env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => (stdout += chunk));
  child.stderr.on("data", (chunk) => (stderr += chunk));
  // Framed as tagged data, so the message does not read as addressed to the classifier.
  child.stdin.end(`<input>\n${elideQuoted(message).slice(-TAIL_CHARS)}\n</input>`);
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  }).finally(() => clearTimeout(timer));
  if (code !== 0) throw new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`);
  const output = (JSON.parse(stdout) as { structured_output?: { explanation?: unknown; proposal?: unknown; options?: unknown } })
    .structured_output;
  const options = Array.isArray(output?.options) ? output.options : [];
  const labels = options
    .filter((o): o is { label: unknown; specificAction: true } => o?.specificAction === true)
    .map((o) => o.label);
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  return { explanation: text(output?.explanation), offer: text(output?.proposal), labels: cleanLabels(labels) };
}
