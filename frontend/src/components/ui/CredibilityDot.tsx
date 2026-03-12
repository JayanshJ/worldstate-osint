interface Props {
  score:     number   // [0, 1]
  sourceId:  string
}

const TIER_COLORS = [
  { min: 0.9, label: 'T1', color: '#00d4ff', title: 'Tier-1 Wire' },
  { min: 0.75, label: 'T2', color: '#22c55e', title: 'Major Outlet' },
  { min: 0.5, label: 'T3', color: '#eab308', title: 'Secondary Source' },
  { min: 0, label: 'T4', color: '#6b7280', title: 'Aggregator / Social' },
]

export function CredibilityDot({ score, sourceId }: Props) {
  const tier = TIER_COLORS.find(t => score >= t.min) ?? TIER_COLORS[TIER_COLORS.length - 1]
  return (
    <span
      className="inline-flex items-center gap-1 text-[9px] font-mono font-semibold tracking-wider opacity-80"
      title={`${tier.title} — credibility ${score.toFixed(2)}`}
      style={{ color: tier.color }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full inline-block"
        style={{ backgroundColor: tier.color }}
      />
      {tier.label}
    </span>
  )
}
