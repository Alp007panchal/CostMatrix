import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Async } from '../../ui/Async'
import { PageHeader } from '../../app/PageHeader'
import type { LibraryIssueKind } from '../../lib/database.types'
import { listLibraryHealth, listLibraryIssues } from './library-health-api'
import { bySeverity, exampleWords, headline, kindLabel, libraryLabel } from './library-health'

/**
 * Library health (migration 0128): what the library is missing, live.
 *
 * The same list `data/seed/README.md` has carried since 8 September — parts with
 * no price, kits with only a main device, groups with no hours — except that this
 * one is read from the library as it stands rather than from a file written once,
 * and it says what each fault does to a costing.
 *
 * It reads only. Nothing here changes, blocks or refuses anything; every row
 * names the screen that fixes it and sends you there.
 */
export function LibraryHealthPage() {
  const [open, setOpen] = useState<LibraryIssueKind | null>(null)
  const health = useQuery({ queryKey: ['library-health'], queryFn: listLibraryHealth })

  return (
    <>
      <PageHeader title="Library health" meta="read only · nothing here is changed for you" />
      <p className="intro">
        What the library is missing, as it stands today. Nothing here is changed for you: each row
        says what the fault does to a costing and which screen puts it right.
      </p>

      <Async query={health} empty="Nothing to fix: every part can be priced and every kit is ready to cost.">
        {(rows) => (
          <>
            <p className="intro">
              <strong>{headline(rows)}</strong>
            </p>

            {bySeverity(rows).map((group, i) => (
              <section key={group.severity} className="section">
                <div className="section-head">
                  <span className="n">{i + 1}</span>
                  <span className={group.severity === 'refuses' ? 'sd bad' : 'sd warn'} />
                  <h2>{group.label}</h2>
                  <span className="q">{group.blurb}</span>
                </div>
                <div className="panel flush">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>What</th>
                        <th>Where</th>
                        <th>How many</th>
                        <th>For example</th>
                        <th>Put right on</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {group.rows.map((row) => (
                        <tr key={`${row.library}-${row.kind}`}>
                          <td>{kindLabel(row.kind)}</td>
                          <td>{libraryLabel(row.library)}</td>
                          <td className="num">{row.items.toLocaleString()}</td>
                          <td className="muted">{exampleWords(row)}</td>
                          <td>{row.fix_on}</td>
                          <td className="right">
                            <button
                              type="button"
                              className="ghost small"
                              onClick={() => setOpen(open === row.kind ? null : row.kind)}
                            >
                              {open === row.kind ? 'Hide' : 'List them'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {group.rows.some((row) => row.kind === open) && open !== null && (
                  <IssueList kind={open} />
                )}
                </div>
              </section>
            ))}
          </>
        )}
      </Async>
    </>
  )
}

/** The rows behind one heading, asked for only when somebody opens it. */
function IssueList({ kind }: { kind: LibraryIssueKind }) {
  const issues = useQuery({ queryKey: ['library-issues', kind], queryFn: () => listLibraryIssues(kind) })
  return (
    <Async query={issues} empty="Nothing here any more.">
      {(list) => (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Held by</th>
                <th>What is wrong</th>
              </tr>
            </thead>
            <tbody>
              {list.map((issue) => (
                <tr key={issue.entity_id}>
                  <td>{issue.code}</td>
                  <td>{issue.name}</td>
                  <td className="num">
                    {issue.entity === 'part' ? `${issue.used_by_kits.toLocaleString()} kit(s)` : ''}
                  </td>
                  <td className="muted">{issue.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Async>
  )
}
