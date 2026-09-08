// LAUNCH-GATED DIAGNOSTIC — Story 26 (W8). Remove this whole
// `src/app/dev/source-panel/` tree before public launch (docs/ops-tasks.md →
// launch gates). Absent unless BY_OPERATOR_KEY is set; the shell below carries
// no data and no secret until the operator types the key in.
import { notFound } from "next/navigation";
import { HOST_BUDGETS, HOST_RATES } from "../../../lib/cached-fetch";
import { panelEnabled } from "./gate";
import { PROBE_MENU } from "./handler";
import Panel, { type HostLimit } from "./Panel";

export const dynamic = "force-dynamic";

/**
 * The CONFIGURED per-host limits, read straight off the harness constants and
 * passed down as plain data. This is the "budget/rate state per host" §A asks
 * for, to the extent it is cheaply readable: the configured ceilings ARE
 * exported and importable; the LIVE bucket state (tokens remaining, cooldown
 * until) is module-private in cached-fetch.ts with no accessor, and exposing it
 * would mean editing that file — which this story forbids. So the panel shows
 * the ceilings statically and surfaces the live refusal (`rate-limited` /
 * `budget-exhausted`) through the probe outcome instead. (Reported as an item.)
 */
function configuredLimits(): HostLimit[] {
  const hosts = new Set([...Object.keys(HOST_BUDGETS), ...Object.keys(HOST_RATES)]);
  return [...hosts].sort().map((host) => {
    const budget = HOST_BUDGETS[host];
    const rate = HOST_RATES[host];
    return {
      host,
      budgetMax: budget?.max ?? null,
      budgetBasis: budget?.basis ?? null,
      ratePerMin: rate?.ratePerMin ?? null,
      burst: rate?.burst ?? null,
      rateBasis: rate?.basis ?? null,
    };
  });
}

export default function SourcePanelPage() {
  if (!panelEnabled()) notFound();
  return <Panel probes={PROBE_MENU} limits={configuredLimits()} />;
}
