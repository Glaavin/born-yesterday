import Mascot from "./Mascot";
import { REPORT_STATES, type ReportStateKey } from "./report-state";

/**
 * SkepticismPill — the worded status pill (design-system.md §4). Server Component.
 * Renders the verdict LABEL in the state colour (meaning is carried in WORDS, so
 * it's never colour-alone) with a subtle same-colour border + tint, and the
 * <Mascot> at the matching result state beside it. The mascot is aria-hidden and
 * its interim art is identical across states — expected; the pill differentiates.
 */
export default function SkepticismPill({ state }: { state: ReportStateKey }) {
  const s = REPORT_STATES[state];
  return (
    <div className="flex items-center gap-4">
      <span
        className={`inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-semibold ${s.pill}`}
      >
        {s.label}
      </span>
      <span className="w-14 shrink-0">
        <Mascot state={s.mascot} />
      </span>
    </div>
  );
}
