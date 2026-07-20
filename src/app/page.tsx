import HeroSearch from "@/components/HeroSearch";
import HatchMethodology from "@/components/HatchMethodology";
import RecentSearches from "@/components/RecentSearches";
import { countReports, getRecentReports } from "@/db/queries";
import { recentReports } from "@/serve/recent";

// Reads real counts/feed at request time — rendered dynamically (no build-time DB).
export const dynamic = "force-dynamic";

export default async function Home() {
  // Resilient: if the DB is briefly unreachable the landing still renders.
  const [count, recent] = await Promise.all([
    countReports().catch(() => 0),
    recentReports(8, { getRecentReports }).catch(() => []),
  ]);

  return (
    <div className="flex flex-col items-center gap-8 py-4">
      <p className="text-center font-heading text-xl italic text-wordmark-cream">
        Checking the receipts before you check out.
      </p>

      <HeroSearch />
      <HatchMethodology count={count} />
      <RecentSearches items={recent} />
    </div>
  );
}
