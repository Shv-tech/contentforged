import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
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
        }
      },
      fontFamily: {
        // We stack Inter for Notion-like UI, falling back to system sans
        sans: ['Inter', 'SF Pro Text', 'system-ui', 'sans-serif'],
        // For dramatic, Superhuman-style headings
        display: ['Inter', 'SF Pro Display', 'system-ui', 'sans-serif'],
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