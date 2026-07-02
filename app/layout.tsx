// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';

// @ts-ignore: allow side-effect CSS import in Next.js app directory
import './globals.css';
// @ts-ignore: allow side-effect CSS import in Next.js app directory
import 'katex/dist/katex.min.css';

import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/components/AuthProvider';

const inter = Inter({ subsets: ['latin'] });

const BASE_URL = 'https://forge.theutopianspace.com';

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
    default: 'Forge — AI Content Strategy Platform for Creators & Agencies',
    template: '%s | Forge',
  },
  description:
    'ContentForge is the AI content operating system that remembers your Brand DNA, scores every post before you publish, plans your LinkedIn and Instagram calendar 90 days out, and gets measurably smarter every session. 26 precision tools. Used by 10,000+ creators.',

  keywords: [
    'AI content tool', 'AI content strategy', 'LinkedIn AI writer',
    'Instagram content AI', 'Twitter X content tool', 'brand DNA AI',
    'content calendar AI', 'AI ghostwriter tool', 'viral hook generator',
    'stop scroll grader', 'AI ebook writer', 'content performance intelligence',
    'AI calendar agent', 'personal brand AI', 'LinkedIn growth tool',
    'content marketing platform', 'AI for creators', 'content operating system',
    'best AI for LinkedIn', 'AI content planner', 'social media AI tool',
    'content repurposing AI', 'ghostwriter AI tool', 'agency content AI',
    'AI hook writer', 'ContentForge'
  ],

  authors: [{ name: 'Forge', url: BASE_URL }],
  creator: 'Forge by SHV Groups',
  publisher: 'SHV Groups Pvt Ltd',

  alternates: {
    canonical: '/',
    languages: {
      'en-US': '/en-US',
      'en-IN': '/en-IN',
    },
  },

  openGraph: {
    type: 'website',
    url: BASE_URL,
    siteName: 'Forge',
    title: 'Forge — Your AI Validates. Forge Fixes.',
    description:
      'The first content AI that remembers your Brand DNA, tells you when your hook is weak before you publish, and plans your next 90 days of content in one conversation. 26 tools. No fluff.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'ContentForge — The Content Operating System',
        type: 'image/png',
      },
    ],
    locale: 'en_US',
  },

  twitter: {
    card: 'summary_large_image',
    site: '@forge',
    creator: '@forge',
    title: 'ContentForge — The Content OS for Serious Creators',
    description:
      'Brand DNA memory. Calendar agent. Stop-Scroll Grader. 26 precision tools. The AI that tells you the truth about your content.',
    images: ['/og-image.png'],
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
    title: 'ContentForge',
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
      <body className={inter.className}>
        
        {/* AuthProvider guarantees the Supabase session is hydrated instantly */}
        <AuthProvider>
          {children}
        </AuthProvider>
        
        {/* Upgraded Enterprise Toaster */}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#111827', /* Tailwind gray-900 */
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 500,
              borderRadius: '10px',
              padding: '12px 16px',
              boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
            },
            success: {
              iconTheme: {
                primary: '#22c55e', /* Tailwind green-500 */
                secondary: '#ffffff',
              },
            },
            error: {
              iconTheme: {
                primary: '#ef4444', /* Tailwind red-500 */
                secondary: '#ffffff',
              },
            },
          }}
        />
      </body>
    </html>
  );
}