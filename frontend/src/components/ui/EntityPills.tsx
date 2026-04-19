import type { KeyEntities } from '@/types'
import { cn } from '@/lib/utils'

interface Props {
  entities: KeyEntities
  max?: number
}

const ENTITY_STYLES = {
  people:        { bg: 'rgba(168,139,250,0.10)', border: '#a78bfa33', color: '#a78bfa' },
  organizations: { bg: 'rgba(216,155,74,0.12)',  border: '#d89b4a40', color: '#d89b4a' },
  locations:     { bg: 'rgba(52,211,153,0.10)',  border: '#34d39933', color: '#34d399' },
}

const ENTITY_ICONS = {
  people:        '·',
  organizations: '·',
  locations:     '·',
}

export function EntityPills({ entities, max = 3 }: Props) {
  const all: Array<{ label: string; type: keyof typeof ENTITY_STYLES }> = [
    ...entities.people.slice(0, max).map(l => ({ label: l, type: 'people' as const })),
    ...entities.organizations.slice(0, max).map(l => ({ label: l, type: 'organizations' as const })),
    ...entities.locations.slice(0, max).map(l => ({ label: l, type: 'locations' as const })),
  ].slice(0, max * 2)

  if (!all.length) return null

  return (
    <div className="flex flex-wrap gap-1">
      {all.map(({ label, type }) => {
        const s = ENTITY_STYLES[type]
        return (
          <span
            key={`${type}-${label}`}
            className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 font-mono border"
            style={{ backgroundColor: s.bg, borderColor: s.border, color: s.color }}
          >
            <span className="text-[8px]">{ENTITY_ICONS[type]}</span>
            {label}
          </span>
        )
      })}
    </div>
  )
}
