import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useFeatures } from '../admin/use-features'
import { listMyDesk } from './desk-api'
import { ageWords, byKind, deskLink, headline } from './desk'

/**
 * What is on your desk (migration 0126): the card on the home page listing the
 * work waiting on the person signed in.
 *
 * It shows **nothing at all** when there is nothing waiting — no empty state, no
 * "you're all caught up". A card that is always there is furniture; one that only
 * appears when it has something to say is read.
 *
 * Nothing on it can be ticked off: every line is cleared by doing the work the
 * line is about, which is why each one is a link rather than a checkbox.
 */
export function DeskCard() {
  const { on } = useFeatures()
  const desk = useQuery({ queryKey: ['my-desk'], queryFn: listMyDesk, enabled: on('my_desk') })
  const items = desk.data ?? []
  if (!on('my_desk') || items.length === 0) return null

  return (
    <div className="card">
      <div className="spread">
        <h2 style={{ margin: 0 }}>On your desk</h2>
      </div>
      <p className="muted" style={{ margin: '.4rem 0 .6rem' }}>{headline(items)}</p>

      {byKind(items).map((group) => (
        <div key={group.kind} style={{ marginTop: '.6rem' }}>
          <strong>{group.label}</strong>
          <p className="muted" style={{ margin: '.15rem 0 .3rem' }}>{group.blurb}</p>
          <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
            {group.items.map((item) => (
              <li key={item.entity_id}>
                <Link to={deskLink(item)}>{item.reference}</Link> — {item.title}{' '}
                <span className="muted">
                  · {item.detail} · {ageWords(item.days)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
