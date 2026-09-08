import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { QuotationPdfData } from './types'
import { s } from './styles'
import { Letterhead, Cell } from './Chrome'

/**
 * The quotation, laid out as the reference document is: a cover letter, then
 * four annexures. Every page carries the letterhead.
 */
export function QuotationDocument({ data }: { data: QuotationPdfData }) {
  return (
    <Document title={`${data.referenceNo} — ${data.customerName}`} author={data.letterhead.companyName}>
      <Page size="A4" style={s.page}>
        <Letterhead letterhead={data.letterhead} />

        <View style={s.metaRow}>
          <Text><Text style={s.bold}>Reference No.: </Text>{data.referenceNo}</Text>
          <Text>{data.dateLong}</Text>
        </View>

        <Text style={s.para}><Text style={s.bold}>To: </Text>{data.customerName}</Text>
        {data.customerAddress && <Text style={s.para}>{data.customerAddress}</Text>}
        <Text style={s.para}>{data.salutation}</Text>

        <Text style={s.subject}>{data.subject}</Text>
        <Text style={s.para}>{data.introText}</Text>

        <View style={s.annexList}>
          {[
            ['Annexure 1:', 'Notes/ Comments on Our Offer'],
            ['Annexure 2:', 'Commercial Terms (Schedule of Prices)'],
            ['Annexure 3:', 'Specific Terms & Conditions'],
            ['Annexure 4:', 'Detailed Technical Offer'],
          ].map(([k, v]) => (
            <View key={k} style={s.annexItem}>
              <Text style={s.annexKey}>{k}</Text>
              <Text>{v}</Text>
            </View>
          ))}
        </View>

        <Text style={s.para}>{data.closingText}</Text>
        <Text style={s.para}>We trust this meets with your requirements.</Text>

        <View style={s.signoff}>
          <Text>Yours Faithfully,</Text>
          {data.signatoryName && <Text style={[s.bold, { marginTop: 14 }]}>{data.signatoryName}</Text>}
          {data.signatoryEmail && <Text>{data.signatoryEmail}</Text>}
          <Text>{data.letterhead.companyName}</Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        <Letterhead letterhead={data.letterhead} />

        <Text style={s.h1}>ANNEXURE I: NOTES/ COMMENTS ON OUR OFFER</Text>
        {data.notesOnOffer.length === 0 && <Text style={s.para}>—</Text>}
        {data.notesOnOffer.map((note, i) => (
          <View key={i} style={s.bullet}>
            <Text style={s.bulletDot}>{String.fromCharCode(97 + (i % 26))})</Text>
            <Text style={s.bulletText}>{note}</Text>
          </View>
        ))}

        <Text style={[s.h1, { marginTop: 18 }]}>ANNEXURE II: (COMMERCIAL TERMS)</Text>
        {data.schedules.map((sch, i) => (
          <View key={i} wrap={false}>
            <Text style={s.h2}>{i + 1}. {sch.heading}</Text>
            <View style={s.table}>
              <View style={s.tr}>
                <Cell header style={s.cNo} align="center">ITEM NO</Cell>
                <Cell header style={s.cDesc}>DESCRIPTION</Cell>
                <Cell header style={s.cUom} align="center">UOM</Cell>
                <Cell header style={s.cQty} align="center">QTY</Cell>
                <Cell header style={s.cUnit} align="right">UNIT PRICE (IN {data.currencyLabel}.)</Cell>
                <Cell header style={s.cTot} align="right" last>TOTAL (IN {data.currencyLabel}.)</Cell>
              </View>
              {sch.rows.map((r) => (
                <View key={r.itemNo} style={s.tr}>
                  <Cell style={s.cNo} align="center">{r.itemNo}</Cell>
                  <Cell style={s.cDesc}>{r.description}</Cell>
                  <Cell style={s.cUom} align="center">{r.uom}</Cell>
                  <Cell style={s.cQty} align="center">{r.qty}</Cell>
                  <Cell style={s.cUnit} align="right">{r.unitPrice}</Cell>
                  <Cell style={s.cTot} align="right" last>{r.total}</Cell>
                </View>
              ))}
              <View style={s.tr}>
                <Text style={s.totalsLabel}>Sub total Amount in {data.currencyLabel}, Ex-works (subject to VAT)</Text>
                <Text style={s.totalsValue}>{sch.subtotal}</Text>
              </View>
              <View style={s.tr}>
                <Text style={s.totalsLabel}>{sch.taxLabel}</Text>
                <Text style={s.totalsValue}>{sch.tax}</Text>
              </View>
              <View style={s.trLast}>
                <Text style={s.totalsLabel}>Total Amount in {data.currencyLabel}, Ex-works (Inclusive of VAT)</Text>
                <Text style={s.totalsValue}>{sch.total}</Text>
              </View>
            </View>
          </View>
        ))}
      </Page>

      <Page size="A4" style={s.page}>
        <Letterhead letterhead={data.letterhead} />
        <Text style={s.h1}>ANNEXURE III: SPECIFIC TERMS & CONDITIONS</Text>
        {data.terms.map((t, i) => (
          <View key={t.heading} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row' }}>
              <Text style={s.termNo}>{i + 1}.</Text>
              <Text style={[s.bold, s.termBody]}>{t.heading}</Text>
            </View>
            <View style={{ flexDirection: 'row' }}>
              <Text style={s.termNo}> </Text>
              <Text style={s.termBody}>{t.body}</Text>
            </View>
          </View>
        ))}
      </Page>

      <Page size="A4" style={s.page}>
        <Letterhead letterhead={data.letterhead} />
        <Text style={s.h1}>ANNEXURE IV: DETAILED TECHNICAL OFFER</Text>
        <Text style={s.h2}>1. LV BOARD TECHNICAL DETAILS</Text>
        <View style={s.table}>
          <View style={s.tr}>
            <Cell header style={s.tNo} align="center">SR. NO</Cell>
            <Cell header style={s.tPart}>PARTICULAR</Cell>
            <Cell header style={s.tDesc}>TECHNICAL DESCRIPTION</Cell>
            <Cell header style={s.tQty} align="center" last>QTY</Cell>
          </View>
          {data.technical.map((row, i) => (
            <View key={row.srNo} style={i === data.technical.length - 1 ? s.trLast : s.tr} wrap>
              <Cell style={s.tNo} align="center">{row.srNo})</Cell>
              <Cell style={s.tPart}>{row.particular}</Cell>
              <Cell style={s.tDesc}>{row.description || '—'}</Cell>
              <Cell style={s.tQty} align="center" last>{row.qty}</Cell>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  )
}
