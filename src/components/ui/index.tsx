import Link from "next/link";
import type { ReactNode } from "react";
import type { ReviewTier, WorklistState } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";

/** Shared primitives. Quiet by default; emphasis is carried by weight and position. */

type ButtonVariant = "primary" | "quiet" | "refuse" | "link";

const BUTTON: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-primary-ink border border-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed",
  quiet: "bg-surface text-ink border border-line hover:border-line-strong disabled:opacity-50 disabled:cursor-not-allowed",
  refuse: "bg-surface text-refuse border border-refuse hover:bg-refuse-soft disabled:opacity-50",
  link: "text-primary underline-offset-4 hover:underline border border-transparent px-0",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-sm px-3.5 py-2 text-[0.9375rem] font-medium leading-tight min-h-11 transition-colors";

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
      ? "font-semibold text-ink"
      : tier === "review this month"
        ? "font-medium text-ink"
        : "font-normal text-muted";
  return <span className={`text-[0.9375rem] ${weight} ${className}`}>{tier}</span>;
}

const STATE_TEXT: Record<WorklistState, string> = {
  flagged: "flagged",
  "team assembled": "team assembled",
  coordinating: "coordinating",
  "meeting held": "meeting held",
  "record signed": "record signed",
  shared: "shared",
  paused: "paused",
};

/** Worklist state. Signed and shared are the only states that earn the affirm colour. */
export function StateBadge({ state, className = "" }: { state: WorklistState; className?: string }) {
  const tone =
    state === "record signed" || state === "shared"
      ? "bg-affirm-soft text-affirm border-affirm/40"
      : state === "paused"
        ? "bg-surface-2 text-muted border-line"
        : "bg-surface text-ink border-line";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.8125rem] leading-5 whitespace-nowrap ${tone} ${className}`}
    >
      {STATE_TEXT[state]}
    </span>
  );
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
    <p className={`font-mono text-[0.75rem] leading-5 text-muted ${className}`}>
      recorded by {recordedBy} on {formatDateTime(recordedAt)} from {source}
    </p>
  );
}

type NoticeKind = "info" | "refuse" | "affirm" | "quiet";

const NOTICE: Record<NoticeKind, string> = {
  info: "border-primary/40 bg-primary-soft text-ink",
  refuse: "border-refuse bg-refuse-soft text-ink",
  affirm: "border-affirm/50 bg-affirm-soft text-ink",
  quiet: "border-line bg-surface-2 text-muted",
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
    <div className={`rounded-sm border px-4 py-3 text-[0.9375rem] leading-6 ${NOTICE[kind]} ${className}`} role={role}>
      {title ? <p className={`font-medium ${kind === "refuse" ? "text-refuse" : ""}`}>{title}</p> : null}
      <div>{children}</div>
    </div>
  );
}

export function Panel({
  title,
  aside,
  children,
  className = "",
  as: Tag = "section",
}: {
  title?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  as?: "section" | "div" | "aside";
}) {
  return (
    <Tag className={`bg-surface border border-line rounded-sm ${className}`}>
      {title ? (
        <header className="flex items-baseline justify-between gap-4 border-b border-line px-5 py-3">
          <h2 className="font-serif text-[1.125rem] font-medium leading-tight">{title}</h2>
          {aside ? <div className="text-[0.8125rem] text-muted">{aside}</div> : null}
        </header>
      ) : null}
      <div className="px-5 py-4">{children}</div>
    </Tag>
  );
}

/** A quiet marker for simulated participants. Always present where they appear. */
export function SimulatedTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-sm border border-dashed border-line-strong px-1.5 py-px font-mono text-[0.6875rem] leading-4 text-muted ${className}`}
      title="A simulated colleague. Replies are seeded for this demonstration."
    >
      simulated
    </span>
  );
}

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-[0.8125rem] ${className}`}>{children}</span>;
}

/** Definition-style label and value, used for the record and the patient header. */
export function LabelValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <Microlabel>{label}</Microlabel>
      <div className="text-[0.9375rem] leading-6">{children}</div>
    </div>
  );
}

export function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="text-[0.9375rem] leading-6 text-muted italic">{children}</p>;
}
