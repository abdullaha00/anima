"use client";

export type ButtonVariant = "primary" | "quiet" | "refuse" | "link";

export const BUTTON: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-ink hover:bg-primary-hover aria-disabled:bg-stone-200 aria-disabled:text-faint aria-disabled:cursor-not-allowed aria-disabled:hover:bg-stone-200",
  quiet:
    "bg-surface text-ink border border-line-strong shadow-xs hover:bg-surface-2 aria-disabled:bg-stone-200 aria-disabled:text-faint aria-disabled:cursor-not-allowed aria-disabled:hover:bg-stone-200",
  refuse: "bg-refuse-soft text-refuse border border-refuse-border hover:bg-surface aria-disabled:opacity-50",
  link: "text-primary-hover hover:bg-primary-soft px-3 aria-disabled:text-faint aria-disabled:cursor-not-allowed",
};

export const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md px-[18px] py-[9px] text-[14px] font-semibold leading-none min-h-11 transition-colors duration-150";

/**
 * A disabled button stays focusable: it is marked aria-disabled and its click is ignored, so
 * focus does not drop to the page body while a form is pending or a step is not yet allowed.
 * A client component, because the guard is an event handler; server components may still
 * render it.
 */
export function Button({
  variant = "quiet",
  className = "",
  disabled,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`${BUTTON_BASE} ${BUTTON[variant]} ${className}`}
      aria-disabled={disabled || undefined}
      onClick={(e) => {
        if (disabled) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...rest}
    />
  );
}
