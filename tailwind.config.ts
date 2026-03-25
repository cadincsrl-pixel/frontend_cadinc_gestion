import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/modules/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        naranja: {
          DEFAULT: '#E8621A',
          dark:    '#C04E10',
          light:   '#FDF0E8',
        },
        azul: {
          DEFAULT: '#0F2744',
          mid:     '#1D3F6E',
          light:   '#E8EEF7',
        },
        carbon:  '#1C1C1E',
        gris: {
          DEFAULT: '#F0EFEB',
          mid:     '#D4D3CF',
          dark:    '#8A8980',
        },
        blanco:  '#FAFAF8',
        verde: {
          DEFAULT: '#1A6B3C',
          light:   '#E4F2EB',
        },
        rojo: {
          DEFAULT: '#C0392B',
          light:   '#FDECEA',
        },
        amarillo: {
          DEFAULT: '#F5A623',
          light:   '#FFF8EB',
        },
      },
      fontFamily: {
        sans:  ['Syne', 'sans-serif'],
        mono:  ['JetBrains Mono', 'monospace'],
        display: ['Bebas Neue', 'sans-serif'],
      },
      boxShadow: {
        card:    '0 2px 12px rgba(15,39,68,.10)',
        'card-lg': '0 8px 40px rgba(15,39,68,.18)',
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
}

export default config