import { G, Line, Page, Rect, Svg, Text, View } from '@react-pdf/renderer'
import type { PdfGaSheet } from './types'
import { devicePlace, gaGeometry } from './ga-geometry'

/**
 * Annexure V: one panel's general arrangement, front elevation, on a landscape
 * page (roadmap 3.8, spec §5).
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
  const g = gaGeometry(sheet)
  const ink = '#111827'
  // The frame the drawing sits in, with room above for the section headings and
  // below for the dimension line.
  const top = 34
  const left = 28

  return (
    <Page size="A4" orientation="landscape" style={{ padding: 24, fontFamily: 'Helvetica', fontSize: 8 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1, borderBottomColor: ink, paddingBottom: 4 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 10 }}>
          ANNEXURE V — GENERAL ARRANGEMENT (FRONT ELEVATION)
        </Text>
        <Text style={{ fontSize: 7 }}>
          Ref. {referenceNo} · Sheet {sheetNo} of {sheetCount} · scale {g.scaleWords}, not to scale on print — work to the dimensions · drawn by CostMatrix from the saved layout, version {sheet.version}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 9 }}>
          {sheet.panelName}{sheet.optionLabel === null ? '' : ` — ${sheet.optionLabel.toUpperCase()}`}
        </Text>
        <Text style={{ fontSize: 7 }}>
          {sheet.construction} · {sheet.sections.length} sections
          {sheet.hasRearFace ? ' · DOUBLE-FRONT: face B is not shown on a front elevation' : ''}
        </Text>
      </View>

      <Svg width={780} height={430} viewBox={`0 0 780 430`} style={{ marginTop: 6 }}>
        <G>
          {/* The two chambers, across the whole board. */}
          <Rect x={left} y={top} width={g.boardWidth} height={g.chamber} stroke={ink} strokeWidth={0.8} fill="none" />
          <Rect x={left} y={top + g.boardHeight - g.chamber} width={g.boardWidth} height={g.chamber} stroke={ink} strokeWidth={0.8} fill="none" />
          <Text x={left + g.boardWidth / 2} y={top + g.chamber * 0.62} style={{ fontSize: 6 }} textAnchor="middle" fill={ink}>
            HORIZONTAL BUSBAR CHAMBER
          </Text>
          <Text x={left + g.boardWidth / 2} y={top + g.boardHeight - g.chamber * 0.38} style={{ fontSize: 6 }} textAnchor="middle" fill={ink}>
            CABLE CHAMBER
          </Text>

          {g.sections.map(({ section, x, width }) => (
            <G key={section.name}>
              {/* The cubicle. */}
              <Rect x={left + x} y={top} width={width} height={g.boardHeight} stroke={ink} strokeWidth={1.4} fill="none" />
              {/* Its distribution-busbar compartment, where it has one. */}
              {section.busbarCompartmentMm > 0 && (
                <Rect
                  x={left + x}
                  y={top + g.chamber}
                  width={section.busbarCompartmentMm * g.scale}
                  height={g.boardHeight - g.chamber * 2}
                  stroke={ink}
                  strokeWidth={0.6}
                  fill="none"
                />
              )}

              {section.devices.filter((d) => d.face === 'front').map((device) => {
                const place = devicePlace(device, g)
                const inset = section.busbarCompartmentMm * g.scale + 6
                const deviceWidth = Math.max(width - inset - 8, 10)
                return (
                  <G key={device.tag}>
                    <Rect
                      x={left + x + inset}
                      y={top + place.y + 2}
                      width={deviceWidth}
                      height={Math.max(place.height - 4, 6)}
                      stroke={ink}
                      strokeWidth={0.8}
                      {...(device.unsized ? { strokeDasharray: '3 2' } : {})}
                      fill="none"
                    />
                    <Text
                      x={left + x + inset + deviceWidth / 2}
                      y={top + place.y + Math.max(place.height / 2, 6)}
                      style={{ fontSize: 6 }}
                      textAnchor="middle"
                      fill={ink}
                    >
                      {device.tag} · {device.label}{device.quantity > 1 ? ` × ${device.quantity}` : ''}
                    </Text>
                    {device.unsized && (
                      <Text x={left + x + inset + deviceWidth / 2} y={top + place.y + Math.max(place.height / 2, 6) + 7} style={{ fontSize: 5 }} textAnchor="middle" fill={ink}>
                        size not on record
                      </Text>
                    )}
                  </G>
                )
              })}

              {/* Its heading, above the board, as a drawing labels sections. */}
              <Text x={left + x + width / 2} y={top - 16} style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }} textAnchor="middle" fill={ink}>
                SECTION {section.name}
              </Text>
              <Text x={left + x + width / 2} y={top - 7} style={{ fontSize: 6 }} textAnchor="middle" fill={ink}>
                {section.designWords} · {section.widthMm}
              </Text>
            </G>
          ))}

          {/* The base the board stands on. */}
          <Rect x={left} y={top + g.boardHeight} width={g.boardWidth} height={g.baseHeight} stroke={ink} strokeWidth={1} fill="none" />

          {/* The dimension line: each section, then the overall. */}
          <Line x1={left} y1={top + g.boardHeight + g.baseHeight + 18} x2={left + g.boardWidth} y2={top + g.boardHeight + g.baseHeight + 18} stroke={ink} strokeWidth={0.6} />
          {g.sections.map(({ section, x, width }) => (
            <G key={`dim-${section.name}`}>
              <Line x1={left + x} y1={top + g.boardHeight + g.baseHeight + 13} x2={left + x} y2={top + g.boardHeight + g.baseHeight + 23} stroke={ink} strokeWidth={0.6} />
              <Text x={left + x + width / 2} y={top + g.boardHeight + g.baseHeight + 31} style={{ fontSize: 6 }} textAnchor="middle" fill={ink}>
                {section.widthMm}
              </Text>
            </G>
          ))}
          <Line x1={left + g.boardWidth} y1={top + g.boardHeight + g.baseHeight + 13} x2={left + g.boardWidth} y2={top + g.boardHeight + g.baseHeight + 23} stroke={ink} strokeWidth={0.6} />
          <Text x={left + g.boardWidth / 2} y={top + g.boardHeight + g.baseHeight + 42} style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }} textAnchor="middle" fill={ink}>
            OVERALL {sheet.widthMm} (W) × {sheet.heightMm + sheet.baseMm} (H)
            {sheet.depthMm === null ? '' : ` × ${sheet.depthMm} (D)`} MM
          </Text>
        </G>
      </Svg>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: ink, paddingTop: 4, marginTop: 'auto' }}>
        <Text style={{ fontSize: 7 }}>{sheet.specLine}</Text>
        <Text style={{ fontSize: 7 }}>
          {companyName.toUpperCase()} · {customerName} · {referenceNo} · {dateLong}
        </Text>
      </View>
    </Page>
  )
}
