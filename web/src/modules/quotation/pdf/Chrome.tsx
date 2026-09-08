import { Image, Text, View } from '@react-pdf/renderer'
import type { PdfLetterhead } from './types'
import { s } from './styles'

/** Letterhead at the top of every page, logos and page number at the bottom. */
export function Letterhead({ letterhead }: { letterhead: PdfLetterhead }) {
  return (
    <>
      <View style={s.header} fixed>
        {letterhead.logoDataUrl ? (
          <Image src={letterhead.logoDataUrl} style={s.headerLogo} />
        ) : (
          <View style={s.headerLogoGap}>
            <Text style={[s.bold, { fontSize: 12 }]}>{letterhead.companyName}</Text>
          </View>
        )}
        <View>
          {letterhead.lines.map((line) => (
            <Text key={line} style={s.headerLines}>{line}</Text>
          ))}
        </View>
      </View>
      <View style={s.headerRule} fixed />

      <View style={s.footer} fixed>
        <View style={s.footerLogos}>
          {letterhead.footerLogoDataUrls.map((src, i) => (
            <Image key={i} src={src} style={s.footerLogo} />
          ))}
        </View>
        <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </>
  )
}

/** A table header or body cell with the right borders. */
export function Cell({ children, style, header, last, align }: {
  children: React.ReactNode
  style: object
  header?: boolean
  last?: boolean
  align?: 'right' | 'center'
}) {
  const base = header ? s.th : s.td
  const alignStyle = align === 'right' ? s.right : align === 'center' ? s.center : {}
  return <Text style={[base, style, last ? s.last : {}, alignStyle]}>{children}</Text>
}
