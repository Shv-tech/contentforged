 
import React from "react";

export const NoiseBackground = ({
  children,
  containerClassName,
  gradientColors = [
    "rgb(209, 138, 94)",  // Base Copper (#d18a5e)
    "rgb(227, 154, 110)", // Lighter Glow (#e39a6e)
    "rgb(140, 83, 51)",   // Darker Forge Amber
  ],
}: {
  children: React.ReactNode;
  containerClassName?: string;
  gradientColors?: string[];
}) => {
  // Dynamically create a smooth linear gradient from the passed colors
  const gradient = `linear-gradient(45deg, ${gradientColors.join(", ")})`;

  return (
    <div className={`relative overflow-hidden ${containerClassName}`}>
      {/* 1. Base Animated Gradient */}
      <div
        className="absolute inset-0 z-0 opacity-80"
        style={{
          background: gradient,
          backgroundSize: "200% 200%",
          animation: "gradientMove 8s ease infinite",
        }}
      />
      
      {/* 2. SVG Static Noise Overlay */}
      <div
        className="absolute inset-0 z-0 opacity-[0.15] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />
      
      {/* 3. The Button (Children) */}
      <div className="relative z-10 w-full h-full">{children}</div>
    </div>
  );
};