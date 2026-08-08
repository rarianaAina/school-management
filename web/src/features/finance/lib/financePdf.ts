import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/formatters'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/types/domain'

const MARGIN = 14

interface Party {
  schoolName: string
  schoolCity?: string | null
  schoolPhone?: string | null
  schoolEmail?: string | null
  currency: string
}

function header(doc: jsPDF, party: Party, title: string, reference: string) {
  const width = doc.internal.pageSize.getWidth()

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(party.schoolName, MARGIN, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  const contact = [party.schoolCity, party.schoolPhone, party.schoolEmail].filter(Boolean).join(' · ')
  if (contact) doc.text(contact, MARGIN, 25)

  doc.setTextColor(20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(title, width - MARGIN, 20, { align: 'right' })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(reference, width - MARGIN, 26, { align: 'right' })

  doc.setDrawColor(200)
  doc.line(MARGIN, 31, width - MARGIN, 31)
}

export interface InvoicePdfData {
  party: Party
  number: string
  issueDate: string
  dueDate: string
  studentName: string
  matricule: string
  lines: Array<{ label: string; quantity: number; unit_amount: number; amount: number }>
  totalAmount: number
  paidAmount: number
}

export function buildInvoicePdf(data: InvoicePdfData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  header(doc, data.party, 'FACTURE', `N° ${data.number}`)

  doc.setFontSize(10)
  doc.text(`Élève : ${data.studentName}`, MARGIN, 40)
  doc.text(`Matricule : ${data.matricule}`, MARGIN, 45)
  doc.text(`Émise le ${formatDate(data.issueDate)}`, width - MARGIN, 40, { align: 'right' })
  doc.text(`Échéance : ${formatDate(data.dueDate)}`, width - MARGIN, 45, { align: 'right' })

  autoTable(doc, {
    startY: 53,
    head: [['Désignation', 'Qté', 'P.U.', 'Montant']],
    body: data.lines.map((line) => [
      line.label,
      String(line.quantity),
      formatCurrency(line.unit_amount, data.party.currency),
      formatCurrency(line.amount, data.party.currency),
    ]),
    styles: { fontSize: 9.5, cellPadding: 2.5 },
    headStyles: { fillColor: [55, 65, 120], textColor: 255 },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  })

  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  const balance = data.totalAmount - data.paidAmount

  autoTable(doc, {
    startY: afterTable + 4,
    body: [
      ['Total', formatCurrency(data.totalAmount, data.party.currency)],
      ['Déjà réglé', formatCurrency(data.paidAmount, data.party.currency)],
      [
        { content: 'Reste à payer', styles: { fontStyle: 'bold' } },
        {
          content: formatCurrency(balance, data.party.currency),
          styles: { fontStyle: 'bold' },
        },
      ],
    ],
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 2.5, halign: 'right' },
    margin: { left: width / 2 },
  })

  doc.setFontSize(8)
  doc.setTextColor(130)
  doc.text(
    'Document généré automatiquement — à conserver.',
    MARGIN,
    doc.internal.pageSize.getHeight() - 14,
  )

  return doc
}

export interface ReceiptPdfData {
  party: Party
  receiptNumber: string
  paidAt: string
  amount: number
  method: PaymentMethod
  reference?: string | null
  studentName: string
  matricule: string
  invoiceNumber?: string | null
  invoiceBalance?: number | null
}

export function buildReceiptPdf(data: ReceiptPdfData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  header(doc, data.party, 'REÇU DE PAIEMENT', `N° ${data.receiptNumber}`)

  doc.setFontSize(10)
  doc.text(`Reçu de : ${data.studentName}`, MARGIN, 40)
  doc.text(`Matricule : ${data.matricule}`, MARGIN, 45)
  doc.text(`Le ${formatDateTime(data.paidAt)}`, width - MARGIN, 40, { align: 'right' })
  if (data.invoiceNumber) {
    doc.text(`Facture ${data.invoiceNumber}`, width - MARGIN, 45, { align: 'right' })
  }

  autoTable(doc, {
    startY: 55,
    body: [
      ['Montant réglé', formatCurrency(data.amount, data.party.currency)],
      ['Mode de règlement', PAYMENT_METHOD_LABELS[data.method]],
      ...(data.reference ? [['Référence', data.reference]] : []),
      ...(data.invoiceBalance !== null && data.invoiceBalance !== undefined
        ? [['Solde restant sur la facture', formatCurrency(data.invoiceBalance, data.party.currency)]]
        : []),
    ],
    theme: 'grid',
    styles: { fontSize: 10.5, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 70 } },
  })

  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  doc.setFontSize(9)
  doc.setTextColor(90)
  doc.text('Signature et cachet de l’établissement', width - MARGIN - 60, afterTable + 25)
  doc.setDrawColor(180)
  doc.line(width - MARGIN - 60, afterTable + 40, width - MARGIN, afterTable + 40)

  doc.setFontSize(8)
  doc.setTextColor(130)
  doc.text(
    'Ce reçu atteste du versement ci-dessus. Aucune rature n’est admise.',
    MARGIN,
    doc.internal.pageSize.getHeight() - 14,
  )

  return doc
}
