/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#05070F', 900: '#070A14', 850: '#0B1020', 800: '#10172B', 700: '#18213A' },
        violet: { DEFAULT: '#7C5CFF', soft: '#A08BFF' },
        cyan: { DEFAULT: '#35E0FF', soft: '#8BE9FF' },
        pink: { DEFAULT: '#FF5CA8' },
        amber: { DEFAULT: '#FFB547' },
        mint: { DEFAULT: '#3DDC97' },
        rose: { DEFAULT: '#F87171' }
      },
      fontFamily: {
        sans: ['Inter', 'Ubuntu', 'system-ui', 'Segoe UI', 'sans-serif'],
        mono: ['"Ubuntu Mono"', 'ui-monospace', 'monospace']
      },
      borderRadius: { xl: '12px', '2xl': '20px', '3xl': '28px' },
      transitionTimingFunction: { out: 'cubic-bezier(.2,.8,.2,1)', spring: 'cubic-bezier(.34,1.4,.64,1)' }
    }
  },
  plugins: []
}
