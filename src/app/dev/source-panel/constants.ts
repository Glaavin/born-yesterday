/**
 * Client-safe constants for the source panel — Story 26 (W8). This module
 * imports NOTHING server-only, so the client `Panel.tsx` can share the header
 * contract with the server `gate.ts` without dragging `node:crypto` (via
 * serve/quota) into the browser bundle.
 */

/** The request header carrying the operator key. */
export const PANEL_HEADER = "x-by-operator";
