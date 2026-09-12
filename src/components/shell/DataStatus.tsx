import { getPatients } from "@/lib/data/source";
import { formatDateTime } from "@/lib/format";

/** A visible but undramatic indicator of where the data came from. */
export async function DataStatus() {
  const { degraded, meta } = await getPatients();
  // Quiet by design: nothing is shown unless the live simulator failed and the cache is in use.
  if (!degraded) return null;
  const label = "using cached data";
  return (
    <span
      className="inline-flex items-center gap-2 font-mono text-[0.75rem]"
      title={
        degraded
          ? "The simulator did not answer. Showing the committed snapshot."
          : `Snapshot taken ${formatDateTime(meta.takenAt)}`
      }
    >
      <span
        aria-hidden="true"
        className={`inline-block h-1.5 w-1.5 rounded-full ${degraded ? "bg-line-strong" : "bg-affirm"}`}
      />
      {label}
    </span>
  );
}
