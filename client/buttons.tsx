import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { useAgent, usePaseo } from "@getpaseo/plugin/client";
import { useToast } from "@getpaseo/plugin/client/react-native";
import { useState } from "react";
import { Pressable, type PressableStateCallbackType, Text, View } from "react-native";
import type { ButtonsData } from "../shared/buttons";

export function ReplyButtons({ agentId, item, theme }: PluginTimelineItemProps<ButtonsData>) {
  const paseo = usePaseo();
  const toast = useToast();
  const running = useAgent(agentId, (a) => a.status === "running") ?? false;
  const [chosen, setChosen] = useState<number | null>(null);
  const disabled = chosen !== null || item.data.stale || running;

  async function press(index: number) {
    setChosen(index);
    try {
      await paseo.agents.ref(agentId).send(item.data.labels[index]);
    } catch (error) {
      setChosen(null);
      toast.error(`Could not send: ${String(error)}`);
    }
  }

  return (
    // Paseo puts a fixed 16 px gap above every row; pull the buttons up toward the question.
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 10, marginTop: -8 }}>
      {item.data.labels.map((label, index) => {
        const isChosen = chosen === index;
        return (
          <Pressable
            key={index}
            accessibilityRole="button"
            accessibilityLabel={label}
            disabled={disabled}
            onPress={() => void press(index)}
            // `hovered` exists on web and desktop only; Paseo's own rows use it the same way.
            // theme.colors.border and surface1 were too faint on the phone in dark mode (2026-09-26).
            style={({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => ({
              borderWidth: 1,
              borderColor: isChosen
                ? theme.colors.accent
                : pressed || (hovered && !disabled)
                  ? theme.colors.foreground
                  : theme.colors.foregroundMuted,
              backgroundColor: theme.colors.surface2,
              borderRadius: 10,
              maxWidth: "100%",
              paddingHorizontal: 16,
              paddingVertical: 10,
              opacity: disabled && !isChosen ? 0.4 : 1,
            })}
          >
            {({ pressed, hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
              <>
                {/* A film of the text color: darkens the button in light mode, lightens it in
                    dark mode. The theme has no shade beyond surface2. */}
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    borderRadius: 9,
                    backgroundColor: theme.colors.foreground,
                    opacity: disabled ? 0 : pressed ? 0.14 : hovered ? 0.08 : 0,
                  }}
                />
                <Text numberOfLines={1} style={{ color: theme.colors.foreground, fontSize: 16 }}>
                  {label}
                </Text>
              </>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}
