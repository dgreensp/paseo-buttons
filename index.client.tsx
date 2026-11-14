import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ReplyButtons } from "./client/buttons";
import { ButtonSettings } from "./client/settings";
import { buttonsSchema, RENDERER_KIND } from "./shared/buttons";

export default function contribute(client: PluginClientContext) {
  const removeRenderer = client.addTimelineRenderer({
    kind: RENDERER_KIND,
    version: 1,
    schema: buttonsSchema,
    Component: ReplyButtons,
  });
  const removeSettings = client.addSettingsScreen({
    id: "buttons",
    title: "Options",
    icon: "SlidersHorizontal",
    Component: ButtonSettings,
  });
  return () => {
    void removeRenderer();
    void removeSettings();
  };
}
