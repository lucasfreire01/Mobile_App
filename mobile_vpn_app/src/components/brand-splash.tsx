import { useEffect, useState } from "react";
import { Animated, Image, View, useWindowDimensions } from "react-native";
import { useReducedMotion } from "../hooks/use-reduced-motion";
import { brandAssets } from "./brand";

export function BrandSplash({ onEntered }: { onEntered: () => void }) {
  const reduced = useReducedMotion();
  const { width } = useWindowDimensions();
  const [symbolProgress] = useState(() => new Animated.Value(0));
  const [nameProgress] = useState(() => new Animated.Value(0));
  const [assetsReady, setAssetsReady] = useState({ symbol: false, logo: false });
  const markHeight = Math.min(72, Math.max(54, width * 0.18));
  const nameWidth = (markHeight * (1454 - 380)) / 388;
  const logoWidth = (markHeight * 1454) / 388;
  const logoOffset = (markHeight * 380) / 388;

  useEffect(() => {
    if (reduced === null || !assetsReady.symbol || !assetsReady.logo) return;
    if (reduced) {
      symbolProgress.setValue(1);
      nameProgress.setValue(1);
      onEntered();
      return;
    }
    const animation = Animated.sequence([
      Animated.timing(symbolProgress, {
        toValue: 1,
        duration: 360,
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(nameProgress, {
        toValue: 1,
        duration: 480,
        useNativeDriver: true,
        isInteraction: false,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) onEntered();
    });
    return () => animation.stop();
  }, [assetsReady, nameProgress, onEntered, reduced, symbolProgress]);

  return (
    <View
      testID="brand-splash"
      accessibilityRole="progressbar"
      accessibilityLabel="Restaurando sua sessão SagaNexus"
      accessibilityState={{ busy: true }}
      className="absolute inset-0 z-50 items-center justify-center bg-white px-10"
    >
      <View className="flex-row items-center justify-center">
        <Animated.View
          style={{
            width: markHeight,
            height: markHeight,
            opacity: symbolProgress,
            transform: [
              {
                scale: symbolProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.72, 1],
                }),
              },
            ],
          }}
        >
          <Image
            source={brandAssets.symbol}
            resizeMode="contain"
            accessibilityLabel="Símbolo S da SagaNexus"
            style={{ width: markHeight, height: markHeight }}
            onLoadEnd={() =>
              setAssetsReady((ready) => ({ ...ready, symbol: true }))
            }
            fadeDuration={0}
          />
        </Animated.View>
        <View
          className="overflow-hidden"
          style={{ width: nameWidth, height: markHeight }}
        >
          <Animated.View
            style={{
              width: logoWidth,
              height: markHeight,
              left: -logoOffset,
              opacity: nameProgress,
              transform: [
                {
                  translateX: nameProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [-markHeight * 0.35, 0],
                  }),
                },
              ],
            }}
          >
            <Image
              source={brandAssets.logo}
              resizeMode="stretch"
              accessibilityLabel="SagaNexus"
              style={{ width: logoWidth, height: markHeight }}
              onLoadEnd={() =>
                setAssetsReady((ready) => ({ ...ready, logo: true }))
              }
              fadeDuration={0}
            />
          </Animated.View>
        </View>
      </View>
    </View>
  );
}
