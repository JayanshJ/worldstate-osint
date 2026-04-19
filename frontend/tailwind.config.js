/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono:  ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Instrument Serif', 'Georgia', 'serif'],   // Direction A headlines
      },
      colors: {
        // Terminal palette — theme-aware via CSS variables
        terminal: {
          bg:      'rgb(var(--t-bg) / <alpha-value>)',
          surface: 'rgb(var(--t-surface) / <alpha-value>)',
          border:  'rgb(var(--t-border) / <alpha-value>)',
          muted:   'rgb(var(--t-muted) / <alpha-value>)',
          text:    'rgb(var(--t-text) / <alpha-value>)',
          dim:     'rgb(var(--t-dim) / <alpha-value>)',
          accent:  'rgb(var(--t-accent) / <alpha-value>)',
        },
        // Volatility spectrum — warm palette matching design
        volt: {
          calm:     '#7bb875',   // muted green    0.0–0.25
          low:      '#a8b856',   // yellow-green   0.25–0.4
          moderate: '#c9a95a',   // warm amber     0.4–0.55
          elevated: '#d88a4a',   // amber-orange   0.55–0.7
          high:     '#d6604c',   // warm red-orange 0.7–0.85
          critical: '#d64747',   // red             0.85–1.0
        },
        // Sentiment
        sent: {
          positive: '#6fbf6a',
          neutral:  '#8a8577',
          negative: '#d15a4c',
        },
      },
      animation: {
        'ticker':       'ticker 40s linear infinite',
        'pulse-glow':   'pulse-glow 2s ease-in-out infinite',
        'slide-in':     'slide-in 0.3s ease-out',
        'fade-in':      'fade-in 0.2s ease-out',
        'blink':        'blink 1s step-end infinite',
        'pulse-dot':    'pulse-dot 1.6s ease-in-out infinite',
      },
      keyframes: {
        ticker: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0px rgba(216,155,74,0)' },
          '50%':      { boxShadow: '0 0 14px rgba(216,155,74,0.35)' },
        },
        'pulse-dot': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(216,155,74,0.5)' },
          '50%':      { boxShadow: '0 0 0 5px rgba(216,155,74,0)' },
        },
        'slide-in': {
          from: { opacity: '0', transform: 'translateY(-8px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
        'blink': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0' },
        },
      },
      boxShadow: {
        'card-volt': '0 0 0 1px rgba(216,155,74,0.1), 0 4px 24px rgba(0,0,0,0.4)',
        'glow-red':  '0 0 20px rgba(214,71,71,0.3)',
        'glow-amber':'0 0 20px rgba(216,155,74,0.25)',
      },
      letterSpacing: {
        widest2: '0.18em',
        widest3: '0.22em',
      },
    },
  },
  plugins: [],
}
