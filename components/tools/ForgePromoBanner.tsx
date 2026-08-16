import Link from "next/link";

export default function ForgePromoBanner({ toolPlatform }: { toolPlatform: string }) {
  return (
    <div className="mt-12 flex flex-col items-center gap-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-6 text-center sm:flex-row sm:justify-between sm:text-left shadow-sm">
      <div>
        <p className="text-base font-semibold text-neutral-900">
          Like this? Forge writes, schedules, and posts your {toolPlatform} content — automatically.
        </p>
        <p className="mt-1.5 text-sm text-neutral-500">
          No more copy-pasting one post at a time. Free plan available.
        </p>
      </div>
      <Link
        href="https://forgeyourway.dev/signup?ref=tools"
        className="shrink-0 rounded-xl bg-neutral-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2"
      >
        Try Forge Free
      </Link>
    </div>
  );
}