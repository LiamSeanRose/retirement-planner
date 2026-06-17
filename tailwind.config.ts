import type { Config } from 'tailwindcss';

/**
 * "Financial almanac" design tokens — warm paper, deep ink + evergreen, a restrained maple accent.
 * Colors are driven by CSS variables (see app/globals.css) so the theme stays in one place.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        surface: 'var(--surface)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        faint: 'var(--faint)',
        line: 'var(--line)',
        evergreen: 'var(--evergreen)',
        'evergreen-soft': 'var(--evergreen-soft)',
        maple: 'var(--maple)',
        gold: 'var(--gold)',
        // Cash-flow series palette (stable order = stacking order)
        'c-pension': 'var(--c-pension)',
        'c-bridge': 'var(--c-bridge)',
        'c-cpp': 'var(--c-cpp)',
        'c-oas': 'var(--c-oas)',
        'c-reg': 'var(--c-reg)',
        'c-tfsa': 'var(--c-tfsa)',
        'c-nonreg': 'var(--c-nonreg)',
        'c-other': 'var(--c-other)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        card: '0.5rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(26, 32, 28, 0.04), 0 8px 24px -12px rgba(26, 32, 28, 0.12)',
      },
      keyframes: {
        'rise-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'rise-in': 'rise-in 0.5s cubic-bezier(0.2, 0.6, 0.2, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
