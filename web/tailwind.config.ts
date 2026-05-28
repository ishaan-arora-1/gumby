import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['var(--font-instrument-serif)', 'Instrument Serif', 'Georgia', 'serif'],
      },
      colors: {
        // From iOS Constants.swift — exact match
        bg: '#0D0D0D',
        canvas: '#000000',
        surface: '#1A1A1A',
        elevated: '#262626',
        elevated2: '#2C2C2C',
        composer: '#262626',
        composerInner: '#1C1C1C',
        studio: '#161616',
        line: '#2D2D2D',
        muted: '#8E8E93',
        placeholder: '#A3A3A3',
        secondary: '#8A8A8A',
        tertiary: '#6B6B6B',
        accent1: '#FF6B35',
        accent2: '#FF3CAC',
        accent3: '#784BA0',
        cta: '#E5E5E5',
        ctaText: '#121212',
        authBg: '#121212',
        accentBlue: '#2563EB',
      },
      backgroundImage: {
        'brand-gradient':
          'linear-gradient(90deg, #FF6B35 0%, #FF3CAC 50%, #784BA0 100%)',
        'brand-gradient-radial':
          'radial-gradient(circle at 30% 20%, #FF6B35 0%, transparent 40%), radial-gradient(circle at 70% 60%, #FF3CAC 0%, transparent 50%), radial-gradient(circle at 50% 100%, #784BA0 0%, transparent 60%)',
        'brand-gradient-vertical':
          'linear-gradient(180deg, #FF6B35 0%, #FF3CAC 50%, #784BA0 100%)',
      },
      borderRadius: {
        card: '20px',
        btn: '12px',
        pill: '999px',
      },
      animation: {
        'shimmer': 'shimmer 3s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow': 'glow 4s ease-in-out infinite',
        'marquee': 'marquee 40s linear infinite',
        'marquee-rev': 'marquee-rev 40s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        glow: {
          '0%,100%': { opacity: '0.4' },
          '50%': { opacity: '0.9' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'marquee-rev': {
          '0%': { transform: 'translateX(-50%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
