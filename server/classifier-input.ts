// What the classifier reads when a turn ends: the agent's final message, or, when that message is
// only a stub (under STUB_LENGTH characters) right after a failed speak call, the speak call's text.
// Paseo's chat shows a speak call's text whether or not the call worked, so after a failed one
// (voice mode was off) that text is what the user is reading, and an agent told so may end the
// turn with a stub such as "(See above.)". An agent that restates its message instead writes more
// than STUB_LENGTH characters, and the restatement is classified as it is. Looks back one item at
// most, past reasoning.

export interface TimelineItem {
  type: string;
  text?: unknown;
  name?: unknown;
  status?: unknown;
  detail?: unknown;
}

export const STUB_LENGTH = 40;

// The final message: the assistant text after the turn's last user message, tool call or other
// item, and the index of its first item. A message's text may span several items.
function finalMessage(timeline: readonly TimelineItem[]): { text: string; start: number } {
  let text = "";
  let start = timeline.length;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const item = timeline[i];
    if (item.type === "reasoning") continue;
    if (item.type !== "assistant_message" || typeof item.text !== "string") break;
    text = item.text + text;
    start = i;
  }
  return { text, start };
}

function failedSpeakText(item: TimelineItem | undefined): string | null {
  if (!item || item.type !== "tool_call" || item.status !== "failed") return null;
  if (typeof item.name !== "string" || !/(^|__)speak$/.test(item.name)) return null;
  const input = (item.detail as { input?: unknown } | undefined)?.input;
  if (typeof input === "string") return input;
  if (input && typeof (input as { text?: unknown }).text === "string") return (input as { text: string }).text;
  return null;
}

export function classifierInput(timeline: readonly TimelineItem[]): string {
  const { text, start } = finalMessage(timeline);
  const message = text.trim();
  if (message.length < STUB_LENGTH) {
    let i = start - 1;
    while (i >= 0 && timeline[i].type === "reasoning") i--;
    const spoken = failedSpeakText(timeline[i])?.trim();
    if (spoken) return spoken;
  }
  return message;
}
