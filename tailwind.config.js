/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  /** `class` = allinea a `document.documentElement.classList.toggle('dark')` nell’app (non `media`). */
  darkMode: 'class',
  theme: {
    /** Unico breakpoint: `md:` = min-width 768px. Rimossi sm/lg/xl/2xl. */
    screens: {
      md: '768px',
    },
    extend: {
      colors: {
        'app-bg': '#0a0a0c',
        // Colore brand dinamico — iniettato da TenantContext via CSS custom properties
        accent: {
          DEFAULT: 'var(--brand)',
          hover:   'var(--brand-hover)',
          dark:    'var(--brand-dark)',
          light:   'var(--brand-light)',
          muted:   'var(--brand-muted)',
        },
        // Palette completa brand (brand-50 … brand-900) per rimpiazzare green-/emerald-
        brand: {
          DEFAULT: 'var(--brand)',
          50:  'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
          900: 'var(--brand-900)',
        },
        // Arancione revisione — per approvazioni e modifiche
        review: {
          DEFAULT: '#D97706',
          hover:   '#B45309',
          light:   '#FEF3C7',
        },
        // Rosso errore — per eliminazioni e azioni critiche
        error: {
          DEFAULT: '#DC2626',
          hover:   '#991B1B',
          light:   '#FEE2E2',
        },
        surface: {
          DEFAULT: '#f8fafc',
          card: '#ffffff',
        },
        ink: {
          DEFAULT: '#1a1a1a',
          secondary: '#475569',
          muted: '#64748b',
        },
        /** Hex brand legacy centralizzati (ex hardcoded in UI) */
        'brand-deep': '#1a1a1a',
        'brand-mid': '#ffffff',
        'brand-navy': '#404040',
        'brand-electric': '#ffffff',
      },
      fontSize: {
        caption: ['0.75rem', { lineHeight: '1.25rem' }],
        body: ['0.875rem', { lineHeight: '1.375rem' }],
        lead: ['1rem', { lineHeight: '1.5rem' }],
        title: ['1.125rem', { lineHeight: '1.5rem' }],
        display: ['1.25rem', { lineHeight: '1.375rem' }],
      },
      animation: {
        'pulse-slow': 'pulse-slow 3s ease-in-out infinite',
        'admin-sync-bar': 'admin-sync-bar 1.15s ease-in-out infinite',
      },
      keyframes: {
        'pulse-slow': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        'admin-sync-bar': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(320%)' },
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif', '"Apple Color Emoji"', '"Segoe UI Emoji"'],
        serif: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
