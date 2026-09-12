/** Button classes shared by the client Button and the server-rendered ButtonLink. Plain module: no client boundary. */
export type ButtonVariant = "primary" | "quiet" | "refuse" | "warn" | "link";

export const BUTTON: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-ink hover:bg-primary-hover aria-disabled:bg-stone-200 aria-disabled:text-faint aria-disabled:cursor-not-allowed aria-disabled:hover:bg-stone-200",
  quiet:
    "bg-surface text-ink border border-line-strong shadow-xs hover:bg-surface-2 aria-disabled:bg-stone-200 aria-disabled:text-faint aria-disabled:cursor-not-allowed aria-disabled:hover:bg-stone-200",
  warn:
    "bg-warn-border text-warn hover:bg-[#fcd34d] aria-disabled:bg-stone-200 aria-disabled:text-faint aria-disabled:cursor-not-allowed aria-disabled:hover:bg-stone-200",
  refuse: "bg-refuse-soft text-refuse border border-refuse-border hover:bg-surface aria-disabled:opacity-50",
  link: "text-primary-hover hover:bg-primary-soft px-3 aria-disabled:text-faint aria-disabled:cursor-not-allowed",
};

export const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md px-[18px] py-[9px] text-[14px] font-semibold leading-none min-h-11 transition-colors duration-150";
