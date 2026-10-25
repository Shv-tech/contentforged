import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Email preferences | Forge',
  robots: { index: false, follow: false },
};

/**
 * Where unsubscribe links land. A link carrying only a token is sent to the
 * API, which unsubscribes immediately and redirects back here with the
 * result, so one click is always enough.
 */
export default function UnsubscribePage({ searchParams }: { searchParams: { token?: string; status?: string } }) {
  if (searchParams.token && !searchParams.status) {
    redirect(`/api/email/unsubscribe?token=${encodeURIComponent(searchParams.token)}`);
  }

  const done = searchParams.status === 'done';

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-5 font-sans text-white">
      <div className="max-w-[460px] text-center">
        <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/40">Forge</p>
        <h1 className="mt-4 text-[32px] font-semibold leading-tight tracking-[-0.03em]">{done ? 'You are unsubscribed.' : 'That link did not work.'}</h1>
        <p className="mt-4 text-[16px] leading-relaxed text-white/55">
          {done
            ? 'You will not get product or marketing email from Forge any more. Receipts, security notices and the posts you schedule still arrive.'
            : 'The link may be old or incomplete. You can manage email from your account settings.'}
        </p>
        <Link href="/account" className="mt-8 inline-flex h-11 items-center rounded-full bg-white px-6 text-[15px] font-medium text-black hover:bg-white/85">
          Email settings
        </Link>
      </div>
    </main>
  );
}
