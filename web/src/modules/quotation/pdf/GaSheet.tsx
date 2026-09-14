import { Page, Text, View } from '@react-pdf/renderer'
import type { PdfGaSheet } from './types'
import { gaGeometry } from './ga-geometry'
import { GaBoard } from './GaBoard'

/**
 * Annexure V: one panel's general arrangement on a landscape page — the front
 * elevation, and for a board with a face at the back, the rear elevation after it
 * (roadmap 3.8, spec §5).
 *
 * Black line art, as the mockup draws it and as a drawing office would: no
 * gradients, no colour, no device faces. The customer reads the section letters,
 * the tags and the dimensions; the workshop prints it and builds from it.
 *
 * It draws the layout somebody saved. It invents nothing — a panel with no saved
 * layout has no sheet at all.
 */
export function GaSheet({
  sheet,
  referenceNo,
  companyName,
  customerName,
  dateLong,
  sheetNo,
  sheetCount,
}: {
  sheet: PdfGaSheet
  referenceNo: string
  companyName: string
  customerName: string
  dateLong: string
  sheetNo: number
  sheetCount: number
}) {
  const ink = '#111827'
  const rear = sheet.elevation === 'rear'
  const scaleWords = gaGeometry(sheet).scaleWords

  return (
    <Page size="A4" orientation="landscape" style={{ padding: 24, fontFamily: 'Helvetica', fontSize: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: ink, paddingBottom: 4 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10 }}>
          ANNEXURE V — GENERAL ARRANGEMENT ({rear ? 'REAR' : 'FRONT'} ELEVATION)
        </Text>
        <Text style={{ fontSize: 7 }}>
          Ref. {referenceNo} · Sheet {sheetNo} of {sheetCount} · scale {scaleWords}, not to scale on print — work to the dimensions · drawn by CostMatrix from the saved layout, version {sheet.version}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9 }}>
          {sheet.panelName}{sheet.optionLabel === null ? '' : ` — ${sheet.optionLabel.toUpperCase()}`}
        </Text>
        <Text style={{ fontSize: 7 }}>
          {sheet.construction} · {sheet.sections.length} sections
          {/* A rear elevation reads backwards, and saying so is the difference
              between a drawing somebody can build from and one they misread. */}
          {rear
            ? ' · VIEWED FROM THE BACK: SECTIONS MIRRORED, RIGHT TO LEFT'
            : sheet.hasRearFace
              ? ' · DOUBLE-FRONT: face B is on the rear elevation overleaf'
              : ''}
        </Text>
      </View>

      <GaBoard sheet={sheet} ink={ink} />

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: ink, paddingTop: 4, marginTop: 'auto' }}>
        <Text style={{ fontSize: 7 }}>{sheet.specLine}</Text>
        <Text style={{ fontSize: 7 }}>
          {companyName.toUpperCase()} · {customerName} · {referenceNo} · {dateLong}
        </Text>
      </View>
    </Page>
  )
}
