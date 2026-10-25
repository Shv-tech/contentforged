'use client';

/**
 * The marketing site's navigation bar and footer, shared by the landing page
 * and the public pages (the free audit, shared grade cards, methodology).
 */

import Image from 'next/image';
import Link from 'next/link';
import { Instagram, Linkedin, Twitter, Youtube } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { focusRing, pillWhite } from './landing/forge-art';

const FOOTER_COLUMNS = [
  {
    heading: 'Product',
    links: [
      { label: 'Try the grader', href: '/#try' },
      { label: 'Free X audit', href: '/audit' },
      { label: 'Tools', href: '/#tools' },
      { label: 'Methodology', href: '/methodology' },
      { label: 'Pricing', href: '/#pricing' },
    ],
  },
  {
    heading: 'For teams',
    links: [
      { label: 'Solo creators', href: '/teams/solo-creators' },
      { label: 'Ghostwriters', href: '/teams/ghostwriters' },
      { label: 'Founders', href: '/teams/founders' },
      { label: 'Enterprise', href: '/teams/enterprise' },
    ],
  },
  {
    heading: 'Company',
    links: [
      { label: 'Blog', href: '/blog' },
      { label: 'SHV Groups', href: 'https://shvgroups.com' },
    ],
  },
  {
    heading: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Security', href: '/security' },
      { label: 'Support', href: 'mailto:support@forgeyourway.dev' },
    ],
  },
];

const SOCIAL = [
  { label: 'Forge on X', href: 'https://x.com/forgeyourway', Icon: Twitter },
  { label: 'Forge on LinkedIn', href: 'https://www.linkedin.com/company/forgeyourway', Icon: Linkedin },
  { label: 'Forge on Instagram', href: 'https://www.instagram.com/forgedtheway', Icon: Instagram },
  { label: 'Forge on YouTube', href: 'https://www.youtube.com/@Forgedyourway', Icon: Youtube },
];

export function Wordmark() {
  return (
    <Link href="/" className={`flex items-center gap-2.5 rounded-full pr-2 ${focusRing}`}>
      <Image src="/logos/forge.svg" alt="" width={26} height={26} priority />
      <span className="text-[14px] font-semibold tracking-[0.18em] text-white">FORGE</span>
    </Link>
  );
}

/** The floating pill navigation used on public pages. */
export function SiteNav({ links = [] }: { links?: Array<{ label: string; href: string }> }) {
  const { user } = useAppStore();
  // The signed-in state comes from persisted client state; render the
  // signed-out actions on the server and swap after mount to avoid a
  // hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const signedIn = mounted && Boolean(user);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
      <nav
        aria-label="Main"
        className="pointer-events-auto flex w-full max-w-[920px] items-center gap-2 rounded-full border border-white/[0.08] bg-[#0B0B0B]/75 py-1.5 pl-3 pr-1.5 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] backdrop-blur-xl"
      >
        <div className="mr-auto">
          <Wordmark />
        </div>
        <div className="hidden items-center lg:flex">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className={`rounded-full px-4 py-2 text-[14px] text-white/60 transition-colors hover:text-white ${focusRing}`}
            >
              {link.label}
            </Link>
          ))}
        </div>
        {signedIn ? (
          <Link href="/dashboard" className={`${pillWhite} !px-5 !py-2 !text-[14px]`}>
            Workspace
          </Link>
        ) : (
          <>
            <Link href="/login" className={`rounded-full px-3 py-2 text-[14px] text-white/60 transition hover:text-white sm:px-4 ${focusRing}`}>
              Log in
            </Link>
            <Link href="/signup" className={`${pillWhite} !px-5 !py-2 !text-[14px]`}>
              Start free
            </Link>
          </>
        )}
      </nav>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mx-auto max-w-[1240px] px-5 pb-12 pt-28 sm:px-8">
      <div className="grid grid-cols-2 gap-x-10 gap-y-14 md:grid-cols-4 lg:grid-cols-6">
        <div className="col-span-2">
          <Link href="/" className={`inline-flex items-center gap-2.5 rounded-full ${focusRing}`}>
            <Image src="/logos/forge.svg" alt="" width={28} height={28} />
            <span className="text-[14px] font-semibold tracking-[0.18em] text-white">FORGE</span>
          </Link>
          <p className="mt-5 max-w-[260px] text-[15px] leading-[1.6] text-white/45">Content tools that learn your voice. Built by SHV Groups.</p>
        </div>
        {FOOTER_COLUMNS.map((col) => (
          <div key={col.heading}>
            <div className="text-[14px] font-medium text-white">{col.heading}</div>
            <ul className="mt-5 space-y-3.5">
              {col.links.map((link) => (
                <li key={link.label}>
                  <Link href={link.href} className={`rounded-sm text-[14px] text-white/45 transition-colors hover:text-white ${focusRing}`}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-20 flex flex-col items-start justify-between gap-6 border-t border-white/[0.07] pt-8 sm:flex-row sm:items-center">
        <span className="text-[13px] text-white/35">&copy; {new Date().getFullYear()} SHV Groups Pvt Ltd</span>
        <div className="flex items-center gap-1">
          {SOCIAL.map(({ label, href, Icon }) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
              className={`rounded-full p-2.5 text-white/40 transition hover:bg-white/[0.05] hover:text-white ${focusRing}`}
            >
              <Icon className="h-4 w-4" />
            </a>
          ))}
        </div>
      </div>
    </footer>
  );
}
