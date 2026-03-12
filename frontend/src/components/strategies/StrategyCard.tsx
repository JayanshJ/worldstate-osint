import { TrendingUp, TrendingDown, Shield, Minus, Clock, AlertTriangle, CheckCircle2, MapPin } from 'lucide-react'
import type {
  MarketStrategy,
  AssetClass,
  Direction,
  RiskLevel,
  Timeframe,
} from '@/types'
import {
  ASSET_CLASS_COLORS,
  ASSET_CLASS_BG,
  DIRECTION_COLORS,
  RISK_COLORS,
} from '@/types'

// ─── Small label helpers ──────────────────────────────────────────────────────

const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  COMMODITY:  'COMMODITY',
  EQUITY:     'EQUITY',
  FOREX:      'FOREX',
  CRYPTO:     'CRYPTO',
  BONDS:      'BONDS',
  VOLATILITY: 'VOLATILITY',
}

const TIMEFRAME_LABELS: Record<Timeframe, string> = {
  INTRADAY: 'INTRADAY',
  SHORT:    '2–7 DAYS',
  MEDIUM:   '1–4 WEEKS',
  LONG:     '1–6 MONTHS',
}

const RISK_LABELS: Record<RiskLevel, string> = {
  LOW:         'LOW RISK',
  MODERATE:    'MODERATE',
  HIGH:        'HIGH RISK',
  SPECULATIVE: 'SPECULATIVE',
}

function DirectionIcon({ direction }: { direction: Direction }) {
  const color = DIRECTION_COLORS[direction]
  const props = { size: 14, color }
  if (direction === 'LONG')    return <TrendingUp  {...props} />
  if (direction === 'SHORT')   return <TrendingDown {...props} />
  if (direction === 'HEDGE')   return <Shield       {...props} />
  return <Minus {...props} />
}

function RiskIcon({ risk }: { risk: RiskLevel }) {
  const color = RISK_COLORS[risk]
  const props = { size: 11, color }
  if (risk === 'LOW')      return <CheckCircle2  {...props} />
  if (risk === 'MODERATE') return <CheckCircle2  {...props} />
  return <AlertTriangle {...props} />
}

// ─── Confidence bar ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color =
    value >= 0.75 ? '#22c55e' :
    value >= 0.55 ? '#eab308' :
    value >= 0.40 ? '#f97316' : '#ef4444'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-terminal-border rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums" style={{ color }}>
        {pct}%
      </span>
    </div>
  )
}

// ─── StrategyCard ─────────────────────────────────────────────────────────────

interface Props {
  strategy: MarketStrategy
  onClusterSelect?: (id: string) => void
}

export function StrategyCard({ strategy, onClusterSelect }: Props) {
  const acColor = ASSET_CLASS_COLORS[strategy.asset_class as AssetClass] ?? '#6b7280'
  const acBg    = ASSET_CLASS_BG[strategy.asset_class as AssetClass]    ?? 'rgba(107,114,128,0.12)'
  const dirColor = DIRECTION_COLORS[strategy.direction as Direction]    ?? '#6b7280'
  const riskColor = RISK_COLORS[strategy.risk_level as RiskLevel]       ?? '#6b7280'

  return (
    <div
      className="border border-terminal-border bg-terminal-surface/40 hover:bg-terminal-surface/70 transition-colors"
      style={{ borderLeftColor: dirColor, borderLeftWidth: 3 }}
    >
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Direction badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm border font-mono text-[10px] font-bold tracking-wider"
            style={{ color: dirColor, borderColor: `${dirColor}44`, background: `${dirColor}15` }}
          >
            <DirectionIcon direction={strategy.direction as Direction} />
            {strategy.direction}
          </div>

          {/* Asset class badge */}
          <div
            className="px-2 py-0.5 rounded-sm font-mono text-[10px] font-bold tracking-wider border"
            style={{ color: acColor, borderColor: `${acColor}44`, background: acBg }}
          >
            {ASSET_CLASS_LABELS[strategy.asset_class as AssetClass] ?? strategy.asset_class}
          </div>

          {/* Risk badge */}
          <div
            className="flex items-center gap-1 px-2 py-0.5 rounded-sm font-mono text-[10px] tracking-wider border"
            style={{ color: riskColor, borderColor: `${riskColor}30`, background: `${riskColor}10` }}
          >
            <RiskIcon risk={strategy.risk_level as RiskLevel} />
            {RISK_LABELS[strategy.risk_level as RiskLevel] ?? strategy.risk_level}
          </div>
        </div>

        {/* Timeframe */}
        <div className="flex items-center gap-1 text-[10px] font-mono text-terminal-dim flex-shrink-0">
          <Clock size={9} />
          {TIMEFRAME_LABELS[strategy.timeframe as Timeframe] ?? strategy.timeframe}
        </div>
      </div>

      {/* ── Title ──────────────────────────────────────────────────────── */}
      <div className="px-4 pb-2">
        <h3 className="font-mono font-bold text-sm text-terminal-text leading-snug">
          {strategy.title}
        </h3>
      </div>

      {/* ── Thesis ─────────────────────────────────────────────────────── */}
      <div className="px-4 pb-3">
        <p className="font-mono text-[11px] text-terminal-dim leading-relaxed">
          {strategy.thesis}
        </p>
      </div>

      {/* ── Rationale bullets ──────────────────────────────────────────── */}
      {strategy.rationale?.length > 0 && (
        <div className="px-4 pb-3 border-t border-terminal-border/40 pt-2.5 space-y-1.5">
          {strategy.rationale.map((point, i) => (
            <div key={i} className="flex items-start gap-2">
              <span
                className="font-mono text-[9px] font-bold mt-0.5 flex-shrink-0"
                style={{ color: i === 0 ? acColor : i === 2 ? '#6b7280' : '#94a3b8' }}
              >
                {i === 0 ? '▶' : i === 1 ? '◆' : '⚠'}
              </span>
              <p className="font-mono text-[10px] text-terminal-text/80 leading-relaxed">
                {point}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* ── Assets + Confidence + Footer ───────────────────────────────── */}
      <div className="px-4 pb-3 pt-1 border-t border-terminal-border/40">
        {/* Specific assets */}
        {strategy.specific_assets?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {strategy.specific_assets.map((asset, i) => (
              <span
                key={i}
                className="font-mono text-[10px] px-2 py-0.5 rounded-sm border"
                style={{ color: acColor, borderColor: `${acColor}40`, background: `${acColor}0d` }}
              >
                {asset}
              </span>
            ))}
          </div>
        )}

        {/* Confidence */}
        <div className="mb-2">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[9px] text-terminal-dim tracking-widest uppercase">
              Conviction
            </span>
          </div>
          <ConfidenceBar value={strategy.confidence} />
        </div>

        {/* Regions + source clusters */}
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-1 flex-wrap">
            {strategy.related_regions?.slice(0, 3).map((region, i) => (
              <span key={i} className="flex items-center gap-0.5 font-mono text-[9px] text-terminal-dim">
                <MapPin size={8} />
                {region}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1 text-[9px] font-mono text-terminal-dim/60">
            {strategy.source_cluster_ids?.length > 0 && (
              <>
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: acColor }}
                />
                {strategy.source_cluster_ids.length} cluster{strategy.source_cluster_ids.length !== 1 ? 's' : ''}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
