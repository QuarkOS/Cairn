import { AbsoluteFill } from "remotion";
import { ReactNode } from "react";
import { colors } from "../theme";

type Props = {
  children: ReactNode;
  variant?: "light" | "dark";
};

export const SceneShell: React.FC<Props> = ({ children, variant = "light" }) => {
  const isDark = variant === "dark";

  return (
    <AbsoluteFill
      style={{
        backgroundColor: isDark ? colors.dark : colors.background,
        color: isDark ? "#f5f4f0" : colors.foreground,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        overflow: "hidden",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: isDark
            ? "radial-gradient(circle at 20% 20%, rgba(45,106,79,0.25) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(64,145,108,0.15) 0%, transparent 45%)"
            : "radial-gradient(circle at 15% 15%, rgba(45,106,79,0.08) 0%, transparent 45%), radial-gradient(circle at 85% 85%, rgba(216,243,220,0.6) 0%, transparent 40%)",
        }}
      />
      <AbsoluteFill style={{ display: "flex", flexDirection: "column" }}>
        {children}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
