import type { BoardAnswers } from '../../lib/database.types'
import { CHANGEOVERS, SOURCES } from './board'

/**
 * The questions the configurator asks, in the order a board is described
 * (roadmap 3.1): what feeds it, what the incomer is, how the supplies change
 * over, what goes out, what is corrected and metered, and the enclosure's own
 * answers — which are recorded, not priced (decision 1).
 */
export function BoardQuestions({
  answers, onChange,
}: {
  answers: BoardAnswers
  onChange: (next: BoardAnswers) => void
}) {
  const set = <K extends keyof BoardAnswers>(key: K, value: BoardAnswers[K]) =>
    onChange({ ...answers, [key]: value })

  const setFeeder = (i: number, patch: Partial<BoardAnswers['feeders'][number]>) =>
    set('feeders', answers.feeders.map((f, j) => (i === j ? { ...f, ...patch } : f)))

  return (
    <>
      <div className="row" style={{ flexWrap: 'wrap', gap: '.6rem', marginTop: '.5rem' }}>
        <span className="muted" style={{ fontSize: '.8125rem' }}>Fed from</span>
        {SOURCES.map((source) => (
          <label key={source} className="row" style={{ gap: '.25rem' }}>
            <input
              type="checkbox"
              checked={answers.sources.includes(source)}
              style={{ width: 'auto' }}
              onChange={(e) => set('sources', e.target.checked
                ? [...answers.sources, source]
                : answers.sources.filter((s) => s !== source))}
            />
            <span style={{ fontSize: '.8125rem' }}>{source}</span>
          </label>
        ))}
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: '.4rem', marginTop: '.5rem' }}>
        <span className="muted" style={{ fontSize: '.8125rem' }}>Incomer</span>
        <input
          type="number" min="0" step="1" style={{ width: '6rem' }}
          aria-label="Incomer rating in amps" placeholder="amps"
          value={answers.incomer_rating_a ?? ''}
          onChange={(e) => set('incomer_rating_a', e.target.value === '' ? null : Number(e.target.value))}
        />
        <select
          aria-label="Incomer type" style={{ width: '11rem' }}
          value={answers.incomer_type}
          onChange={(e) => set('incomer_type', e.target.value)}
        >
          <option value="acb">ACB</option>
          <option value="mccb">MCCB</option>
          <option value="switch">Switch disconnector</option>
          <option value="">Whatever fits</option>
        </select>
        <select
          aria-label="Changeover" style={{ width: '15rem' }}
          value={answers.changeover}
          onChange={(e) => set('changeover', e.target.value)}
        >
          {CHANGEOVERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      <div style={{ marginTop: '.5rem' }}>
        <span className="muted" style={{ fontSize: '.8125rem' }}>Outgoing ways</span>
        {answers.feeders.map((feeder, i) => (
          <div key={i} className="row" style={{ gap: '.4rem', marginTop: '.25rem' }}>
            <input
              type="number" min="0" step="1" style={{ width: '5.5rem' }}
              aria-label={`Way ${i + 1} rating in amps`} placeholder="amps"
              value={feeder.rating_a || ''}
              onChange={(e) => setFeeder(i, { rating_a: Number(e.target.value) })}
            />
            <span className="muted" style={{ fontSize: '.8125rem' }}>×</span>
            <input
              type="number" min="0" step="1" style={{ width: '5rem' }}
              aria-label={`Way ${i + 1} how many`} placeholder="how many"
              value={feeder.quantity || ''}
              onChange={(e) => setFeeder(i, { quantity: Number(e.target.value) })}
            />
            <select
              aria-label={`Way ${i + 1} device`} style={{ width: '8rem' }}
              value={feeder.type}
              onChange={(e) => setFeeder(i, { type: e.target.value })}
            >
              <option value="mccb">MCCB</option>
              <option value="mcb">MCB</option>
              <option value="">Whatever fits</option>
            </select>
            {answers.feeders.length > 1 && (
              <button
                aria-label={`Remove way ${i + 1}`}
                onClick={() => set('feeders', answers.feeders.filter((_, j) => j !== i))}
              >
                −
              </button>
            )}
          </div>
        ))}
        <button
          style={{ marginTop: '.3rem', fontSize: '.8125rem' }}
          onClick={() => set('feeders', [...answers.feeders, { rating_a: 0, quantity: 0, type: 'mccb' }])}
        >
          + another rating
        </button>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: '.4rem', marginTop: '.5rem' }}>
        <span className="muted" style={{ fontSize: '.8125rem' }}>Correction</span>
        <input
          type="number" min="0" step="5" style={{ width: '6rem' }}
          aria-label="Correction in kVAr" placeholder="kVAr"
          value={answers.apfc_kvar ?? ''}
          onChange={(e) => set('apfc_kvar', e.target.value === '' ? null : Number(e.target.value))}
        />
        <label className="row" style={{ gap: '.25rem' }}>
          <input
            type="checkbox" checked={answers.metering} style={{ width: 'auto' }}
            onChange={(e) => set('metering', e.target.checked)}
          />
          <span style={{ fontSize: '.8125rem' }}>Metered</span>
        </label>
      </div>

      <div className="row" style={{ flexWrap: 'wrap', gap: '.4rem', marginTop: '.5rem' }}>
        <span className="muted" style={{ fontSize: '.8125rem' }}>Enclosure</span>
        <input aria-label="Form of separation" placeholder="form, e.g. 4B" style={{ width: '8rem' }}
               value={answers.form} onChange={(e) => set('form', e.target.value)} />
        <input aria-label="IP rating" placeholder="IP, e.g. IP54" style={{ width: '8rem' }}
               value={answers.ip} onChange={(e) => set('ip', e.target.value)} />
        <input aria-label="Access" placeholder="access, e.g. front" style={{ width: '9rem' }}
               value={answers.access} onChange={(e) => set('access', e.target.value)} />
        <input aria-label="Cable entry" placeholder="cable entry, e.g. bottom" style={{ width: '11rem' }}
               value={answers.cable_entry} onChange={(e) => set('cable_entry', e.target.value)} />
      </div>
      <p className="muted" style={{ fontSize: '.75rem', margin: '.3rem 0 0' }}>
        The enclosure answers are recorded on the panel and printed with it; the cubicles themselves
        are still costed as catalogue cubicles plus the company&rsquo;s uplift.
      </p>
    </>
  )
}
