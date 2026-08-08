import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatDate, formatNumber } from '@/lib/formatters'
import { mentionFor, type SchoolSettings } from '@/types/domain'
import type { SubjectResultRow, TermResultRow, UnitResultRow } from '../api/grading.api'

export interface ReportCardData {
  schoolName: string
  schoolCity?: string | null
  yearName: string
  termName: string
  className: string
  levelName?: string | null
  result: TermResultRow
  subjects: SubjectResultRow[]
  units: UnitResultRow[]
  settings: SchoolSettings
}

const MARGIN = 14

/**
 * Bulletin PDF.
 *
 * Deux gabarits selon le mode de notation : relevé de matières avec
 * coefficients et rang, ou relevé semestriel d'unités d'enseignement avec
 * crédits acquis. Les données proviennent des tables figées à la publication,
 * jamais des vues de calcul en direct : un bulletin déjà remis ne bouge plus.
 */
export function buildReportCard(data: ReportCardData): jsPDF {
  const isEcts = data.settings.grading.mode === 'ects'
  const scale = data.settings.grading.scale
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const width = doc.internal.pageSize.getWidth()

  // En-tête
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(data.schoolName, MARGIN, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(110)
  if (data.schoolCity) doc.text(data.schoolCity, MARGIN, 25)
  doc.text(`Année scolaire ${data.yearName}`, width - MARGIN, 20, { align: 'right' })
  doc.text(data.termName, width - MARGIN, 25, { align: 'right' })

  doc.setDrawColor(200)
  doc.line(MARGIN, 29, width - MARGIN, 29)

  doc.setTextColor(20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(isEcts ? 'Relevé de notes semestriel' : 'Bulletin scolaire', MARGIN, 38)

  // Identité
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const student = data.result.student
  doc.text(`Élève : ${student?.full_name ?? ''}`, MARGIN, 46)
  doc.text(`Matricule : ${student?.matricule ?? ''}`, MARGIN, 51)
  doc.text(
    `${data.className}${data.levelName ? ` — ${data.levelName}` : ''}`,
    width - MARGIN,
    46,
    { align: 'right' },
  )
  doc.text(`Effectif : ${data.result.class_size ?? '—'}`, width - MARGIN, 51, { align: 'right' })

  // Corps
  if (isEcts) {
    autoTable(doc, {
      startY: 58,
      head: [["Unité d'enseignement", 'Moyenne', 'Crédits', 'Acquis', 'Validation']],
      body: data.units.map((unit) => [
        `${unit.study_unit?.code ?? ''} — ${unit.study_unit?.name ?? ''}`,
        unit.average !== null ? formatNumber(Number(unit.average), 2) : '—',
        formatNumber(Number(unit.credits), 1),
        formatNumber(Number(unit.credits_earned), 1),
        unit.is_validated
          ? unit.validation_mode === 'compensation'
            ? 'Validée (compensation)'
            : 'Validée'
          : 'Non validée',
      ]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [55, 65, 120], textColor: 255 },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
        3: { halign: 'right' },
      },
    })
  } else {
    autoTable(doc, {
      startY: 58,
      head: [['Matière', 'Coef.', 'Moyenne', 'Classe', 'Min', 'Max', 'Rang', 'Enseignant']],
      body: data.subjects.map((subject) => [
        subject.class_subject?.subject?.name ?? '',
        formatNumber(Number(subject.coefficient), 0),
        subject.average !== null ? formatNumber(Number(subject.average), 2) : '—',
        subject.class_average !== null ? formatNumber(Number(subject.class_average), 2) : '—',
        subject.class_min !== null ? formatNumber(Number(subject.class_min), 2) : '—',
        subject.class_max !== null ? formatNumber(Number(subject.class_max), 2) : '—',
        subject.rank ?? '—',
        subject.class_subject?.teacher?.full_name ?? '—',
      ]),
      styles: { fontSize: 8.5, cellPadding: 2 },
      headStyles: { fillColor: [55, 65, 120], textColor: 255 },
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right', fontStyle: 'bold' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    })
  }

  const afterTable = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY

  // Synthèse
  const average = data.result.general_average !== null ? Number(data.result.general_average) : null
  const mention = mentionFor(average, scale)

  autoTable(doc, {
    startY: afterTable + 6,
    body: [
      [
        { content: 'Moyenne générale', styles: { fontStyle: 'bold' } },
        average !== null ? `${formatNumber(average, 2)} / ${scale}` : '—',
        { content: isEcts ? 'Crédits acquis' : 'Rang', styles: { fontStyle: 'bold' } },
        isEcts
          ? `${formatNumber(Number(data.result.credits_earned ?? 0), 1)} / ${formatNumber(
              Number(data.result.credits_required ?? 0),
              1,
            )}`
          : `${data.result.rank ?? '—'} sur ${data.result.class_size ?? '—'}`,
      ],
      [
        { content: 'Moyenne de la classe', styles: { fontStyle: 'bold' } },
        data.result.class_average !== null
          ? formatNumber(Number(data.result.class_average), 2)
          : '—',
        { content: mention ? 'Mention' : 'Décision', styles: { fontStyle: 'bold' } },
        mention ?? data.result.decision ?? '—',
      ],
    ],
    styles: { fontSize: 9.5, cellPadding: 2.5 },
    theme: 'grid',
  })

  const afterSummary = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY

  // Appréciation
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text("Appréciation générale", MARGIN, afterSummary + 10)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  const comment = data.result.head_comment?.trim() || '—'
  doc.text(doc.splitTextToSize(comment, width - MARGIN * 2), MARGIN, afterSummary + 16)

  // Pied de page
  doc.setFontSize(8)
  doc.setTextColor(130)
  doc.text(
    `Absences : ${data.result.absences_count} · Retards : ${data.result.late_count}`,
    MARGIN,
    doc.internal.pageSize.getHeight() - 14,
  )
  doc.text(
    data.result.published_at
      ? `Publié le ${formatDate(data.result.published_at)}`
      : 'Document provisoire — non publié',
    width - MARGIN,
    doc.internal.pageSize.getHeight() - 14,
    { align: 'right' },
  )

  return doc
}

export function reportCardFilename(data: ReportCardData): string {
  const name = (data.result.student?.full_name ?? 'bulletin')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .toLowerCase()
  return `bulletin-${name}-${data.termName.replace(/\s+/g, '-').toLowerCase()}.pdf`
}
