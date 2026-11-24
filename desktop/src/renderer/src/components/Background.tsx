// Slow aurora blobs behind the app: GPU-only transforms, blurred, very cheap.
export function Background({ tint = 'default' }: { tint?: 'default' | 'eye' }) {
  const colors = tint === 'eye' ? ['#35e0ff', '#3ddc97', '#7c5cff'] : ['#7c5cff', '#35e0ff', '#ff5ca8']
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-ink-900">
      <div className="aurora-blob" style={{ width: '46vw', height: '46vw', left: '-10vw', top: '-14vw', background: `radial-gradient(circle, ${colors[0]} 0%, ${colors[0]}00 68%)`, animation: 'drift1 26s ease-in-out infinite' }} />
      <div className="aurora-blob" style={{ width: '38vw', height: '38vw', right: '-8vw', top: '10vh', background: `radial-gradient(circle, ${colors[1]} 0%, ${colors[1]}00 68%)`, opacity: 0.3, animation: 'drift2 32s ease-in-out infinite' }} />
      <div className="aurora-blob" style={{ width: '34vw', height: '34vw', left: '30vw', bottom: '-18vw', background: `radial-gradient(circle, ${colors[2]} 0%, ${colors[2]}00 68%)`, opacity: 0.24, animation: 'drift3 38s ease-in-out infinite' }} />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(7,10,20,0.55)_70%,rgba(7,10,20,0.9)_100%)]" />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1px, transparent 1px)', backgroundSize: '26px 26px' }}
      />
    </div>
  )
}
