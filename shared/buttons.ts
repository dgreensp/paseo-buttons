import { z } from "zod";

// The row the daemon side appends after an agent's final message when a classifier call finds
// that the message ends with an offer.
export const RENDERER_KIND = "reply-buttons";
export const MAX_BUTTONS = 4;
// The classifier is asked for labels up to MAX_LABEL characters; the code cuts only runaway ones at
// LABEL_CAP, since a label is also the message a tap sends. A button shows one line, ellipsized.
export const MAX_LABEL = 40;
export const LABEL_CAP = 80;

export const buttonsSchema = z.object({
  labels: z.array(z.string()).min(1).max(MAX_BUTTONS),
  // Set when the next turn starts, whether from a tap or a typed message.
  stale: z.boolean(),
});

export type ButtonsData = z.output<typeof buttonsSchema>;
