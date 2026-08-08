import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Calculator, Download, FileText, Send, Trophy } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatCard } from '@/components/shared/StatCard'
import { RoleGate } from '@/components/shared/RoleGate'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { useSchool } from '@/features/schools/SchoolProvider'
import { queryClient } from '@/lib/queryClient'
import { formatNumber } from '@/lib/formatters'
import { listClasses } from '@/features/academics/api/academics.api'
import { mentionFor } from '@/types/domain'
import {
  computeTermResults,
  listSubjectResults,
  listTermResults,
  listUnitResults,
  publishTermResults,
  saveTermComment,
  storeReportCard,
  type TermResultRow,
} from '../api/grading.api'
import { buildReportCard, reportCardFilename, type ReportCardData } from '../lib/reportCardPdf'

export function ReportCardsPage() {
  const { schoolId, school, selectedYearId, settings, terms, currentTerm, academicYears } =
    useSchool()
  const isEcts = settings.grading.mode === 'ects'

  const [classId, setClassId] = useState('')
  const [termId, setTermId] = useState('')
  const [publishOpen, setPublishOpen] = useState(false)
  const [commentFor, setCommentFor] = useState<TermResultRow | null>(null)
  const [commentText, setCommentText] = useState('')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  useEffect(() => {
    if (!termId && currentTerm) setTermId(currentTerm.id)
  }, [currentTerm, termId])

  const classesQuery = useQuery({
    queryKey: ['classes', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listClasses(schoolId!, selectedYearId!),
  })

  useEffect(() => {
    if (!classId && classesQuery.data?.[0]?.id) setClassId(classesQuery.data[0].id!)
  }, [classesQuery.data, classId])

  const resultsQuery = useQuery({
    queryKey: ['term-results', schoolId, classId, termId],
    enabled: Boolean(classId && termId),
    queryFn: () => listTermResults(classId, termId),
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['term-results', schoolId] })

  const computeMutation = useMutation({
    mutationFn: () => computeTermResults(classId, termId),
    onSuccess: async (count) => {
      await refresh()
      toast.success(
        count > 0
          ? `${count} bulletin${count > 1 ? 's' : ''} calculé${count > 1 ? 's' : ''}.`
          : 'Aucune note à consolider sur cette période.',
      )
    },
  })

  const publishMutation = useMutation({
    mutationFn: () => publishTermResults(classId, termId),
    onSuccess: async (count) => {
      await refresh()
      toast.success(`${count} bulletin(s) publié(s) — visibles par les élèves et les parents.`)
    },
  })

  const commentMutation = useMutation({
    mutationFn: ({ id, comment }: { id: string; comment: string | null }) =>
      saveTermComment(id, comment),
    onSuccess: async () => {
      await refresh()
      setCommentFor(null)
      toast.success('Appréciation enregistrée.')
    },
  })

  /** Assemble les données figées puis produit le PDF ; le dépôt est optionnel. */
  async function buildFor(result: TermResultRow, upload: boolean) {
    const klass = classesQuery.data?.find((item) => item.id === classId)
    const term = terms.find((item) => item.id === termId)
    const year = academicYears.find((item) => item.id === selectedYearId)

    const [subjects, units] = await Promise.all([
      isEcts ? Promise.resolve([]) : listSubjectResults(result.student_id, termId),
      isEcts ? listUnitResults(result.student_id, termId) : Promise.resolve([]),
    ])

    const data: ReportCardData = {
      schoolName: school?.name ?? '',
      schoolCity: school?.city,
      yearName: year?.name ?? '',
      termName: term?.name ?? '',
      className: klass?.name ?? '',
      levelName: klass?.level_name,
      result,
      subjects,
      units,
      settings,
    }

    const doc = buildReportCard(data)

    if (upload && schoolId) {
      await storeReportCard(schoolId, termId, result.student_id, result.id, doc.output('blob'))
    }

    return { doc, data }
  }

  const downloadMutation = useMutation({
    mutationFn: async (result: TermResultRow) => {
      const { doc, data } = await buildFor(result, true)
      doc.save(reportCardFilename(data))
    },
    onSuccess: async () => {
      await refresh()
      toast.success('Bulletin généré et archivé.')
    },
  })

  const bulkMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const rows = (resultsQuery.data ?? []).filter((row) => ids.includes(row.id))
      for (const row of rows) {
        // Séquentiel : le rendu PDF est synchrone et bloquerait l'interface en
        // parallèle sur une classe entière.
        await buildFor(row, true)
      }
      return rows.length
    },
    onSuccess: async (count) => {
      await refresh()
      setSelectedIds([])
      toast.success(`${count} bulletin(s) archivé(s) dans le stockage.`)
    },
  })

  const results = resultsQuery.data ?? []
  const published = results.filter((row) => row.is_published).length
  const classAverage =
    results.length > 0
      ? results.reduce((sum, row) => sum + Number(row.general_average ?? 0), 0) / results.length
      : null
  const passing = results.filter(
    (row) => Number(row.general_average ?? 0) >= settings.grading.passing_score,
  ).length

  const columns: Column<TermResultRow>[] = [
    {
      id: 'rank',
      header: 'Rang',
      width: '70px',
      cell: (row) => (
        <span className="tabular font-medium">
          {row.rank ?? '—'}
          {row.rank === 1 ? <Trophy className="ml-1 inline size-3.5 text-warning" /> : null}
        </span>
      ),
    },
    {
      id: 'student',
      header: 'Élève',
      cell: (row) => (
        <div>
          <p className="font-medium">{row.student?.full_name}</p>
          <p className="tabular text-xs text-muted-foreground">{row.student?.matricule}</p>
        </div>
      ),
    },
    {
      id: 'average',
      header: 'Moyenne',
      align: 'right',
      cell: (row) => (
        <span
          className={
            Number(row.general_average ?? 0) >= settings.grading.passing_score
              ? 'tabular font-semibold'
              : 'tabular font-semibold text-destructive'
          }
        >
          {row.general_average !== null ? formatNumber(Number(row.general_average), 2) : '—'}
        </span>
      ),
    },
    ...(isEcts
      ? [
          {
            id: 'credits',
            header: 'Crédits',
            align: 'right' as const,
            cell: (row: TermResultRow) => (
              <span className="tabular">
                {formatNumber(Number(row.credits_earned ?? 0), 1)} /{' '}
                {formatNumber(Number(row.credits_required ?? 0), 1)}
              </span>
            ),
          },
        ]
      : [
          {
            id: 'mention',
            header: 'Mention',
            hideOnMobile: true,
            cell: (row: TermResultRow) => {
              const mention = mentionFor(
                row.general_average !== null ? Number(row.general_average) : null,
                settings.grading.scale,
              )
              return mention ? (
                <Badge variant="secondary">{mention}</Badge>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            },
          },
        ]),
    {
      id: 'comment',
      header: 'Appréciation',
      hideOnMobile: true,
      cell: (row) => (
        <button
          type="button"
          className="max-w-56 truncate text-left text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          onClick={(event) => {
            event.stopPropagation()
            setCommentFor(row)
            setCommentText(row.head_comment ?? '')
          }}
        >
          {row.head_comment || 'Ajouter…'}
        </button>
      ),
    },
    {
      id: 'status',
      header: 'Statut',
      cell: (row) =>
        row.is_published ? (
          <Badge>Publié</Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            Provisoire
          </Badge>
        ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      width: '60px',
      cell: (row) => (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Télécharger le bulletin"
          onClick={(event) => {
            event.stopPropagation()
            downloadMutation.mutate(row)
          }}
        >
          <Download className="size-4" />
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bulletins"
        description={
          isEcts
            ? "Relevés semestriels : unités d'enseignement, crédits et compensation."
            : 'Moyennes générales, rangs, appréciations et bulletins PDF.'
        }
        actions={
          <RoleGate permission="report_card:publish">
            <Button
              variant="outline"
              onClick={() => computeMutation.mutate()}
              disabled={!classId || !termId || computeMutation.isPending}
            >
              <Calculator className="size-4" />
              Calculer
            </Button>
            <Button
              onClick={() => setPublishOpen(true)}
              disabled={results.length === 0 || published === results.length}
            >
              <Send className="size-4" />
              Publier
            </Button>
          </RoleGate>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Select value={classId || undefined} onValueChange={setClassId}>
            <SelectTrigger className="w-52">
              <SelectValue placeholder={settings.vocabulary.class} />
            </SelectTrigger>
            <SelectContent>
              {(classesQuery.data ?? []).map((item) => (
                <SelectItem key={item.id!} value={item.id!}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={termId || undefined} onValueChange={setTermId}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={settings.vocabulary.term} />
            </SelectTrigger>
            <SelectContent>
              {terms.map((term) => (
                <SelectItem key={term.id} value={term.id}>
                  {term.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {results.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Bulletins" value={results.length} icon={FileText} />
          <StatCard
            label="Moyenne de classe"
            value={classAverage !== null ? formatNumber(classAverage, 2) : '—'}
          />
          <StatCard
            label="Au-dessus du seuil"
            value={`${passing} / ${results.length}`}
            tone={passing === results.length ? 'success' : 'default'}
            hint={`Seuil : ${settings.grading.passing_score}`}
          />
          <StatCard
            label="Publiés"
            value={`${published} / ${results.length}`}
            tone={published === results.length ? 'success' : 'warning'}
          />
        </div>
      ) : null}

      <DataTable
        columns={columns}
        rows={results}
        getRowId={(row) => row.id}
        isLoading={resultsQuery.isPending}
        selection={{ selectedIds, onChange: setSelectedIds }}
        bulkActions={(ids) => (
          <Button size="sm" onClick={() => bulkMutation.mutate(ids)} disabled={bulkMutation.isPending}>
            <Download className="size-4" />
            Archiver les PDF
          </Button>
        )}
        emptyState={
          <EmptyState
            icon={FileText}
            title="Aucun bulletin"
            description="Lancez le calcul : les moyennes, rangs et statistiques de classe sont consolidés depuis les notes saisies."
          />
        }
      />

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publier les bulletins de cette classe ?"
        description="Les élèves et leurs parents y auront immédiatement accès. Les valeurs publiées sont figées : un recalcul ultérieur ne modifie pas les bulletins déjà remis."
        confirmLabel="Publier"
        onConfirm={async () => {
          await publishMutation.mutateAsync()
        }}
      />

      <Dialog open={Boolean(commentFor)} onOpenChange={(open) => !open && setCommentFor(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Appréciation — {commentFor?.student?.full_name}</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={5}
            value={commentText}
            onChange={(event) => setCommentText(event.target.value)}
            placeholder="Trimestre satisfaisant, des efforts à poursuivre à l'écrit…"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCommentFor(null)}>
              Annuler
            </Button>
            <Button
              onClick={() =>
                commentFor &&
                commentMutation.mutate({ id: commentFor.id, comment: commentText || null })
              }
              disabled={commentMutation.isPending}
            >
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
