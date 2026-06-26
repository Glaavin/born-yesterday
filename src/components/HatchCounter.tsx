/**
 * HatchCounter — playful chrome (design-system.md §2). The count is a mock prop
 * until the data layer (Sprint 1.1) provides the real number. Server Component.
 */
export default function HatchCounter({ count }: { count: number }) {
  return (
    <p className="text-center text-base text-ink">
      Something&rsquo;s hatching!{" "}
      <span className="font-semibold text-accent-gold">
        {count.toLocaleString()}
      </span>{" "}
      reports hatched so far.
    </p>
  );
}
