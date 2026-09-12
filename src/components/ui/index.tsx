import Link from "next/link";
import type { ReactNode } from "react";
import type { ReviewTier, SignalFamily, WorklistState } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";

/** Shared primitives, following the Cairn design system. Quiet by default. */

type ButtonVariant = "primary" | "quiet" | "refuse" | "link";

const BUTTON: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-ink hover:bg-primary-hover disabled:bg-stone-200 disabled:text-faint disabled:cursor-not-allowed",
  quiet:
    "bg-surface text-ink border border-line-strong shadow-xs hover:bg-surface-2 disabled:bg-stone-200 disabled:text-faint disabled:cursor-not-allowed",
  refuse: "bg-refuse-soft text-refuse border border-refuse-border hover:bg-surface disabled:opacity-50",
  link: "text-primary-hover hover:bg-primary-soft px-3",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-md px-[18px] py-[9px] text-[14px] font-semibold leading-none min-h-11 transition-colors duration-150";

export function Button({
  variant = "quiet",
  className = "",
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button className={`${BUTTON_BASE} ${BUTTON[variant]} ${className}`} {...rest} />;
}

export function ButtonLink({
  href,
  variant = "quiet",
  className = "",
  children,
}: {
  href: string;
  variant?: ButtonVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={`${BUTTON_BASE} ${BUTTON[variant]} ${className}`}>
      {children}
    </Link>
  );
}

export function Microlabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`microlabel ${className}`}>{children}</div>;
}

/** A review tier, carried by weight, never by colour. */
export function TierLabel({ tier, className = "" }: { tier: ReviewTier; className?: string }) {
  const weight =
    tier === "review this week"
      ? "font-bold text-ink"
      : tier === "review this month"
        ? "font-semibold text-ink"
        : "font-medium text-secondary";
  return <span className={`text-[13px] ${weight} ${className}`}>{tier}</span>;
}

const STATE_TONE: Record<WorklistState, { pill: string; dot: string }> = {
  flagged: { pill: "bg-stone-100 text-secondary border-line", dot: "bg-stone-300" },
  "team assembled": { pill: "bg-warn-soft text-warn border-warn-border", dot: "bg-warn-stripe" },
  coordinating: { pill: "bg-warn-soft text-warn border-warn-border", dot: "bg-warn-stripe" },
  "meeting held": { pill: "bg-warn-soft text-warn border-warn-border", dot: "bg-warn-stripe" },
  "record signed": { pill: "bg-affirm-soft text-affirm border-affirm-border", dot: "bg-cairn-400" },
  shared: { pill: "bg-affirm-soft text-affirm border-affirm-border", dot: "bg-cairn-400" },
  paused: { pill: "bg-stone-100 text-secondary border-line", dot: "bg-stone-300" },
};

/** Worklist state as a status badge: a dot and text, never colour alone. */
export function StateBadge({ state, className = "" }: { state: WorklistState; className?: string }) {
  const tone = STATE_TONE[state];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[12px] font-semibold leading-none ${tone.pill} ${className}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} />
      {state}
    </span>
  );
}

export type ChipTone = "neutral" | "brand" | "info" | "warn" | "affirm";

const CHIP_TONE: Record<ChipTone, string> = {
  neutral: "border-line bg-stone-100 text-secondary",
  brand: "border-primary-border bg-primary-soft text-affirm",
  info: "border-info-border bg-info-soft text-info",
  warn: "border-warn-border bg-warn-soft text-warn",
  affirm: "border-affirm-border bg-affirm-soft text-affirm",
};

/** A square signal chip, for indicator codes and short facts. Tone is category, never severity. */
export function Chip({
  children,
  className = "",
  tone = "neutral",
}: {
  children: ReactNode;
  className?: string;
  tone?: ChipTone;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-xs border px-2 py-[3px] text-[11px] font-medium leading-none ${CHIP_TONE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Indicator families are categories, so each gets its own tint: general, disease, service use. */
export const FAMILY_TONE: Record<SignalFamily, ChipTone> = {
  general: "info",
  "disease-specific": "brand",
  "service-use": "warn",
};

export function FamilyChip({ family }: { family: SignalFamily }) {
  return <Chip tone={FAMILY_TONE[family]}>{family}</Chip>;
}

/** "recorded by X on D from S". Every record field carries one. */
export function ProvenanceLine({
  recordedBy,
  recordedAt,
  source,
  className = "",
}: {
  recordedBy: string;
  recordedAt: string;
  source: string;
  className?: string;
}) {
  return (
    <p className={`text-[12px] leading-5 text-faint tnum ${className}`}>
      recorded by <span className="text-muted">{recordedBy}</span> on {formatDateTime(recordedAt)} from{" "}
      <span className="text-muted">{source}</span>
    </p>
  );
}

type NoticeKind = "info" | "refuse" | "affirm" | "quiet" | "warn";

const NOTICE: Record<NoticeKind, string> = {
  info: "border-info-border bg-info-soft text-ink",
  refuse: "border-refuse-border bg-refuse-soft text-ink",
  affirm: "border-affirm-border bg-affirm-soft text-ink",
  warn: "border-warn-border bg-warn-soft text-ink",
  quiet: "border-line bg-surface-2 text-secondary",
};

/** An inline state that stays on screen. Not a toast. */
export function Notice({
  kind = "info",
  title,
  children,
  className = "",
  role,
}: {
  kind?: NoticeKind;
  title?: string;
  children: ReactNode;
  className?: string;
  role?: string;
}) {
  return (
    <div className={`rounded-md border px-4 py-3.5 text-[14px] leading-6 ${NOTICE[kind]} ${className}`} role={role}>
      {title ? (
        <p className={`text-[13px] font-bold ${kind === "refuse" ? "text-refuse" : kind === "affirm" ? "text-affirm" : kind === "warn" ? "text-warn" : ""}`}>
          {title}
        </p>
      ) : null}
      <div>{children}</div>
    </div>
  );
}

/** A white card on the stone ground. 12px radius, subtle warm shadow. Never card-on-card. */
export function Panel({
  title,
  aside,
  children,
  className = "",
  as: Tag = "section",
  tone = "plain",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside";
  /** 'brand' tints the header Cairn green, for the one panel that carries the screen's purpose. */
  tone?: "plain" | "brand";
}) {
  const header = tone === "brand" ? "border-b border-cairn-100 bg-primary-soft" : "border-b border-line";
  const titleColour = tone === "brand" ? "text-affirm" : "text-ink";
  const asideColour = tone === "brand" ? "text-affirm/80" : "text-faint";
  return (
    <Tag className={`overflow-hidden rounded-lg border border-line bg-surface shadow-sm ${className}`}>
      {title ? (
        <header className={`flex items-baseline justify-between gap-4 px-6 py-3.5 ${header}`}>
          <h2 className={`min-w-0 text-[14px] font-bold tracking-[-0.01em] ${titleColour}`}>{title}</h2>
          {aside ? <div className={`min-w-0 text-right text-[12px] ${asideColour}`}>{aside}</div> : null}
        </header>
      ) : null}
      <div className="px-6 py-5">{children}</div>
    </Tag>
  );
}

/** A quiet marker for simulated participants. Always present where they appear. */
export function SimulatedTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-xs border border-dashed border-line-strong px-1.5 py-px text-[11px] font-medium leading-4 text-faint ${className}`}
      title="A simulated colleague. Replies are seeded for this demonstration."
    >
      simulated
    </span>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[12px] tnum ${className}`}>{children}</span>;
}

/** Definition-style label and value, used for the record and the patient header. */
export function LabelValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Microlabel>{label}</Microlabel>
      <div className="text-[14px] leading-6">{children}</div>
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-[14px] leading-6 text-muted">{children}</p>;
}

/** Page title block: eyebrow, title, intro. */
export function PageHeader({
  eyebrow,
  title,
  intro,
  aside,
}: {
  eyebrow?: string;
  title: ReactNode;
  intro?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-line pb-6">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="font-display text-[28px] leading-[1.1] text-ink sm:text-[32px]" style={{ textWrap: "balance" }}>
          {title}
        </h1>
        {intro ? <p className="mt-2 max-w-[540px] text-[15px] leading-relaxed text-secondary">{intro}</p> : null}
      </div>
      {aside ? <div className="text-[12px] leading-5 text-faint">{aside}</div> : null}
    </header>
  );
}
