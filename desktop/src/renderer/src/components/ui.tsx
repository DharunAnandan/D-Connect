import { motion, type HTMLMotionProps } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'
import { forwardRef, type ReactNode } from 'react'
import { gradientFor, initials } from '@/lib/format'
import { item, spring } from '@/theme/motion'

export function cx(...c: (string | false | null | undefined)[]): string {
  return c.filter(Boolean).join(' ')
}

export const Card = forwardRef<HTMLDivElement, HTMLMotionProps<'div'> & { hover?: boolean; strong?: boolean }>(function Card(
  { className, hover, strong, children, ...rest },
  ref
) {
  return (
    <motion.div
      ref={ref}
      variants={item}
      whileHover={hover ? { y: -3, transition: spring } : undefined}
      className={cx(strong ? 'glass-strong' : 'glass', 'rounded-2xl', hover && 'transition-shadow hover:shadow-[0_18px_50px_-14px_rgba(124,92,255,0.35)]', className)}
      {...rest}
    >
      {children}
    </motion.div>
  )
})

type BtnProps = HTMLMotionProps<'button'> & { variant?: 'primary' | 'ghost' | 'soft' | 'danger' | 'success'; icon?: LucideIcon; size?: 'sm' | 'md' | 'lg' }
export function Button({ variant = 'soft', icon: Icon, size = 'md', className, children, ...rest }: BtnProps) {
  const v = {
    primary: 'text-ink-950 font-semibold bg-[linear-gradient(120deg,#8b6cff,#35e0ff)] shadow-[0_8px_28px_-8px_rgba(53,224,255,0.6)] hover:shadow-[0_10px_34px_-6px_rgba(124,92,255,0.7)]',
    soft: 'bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white/90',
    ghost: 'hover:bg-white/[0.06] text-white/70 hover:text-white',
    danger: 'bg-rose/90 hover:bg-rose text-white font-semibold shadow-[0_8px_28px_-8px_rgba(248,113,113,0.7)]',
    success: 'bg-mint/90 hover:bg-mint text-ink-950 font-semibold shadow-[0_8px_28px_-8px_rgba(61,220,151,0.7)]'
  }[variant]
  const s = { sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg', md: 'h-10 px-4 text-sm gap-2 rounded-xl', lg: 'h-12 px-6 text-[15px] gap-2.5 rounded-2xl' }[size]
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.96 }}
      transition={spring}
      className={cx('no-drag inline-flex items-center justify-center whitespace-nowrap transition-[background,box-shadow,color] disabled:opacity-40 disabled:pointer-events-none', v, s, className)}
      {...rest}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 17} strokeWidth={2.2} />}
      {children as ReactNode}
    </motion.button>
  )
}

export function IconButton({ icon: Icon, label, active, className, size = 38, ...rest }: HTMLMotionProps<'button'> & { icon: LucideIcon; label: string; active?: boolean; size?: number }) {
  return (
    <motion.button
      title={label}
      aria-label={label}
      whileHover={{ scale: 1.08 }}
      whileTap={{ scale: 0.9 }}
      transition={spring}
      style={{ width: size, height: size }}
      className={cx('no-drag grid place-items-center rounded-xl transition-colors', active ? 'bg-cyan/15 text-cyan' : 'text-white/60 hover:text-white hover:bg-white/[0.07]', className)}
      {...rest}
    >
      <Icon size={Math.round(size * 0.47)} strokeWidth={2} />
    </motion.button>
  )
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx('no-drag relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-300 disabled:opacity-40', on ? 'bg-[linear-gradient(120deg,#7c5cff,#35e0ff)]' : 'bg-white/10')}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 600, damping: 32 }}
        className={cx('absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.4)]', on ? 'right-[3px]' : 'left-[3px]')}
      />
    </button>
  )
}

export function Slider({ value, min, max, step = 1, onChange, suffix }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; suffix?: string }) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-6 flex-1">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-white/10" />
        <div className="absolute left-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[linear-gradient(90deg,#7c5cff,#35e0ff)]" style={{ width: `${pct}%` }} />
        <div className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_4px_rgba(53,224,255,0.2)]" style={{ left: `${pct}%` }} />
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="absolute inset-0 w-full cursor-pointer opacity-0" />
      </div>
      <span className="w-14 text-right text-sm tabular-nums text-white/80">
        {value}
        {suffix}
      </span>
    </div>
  )
}

export function Ring({ value, size = 64, stroke = 6, children, colors = ['#7c5cff', '#35e0ff'], track = 'rgba(255,255,255,0.08)' }: { value: number; size?: number; stroke?: number; children?: ReactNode; colors?: string[]; track?: string }) {
  const r = (size - stroke) / 2
  const len = 2 * Math.PI * r
  const id = `rg${colors.join('').replace(/#/g, '')}`
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {colors.map((c, i) => (
              <stop key={c} offset={`${(i / (colors.length - 1)) * 100}%`} stopColor={c} />
            ))}
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={len}
          initial={false}
          animate={{ strokeDashoffset: len * (1 - Math.max(0, Math.min(1, value))), opacity: value < 0.005 ? 0 : 1 }}
          transition={{ type: 'spring', stiffness: 60, damping: 18 }}
          style={{ filter: `drop-shadow(0 0 6px ${colors[colors.length - 1]}88)` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string; size?: number }) {
  if (src) return <img src={src} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
  return (
    <div className="grid shrink-0 place-items-center rounded-full font-semibold text-white shadow-inner" style={{ width: size, height: size, background: gradientFor(name), fontSize: size * 0.38 }}>
      {initials(name)}
    </div>
  )
}

export function PageHeader({ title, subtitle, children, icon: Icon }: { title: string; subtitle?: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="sticky top-0 z-20 -mx-8 mb-6 flex items-end justify-between gap-4 bg-gradient-to-b from-ink-900 via-ink-900/95 to-transparent px-8 pb-3 pt-2">
      <div className="flex items-center gap-3.5">
        {Icon && (
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[linear-gradient(135deg,rgba(124,92,255,0.25),rgba(53,224,255,0.18))] text-cyan-soft ring-1 ring-white/10">
            <Icon size={21} />
          </div>
        )}
        <div>
          <h1 className="text-[26px] font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

export function Empty({ icon: Icon, title, body, children }: { icon: LucideIcon; title: string; body?: string; children?: ReactNode }) {
  return (
    <motion.div variants={item} className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="mb-5 grid h-20 w-20 place-items-center rounded-3xl bg-[linear-gradient(135deg,rgba(124,92,255,0.22),rgba(53,224,255,0.12))] text-cyan-soft ring-1 ring-white/10"
      >
        <Icon size={34} strokeWidth={1.6} />
      </motion.div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm text-muted">{body}</p>}
      {children && <div className="mt-5">{children}</div>}
    </motion.div>
  )
}

export function Pill({ children, color = 'cyan', className }: { children: ReactNode; color?: 'cyan' | 'mint' | 'amber' | 'rose' | 'violet' | 'pink'; className?: string }) {
  const c = {
    cyan: 'bg-cyan/12 text-cyan-soft ring-cyan/25',
    mint: 'bg-mint/12 text-mint ring-mint/25',
    amber: 'bg-amber/12 text-amber ring-amber/25',
    rose: 'bg-rose/12 text-rose ring-rose/25',
    violet: 'bg-violet/15 text-violet-soft ring-violet/30',
    pink: 'bg-pink/12 text-pink ring-pink/25'
  }[color]
  return <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1', c, className)}>{children}</span>
}

export function Row({ title, body, children, icon: Icon }: { title: string; body?: string; children?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-center gap-4 py-3.5">
      {Icon && (
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.05] text-white/70">
          <Icon size={17} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        {body && <div className="mt-0.5 text-xs text-muted">{body}</div>}
      </div>
      {children}
    </div>
  )
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="no-drag relative flex rounded-xl bg-white/[0.05] p-1 ring-1 ring-white/[0.06]">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cx('relative z-10 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors', value === o.value ? 'text-white' : 'text-white/55 hover:text-white/80')}>
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} transition={spring} className="absolute inset-0 -z-10 rounded-lg bg-white/[0.1] ring-1 ring-white/10" />}
          {o.label}
        </button>
      ))}
    </div>
  )
}
