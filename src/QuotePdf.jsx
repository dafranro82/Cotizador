import React from 'react';
import { PDFDownloadLink, Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { Download } from 'lucide-react';

function formatMoney(value, currencyCode = 'COP') {
  return new Intl.NumberFormat(currencyCode === 'USD' ? 'en-US' : 'es-CO', {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: currencyCode === 'USD' ? 2 : 0
  }).format(Number(value) || 0);
}

export default function PdfDownload({ quote, customer }) {
  return (
    <PDFDownloadLink
      className="download-link"
      fileName={`Komodo-oferta-${quote.number}.pdf`}
      document={<QuotePdf quote={quote} customer={customer} />}
    >
      {({ loading }) => (
        <>
          <Download size={16} />
          {loading ? 'Preparando PDF' : 'Descargar PDF'}
        </>
      )}
    </PDFDownloadLink>
  );
}

function QuotePdf({ quote, customer }) {
  const today = new Date(quote.createdAt).toLocaleDateString('es-CO');
  const quoteCurrency = quote.currency || 'COP';
  return (
    <Document>
      <Page size="A4" style={pdfStyles.page}>
        <View style={pdfStyles.header}>
          <View style={pdfStyles.brandBox}>
            <Text style={pdfStyles.logo}>K</Text>
            <Text style={pdfStyles.brandName}>Komodo</Text>
          </View>
          <View style={pdfStyles.projectBox}>
            <Text style={pdfStyles.title}>PROYECTO</Text>
            <Text style={pdfStyles.project}>{customer.projectName}</Text>
          </View>
          <View style={pdfStyles.offerBox}>
            <Text style={pdfStyles.title}>OFERTA {quote.number}</Text>
            <Text>Fecha {today}</Text>
            <Text>Contacto: {customer.contactName}</Text>
            <Text>{customer.email}</Text>
            <Text>Moneda: {quoteCurrency}</Text>
            <Text>TRM: {formatMoney(quote.trm, 'COP')}</Text>
          </View>
        </View>

        <View style={pdfStyles.clientGrid}>
          <Text>Cliente: {customer.clientCompany}</Text>
          <Text>Dirigido a: {customer.contactName}</Text>
          <Text>Direccion: {customer.address}</Text>
          <Text>Telefono: {customer.phone}</Text>
          <Text>Celular: {customer.mobile}</Text>
          <Text>E-Mail: {customer.email}</Text>
        </View>

        <View style={pdfStyles.tableHeader}>
          <Text style={pdfStyles.ref}>REFERENCIA</Text>
          <Text style={pdfStyles.desc}>DESCRIPCION</Text>
          <Text style={pdfStyles.qty}>CAN</Text>
          <Text style={pdfStyles.money}>PRECIO</Text>
          <Text style={pdfStyles.money}>SUBTOTAL</Text>
        </View>
        {quote.items.map((item) => (
          <View style={pdfStyles.tableRow} key={item.id}>
            <Text style={pdfStyles.ref}>{item.reference}</Text>
            <Text style={pdfStyles.desc}>{item.description}</Text>
            <Text style={pdfStyles.qty}>{item.quantity}</Text>
            <Text style={pdfStyles.money}>{formatMoney(item.unitPrice, quoteCurrency)}</Text>
            <Text style={pdfStyles.money}>{formatMoney(item.lineTotal, quoteCurrency)}</Text>
          </View>
        ))}
        <View style={pdfStyles.totalBox}>
          <Text>Subtotal {formatMoney(quote.subtotal, quoteCurrency)}</Text>
          <Text style={pdfStyles.total}>Total {formatMoney(quote.total, quoteCurrency)}</Text>
        </View>
      </Page>
    </Document>
  );
}

const pdfStyles = StyleSheet.create({
  page: { padding: 24, fontSize: 9, fontFamily: 'Helvetica', color: '#111827' },
  header: { flexDirection: 'row', gap: 10, borderBottom: '2 solid #a9ad28', paddingBottom: 8 },
  brandBox: { width: '28%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#c3c929', color: '#fff', fontSize: 22, textAlign: 'center', paddingTop: 7 },
  brandName: { fontSize: 22, color: '#7a7d86' },
  projectBox: { width: '36%', alignItems: 'center', justifyContent: 'center' },
  offerBox: { width: '36%', backgroundColor: '#d6d06a', padding: 10, borderRadius: 6, gap: 3 },
  title: { fontSize: 12, fontWeight: 'bold' },
  project: { color: '#cc0000', marginTop: 6 },
  clientGrid: { marginTop: 12, gap: 4 },
  tableHeader: { flexDirection: 'row', marginTop: 14, borderBottom: '1 solid #a9ad28', paddingBottom: 5, fontWeight: 'bold' },
  tableRow: { flexDirection: 'row', minHeight: 34, borderBottom: '1 solid #eeeeee', paddingVertical: 7 },
  ref: { width: '18%' },
  desc: { width: '42%' },
  qty: { width: '8%', textAlign: 'center' },
  money: { width: '16%', textAlign: 'right' },
  totalBox: { marginTop: 18, marginLeft: 'auto', width: 180, gap: 6 },
  total: { fontSize: 13, fontWeight: 'bold' }
});
