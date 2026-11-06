import { useCallback } from "react";
import { useFocusEffect } from "expo-router";
import { AppState } from "react-native";

// Refresh the visible screen on entry and when the app becomes active again.
export function useActiveRefresh(
  refresh: () => void | Promise<unknown>,
  cancel?: () => void,
) {
  useFocusEffect(
    useCallback(() => {
      let previousState = AppState.currentState;
      if (previousState !== "background" && previousState !== "inactive") {
        void refresh();
      }
      const subscription = AppState.addEventListener("change", (nextState) => {
        if (nextState === "active" && previousState !== "active") {
          void refresh();
        }
        previousState = nextState;
      });
      return () => {
        subscription.remove();
        cancel?.();
      };
    }, [refresh, cancel]),
  );
}
