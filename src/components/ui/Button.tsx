"use client";

import { BUTTON, BUTTON_BASE, type ButtonVariant } from "./button-classes";

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
