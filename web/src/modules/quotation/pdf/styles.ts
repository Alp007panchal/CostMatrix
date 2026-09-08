import { StyleSheet } from '@react-pdf/renderer'

/** One place for the look: Helvetica, 10 pt, thin table borders, A4 margins. */
export const s = StyleSheet.create({
  page: { paddingTop: 110, paddingBottom: 70, paddingHorizontal: 56, fontFamily: 'Helvetica', fontSize: 10, lineHeight: 1.4 },

  header: { position: 'absolute', top: 28, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  headerLogo: { width: 110, height: 56, objectFit: 'contain' },
  headerLogoGap: { width: 110, height: 56 },
  headerLines: { fontSize: 8, textAlign: 'right', lineHeight: 1.35 },
  headerRule: { position: 'absolute', top: 92, left: 56, right: 56, borderBottomWidth: 1, borderBottomColor: '#222' },

  footer: { position: 'absolute', bottom: 24, left: 56, right: 56, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerLogos: { flexDirection: 'row', gap: 10 },
  footerLogo: { height: 22, width: 60, objectFit: 'contain' },
  pageNo: { fontSize: 8, color: '#555' },

  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  bold: { fontFamily: 'Helvetica-Bold' },
  para: { marginBottom: 8 },
  subject: { fontFamily: 'Helvetica-Bold', textDecoration: 'underline', marginVertical: 10 },
  annexList: { marginVertical: 8, paddingLeft: 12 },
  annexItem: { flexDirection: 'row', marginBottom: 2 },
  annexKey: { width: 82, fontFamily: 'Helvetica-Bold' },

  h1: { fontFamily: 'Helvetica-Bold', fontSize: 11, marginBottom: 10, textDecoration: 'underline' },
  h2: { fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 8, marginBottom: 4 },
  bullet: { flexDirection: 'row', marginBottom: 3, paddingLeft: 8 },
  bulletDot: { width: 14 },
  bulletText: { flex: 1 },

  table: { borderWidth: 1, borderColor: '#222', marginTop: 6, marginBottom: 12 },
  tr: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#222' },
  trLast: { flexDirection: 'row' },
  th: { fontFamily: 'Helvetica-Bold', fontSize: 8.5, padding: 4, borderRightWidth: 1, borderRightColor: '#222', backgroundColor: '#eee' },
  td: { fontSize: 9, padding: 4, borderRightWidth: 1, borderRightColor: '#222' },
  last: { borderRightWidth: 0 },
  right: { textAlign: 'right' },
  center: { textAlign: 'center' },

  cNo: { width: '9%' }, cDesc: { width: '41%' }, cUom: { width: '9%' }, cQty: { width: '9%' }, cUnit: { width: '16%' }, cTot: { width: '16%' },
  totalsLabel: { width: '84%', padding: 4, borderRightWidth: 1, borderRightColor: '#222', fontFamily: 'Helvetica-Bold', fontSize: 9 },
  totalsValue: { width: '16%', padding: 4, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 9 },

  tNo: { width: '8%' }, tPart: { width: '24%' }, tDesc: { width: '58%' }, tQty: { width: '10%' },

  termNo: { width: 18, fontFamily: 'Helvetica-Bold' },
  termBody: { flex: 1 },

  signoff: { marginTop: 18 },
})
