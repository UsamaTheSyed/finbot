import { forwardRef, type ButtonHTMLAttributes } from "react";
import { LoaderCircle } from "lucide-react";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  loading?: boolean;
  size?: "normal" | "small" | "icon";
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant = "secondary",
      size = "normal",
      loading = false,
      disabled,
      children,
      className = "",
      ...props
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        className={`button button--${variant} button--${size} ${className}`}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && (
          <LoaderCircle size={16} className="spin" aria-hidden="true" />
        )}
        {children}
      </button>
    );
  },
);
