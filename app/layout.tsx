import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
  title: 'ContentForge — Turn One Piece of Content Into 30+ Posts',
  description:
    'Paste a blog, video, or raw text. Get LinkedIn posts, tweets, newsletters, threads, and Instagram captions — instantly. Bring your own API key. Zero markup.',
  openGraph: {
    title: 'ContentForge — Turn One Piece of Content Into 30+ Posts',
    description:
      'The AI content repurposing engine for creators who ship daily. Paste once, post everywhere.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ContentForge',
    description: 'One input. 30+ platform-ready posts. Instantly.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Toaster
          position="bottom-center"
          toastOptions={{
            duration: 3500,
            style: {
              background: '#1d1d1f',
              color: '#ffffff',
              fontSize: '14px',
              fontFamily:
                'SF Pro Text, Helvetica Neue, Helvetica, Arial, sans-serif',
              letterSpacing: '-0.224px',
              borderRadius: '8px',
              padding: '10px 16px',
            },
          }}
        />
      </body>
    </html>
  );
}
