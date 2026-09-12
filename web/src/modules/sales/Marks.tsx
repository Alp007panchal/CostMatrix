/**
 * The two marks the sales reports draw, in plain HTML: a meter for a ratio, and a
 * dumbbell for quoted-against-achieved. One hue throughout — the app's accent —
 * because the app's own green and red fail a colour-blindness check against each
 * other (ΔE 5.1 deuteranopia), and a ratio does not need two hues anyway. Every
 * mark sits in a table row beside its own numbers, so nothing is carried by colour.
 */

/** A ratio against its whole: a recessive track, one filled bar, rounded ends. */
export function Meter({ value, title }: { value: number | null; title: string }) {
  if (value === null) {
    return <span className="muted" title={title}>—</span>
  }
  const pct = Math.min(Math.max(value, 0), 1) * 100
  return (
    <span
      title={title}
      style={{
        display: 'inline-block', width: '5.5rem', height: '.5rem', borderRadius: '999px',
        background: 'var(--line)', overflow: 'hidden', verticalAlign: 'middle',
      }}
    >
      <span
        style={{
          display: 'block', width: `${pct}%`, height: '100%', borderRadius: '999px',
          background: 'var(--accent)',
        }}
      />
    </span>
  )
}

/**
 * Quoted against achieved: two dots on one track, the lighter one what was quoted
 * and the solid one what the shop achieved. The numbers are in the next columns —
 * the mark is for seeing the direction at a glance.
 */
export function Dumbbell({
  from, to, domain, title,
}: {
  from: number | null
  to: number | null
  domain: { min: number; max: number }
  title: string
}) {
  if (from === null || to === null) return <span className="muted" title={title}>—</span>
  const span = domain.max - domain.min
  const at = (v: number) => `${(Math.min(Math.max((v - domain.min) / span, 0), 1)) * 100}%`
  const left = Math.min(from, to)
  const right = Math.max(from, to)

  return (
    <span
      title={title}
      style={{ position: 'relative', display: 'inline-block', width: '7rem', height: '.75rem', verticalAlign: 'middle' }}
    >
      <span style={{
        position: 'absolute', top: '50%', left: 0, right: 0, height: '2px',
        background: 'var(--line)', transform: 'translateY(-50%)',
      }} />
      <span style={{
        position: 'absolute', top: '50%', left: at(left), width: `calc(${at(right)} - ${at(left)})`,
        height: '2px', background: 'var(--accent)', opacity: .45, transform: 'translateY(-50%)',
      }} />
      <Dot at={at(from)} solid={false} />
      <Dot at={at(to)} solid />
    </span>
  )
}

function Dot({ at, solid }: { at: string; solid: boolean }) {
  return (
    <span style={{
      position: 'absolute', top: '50%', left: at, width: '.5rem', height: '.5rem',
      marginLeft: '-.25rem', borderRadius: '999px', transform: 'translateY(-50%)',
      background: solid ? 'var(--accent)' : 'var(--card)',
      border: `2px solid var(--accent)`, boxSizing: 'content-box',
      // A 2px ring of surface, so overlapping dots stay two dots.
      outline: '2px solid var(--card)',
    }} />
  )
}
