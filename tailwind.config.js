/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Archivo', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      // Softer than Tailwind's defaults across the board. Every rounded-* class
      // in the app moves together, so the whole surface gets the same radius
      // language instead of each card being edited by hand.
      borderRadius: {
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
      },
    },
  },
  plugins: [],
}
