import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { ImportCard } from './ImportCard'
import { importComponents, importKitGroupHours, importKits } from './import-api'

/**
 * The seed importer: the three CSV files under data/seed, in order. The
 * master admin loads the master library; a company admin loads private parts
 * and kits for their own company. Nothing is ever deleted by an import.
 */
export function SeedImportPage() {
  const { company, isMasterAdmin } = useSession()
  const queryClient = useQueryClient()
  const [toMaster, setToMaster] = useState(isMasterAdmin)
  if (!company) return null
  const target = toMaster ? null : company.id

  const refresh = () => {
    for (const key of ['components', 'assemblies', 'kit-groups', 'kit-group-hours', 'assembly-hours']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }

  return (
    <>
      <h1>Import</h1>
      <p className="muted">
        Load the catalogue and the kits from the CSV files derived from your exports
        (<code>data/seed/</code> in the repository; <code>README.md</code> there explains the
        columns and lists the rows worth checking first). Do the three steps in order: kits need
        their parts, hours need their kit groups. Each step shows what would happen before it
        saves anything, and never deletes.
      </p>
      {isMasterAdmin && (
        <label className="row" style={{ gap: '.4rem', marginBottom: '.75rem' }}>
          <input type="checkbox" checked={toMaster} onChange={(e) => setToMaster(e.target.checked)} />
          Import into the master library (shared with every company)
        </label>
      )}

      <ImportCard
        step={1}
        title="Components"
        blurb="components.csv — one row per part: purchase price and currency, or kg per metre for busbar. Parts without a price import as placeholders and are flagged; price them on the Components screen before costing."
        required={['part_number', 'name', 'bom_category']}
        run={(rows, apply, fileName) => importComponents(rows, target, apply, fileName)}
        onApplied={refresh}
      />
      <ImportCard
        step={2}
        title="Kits and kit groups"
        blurb="kits.csv — one row per kit line. Kit groups are created from the kit_group column. A kit is accepted only if every part is in the library and exactly one line is its main device; re-importing a changed kit replaces its lines and keeps its hours."
        required={['kit_group', 'kit_name', 'part_number', 'quantity', 'is_main_device']}
        run={(rows, apply, fileName) => importKits(rows, target, apply, fileName)}
        onApplied={refresh}
      />
      <ImportCard
        step={3}
        title="Kit group hours"
        blurb="kit-group-labour-template.csv with the hours filled in — one row per kit group and kind of work. Blank rows are skipped, so you can fill the file a group at a time. The Kit groups screen edits the same figures."
        required={['kit_group', 'process_type', 'hours']}
        run={(rows, apply) => importKitGroupHours(rows, target, apply)}
        onApplied={refresh}
      />
    </>
  )
}
