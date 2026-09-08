import { isOperatorRequest } from "../../../serve/quota";
import { PANEL_HEADER } from "./constants";

/**
 * Source-panel presence gate — Story 26 (W8). LAUNCH-GATED: this whole
 * `src/app/dev/source-panel/` tree is a diagnostic surface that MUST be removed
 * before public launch (see docs/ops-tasks.md → launch gates).
 *
 * SECURITY POSTURE — reuses Story 23.1's SINGLE operator path
 * (`BY_OPERATOR_KEY` + `isOperatorRequest`) rather than inventing a second
 * secret. One operator path is easier to reason about and, more to the point,
 * easier to CLOSE: unset one env var and every operator capability — quota
 * bypass and this panel — goes dark together.
 *
 * FAILS CLOSED, two layers:
 *   1. `panelEnabled()`  — is the route present at all? Env key unset/empty →
 *      the page and the API 404 (route "absent", the roadmap's requirement).
 *      This is the production default, because `BY_OPERATOR_KEY` is unset in
 *      production.
 *   2. `panelAuthorized()` — does THIS request carry the key? Every data read
 *      and every probe requires it via the `x-by-operator` header, so even in a
 *      window where the env key IS set, an unauthenticated GET to the API 404s.
 *      The page shell itself carries no data and no secret; it is inert until
 *      the operator types the key in, which the client attaches per request and
 *      never puts in a URL.
 */
export { PANEL_HEADER };

/** Route-existence gate: is the panel enabled in this environment at all? */
export function panelEnabled(env: string | undefined = process.env.BY_OPERATOR_KEY): boolean {
  return typeof env === "string" && env.length > 0;
}

/** Per-request gate: does this request present the operator key? Fails closed. */
export function panelAuthorized(
  headerValue: string | null | undefined,
  env: string | undefined = process.env.BY_OPERATOR_KEY,
): boolean {
  return isOperatorRequest(headerValue, env);
}
