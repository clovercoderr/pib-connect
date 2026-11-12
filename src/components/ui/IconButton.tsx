import React from "react";

export type IconButtonTone = "ghost" | "glass" | "toggle-on";
export type IconButtonSize = "sm" | "md";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * `ghost`  – sits on the top bar, no fill at rest.
   * `glass`  – floats on top of content (3D view), tinted surface + blur.
   * `toggle-on` – glass styling but visually "engaged" (e.g. split view active).
   */
  tone?: IconButtonTone;
  size?: IconButtonSize;
}

const SIZE_STYLES: Record<IconButtonSize, string> = {
  sm: "h-7 w-7",
  md: "h-8 w-8",
};

const TONE_STYLES: Record<IconButtonTone, string> = {
  ghost:
    "text-white/30 hover:text-white/65 hover:bg-white/[0.05]",
  glass:
    "border border-white/[0.07] bg-[var(--color-surface-overlay)]/85 text-white/70 backdrop-blur-xl hover:bg-white/[0.08] hover:text-white/95",
  "toggle-on":
    "border border-white/[0.1] bg-white/[0.1] text-white/85 backdrop-blur-xl hover:bg-white/[0.13] hover:text-white",
};

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ tone = "ghost", size = "sm", className = "", children, ...props }, ref) => (
    <button
      ref={ref}
      onMouseDown={(e) => {
        // Prevent the canvas underneath from stealing focus during click —
        // matters for the floating glass buttons that sit on the 3D view.
        if (tone !== "ghost") e.preventDefault();
        props.onMouseDown?.(e);
      }}
      className={`inline-flex items-center justify-center rounded-full transition-[background-color,color,transform] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.94] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 focus-visible:ring-offset-0 disabled:opacity-40 disabled:pointer-events-none ${SIZE_STYLES[size]} ${TONE_STYLES[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  ),
);

IconButton.displayName = "IconButton";
