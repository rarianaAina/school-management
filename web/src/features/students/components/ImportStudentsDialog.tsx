import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSchool } from '@/features/schools/SchoolProvider'
import { supabase, describeSupabaseError } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/** Colonnes acceptées dans le fichier, avec leurs alias tolérés. */
const COLUMN_ALIASES: Record<string, string[]> = {
  first_name: ['prenom', 'prénom', 'first_name', 'firstname'],
  last_name: ['nom', 'last_name', 'lastname', 'nom_de_famille'],
  birth_date: ['date_de_naissance', 'naissance', 'birth_date', 'date_naissance'],
  gender: ['sexe', 'genre', 'gender'],
  email: ['email', 'e-mail', 'courriel'],
  phone: ['telephone', 'téléphone', 'phone', 'tel'],
  address: ['adresse', 'address'],
  city: ['ville', 'city'],
  nationality: ['nationalite', 'nationalité', 'nationality'],
  birth_place: ['lieu_de_naissance', 'birth_place', 'lieu_naissance'],
  previous_school: ['etablissement_precedent', 'previous_school', 'ecole_precedente'],
}

const GENDER_ALIASES: Record<string, string> = {
  m: 'male',
  masculin: 'male',
  homme: 'male',
  male: 'male',
  f: 'female',
  feminin: 'female',
  féminin: 'female',
  femme: 'female',
  female: 'female',
}

interface ParsedRow {
  line: number
  values: Record<string, string | null>
  error: string | null
}

function normalizeHeader(header: string): string | null {
  const clean = header
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')

  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const normalizedAliases = aliases.map((alias) =>
      alias.normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
    )
    if (normalizedAliases.includes(clean)) return field
  }
  return null
}

/** Accepte 12/04/2009, 12-04-2009 et 2009-04-12. */
function normalizeDate(value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (iso) return trimmed

  const french = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(trimmed)
  if (french) {
    const [, day, month, year] = french
    return `${year}-${month!.padStart(2, '0')}-${day!.padStart(2, '0')}`
  }

  return null
}

const TEMPLATE =
  'prenom,nom,date_de_naissance,sexe,email,telephone,adresse,ville,nationalite\n' +
  'Lucas,Dupont,12/04/2009,M,lucas.dupont@example.com,+261340000000,Lot II A,Antananarivo,Malgache\n'

interface ImportStudentsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported: () => void | Promise<unknown>
}

export function ImportStudentsDialog({
  open,
  onOpenChange,
  onImported,
}: ImportStudentsDialogProps) {
  const { schoolId } = useSchool()
  const inputRef = useRef<HTMLInputElement>(null)
  const [filename, setFilename] = useState<string | null>(null)
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [missingColumns, setMissingColumns] = useState<string[]>([])
  const [progress, setProgress] = useState(0)

  const validRows = rows.filter((row) => !row.error)
  const invalidRows = rows.filter((row) => row.error)

  function reset() {
    setFilename(null)
    setRows([])
    setMissingColumns([])
    setProgress(0)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleFile(file: File) {
    setFilename(file.name)

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const headers = result.meta.fields ?? []
        const mapping = new Map<string, string>()
        for (const header of headers) {
          const field = normalizeHeader(header)
          if (field) mapping.set(header, field)
        }

        const mapped = new Set(mapping.values())
        const missing = ['first_name', 'last_name'].filter((field) => !mapped.has(field))
        setMissingColumns(missing)

        if (missing.length > 0) {
          setRows([])
          return
        }

        const parsed: ParsedRow[] = result.data.map((raw, index) => {
          const values: Record<string, string | null> = {}
          for (const [header, field] of mapping) {
            const value = (raw[header] ?? '').trim()
            values[field] = value === '' ? null : value
          }

          let error: string | null = null

          if (!values.first_name) error = 'Prénom manquant'
          else if (!values.last_name) error = 'Nom manquant'

          if (values.birth_date) {
            const normalized = normalizeDate(values.birth_date)
            if (!normalized) error ??= `Date illisible : « ${values.birth_date} »`
            values.birth_date = normalized
          }

          if (values.gender) {
            const normalized = GENDER_ALIASES[values.gender.trim().toLowerCase()]
            values.gender = normalized ?? null
          }

          return { line: index + 2, values, error }
        })

        setRows(parsed)
      },
      error: (error) => toast.error(`Lecture impossible : ${error.message}`),
    })
  }

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!schoolId) throw new Error('Aucun établissement actif.')

      const { data: job, error: jobError } = await supabase
        .from('import_jobs')
        .insert({
          school_id: schoolId,
          entity: 'students',
          filename: filename ?? 'import.csv',
          status: 'processing',
          total_rows: rows.length,
          error_rows: invalidRows.length,
          errors: invalidRows.map((row) => ({ line: row.line, message: row.error })),
        })
        .select('id')
        .single()
      if (jobError) throw jobError

      // Insertion par lots : un CSV de rentrée dépasse vite la taille d'une
      // seule requête, et un lot en échec n'annule pas les précédents.
      const BATCH = 50
      let inserted = 0
      const failures: Array<{ line: number; message: string }> = []

      for (let index = 0; index < validRows.length; index += BATCH) {
        const batch = validRows.slice(index, index + BATCH)
        const payload = batch.map((row) => ({
          school_id: schoolId,
          status: 'enrolled' as const,
          ...row.values,
        }))

        const { error, count } = await supabase
          .from('students')
          .insert(payload as never, { count: 'exact' })

        if (error) {
          failures.push({
            line: batch[0]!.line,
            message: `Lignes ${batch[0]!.line}–${batch.at(-1)!.line} : ${describeSupabaseError(error)}`,
          })
        } else {
          inserted += count ?? batch.length
        }

        setProgress(Math.round(((index + batch.length) / validRows.length) * 100))
      }

      await supabase
        .from('import_jobs')
        .update({
          status: failures.length > 0 && inserted === 0 ? 'failed' : 'completed',
          success_rows: inserted,
          error_rows: invalidRows.length + failures.length,
          errors: [
            ...invalidRows.map((row) => ({ line: row.line, message: row.error })),
            ...failures,
          ],
        })
        .eq('id', job.id)

      return { inserted, failures }
    },
    onSuccess: async ({ inserted, failures }) => {
      await onImported()
      if (failures.length > 0) {
        toast.warning(`${inserted} élève(s) importé(s), ${failures.length} lot(s) en échec.`)
      } else {
        toast.success(`${inserted} élève${inserted > 1 ? 's' : ''} importé${inserted > 1 ? 's' : ''}.`)
      }
      reset()
      onOpenChange(false)
    },
  })

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'modele-import-eleves.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (importMutation.isPending) return
        if (!next) reset()
        onOpenChange(next)
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importer des élèves</DialogTitle>
          <DialogDescription>
            Fichier CSV encodé en UTF-8. Les colonnes sont reconnues par leur intitulé, en
            français comme en anglais.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadTemplate}>
              <Download className="size-4" />
              Télécharger le modèle
            </Button>
            <span className="text-xs text-muted-foreground">
              Colonnes obligatoires : prénom, nom.
            </span>
          </div>

          <label
            className={cn(
              'flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center transition-colors',
              'hover:border-primary/50 hover:bg-accent/40',
            )}
          >
            <FileSpreadsheet className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium">
              {filename ?? 'Choisir un fichier CSV'}
            </span>
            <span className="text-xs text-muted-foreground">
              Aucun envoi tant que vous n&apos;avez pas confirmé.
            </span>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) handleFile(file)
              }}
            />
          </label>

          {missingColumns.length > 0 ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertDescription>
                Colonnes obligatoires introuvables :{' '}
                {missingColumns.map((c) => (c === 'first_name' ? 'prénom' : 'nom')).join(', ')}.
                Vérifiez la première ligne du fichier.
              </AlertDescription>
            </Alert>
          ) : null}

          {rows.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary" className="gap-1.5">
                  <CheckCircle2 className="size-3.5" />
                  {validRows.length} ligne{validRows.length > 1 ? 's' : ''} valide
                  {validRows.length > 1 ? 's' : ''}
                </Badge>
                {invalidRows.length > 0 ? (
                  <Badge variant="outline" className="gap-1.5 text-destructive">
                    <AlertTriangle className="size-3.5" />
                    {invalidRows.length} ignorée{invalidRows.length > 1 ? 's' : ''}
                  </Badge>
                ) : null}
              </div>

              {invalidRows.length > 0 ? (
                <ScrollArea className="max-h-40 rounded-md border">
                  <ul className="divide-y text-sm">
                    {invalidRows.slice(0, 50).map((row) => (
                      <li key={row.line} className="flex gap-3 px-3 py-2">
                        <span className="tabular shrink-0 text-muted-foreground">
                          Ligne {row.line}
                        </span>
                        <span className="text-destructive">{row.error}</span>
                      </li>
                    ))}
                  </ul>
                </ScrollArea>
              ) : null}

              {importMutation.isPending ? <Progress value={progress} /> : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={importMutation.isPending}
          >
            Annuler
          </Button>
          <Button
            onClick={() => importMutation.mutate()}
            disabled={validRows.length === 0 || importMutation.isPending}
          >
            {importMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Importer {validRows.length > 0 ? `${validRows.length} élève(s)` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
