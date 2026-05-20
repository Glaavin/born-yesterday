export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-2xl text-center">
        <div className="mb-3 text-2xl" aria-hidden="true">
          🚩
        </div>

        <h1 className="font-serif text-6xl leading-none font-black tracking-tight text-slate-50 sm:text-7xl">
          Born Yesterday
          <span className="ml-1 align-super text-lg font-bold text-emerald-400 sm:text-xl">
            .tech
          </span>
        </h1>

        <div className="mx-auto my-8 h-px w-16 bg-emerald-400/60" />

        <p className="font-serif text-xl text-slate-300 italic sm:text-2xl">
          Checking the receipts before you check out.
        </p>

        <p className="mx-auto mt-10 max-w-xl text-base leading-relaxed text-slate-400 sm:text-lg">
          We generate Trust Reports for SaaS and digital services using public
          data — domain age, marketing history, ownership signals — so you can
          tell established tools from week-old AI pivots before you put your
          credit card in.
        </p>

        <footer className="mt-20 text-sm text-slate-500">
          Coming soon. Built with skepticism.
        </footer>
      </div>
    </main>
  );
}
