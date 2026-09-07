/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  // Scan the HTML entry points AND the TS source, because many utility
  // classes are emitted from template literals in main.ts / auth.ts.
  content: ['./index.html', './auth.html', './src/**/*.{ts,js}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Space Grotesk', 'sans-serif'],
        serif: ['Crimson Pro', 'serif'],
      },
      colors: {
        bg: '#F6F5FB',
        surface: '#FFFFFF',
        surface2: '#F1EEF9',
        border: '#E5E1F0',
        primary: '#7C3AED',
        secondary: '#6366F1',
        accent: '#DB2777',
        fg: '#211E33',
        muted: '#6E6A85',
        success: '#059669',
        warn: '#D97706',
        danger: '#DC2626',
      },
    },
  },
  plugins: [],
};
