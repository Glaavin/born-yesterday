import AdScriptStub from "./AdScriptStub";

/**
 * AdSlot — built now, served later (design-system.md §5). Server Component.
 *
 * A fixed-size, in-flow, labeled ad container that reserves its dimensions
 * whether or not an ad ever loads (zero CLS). Ads are OFF by default in dev and
 * at launch: the placeholder is shown and the prod script stub is gated off.
 *
 * NEVER-list by construction (§5): this renders a plain in-flow box only — no
 * position:fixed/sticky, no portal/overlay, no full-screen, no autoplay. There
 * is no code path that could make a slot sticky, an interstitial, a pop-up, or
 * a native-disguised unit.
 */

// Map known IAB sizes to fixed standard-scale classes (no arbitrary values).
// 160×600 wide skyscraper → w-40 (160px) × h-150 (600px).
const SIZES = {
  "160x600": "w-40 h-150",
} as const;

export type AdSize = keyof typeof SIZES;

// Gated off by default. Only an explicit NEXT_PUBLIC_ADS_ENABLED="true" flips it.
const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === "true";

export default function AdSlot({
  id,
  size = "160x600",
}: {
  id: string;
  size?: AdSize;
}) {
  return (
    <div
      data-ad-slot={id}
      data-ad-size={size}
      className={`relative flex ${SIZES[size]} items-center justify-center overflow-hidden rounded-md bg-black/30`}
    >
      {/* Always-present label (§5). Lives inside the fixed box, so it never
          changes the reserved dimensions. "FUTURE" sits above "Advertisement"
          to read as reserved-but-empty inventory. */}
      <div className="flex flex-col items-center gap-0.5 text-center text-xs uppercase tracking-widest text-label-teal/70">
        <span>Future</span>
        <span>Advertisement</span>
      </div>

      {/* Default OFF → placeholder only, no client JS, no network. When the flag
          is explicitly enabled, the gated (still inert) script stub mounts. */}
      {ADS_ENABLED ? <AdScriptStub id={id} size={size} /> : null}
    </div>
  );
}
