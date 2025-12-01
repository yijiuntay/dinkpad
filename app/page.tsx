import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden -z-10">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px]" />
      </div>

      <main className="flex flex-col items-center text-center max-w-2xl mx-auto space-y-8 z-10">
        <div className="space-y-4">
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter bg-gradient-to-br from-white via-slate-200 to-slate-400 bg-clip-text text-transparent drop-shadow-sm">
            DinkPad
          </h1>
          <p className="text-xl md:text-2xl text-slate-400 font-light tracking-wide">
            The Ultimate Pickleball Session Manager
          </p>
        </div>

        <div className="glass-panel p-8 rounded-3xl shadow-2xl border border-white/5 max-w-md w-full mx-auto transform hover:scale-105 transition-all duration-300">
          <p className="text-slate-300 mb-6">
            Automate your open play. Fair rotations, optimized matchups, and zero hassle.
          </p>
          
          <Link 
            href="/setup"
            className="group relative inline-flex items-center justify-center w-full px-8 py-4 font-bold text-lg text-primary-foreground transition-all duration-200 bg-primary rounded-xl hover:bg-lime-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
          >
            <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black"></span>
            <span className="relative flex items-center gap-2">
              Start New Session
              <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </Link>
        </div>
      </main>

      <footer className="absolute bottom-6 text-slate-500 text-sm">
        &copy; {new Date().getFullYear()} DinkPad. Built for the court.
      </footer>
    </div>
  );
}
