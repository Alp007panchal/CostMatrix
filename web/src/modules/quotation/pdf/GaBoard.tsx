import { G, Line, Rect, Svg, Text } from '@react-pdf/renderer'
import type { PdfGaSheet } from './types'
import { devicePlace, gaGeometry, sectionBands } from './ga-geometry'

/**
 * The board itself, drawn — the part of a general-arrangement sheet that is line
 * art rather than page furniture (roadmap 3.8, spec §5).
 *
 * One component draws both elevations, because they are one board. What the rear
 * sheet changes is decided in `ga.ts` (the sections reversed, face B's devices
 * kept) and in `sectionBands` (the busbar chamber on the other hand); nothing
 * here is a second drawing that could drift from the first.
 */
export function GaBoard({ sheet, ink }: { sheet: PdfGaSheet; ink: string }) {
  const g = gaGeometry(sheet)
  const mirrored = sheet.elevation === 'rear'
  const top = 34
  const left = 28
  const footY = top + g.boardHeight + g.baseHeight

  return (
    <Svg width={780} height={430} viewBox="0 0 780 430" style={{ marginTop: 6 }}>
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

        {g.sections.map(({ section, x, width }) => {
          const band = sectionBands(section, left + x, width, g, mirrored)
          const devices = section.devices.filter((d) => d.face === sheet.elevation)
          return (
            <G key={section.name}>
              {/* The cubicle. */}
              <Rect x={left + x} y={top} width={width} height={g.boardHeight} stroke={ink} strokeWidth={1.4} fill="none" />
              {/* Its distribution-busbar compartment, where it has one. */}
              {band.compartmentWidth > 0 && (
                <Rect
                  x={band.compartmentX}
                  y={top + g.chamber}
                  width={band.compartmentWidth}
                  height={g.boardHeight - g.chamber * 2}
                  stroke={ink}
                  strokeWidth={0.6}
                  fill="none"
                />
              )}

              {devices.map((device) => {
                const place = devicePlace(device, g)
                return (
                  <G key={device.tag}>
                    <Rect
                      x={band.deviceX}
                      y={top + place.y + 2}
                      width={band.deviceWidth}
                      height={Math.max(place.height - 4, 6)}
                      stroke={ink}
                      strokeWidth={0.8}
                      {...(device.unsized ? { strokeDasharray: '3 2' } : {})}
                      fill="none"
                    />
                    <Text
                      x={band.deviceX + band.deviceWidth / 2}
                      y={top + place.y + Math.max(place.height / 2, 6)}
                      style={{ fontSize: 6 }}
                      textAnchor="middle"
                      fill={ink}
                    >
                      {device.tag} · {device.label}{device.quantity > 1 ? ` × ${device.quantity}` : ''}
                    </Text>
                    {device.unsized && (
                      <Text x={band.deviceX + band.deviceWidth / 2} y={top + place.y + Math.max(place.height / 2, 6) + 7} style={{ fontSize: 5 }} textAnchor="middle" fill={ink}>
                        size not on record
                      </Text>
                    )}
                  </G>
                )
              })}

              {/* A section with nothing on this side is drawn as the steel it is,
                  and says what is behind it rather than being left blank. */}
              {mirrored && devices.length === 0 && (
                <Text x={left + x + width / 2} y={top + g.boardHeight / 2} style={{ fontSize: 6 }} textAnchor="middle" fill={ink}>
                  NO DEVICES ON THIS FACE
                </Text>
              )}

              {/* Its heading, above the board, as a drawing labels sections. */}
              <Text x={left + x + width / 2} y={top - 16} style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }} textAnchor="middle" fill={ink}>
                SECTION {section.name}
              </Text>
              <Text x={left + x + width / 2} y={top - 7} style={{ fontSize: 6 }} textAnchor="middle" fill={ink}>
                {mirrored ? section.rearWords : section.designWords} · {section.widthMm}
              </Text>
            </G>
          )
        })}

        {/* The base the board stands on. */}
        <Rect x={left} y={top + g.boardHeight} width={g.boardWidth} height={g.baseHeight} stroke={ink} strokeWidth={1} fill="none" />

        {/* The dimension line: each section, then the overall. */}
        <Line x1={left} y1={footY + 18} x2={left + g.boardWidth} y2={footY + 18} stroke={ink} strokeWidth={0.6} />
        {g.sections.map(({ section, x, width }) => (
          <G key={`dim-${section.name}`}>
            <Line x1={left + x} y1={footY + 13} x2={left + x} y2={footY + 23} stroke={ink} strokeWidth={0.6} />
            <Text x={left + x + width / 2} y={footY + 31} style={{ fontSize: 6 }} textAnchor="middle" fill={ink}>
              {section.widthMm}
            </Text>
          </G>
        ))}
        <Line x1={left + g.boardWidth} y1={footY + 13} x2={left + g.boardWidth} y2={footY + 23} stroke={ink} strokeWidth={0.6} />
        <Text x={left + g.boardWidth / 2} y={footY + 42} style={{ fontSize: 7, fontFamily: 'Helvetica-Bold' }} textAnchor="middle" fill={ink}>
          OVERALL {sheet.widthMm} (W) × {sheet.heightMm + sheet.baseMm} (H)
          {sheet.depthMm === null ? '' : ` × ${sheet.depthMm} (D)`} MM
        </Text>
      </G>
    </Svg>
  )
}
