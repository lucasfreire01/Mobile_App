import { useEffect, useState } from "react";
import { Animated, Image, Modal, View } from "react-native";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { brandAssets } from "./brand";

/** Visibility follows the request lifecycle, never the remote operation's status. */
export function BrandLoadingOverlay({
  visible,
  label = "Carregando",
}: {
  visible: boolean;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    pulse.setValue(0);
    if (!visible || reduced !== false) return;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 850,
          useNativeDriver: true,
          isInteraction: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 850,
          useNativeDriver: true,
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse, reduced, visible]);

  if (!visible) return null;
  return (
    <Modal
      transparent
      animationType="none"
      visible
      onRequestClose={() => undefined}
    >
      <View
        testID="brand-loading-overlay"
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityState={{ busy: true }}
        accessibilityViewIsModal
        className="flex-1 items-center justify-center bg-white/80"
      >
        <Animated.View
          style={{
            opacity: pulse.interpolate({
              inputRange: [0, 1],
              outputRange: [1, 0.7],
            }),
            transform: [
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.07],
                }),
              },
              {
                rotate: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["-3deg", "3deg"],
                }),
              },
            ],
          }}
        >
          <Image
            source={brandAssets.symbol}
            resizeMode="contain"
            accessible={false}
            className="!h-20 !w-20"
            fadeDuration={0}
          />
        </Animated.View>
      </View>
    </Modal>
  );
}
