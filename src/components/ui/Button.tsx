import React from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "secondary", size = "md", icon, children, ...props }, ref) => {
    // Specify the transitioned properties explicitly (per Emil: never use
    // `transition: all` — it animates layout properties you didn't intend
    // and can drop frames). focus-visible keeps keyboard users supported
    // without showing a focus ring on every mouse click.
    const baseStyles = "inline-flex items-center justify-center font-medium transition-[background-color,color,border-color,transform] duration-150 ease-[cubic-bezier(0.32,0.72,0,1)] rounded-md active:scale-[0.96] disabled:active:scale-100 disabled:opacity-50 disabled:pointer-events-none will-change-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30";
    
    // Some buttons need perfectly rounded pills:
    const isPill = className.includes('rounded-full');
    
    const sizeStyles = {
      xs: "px-2 tracking-wide py-0.5 text-[10px] gap-1",
      sm: "px-3 py-1 text-[10px] gap-1.5",
      md: "px-4 py-2 text-xs gap-2",
      lg: "px-5 py-2.5 text-sm gap-2",
    };

    const variantStyles = {
      primary: "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border border-emerald-500/20",
      secondary: "bg-white/5 text-white/70 hover:bg-white/10 hover:text-white/90 border border-white/10",
      danger: "bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/20",
      ghost: "text-white/40 hover:text-white/70 hover:bg-white/5",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${!isPill && !className.includes('rounded-') ? 'rounded-md' : ''} ${className}`}
        {...props}
      >
        {icon && <span className="flex-shrink-0">{icon}</span>}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
