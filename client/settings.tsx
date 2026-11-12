import { useCallback } from "react";
import { Text } from "react-native";
import { useSettings, type PluginSurfaceProps } from "@getpaseo/plugin/client";
import { SettingsCard, SettingsSection, SettingsSwitch } from "@getpaseo/plugin/client/ui";
import { buttonSettings } from "../shared/settings";

export function ButtonSettings({ theme }: PluginSurfaceProps) {
  const settings = useSettings(buttonSettings);
  const changeCommitButton = useCallback(
    (commitButton: boolean) => {
      if (settings.status !== "ready") return;
      void settings.save({ ...settings.values, commitButton }, settings.revision);
    },
    [settings],
  );
  if (settings.status !== "ready") {
    const message = settings.status === "loading" ? "Loading…" : settings.error;
    return <Text style={{ color: theme.colors.foreground }}>{message}</Text>;
  }
  return (
    <SettingsSection title="Buttons">
      <SettingsCard>
        <SettingsSwitch
          label="Commit button"
          hint={'Adds "Commit" when a message mentions committing and the agent\'s repository has uncommitted changes.'}
          value={settings.values.commitButton}
          disabled={settings.saving}
          error={settings.saveError}
          onValueChange={changeCommitButton}
        />
      </SettingsCard>
    </SettingsSection>
  );
}
