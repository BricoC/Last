import React from "react";
import { cn } from "@/shared/utils/cn";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, disabled, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

    const variantStyles = {
      primary: "bg-[var(--primary)] text-white hover:opacity-90",
      secondary: "bg-[var(--secondary)] text-[var(--foreground)] hover:bg-slate-700",
      outline: "border border-[var(--border)] bg-transparent hover:bg-slate-800 text-[var(--foreground)]",
      danger: "bg-[var(--destructive)] text-white hover:opacity-90",
      ghost: "bg-transparent hover:bg-slate-800 text-[var(--foreground)]",
    };

    const sizeStyles = {
      sm: "h-8 px-3 text-xs rounded-[var(--radius)]",
      md: "h-10 px-4 text-sm rounded-[var(--radius)]",
      lg: "h-12 px-6 text-base rounded-[var(--radius)]",
    };

    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(baseStyles, variantStyles[variant], sizeStyles[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
