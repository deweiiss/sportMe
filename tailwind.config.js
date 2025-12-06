/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // Use class-based dark mode
  theme: {
    extend: {
      colors: {
        primary: {
          start: '#667eea',
          end: '#764ba2',
        },
        orange: {
          DEFAULT: '#fc4c02',
          light: '#fc6c02',
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        'gradient-orange': 'linear-gradient(135deg, #fc4c02 0%, #fc6c02 100%)',
      },
    },
  },
  plugins: [],
}

