import { useState, useEffect, useRef } from 'react'
import { X, ChevronRight, ChevronLeft, LayoutDashboard, Globe, Zap, GitBranch, Bell, Search, FlaskConical } from 'lucide-react'

interface Step {
  icon:        React.ReactNode
  title:       string
  description: string
  hint?:       string
}

const STEPS: Step[] = [
  {
    icon:        <Globe size={24} className="text-terminal-accent" />,
    title:       'Welcome to WorldState',
    description: 'Real-time geopolitical intelligence fused with market signals. Every panel updates live as events unfold around the world.',
    hint:        'This tour takes about 60 seconds.',
  },
  {
    icon:        <LayoutDashboard size={24} className="text-blue-400" />,
    title:       'Feed — Live Intelligence',
    description: 'The main dashboard shows two panels: Event Clusters on the left (AI-grouped stories) and Live Feed on the right (raw articles as they arrive).',
    hint:        'Click any cluster to expand it and see source articles, key entities, and a volatility score.',
  },
  {
    icon:        <Zap size={24} className="text-yellow-400" />,
    title:       'Event Clusters',
    description: 'Articles are grouped by semantic similarity into clusters. Each cluster is scored for volatility (0–1), sentiment, and geographic reach.',
    hint:        'Filter by category (CONFLICT, FINANCE, CRYPTO…) or severity (MOD+, HIGH, CRIT) using the top bar.',
  },
  {
    icon:        <FlaskConical size={24} className="text-green-400" />,
    title:       'Alpha — Market Signals',
    description: 'AI synthesizes active clusters into directional market strategies across COMMODITY, EQUITY, FOREX, CRYPTO, BONDS, and VOLATILITY.',
    hint:        'Each signal now includes a live backtest — see how the price actually moved at 4h and 24h after generation.',
  },
  {
    icon:        <Globe size={24} className="text-cyan-400" />,
    title:       'World Map',
    description: 'Geographic view of active intelligence clusters. Countries are colored by cluster intensity. Click a country to filter relevant signals.',
    hint:        'Switch to Map tab in the top navigation.',
  },
  {
    icon:        <GitBranch size={24} className="text-purple-400" />,
    title:       'Supply Chain — SPLC',
    description: 'Search any stock ticker to visualize its supplier and customer network. Nodes are colored by supply chain tier and geographic risk.',
    hint:        'Click any node to expand that company\'s own supply chain.',
  },
  {
    icon:        <Bell size={24} className="text-red-400" />,
    title:       'Alerts & Search',
    description: 'Set keyword or entity alert watches — WorldState will notify you in real time when a matching cluster appears.',
    hint:        'Use ⌘K (or Ctrl+K) to search across all intelligence instantly.',
  },
  {
    icon:        <Search size={24} className="text-terminal-accent" />,
    title:       "You're ready",
    description: 'WorldState is now monitoring global sources in real time. Intelligence clusters will populate as articles are ingested and processed.',
    hint:        'You can revisit this tour from your account settings at any time.',
  },
]

const STORAGE_KEY = 'onboarding_complete'

export function useOnboarding() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const done = localStorage.getItem(STORAGE_KEY)
    if (!done) setShow(true)
  }, [])

  const complete = () => {
    localStorage.setItem(STORAGE_KEY, '1')
    setShow(false)
  }

  return { show, complete }
}

export function OnboardingTour({ onComplete }: { onComplete: () => void }) {
  const [step, setStep] = useState(0)
  const total = STEPS.length
  const current = STEPS[step]
  const isLast = step === total - 1
  const barRef = useRef<HTMLDivElement>(null)

  function finish() {
    localStorage.setItem(STORAGE_KEY, '1')
    onComplete()
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md mx-4 bg-terminal-surface border border-terminal-border shadow-2xl rounded-sm font-mono">

        {/* Progress bar */}
        <div className="h-0.5 bg-terminal-border">
          <div
            ref={barRef}
            className="h-full bg-terminal-accent transition-all duration-300"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <span className="text-[9px] text-terminal-dim tracking-widest uppercase">
            Step {step + 1} of {total}
          </span>
          <button
            onClick={finish}
            className="text-terminal-dim hover:text-terminal-text transition-colors"
            title="Skip tour"
          >
            <X size={14} />
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-terminal-muted rounded-sm">
              {current.icon}
            </div>
            <h2 className="text-terminal-text font-bold text-base leading-tight">
              {current.title}
            </h2>
          </div>

          <p className="text-terminal-dim text-xs leading-relaxed mb-3">
            {current.description}
          </p>

          {current.hint && (
            <div className="flex items-start gap-2 px-3 py-2 bg-terminal-accent/5 border border-terminal-accent/20 rounded-sm">
              <span className="text-terminal-accent text-[10px] flex-shrink-0 mt-0.5">→</span>
              <p className="text-terminal-accent/80 text-[10px] leading-relaxed">
                {current.hint}
              </p>
            </div>
          )}
        </div>

        {/* Step dots */}
        <div className="flex items-center justify-center gap-1.5 pb-2">
          {STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`w-1.5 h-1.5 rounded-full transition-all ${
                i === step
                  ? 'bg-terminal-accent w-4'
                  : i < step
                  ? 'bg-terminal-accent/40'
                  : 'bg-terminal-border'
              }`}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 pb-5 pt-1">
          <button
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-1 text-[10px] text-terminal-dim hover:text-terminal-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={12} /> Back
          </button>

          {isLast ? (
            <button
              onClick={finish}
              className="flex items-center gap-1.5 text-[10px] font-bold px-4 py-1.5 bg-terminal-accent text-black rounded-sm hover:brightness-110 transition-all"
            >
              Get Started <ChevronRight size={12} />
            </button>
          ) : (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex items-center gap-1.5 text-[10px] font-bold px-4 py-1.5 border border-terminal-accent/40 text-terminal-accent hover:bg-terminal-accent/10 rounded-sm transition-colors"
            >
              Next <ChevronRight size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
