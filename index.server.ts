import type { PluginServerContext } from "@getpaseo/plugin/server";
import { classify } from "./server/classify";
import { addCommitButton } from "./server/commit-button";
import { classifierInput, type TimelineItem } from "./server/classifier-input";
import { type ButtonsData, RENDERER_KIND } from "./shared/buttons";
import { buttonSettings } from "./shared/settings";

// Agents are not told about the buttons and write as they always do. When a turn ends, a
// classifier call reads the final message (or a failed speak call's text;
// server/classifier-input.ts); if it ends with an offer, the plugin appends a row of buttons after
// it. Appended rows live in the daemon's memory and vanish on a daemon restart.
export default function contribute(server: PluginServerContext) {
  // Per agent: turns started so far, so a classification that finishes after the next turn began
  // is dropped; and the live row, to grey it out when the next turn starts.
  const turns = new Map<string, number>();
  const live = new Map<string, { id: string; data: ButtonsData }>();
  const settings = server.registerSettings(buttonSettings);

  server.on("agent.turn_ended", async (event, { paseo }) => {
    if (event.outcome.kind !== "completed") return;
    const agentId = event.agent.id;
    const turn = turns.get(agentId) ?? 0;
    // The event's own timeline is always empty since Paseo 0.14.0; fetch the tail instead.
    const { entries } = await paseo.agents.ref(agentId).timeline.refetch({ direction: "tail", limit: 20 });
    const message = classifierInput(entries.map((entry) => entry.item) as readonly TimelineItem[]);
    if (!message) return;
    let labels: string[];
    try {
      labels = await classify(message);
    } catch (error) {
      console.error(`paseo-buttons: classify failed for ${agentId}: ${String(error)}`);
      return;
    }
    const current = await settings.read();
    if (current.status === "ready" && current.values.commitButton) {
      labels = await addCommitButton(labels, message, event.agent.cwd);
    }
    if ((turns.get(agentId) ?? 0) !== turn) return;
    console.log(`paseo-buttons: ${agentId} ${labels.length ? JSON.stringify(labels) : "no offer"}`);
    if (labels.length === 0) return;
    const row = { id: `buttons-${Date.now()}`, data: { labels, stale: false } };
    await paseo.agents.ref(agentId).timeline.append({
      type: "plugin",
      id: row.id,
      kind: RENDERER_KIND,
      version: 1,
      data: row.data,
    });
    live.set(agentId, row);
  });

  // Grey out the last row once the next turn starts, whether from a tap or a typed message.
  // Reusing the row's id replaces it in place.
  server.on("agent.turn_started", async (event, { paseo }) => {
    const agentId = event.agent.id;
    turns.set(agentId, (turns.get(agentId) ?? 0) + 1);
    const row = live.get(agentId);
    if (!row) return;
    live.delete(agentId);
    await paseo.agents.ref(agentId).timeline.append({
      type: "plugin",
      id: row.id,
      kind: RENDERER_KIND,
      version: 1,
      data: { ...row.data, stale: true },
    });
  });

  return () => {};
}
