/**
 * Colours are driven by CSS custom properties so the whole UI can flip between
 * light and dark themes without touching component classes. Each shade maps to
 * `rgb(var(--<name>-<shade>) / <alpha-value>)`, and the actual RGB triplets are
 * defined (per theme) in src/index.css. The app uses high slate numbers for
 * surfaces and low numbers for text, so the light theme simply reverses the
 * neutral/accent scales — see index.css.
 */
const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/** Build a Tailwind colour scale backed by CSS variables (alpha-aware). */
function tokenScale(name) {
  return Object.fromEntries(
    SHADES.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`]),
  );
}

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        slate: tokenScale('slate'),
        brand: tokenScale('brand'),
        emerald: tokenScale('emerald'),
        sky: tokenScale('sky'),
        violet: tokenScale('violet'),
        amber: tokenScale('amber'),
        rose: tokenScale('rose'),
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
      },
    },
  },
  plugins: [],
};
