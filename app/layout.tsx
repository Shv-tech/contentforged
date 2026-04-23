import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from '@/components/AuthProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'ContentForge | Enterprise Intelligence',
  description:
    'The AI content repurposing engine for creators who ship daily. Paste once, post everywhere. Wholesale intelligence, zero markup.',
  openGraph: {
    title: 'ContentForge | Enterprise Intelligence',
    description:
      'The weapons-grade content strategist. Turn one piece of content into 30+ platform-ready posts instantly.',
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
      <body className={inter.className}>
        
        {/* The AuthProvider guarantees the Supabase session 
          is hydrated into your global Zustand store instantly. 
        */}
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