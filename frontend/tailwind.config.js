/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        mono:  ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
        sans:  ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Terminal palette — Bloomberg-inspired
        terminal: {
          bg:       '#0a0a0f',
          surface:  '#0f0f1a',
          border:   '#1a1a2e',
          muted:    '#2a2a3e',
          text:     '#c8d3e8',
          dim:      '#5a6380',
          accent:   '#00d4ff',
        },
        // Volatility spectrum (calm → breaking)
        volt: {
          calm:     '#22c55e',   // green  0.0–0.25
          low:      '#84cc16',   // lime   0.25–0.4
          moderate: '#eab308',   // yellow 0.4–0.55
          elevated: '#f97316',   // orange 0.55–0.7
          high:     '#ef4444',   // red    0.7–0.85
          critical: '#dc2626',   // red-700 0.85–1.0
        },
        // Sentiment
        sent: {
          positive: '#10b981',
          neutral:  '#6b7280',
          negative: '#f87171',
        },
      },
      animation: {
        'ticker':       'ticker 40s linear infinite',
        'pulse-glow':   'pulse-glow 2s ease-in-out infinite',
        'slide-in':     'slide-in 0.3s ease-out',
        'fade-in':      'fade-in 0.2s ease-out',
        'blink':        'blink 1s step-end infinite',
      },
      keyframes: {
        ticker: {
          '0%':   { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 0px rgba(0,212,255,0)' },
          '50%':      { boxShadow: '0 0 12px rgba(0,212,255,0.4)' },
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
        'card-volt': '0 0 0 1px rgba(0,212,255,0.1), 0 4px 24px rgba(0,0,0,0.4)',
        'glow-red':  '0 0 20px rgba(239,68,68,0.3)',
        'glow-cyan': '0 0 20px rgba(0,212,255,0.2)',
      },
    },
  },
  plugins: [],
}
