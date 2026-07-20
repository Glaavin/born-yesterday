import Wordmark from "@/components/Wordmark";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Hero: top nav + wordmark over the surface gradient */}
      <section className="bg-linear-to-b from-background to-surface-2 px-6 pb-16 pt-6 sm:pb-20">
        <nav className="flex justify-end gap-4 font-serif text-xs font-bold tracking-widest text-brand-1 uppercase sm:text-sm">
          <a href="#" className="transition-opacity hover:opacity-80">
            Support Glaavin
          </a>
          <span aria-hidden="true" className="text-brand-1/50">
            |
          </span>
          <a href="#" className="transition-opacity hover:opacity-80">
            Report an Issue
          </a>
        </nav>

        <div className="mt-12 flex justify-center sm:mt-16">
          <Wordmark />
        </div>
      </section>

      {/* Report results */}
      <section className="mx-auto w-full max-w-4xl px-6 py-12">
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-1 font-serif text-lg font-bold tracking-wide uppercase sm:text-xl">
          <a href="#" className="text-positive-2">
            My Report Results
          </a>
          <span aria-hidden="true" className="text-tech-2/60">
            |
          </span>
          <a href="#" className="text-tech-2 transition-opacity hover:opacity-80">
            Recent Searches
          </a>
          <span aria-hidden="true" className="text-tech-2/60">
            |
          </span>
          <a href="#" className="text-tech-2 transition-opacity hover:opacity-80">
            Search Again
          </a>
        </nav>

        <p className="mt-6 text-sm text-muted">
          12 Data Sources Found in 2.1 seconds
        </p>

        <article className="mt-4 rounded-lg border border-brand-1/70 bg-positive-1/5 p-8">
          <header className="flex flex-wrap items-center gap-4">
            <h2 className="font-serif text-2xl font-bold tracking-wide text-brand-1 uppercase sm:text-3xl">
              Digital-Pyramid-Scheme.ai
            </h2>
            <span className="rounded-full bg-flag-1 px-5 py-2 text-sm font-medium text-white">
              Red Flag Found
            </span>
          </header>

          <div className="mt-10 space-y-2 text-lg">
            <p className="font-semibold text-foreground">
              Born Yesterday Report Goes Here
            </p>
            <p className="text-flag-2">Flagged Data Highlighted in This Color</p>
            <p className="text-positive-1">
              Positive Findings Highlighted in This Color
            </p>
          </div>

          <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 font-serif text-sm font-bold tracking-wide text-brand-1 uppercase">
            <a href="#" className="transition-opacity hover:opacity-80">
              Search Again &gt;
            </a>
            <div className="flex gap-3">
              <a href="#" className="transition-opacity hover:opacity-80">
                Copy to Clipboard
              </a>
              <span aria-hidden="true" className="text-brand-1/50">
                |
              </span>
              <a href="#" className="transition-opacity hover:opacity-80">
                Share Tools
              </a>
            </div>
          </footer>
        </article>

        <p className="mt-6 text-center text-sm text-muted">
          Legal disclaimer goes here and says something about this is just
          guidance.
        </p>
      </section>
    </main>
  );
}
