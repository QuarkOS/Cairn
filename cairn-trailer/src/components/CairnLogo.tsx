import { Easing, interpolate, useCurrentFrame } from "remotion";
import { colors } from "../theme";

type Props = {
  size?: number;
  animate?: boolean;
};

export const CairnLogo: React.FC<Props> = ({ size = 120, animate = true }) => {
  const frame = useCurrentFrame();
  const scale = animate
    ? interpolate(frame, [0, 20], [0.85, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
        easing: Easing.bezier(0.16, 1, 0.3, 1),
      })
    : 1;

  const stoneHeight = size * 0.18;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      style={{ scale, display: "block" }}
    >
      <rect
        x={30}
        y={72}
        width={60}
        height={stoneHeight}
        rx={6}
        fill={colors.primary}
      />
      <rect
        x={24}
        y={52}
        width={72}
        height={stoneHeight}
        rx={6}
        fill={colors.primaryLight}
      />
      <rect
        x={36}
        y={32}
        width={48}
        height={stoneHeight}
        rx={6}
        fill={colors.primary}
      />
      <circle cx={60} cy={24} r={10} fill={colors.accent} stroke={colors.primary} strokeWidth={3} />
    </svg>
  );
};
