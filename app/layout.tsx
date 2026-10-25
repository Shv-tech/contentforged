// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { rootMetadata } from '@/lib/seo';

// @ts-ignore: allow side-effect CSS import in Next.js app directory
import './globals.css';
// @ts-ignore: allow side-effect CSS import in Next.js app directory
import 'katex/dist/katex.min.css';

import { Toaster } from 'react-hot-toast';
import { Analytics } from '@vercel/analytics/next';
import { AuthProvider } from '@/components/AuthProvider';
import StructuredData from '@/components/StructuredData';

// One typeface across the marketing site and the app, exposed as a CSS
// variable so Tailwind's font-sans resolves to it everywhere. Instrument
// Sans (SIL Open Font License, app/fonts/OFL.txt) is self-hosted as a
// variable font: builds never depend on reaching Google Fonts, and pages
// make no third-party font request.
const sans = localFont({
  src: './fonts/instrument-sans-latin-wght-normal.woff2',
  weight: '400 700',
  style: 'normal',
  variable: '--font-sans',
  display: 'swap',
});

const BASE_URL = 'https://forgeyourway.dev';

// ── Viewport ──────────────────────────────────────────────────────────────
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#000000',
};

// ── Advanced SEO Metadata ─────────────────────────────────────────────────
export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),

  title: {
    default: 'Forge: AI content that sounds like you',
    template: '%s | Forge',
  },
  description:
    'Forge learns your voice from your own posts, writes in it, grades every draft before you post, and learns from what actually performs. Drafts, scheduling and results for X, LinkedIn, Threads and Bluesky.',

  keywords: [
    'AI content tool', 'AI content strategy', 'LinkedIn AI writer',
    'Instagram content AI', 'Twitter X content tool', 'brand DNA AI',
    'content calendar AI', 'AI ghostwriter tool', 'viral hook generator',
    'stop scroll grader', 'AI ebook writer', 'content performance intelligence',
    'AI calendar agent', 'personal brand AI', 'LinkedIn growth tool',
    'content marketing platform', 'AI for creators', 'content operating system',
    'best AI for LinkedIn', 'AI content planner', 'social media AI tool',
    'content repurposing AI', 'ghostwriter AI tool', 'agency content AI',
    'AI hook writer', 'Forge'
  ],

  authors: [{ name: 'Forge', url: BASE_URL }],
  creator: 'Forge by SHV Groups',
  publisher: 'SHV Groups Pvt Ltd',

  // Single-locale site: canonical only. Locale alternates pointed at
  // /en-US and /en-IN, which do not exist, and Search Console flags that.
  alternates: {
    canonical: '/',
  },

  openGraph: {
    type: 'website',
    url: BASE_URL,
    siteName: 'Forge',
    title: 'Forge: AI content that sounds like you',
    description:
      'Forge learns your voice, writes in it, and tells you when a post is not ready yet. Then it learns from what you actually post.',
    images: [
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Forge: AI content that sounds like you',
        type: 'image/jpeg',
      },
    ],
    locale: 'en_US',
  },

  twitter: {
    card: 'summary_large_image',
    site: '@forgeyourway',
    creator: '@forgeyourway',
    title: 'Forge: AI content that sounds like you',
    description: 'Learns your voice, grades every draft before you post, and learns from your results.',
    images: ['/og-image.jpg'],
  },

  robots: {
    index: true,
    follow: true,
    nocache: false,
    googleBot: {
      index: true,
      follow: true,
      noimageindex: false,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  applicationName: 'Forge',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Forge',
  },

  category: 'technology',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Preconnect to speed up font + API calls */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Favicon set */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="manifest" href="/manifest.json" />
      </head>
      <body className={`${sans.className} ${sans.variable}`}>

        {/* Site-wide JSON-LD for SEO + AI answer engines (ChatGPT, Claude,
            Gemini/AI Overviews, Perplexity) — see components/StructuredData.tsx */}
        <StructuredData />

        {/* AuthProvider guarantees the Supabase session is hydrated instantly */}
        <AuthProvider>
          {children}
        </AuthProvider>
        
        {/* Toasts match the app: a dark pill, quiet icons. Upsells use the
            neutral style, never the error style. */}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#141414',
              color: '#ffffff',
              border: '1px solid rgba(255,255,255,0.08)',
              fontSize: '14px',
              fontWeight: 500,
              borderRadius: '999px',
              padding: '10px 16px',
              boxShadow: '0 20px 50px -20px rgba(0,0,0,0.9)',
            },
            success: { iconTheme: { primary: '#ffffff', secondary: '#141414' } },
            error: { iconTheme: { primary: '#ff8a65', secondary: '#141414' } },
          }}
        />

        {/* Vercel Web Analytics — page views + route changes */}
        <Analytics />
      </body>
    </html>
  );
}