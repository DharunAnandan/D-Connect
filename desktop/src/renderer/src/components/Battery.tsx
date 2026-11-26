import { BatteryCharging } from 'lucide-react'

export function BatteryPill({ level, charging }: { level: number; charging: boolean }) {
  const color = charging ? 'rgb(var(--c-mint))' : level <= 15 ? '#f87171' : level <= 30 ? '#ffb547' : '#8be9ff'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2 py-1 text-[10.5px] font-semibold tabular-nums" style={{ color }}>
      {charging ? (
        <BatteryCharging size={13} />
      ) : (
        <span className="relative inline-block h-[9px] w-[17px] rounded-[3px] border border-current p-[1px]">
          <span className="block h-full rounded-[1px] bg-current transition-all duration-700" style={{ width: `${Math.max(6, level)}%` }} />
          <span className="absolute -right-[3px] top-1/2 h-[4px] w-[2px] -translate-y-1/2 rounded-r bg-current" />
        </span>
      )}
      {level}%
    </span>
  )
}
