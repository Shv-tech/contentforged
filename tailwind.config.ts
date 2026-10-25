import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  // Classes built from data at runtime (draft platform tints, verdict tones)
  // that the scanner cannot see in source.
  safelist: ['bg-forge-good', 'bg-forge-warn', 'bg-forge-bad', 'text-forge-good', 'text-forge-warn', 'text-forge-bad'],
  theme: {
    extend: {
      colors: {
        // Claude & Notion Warm Neutrals
        canvas: '#faf9f5', // Ivory / Warm White
        surface: '#ffffff', // Pure white for elevated cards
        'surface-warm': '#f0eee6', // Border Cream
        
        // Superhuman & Anthropic Typography Colors
        ink: {
          main: '#141413', // Near Black
          muted: '#5e5d59', // Olive Gray (yellow-brown undertone, no cool grays)
          faint: '#a39e98', // Light warm gray
        },

        // Accents
        accent: {
          charcoal: '#292827', // Superhuman button dark
          lavender: '#cbb7fb', // Superhuman accent badge
          terracotta: '#c96442', // Claude subtle highlight
        },

        // The app's dark system, shared with the landing page. Surfaces step
        // up in small increments from pure black; colour is reserved for
        // meaning (ember = Forge, good/warn = state).
        forge: {
          ink: '#000000',
          panel: '#070707',
          card: '#0E0E0E',
          raised: '#151515',
          hover: '#1C1C1C',
          line: 'rgba(255,255,255,0.08)',
          ember: '#FF8A2B',
          ember2: '#E0570A',
          gold: '#FFB067',
          steel: '#9AA8B8',
          good: '#8EE3B0',
          warn: '#FFB067',
          bad: '#FF8A65',
        },
      },
      fontFamily: {
        // We stack Inter for Notion-like UI, falling back to system sans
        // Instrument Sans everywhere, loaded by next/font in app/layout.tsx.
        sans: ['var(--font-sans)', 'Instrument Sans', 'system-ui', 'sans-serif'],
        // For dramatic, Superhuman-style headings
        display: ['var(--font-sans)', 'Instrument Sans', 'system-ui', 'sans-serif'],
        // For literary/Claude moments
        serif: ['Georgia', 'Cambria', 'Times New Roman', 'serif'],
      },
      boxShadow: {
        // Notion's "Whisper" shadows
        whisper: 'rgba(0, 0, 0, 0.05) 0px 4px 24px',
        floating: 'rgba(0,0,0,0.07) 0px 2.025px 7.85px, rgba(0,0,0,0.02) 0px 0.8px 2.93px, rgba(0,0,0,0.01) 0px 0.175px 1.04px',
      },
      letterSpacing: {
        tightest: '-0.04em', // -2.125px equivalent for massive headings
        tighter: '-0.02em',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'), // <-- ADD THIS LINE
  ],
};

export default config;