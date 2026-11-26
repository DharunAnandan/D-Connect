const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // theme colours: CSS variables (see index.css, [data-theme])
        ink: { 950: v('ink-950'), 900: v('ink-900'), 850: v('ink-850'), 800: v('ink-800'), 700: v('ink-700') },
        violet: { DEFAULT: v('violet'), soft: v('violet-soft') },
        cyan: { DEFAULT: v('cyan'), soft: v('cyan-soft') },
        pink: { DEFAULT: v('pink') },
        amber: { DEFAULT: '#FFB547' },
        mint: { DEFAULT: v('mint') },
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
