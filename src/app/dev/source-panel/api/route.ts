// LAUNCH-GATED DIAGNOSTIC — Story 26 (W8). This route and its parent
// `src/app/dev/source-panel/` tree MUST be removed before public launch (see
// docs/ops-tasks.md → launch gates). It exists only to make source diagnosis
// routine; it is read-only, unlinked, and absent unless BY_OPERATOR_KEY is set.
import { NextResponse, type NextRequest } from "next/server";
import { panelAuthorized, PANEL_HEADER } from "../gate";
import { defaultRunner } from "../queries";
import { handlePanelAction, PANEL_FETCHER } from "../handler";

export const dynamic = "force-dynamic";

/**
 * PROBE + HISTORY endpoint. Every probe fired here goes through `cachedFetch` —
 * the deps below are the ONLY wiring, and the fetcher is the real harness
 * instance (asserted by a test). Fails closed: without the operator key the
 * route is indistinguishable from one that does not exist (bare 404, no body
 * that hints at what it is).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!panelAuthorized(req.headers.get(PANEL_HEADER))) {
    return new NextResponse("Not found", { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ kind: "error", error: "invalid JSON body" }, { status: 400 });
  }

  const result = await handlePanelAction(body, { run: defaultRunner(), fetcher: PANEL_FETCHER });
  const status = result.kind === "error" ? 400 : 200;
  return NextResponse.json(result, { status });
}
