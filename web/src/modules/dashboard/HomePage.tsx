import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { useFeatures } from '../admin/use-features'
import { PageHeader } from '../../app/PageHeader'
import { listFollowups } from '../crm/api'
import { listQuotations } from '../quotation/api'
import { listLibraryHealth } from '../library/library-health-api'
import { listMyDesk } from './desk-api'
import { todayIso } from './attention'
import { exceptions, homeTiles } from './home-tiles'
import { DeskCard } from './DeskCard'
import { FollowUpsSection } from './FollowUpsSection'

/**
 * Where signing in lands you (house style §5): four tiles, one bar of things
 * that need a decision today, then the two sections that are actual work.
 *
 * What left, and where it went: "How your company is set up" is now Settings ›
 * Company details, and "Your roles" is the block at the bottom of the sidebar.
 * Neither was ever something a person came here to read — they were here because
 * there was nowhere else to put them.
 */
export function HomePage() {
  const { profile, company, isMasterAdmin } = useSession()
  const { on } = useFeatures()
  const desk = useQuery({ queryKey: ['my-desk'], queryFn: listMyDesk, enabled: on('my_desk') })
  const quotations = useQuery({ queryKey: ['quotations'], queryFn: listQuotations })
  const followups = useQuery({ queryKey: ['followups'], queryFn: listFollowups })
  const library = useQuery({
    queryKey: ['library-health'],
    queryFn: listLibraryHealth,
    enabled: on('library_health'),
  })
  if (!profile || !company) return null

  const today = todayIso()
  const tiles = homeTiles(desk.data ?? [], quotations.data ?? [], followups.data ?? [], today)
  const bar = exceptions(desk.data ?? [], followups.data ?? [], library.data ?? [], today)

  return (
    <>
      <PageHeader
        title={`Good day, ${profile.full_name.split(' ')[0]}`}
        meta={`${company.name}${isMasterAdmin ? ' · master administrator' : ''}`}
      />
      <p className="intro">
        Everything here comes from costings and quotations already in the app — nothing is typed
        twice. Red means somebody must act today; amber means watch it.
      </p>

      <div className="kpi-row">
        {tiles.map((tile) => (
          <div className={tile.tone === undefined ? 'kpi' : `kpi k-${tile.tone}`} key={tile.label}>
            <div className="label">{tile.label}</div>
            <div className="value">{tile.value}</div>
            <div className="delta">{tile.delta}</div>
          </div>
        ))}
      </div>

      {bar.length > 0 && (
        <div className="exbar">
          <div className="exbar-head">
            <span className="n">{bar.length}</span>
            <span className="t">
              {bar.length === 1 ? 'one thing needs a decision now' : `${bar.length} things need a decision now`}
            </span>
            <span className="hint">click one to open where it came from</span>
          </div>
          <div className="exlist">
            {bar.map((item) => (
              <Link className={item.watch === true ? 'exitem watch' : 'exitem'} to={item.to} key={item.src}>
                <span className="sev" />
                <div>
                  <div className="hl">{item.hl}</div>
                  <div className="why">{item.why}</div>
                  <div className="src">{item.src}</div>
                </div>
                <span className="fig">{item.fig}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid2">
        <DeskCard />
        <FollowUpsSection />
      </div>
    </>
  )
}
