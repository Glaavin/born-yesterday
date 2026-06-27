import { NextResponse, type NextRequest } from "next/server";
import { normalizeDomain } from "@/lib/domain";

/**
 * The landing search submits here (GET ?url=…). We normalize and redirect to the
 * clean /r/<domain>; an invalid input redirects to /r/<raw> so the report page
 * renders the error state. No data work here.
 */
export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("url") ?? "";
  const domain = normalizeDomain(raw);
  const target = `/r/${encodeURIComponent(domain ?? (raw.trim() || "invalid"))}`;
  return NextResponse.redirect(new URL(target, req.url));
}
