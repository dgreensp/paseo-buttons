// node --experimental-strip-types test/classifier-input.test.mjs  (npm run test:input)
import assert from "node:assert/strict";
const { classifierInput } = await import("../server/classifier-input.ts");

const user = { type: "user_message", text: "hi" };
const say = (text, status = "failed") => ({ type: "tool_call", name: "speak", status, detail: { type: "unknown", input: text } });
const msg = (text) => ({ type: "assistant_message", text });
const offer = "Want me to commit both repos and deploy?";

const cases = [
  ["failed speak, then a stub", [user, say(offer), msg("(See above.)")], offer],
  ["failed speak, reasoning, then a stub", [user, say(offer), { type: "reasoning", text: "..." }, msg("(See above.)")], offer],
  ["MCP-prefixed tool name", [user, { ...say(offer), name: "mcp__paseo__speak" }, msg("(See above.)")], offer],
  ["failed speak, then real text of 40+ characters", [user, say(offer), msg("Committed both repos; the deploy is running now.")], "Committed both repos; the deploy is running now."],
  ["successful speak, then (Spoken.)", [user, say(offer, "completed"), msg("(Spoken.)")], "(Spoken.)"],
  ["short message, no speak call before it", [user, msg("Done.")], "Done."],
  ["short message after another tool", [user, { type: "tool_call", name: "Bash", status: "failed", detail: {} }, msg("Done.")], "Done."],
  ["ordinary final message", [user, msg(offer)], offer],
];
for (const [name, timeline, want] of cases) {
  assert.equal(classifierInput(timeline), want, name);
  console.log("ok -", name);
}
