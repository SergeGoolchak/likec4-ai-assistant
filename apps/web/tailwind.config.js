import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        slate: { 50: '#faf8f4', 100: '#f2eee7', 200: '#e6dfd5', 300: '#d4cbbf', 400: '#787167', 500: '#66625b', 600: '#56514b', 700: '#403c37', 800: '#302d29', 900: '#1d1d1f' },
      },
      fontFamily: { sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'] },
    },
  },
  plugins: [typography],
};
