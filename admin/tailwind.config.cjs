/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#e11d48',
        secondary: '#be185d',
        dark: '#1a1a2e',
        surface: '#16213e',
        background: '#0f0f23',
      },
    },
  },
  plugins: [],
};