// app/not-found.tsx
import Link from 'next/link';
import Image from 'next/image';


export default function NotFound() {
  return (
    <main className="relative flex min-h-screen items-end overflow-hidden bg-black font-sans text-white">
      <Image src="/assets/art/slag.jpg" alt="" fill priority sizes="100vw" className="object-cover opacity-80" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      <div className="relative mx-auto w-full max-w-[1240px] px-6 pb-20 sm:px-8 sm:pb-28">
        <p className="text-[15px] text-white/60">404</p>
        <h1 className="mt-3 max-w-[760px] text-[48px] font-semibold leading-[0.98] tracking-[-0.05em] sm:text-[88px]">
          This page has gone cold.
        </h1>
        <p className="mt-6 max-w-[480px] text-[18px] leading-[1.55] text-white/65">
          The link may be old or mistyped. Everything else is still where you left it.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/" className="rounded-full bg-white px-6 py-3 text-[15px] font-medium text-black transition hover:bg-white/85">Go to the home page</Link>
          <Link href="/dashboard" className="rounded-full border border-white/20 px-6 py-3 text-[15px] font-medium text-white transition hover:bg-white/[0.05]">Open your workspace</Link>
        </div>
      </div>
    </main>
  );
}
