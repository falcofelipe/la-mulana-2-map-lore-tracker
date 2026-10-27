/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ruins: {
          950: '#0b0e14',
          900: '#111621',
          800: '#1a2233',
          700: '#26324a',
          600: '#374869',
          accent: '#f59e0b',
          cyan: '#06b6d4',
        }
      }
    },
  },
  plugins: [],
}
