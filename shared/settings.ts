import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";

// Per-host settings, edited under Settings → Plugins → paseo-buttons.
export const buttonSettings = defineSettings({
  id: "buttons",
  scope: "host",
  version: 1,
  schema: z.object({
    // Add a "Commit" button when a message mentions committing and the agent's repository has
    // uncommitted changes (server/commit-button.ts).
    commitButton: z.boolean().default(false),
  }),
});
