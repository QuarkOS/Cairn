import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { ReactNode } from "react";

type Props = {
  children: ReactNode;
  delay?: number;
  direction?: "up" | "down" | "none";
};

export const FadeSlide: React.FC<Props> = ({
  children,
  delay = 0,
  direction = "up",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = delay;
  const end = delay + 0.6 * fps;

  const opacity = interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const offset = interpolate(frame, [start, end], [24, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const translateY =
    direction === "up" ? `${offset}px` : direction === "down" ? `${-offset}px` : "0px";

  return (
    <div style={{ opacity, translate: `0 ${translateY}` }}>{children}</div>
  );
};
