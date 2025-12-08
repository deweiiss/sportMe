/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    {
      pattern: /(bg|text|border)-(yale-blue|slate-grey|lavender-blush|bubblegum-pink|amber-flame)-(50|100|200|300|400|500|600|700|800|900|950)/,
    },
  ],
  darkMode: 'class', // Use class-based dark mode
  theme: {
    extend: {
      colors: {
        'yale-blue': {
          50: '#e6f0f4',
          100: '#cce1e9',
          200: '#99c3d3',
          300: '#66a5bd',
          400: '#3387a7',
          500: '#08415c', // Main color
          600: '#063449',
          700: '#052736',
          800: '#031a23',
          900: '#020d10',
          950: '#010608',
        },
        'bubblegum-pink': {
          50: '#fde8ea',
          100: '#fbd1d5',
          200: '#f7a3ab',
          300: '#f37581',
          400: '#ef4757',
          500: '#f05365', // Main color
          600: '#c04250',
          700: '#90323c',
          800: '#602128',
          900: '#301114',
          950: '#21090b',
        },
        'slate-grey': {
          50: '#f0f3f4',
          100: '#e1e7e9',
          200: '#c3cfd3',
          300: '#a5b7bd',
          400: '#879fa7',
          500: '#6b818c', // Main color
          600: '#566770',
          700: '#404d54',
          800: '#2b3438',
          900: '#151a1c',
          950: '#0e1112',
        },
        'amber-flame': {
          50: '#fef9e8',
          100: '#fdf3d1',
          200: '#fbe7a3',
          300: '#f9db75',
          400: '#f7cf47',
          500: '#fabc2a', // Main color
          600: '#c89622',
          700: '#967119',
          800: '#644b11',
          900: '#322608',
          950: '#231904',
        },
        'lavender-blush': {
          50: '#fefdfd',
          100: '#fdfbfb',
          200: '#fbf7f7',
          300: '#f9f3f3',
          400: '#f7efef',
          500: '#eee5e9', // Main color
          600: '#beb7ba',
          700: '#8f898c',
          800: '#5f5b5d',
          900: '#302e2f',
          950: '#211f20',
        },
        // Keep primary for backward compatibility, map to yale-blue
        primary: {
          start: '#08415c',
          end: '#063449',
        },
        orange: {
          DEFAULT: '#fc4c02',
          light: '#fc6c02',
        },
      },
      backgroundImage: {
        'gradient-primary': 'linear-gradient(135deg, #08415c 0%, #063449 100%)',
        'gradient-orange': 'linear-gradient(135deg, #fc4c02 0%, #fc6c02 100%)',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

