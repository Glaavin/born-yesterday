import WordmarkMascot from "@/components/WordmarkMascot";

export default function Home() {
  // The wordmark (page <h1>) + mascot, seated in the shell's <main>.
  // Story 1.2.6 builds the rest of the landing around it.
  return (
    <div className="py-10">
      <WordmarkMascot state="idle" />
    </div>
  );
}
