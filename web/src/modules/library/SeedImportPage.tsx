import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useSession } from '../auth/session'
import { ImportCard } from './ImportCard'
import { importComponents, importDimensions, importKitGroupHours, importKits } from './import-api'

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
        Load the catalogue and the kits from the cleaned files in <code>data/seed/</code>
        (<code>README.md</code> there explains the columns; the two <code>*-issues.csv</code> files
        list what the clean-up changed). Do the three steps in order: kits need their parts, hours
        need their kit groups. Each step shows what would happen before it saves anything, and
        never deletes.
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
        blurb="components.csv — one row per part in the supplier template: purchase price in EUR, category, brand, rating. Busbar sizes are priced by weight (kg per metre = price ÷ the copper rate). Parts without a price import as placeholders and are flagged; price them on the Components screen before costing."
        required={['partNumber', 'description', 'category', 'priceEur', 'purchaseCurrency']}
        second={{ label: 'Category map', hint: 'category-map.csv, which BOM category each catalogue category belongs to', required: ['category', 'bomCategory'] }}
        run={(rows, map, apply, fileName) => importComponents(rows, map, target, apply, fileName)}
        onApplied={refresh}
      />
      <ImportCard
        step={2}
        title="Kits and kit groups"
        blurb="kits.csv — one row per kit line. With kit-labour-template.csv each kit gets its labour group (the 17 groups become the kit groups), its main device and any hours of its own. A kit is accepted only if every part is in the library and its main device is among its lines; re-importing a changed kit replaces its lines and keeps its hours."
        required={['kitName', 'partNumber', 'quantity', 'kitGroup']}
        second={{ label: 'Kit template', hint: 'kit-labour-template.csv, one row per kit', required: ['kitName', 'labourGroup', 'mainPart'] }}
        run={(rows, tpl, apply, fileName) => importKits(rows, tpl, target, apply, fileName)}
        onApplied={refresh}
      />
      <ImportCard
        step={3}
        title="Kit group hours"
        blurb="kit-group-labour-template.csv with the hours filled in — one row per labour group with three columns: panel assembly, wiring, busbar fabrication. Blank cells are skipped, so you can fill the file a group at a time. The Kit groups screen edits the same figures."
        required={['labourGroup', 'hoursPanelAssembly', 'hoursWiring', 'hoursBusbarFabrication']}
        run={(rows, _second, apply) => importKitGroupHours(rows, target, apply)}
        onApplied={refresh}
      />
      <ImportCard
        step={4}
        title="Dimensions (optional)"
        blurb="dimensions-template.csv — one row per part, its number and description already filled in, for you to add width, height, depth, what it mounts on, clearances and weight; for an enclosure cubicle, the usable area inside it and its chambers. Nothing here changes a price or a category, blank rows are counted as not done yet, and the only thing that uses the figures is the space check on a costing panel. Regenerate the file with scripts/build_dimensions_template.py; it keeps what you have already typed."
        required={['partNumber']}
        run={(rows, _second, apply) => importDimensions(rows, target, apply)}
        onApplied={refresh}
      />
    </>
  )
}
