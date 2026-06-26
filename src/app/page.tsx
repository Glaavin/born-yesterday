import WordmarkMascot from "@/components/WordmarkMascot";
import HeroSearch from "@/components/HeroSearch";
import HatchCounter from "@/components/HatchCounter";
import MethodologyCard from "@/components/MethodologyCard";

// Mock count until the data layer (Sprint 1.1) provides the real number.
const REPORTS_HATCHED = 1247;

export default function Home() {
  return (
    <div className="flex flex-col items-center gap-8 py-4">
      <WordmarkMascot state="idle" />

      <p className="text-center font-heading text-2xl italic text-wordmark-cream">
        Checking the receipts before you check out.
      </p>

      <HeroSearch />
      <HatchCounter count={REPORTS_HATCHED} />
      <MethodologyCard />
    </div>
  );
}
