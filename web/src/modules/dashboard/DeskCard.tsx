import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useFeatures } from '../admin/use-features'
import { listMyDesk } from './desk-api'
import { ageWords, byKind, deskLink, headline } from './desk'

/**
 * What is on your desk (migration 0129): section 1 of the home page, listing the
 * work waiting on the person signed in.
 *
 * It shows **nothing at all** when there is nothing waiting — no empty state, no
 * "you're all caught up". A card that is always there is furniture; one that only
 * appears when it has something to say is read.
 *
 * Nothing on it can be ticked off: every line is cleared by doing the work the
 * line is about, which is why each one is a link and the last column says what
 * that work is rather than offering a button that would only pretend.
 */
export function DeskCard() {
  const { on } = useFeatures()
  const desk = useQuery({ queryKey: ['my-desk'], queryFn: listMyDesk, enabled: on('my_desk') })
  const items = desk.data ?? []
  if (!on('my_desk') || items.length === 0) return null

  return (
    <div className="section">
      <div className="section-head">
        <span className="n">1</span>
        <span className="sd ok" />
        <h2>On your desk</h2>
        <span className="q">{headline(items)}</span>
      </div>
      <div className="panel flush">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>What it is</th>
                <th>Waiting</th>
                <th>What next</th>
              </tr>
            </thead>
            {byKind(items).map((group) => (
              <tbody key={group.kind}>
                <tr className="subtotal">
                  <td className="l" colSpan={4} title={group.blurb}>
                    {group.label}
                  </td>
                </tr>
                {group.items.map((item) => (
                  <tr key={item.entity_id}>
                    <td className="mono">
                      <Link to={deskLink(item)}>{item.reference}</Link>
                    </td>
                    <td>
                      {item.title}
                      <span className="sub">{item.detail}</span>
                    </td>
                    <td>{ageWords(item.days)}</td>
                    <td>{group.next}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </div>
  )
}
