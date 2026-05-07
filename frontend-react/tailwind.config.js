/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // VVAULT HIGH-CONTRAST NEUTRAL PALETTE
        slate: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          400: '#a1a1aa', // Perfect crisp secondary text
          500: '#71717a',
          600: '#52525b',
          700: '#27272a', // Strong visible borders
          800: '#18181b', // Hover states
          900: '#09090b', // Cards and Sidebar (Deep Gray/Black)
          950: '#000000', // App Background (Pure OLED Black)
        },
        // VVAULT BRAND ACCENT (Neon Security Cyan)
        accent: {
          DEFAULT: '#00E6CC',
          hover: '#00C7B1',
          muted: 'rgba(0, 230, 204, 0.15)',
        }
      },
    },
  },
  plugins: [],
}