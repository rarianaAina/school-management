import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import {
  AlertTriangle,
  BanknoteArrowUp,
  Coins,
  Download,
  FileText,
  Mail,
  Plus,
  Receipt,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable, type Column } from '@/components/shared/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { StatCard } from '@/components/shared/StatCard'
import { RoleGate } from '@/components/shared/RoleGate'
import { DateField, SelectField, SwitchField, TextField } from '@/components/shared/FormFields'
import { useSchool } from '@/features/schools/SchoolProvider'
import { queryClient } from '@/lib/queryClient'
import { formatCurrency, formatDate, formatNumber } from '@/lib/formatters'
import { listClasses, listLevels, listPrograms } from '@/features/academics/api/academics.api'
import {
  INVOICE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type InvoiceStatus,
  type PaymentMethod,
  type StudentBalance,
} from '@/types/domain'
import {
  billClass,
  cancelInvoice,
  createFeeCategory,
  createFeeStructure,
  deleteFeeStructure,
  getInvoice,
  getPayment,
  listBalances,
  listFeeCategories,
  listFeeStructures,
  listInvoices,
  listPayments,
  recordPayment,
  sendReminders,
  storeInvoicePdf,
  storeReceipt,
  type FeeStructureRow,
  type InvoiceRow,
  type PaymentRow,
} from '../api/finance.api'
import { buildInvoicePdf, buildReceiptPdf } from '../lib/financePdf'

const categorySchema = z.object({
  name: z.string().min(1, 'Nom requis').max(80),
  code: z.string().max(15).nullable(),
  is_mandatory: z.boolean(),
})

const structureSchema = z.object({
  fee_category_id: z.string().min(1, 'Catégorie requise'),
  level_id: z.string().nullable(),
  program_id: z.string().nullable(),
  class_id: z.string().nullable(),
  amount: z.coerce.number().min(0),
})

const billSchema = z.object({
  class_id: z.string().min(1, 'Classe requise'),
  due_date: z.string().min(1, 'Échéance requise'),
})

const paymentSchema = z.object({
  amount: z.coerce.number().positive('Montant strictement positif'),
  method: z.enum(['cash', 'bank_transfer', 'mobile_money', 'card', 'check', 'other']),
  reference: z.string().max(60).nullable(),
  paid_at: z.string().min(1),
})

const STATUS_VARIANT: Record<InvoiceStatus, 'default' | 'secondary' | 'outline'> = {
  draft: 'outline',
  issued: 'secondary',
  partially_paid: 'secondary',
  paid: 'default',
  overdue: 'outline',
  cancelled: 'outline',
}

export function FinancePage() {
  const { schoolId, school, selectedYearId, settings, can } = useSchool()
  const currency = school?.currency ?? 'EUR'
  const canManage = can('finance:write')

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [structureOpen, setStructureOpen] = useState(false)
  const [billOpen, setBillOpen] = useState(false)
  const [payFor, setPayFor] = useState<InvoiceRow | null>(null)
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
  const [range] = useState(() => {
    const to = new Date()
    const from = new Date(to.getFullYear(), to.getMonth() - 5, 1)
    return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
  })

  const invoicesQuery = useQuery({
    queryKey: ['invoices', schoolId, selectedYearId, { search, statusFilter }],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () =>
      listInvoices(schoolId!, selectedYearId!, {
        search,
        status: statusFilter === 'all' ? null : statusFilter,
        overdueOnly: statusFilter === 'overdue',
      }),
  })

  const balancesQuery = useQuery({
    queryKey: ['balances', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listBalances(schoolId!, selectedYearId!, true),
  })

  const paymentsQuery = useQuery({
    queryKey: ['payments', schoolId, range],
    enabled: Boolean(schoolId),
    queryFn: () => listPayments(schoolId!, range.from, range.to),
  })

  const categoriesQuery = useQuery({
    queryKey: ['fee-categories', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listFeeCategories(schoolId!),
  })

  const structuresQuery = useQuery({
    queryKey: ['fee-structures', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listFeeStructures(schoolId!, selectedYearId!),
  })

  const classesQuery = useQuery({
    queryKey: ['classes', schoolId, selectedYearId],
    enabled: Boolean(schoolId && selectedYearId),
    queryFn: () => listClasses(schoolId!, selectedYearId!),
  })

  const levelsQuery = useQuery({
    queryKey: ['levels', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listLevels(schoolId!),
  })

  const programsQuery = useQuery({
    queryKey: ['programs', schoolId],
    enabled: Boolean(schoolId),
    queryFn: () => listPrograms(schoolId!),
  })

  const invalidate = (key: string) =>
    queryClient.invalidateQueries({ queryKey: [key, schoolId] })

  const categoryMutation = useMutation({
    mutationFn: (values: z.infer<typeof categorySchema>) =>
      createFeeCategory({ school_id: schoolId!, ...values }),
    onSuccess: async () => {
      await invalidate('fee-categories')
      toast.success('Catégorie créée.')
    },
  })

  const structureMutation = useMutation({
    mutationFn: (values: z.infer<typeof structureSchema>) =>
      createFeeStructure({
        school_id: schoolId!,
        academic_year_id: selectedYearId!,
        currency,
        ...values,
      }),
    onSuccess: async () => {
      await invalidate('fee-structures')
      toast.success('Tarif enregistré.')
    },
  })

  const deleteStructureMutation = useMutation({
    mutationFn: (id: string) => deleteFeeStructure(id),
    onSuccess: async () => {
      await invalidate('fee-structures')
      toast.success('Tarif supprimé.')
    },
  })

  const billMutation = useMutation({
    mutationFn: (values: z.infer<typeof billSchema>) =>
      billClass(values.class_id, selectedYearId!, values.due_date),
    onSuccess: async ({ billed, skipped }) => {
      await Promise.all([invalidate('invoices'), invalidate('balances')])
      toast.success(
        `${billed} facture(s) émise(s)${skipped > 0 ? `, ${skipped} élève(s) déjà à jour` : ''}.`,
      )
    },
  })

  const paymentMutation = useMutation({
    mutationFn: async (values: z.infer<typeof paymentSchema>) => {
      const paymentId = await recordPayment({
        invoiceId: payFor!.id,
        amount: values.amount,
        method: values.method,
        reference: values.reference,
        paidAt: new Date(values.paid_at).toISOString(),
      })

      // Le reçu est produit dans la foulée : c'est le document que la famille
      // repart avec, il ne doit pas dépendre d'une action ultérieure.
      const payment = await getPayment(paymentId)
      const student = payment.student as unknown as {
        full_name: string | null
        matricule: string
      } | null
      const invoice = payment.invoice as unknown as {
        number: string
        balance: number
      } | null

      const doc = buildReceiptPdf({
        party: {
          schoolName: school?.name ?? '',
          schoolCity: school?.city,
          schoolPhone: school?.phone,
          schoolEmail: school?.email,
          currency,
        },
        receiptNumber: payment.receipt_number,
        paidAt: payment.paid_at,
        amount: Number(payment.amount),
        method: payment.method as PaymentMethod,
        reference: payment.reference,
        studentName: student?.full_name ?? '',
        matricule: student?.matricule ?? '',
        invoiceNumber: invoice?.number,
        invoiceBalance: invoice ? Number(invoice.balance) : null,
      })

      await storeReceipt(schoolId!, paymentId, doc.output('blob'))
      doc.save(`recu-${payment.receipt_number}.pdf`)
      return payment.receipt_number
    },
    onSuccess: async (receiptNumber) => {
      await Promise.all([invalidate('invoices'), invalidate('balances'), invalidate('payments')])
      setPayFor(null)
      toast.success(`Paiement enregistré — reçu ${receiptNumber}.`)
    },
  })

  const invoicePdfMutation = useMutation({
    mutationFn: async (row: InvoiceRow) => {
      const invoice = await getInvoice(row.id)
      const student = invoice.student as unknown as {
        full_name: string | null
        matricule: string
      } | null

      const doc = buildInvoicePdf({
        party: {
          schoolName: school?.name ?? '',
          schoolCity: school?.city,
          schoolPhone: school?.phone,
          schoolEmail: school?.email,
          currency,
        },
        number: invoice.number,
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        studentName: student?.full_name ?? '',
        matricule: student?.matricule ?? '',
        lines: (invoice.invoice_lines ?? []).map((line) => ({
          label: line.label,
          quantity: Number(line.quantity),
          unit_amount: Number(line.unit_amount),
          amount: Number(line.amount),
        })),
        totalAmount: Number(invoice.total_amount),
        paidAmount: Number(invoice.paid_amount),
      })

      await storeInvoicePdf(schoolId!, invoice.id, doc.output('blob'))
      doc.save(`facture-${invoice.number}.pdf`)
    },
    onSuccess: () => toast.success('Facture générée et archivée.'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelInvoice(id),
    onSuccess: async () => {
      await Promise.all([invalidate('invoices'), invalidate('balances')])
      toast.success('Facture annulée.')
    },
  })

  const remindersMutation = useMutation({
    mutationFn: (ids: string[]) => sendReminders(ids),
    onSuccess: (result) => {
      setSelectedInvoices([])
      toast.success(`${result.sent} relance(s) envoyée(s).`)
    },
  })

  const invoices = invoicesQuery.data ?? []
  const balances = balancesQuery.data ?? []

  const totals = useMemo(() => {
    const invoiced = invoices.reduce((sum, row) => sum + Number(row.total_amount), 0)
    const paid = invoices.reduce((sum, row) => sum + Number(row.paid_amount), 0)
    const overdue = invoices
      .filter((row) => Number(row.balance) > 0 && row.due_date < new Date().toISOString().slice(0, 10))
      .reduce((sum, row) => sum + Number(row.balance), 0)
    return { invoiced, paid, outstanding: invoiced - paid, overdue }
  }, [invoices])

  const recoveryRate = totals.invoiced > 0 ? (totals.paid / totals.invoiced) * 100 : null

  const invoiceColumns: Column<InvoiceRow>[] = [
    {
      id: 'number',
      header: 'Facture',
      cell: (row) => (
        <div>
          <p className="tabular font-medium">{row.number}</p>
          <p className="text-xs text-muted-foreground">{formatDate(row.issue_date)}</p>
        </div>
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
      id: 'total',
      header: 'Total',
      align: 'right',
      cell: (row) => (
        <span className="tabular">{formatCurrency(Number(row.total_amount), currency)}</span>
      ),
    },
    {
      id: 'balance',
      header: 'Reste',
      align: 'right',
      cell: (row) => (
        <span
          className={
            Number(row.balance) > 0 ? 'tabular font-semibold text-destructive' : 'tabular'
          }
        >
          {formatCurrency(Number(row.balance), currency)}
        </span>
      ),
    },
    {
      id: 'due',
      header: 'Échéance',
      hideOnMobile: true,
      cell: (row) => {
        const late =
          Number(row.balance) > 0 && row.due_date < new Date().toISOString().slice(0, 10)
        return (
          <span className={late ? 'tabular text-destructive' : 'tabular text-muted-foreground'}>
            {formatDate(row.due_date)}
          </span>
        )
      },
    },
    {
      id: 'status',
      header: 'Statut',
      cell: (row) => (
        <Badge variant={STATUS_VARIANT[row.status as InvoiceStatus]}>
          {INVOICE_STATUS_LABELS[row.status as InvoiceStatus]}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      width: '150px',
      cell: (row) => (
        <div className="flex justify-end gap-1" onClick={(event) => event.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Facture PDF"
            onClick={() => invoicePdfMutation.mutate(row)}
          >
            <Download className="size-4" />
          </Button>
          <RoleGate permission="finance:write">
            <Button
              variant="ghost"
              size="sm"
              disabled={Number(row.balance) <= 0 || row.status === 'cancelled'}
              onClick={() => setPayFor(row)}
            >
              <BanknoteArrowUp className="size-4" />
              Encaisser
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Annuler"
              className="text-destructive"
              disabled={Number(row.paid_amount) > 0 || row.status === 'cancelled'}
              onClick={() => cancelMutation.mutate(row.id)}
            >
              <Trash2 className="size-4" />
            </Button>
          </RoleGate>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finances"
        description="Grilles tarifaires, facturation, encaissements et suivi des impayés."
        actions={
          <RoleGate permission="finance:write">
            <Button onClick={() => setBillOpen(true)} disabled={!selectedYearId}>
              <FileText className="size-4" />
              Facturer une {settings.vocabulary.class.toLowerCase()}
            </Button>
          </RoleGate>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Facturé"
          value={formatCurrency(totals.invoiced, currency)}
          icon={FileText}
        />
        <StatCard label="Encaissé" value={formatCurrency(totals.paid, currency)} icon={Wallet} />
        <StatCard
          label="Reste à recouvrer"
          value={formatCurrency(totals.outstanding, currency)}
          icon={Coins}
          tone={totals.outstanding > 0 ? 'warning' : 'success'}
          hint={recoveryRate !== null ? `${formatNumber(recoveryRate, 1)} % recouvré` : undefined}
        />
        <StatCard
          label="Échu impayé"
          value={formatCurrency(totals.overdue, currency)}
          icon={AlertTriangle}
          tone={totals.overdue > 0 ? 'destructive' : 'success'}
        />
      </div>

      <Tabs defaultValue="invoices">
        <TabsList>
          <TabsTrigger value="invoices">Factures</TabsTrigger>
          <TabsTrigger value="unpaid">Impayés ({balances.length})</TabsTrigger>
          <TabsTrigger value="payments">Encaissements</TabsTrigger>
          <TabsTrigger value="fees">Grille tarifaire</TabsTrigger>
        </TabsList>

        {/* Factures ------------------------------------------------------- */}
        <TabsContent value="invoices" className="space-y-4 pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="N° de facture, élève, matricule…"
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes</SelectItem>
                <SelectItem value="overdue">En retard uniquement</SelectItem>
                {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map((value) => (
                  <SelectItem key={value} value={value}>
                    {INVOICE_STATUS_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DataTable
            columns={invoiceColumns}
            rows={invoices}
            getRowId={(row) => row.id}
            isLoading={invoicesQuery.isPending}
            selection={
              canManage ? { selectedIds: selectedInvoices, onChange: setSelectedInvoices } : undefined
            }
            bulkActions={(ids) => (
              <Button
                size="sm"
                onClick={() => remindersMutation.mutate(ids)}
                disabled={remindersMutation.isPending}
              >
                <Mail className="size-4" />
                Relancer par e-mail
              </Button>
            )}
            emptyState={
              <EmptyState
                icon={FileText}
                title="Aucune facture"
                description="Définissez la grille tarifaire, puis facturez une classe entière en une opération."
              />
            }
          />
        </TabsContent>

        {/* Impayés -------------------------------------------------------- */}
        <TabsContent value="unpaid" className="pt-4">
          <DataTable
            columns={
              [
                {
                  id: 'student',
                  header: 'Élève',
                  cell: (row: StudentBalance) => (
                    <div>
                      <p className="font-medium">{row.full_name}</p>
                      <p className="tabular text-xs text-muted-foreground">{row.matricule}</p>
                    </div>
                  ),
                },
                {
                  id: 'invoiced',
                  header: 'Facturé',
                  align: 'right',
                  cell: (row: StudentBalance) => (
                    <span className="tabular">
                      {formatCurrency(Number(row.total_invoiced), currency)}
                    </span>
                  ),
                },
                {
                  id: 'paid',
                  header: 'Payé',
                  align: 'right',
                  hideOnMobile: true,
                  cell: (row: StudentBalance) => (
                    <span className="tabular">
                      {formatCurrency(Number(row.total_paid), currency)}
                    </span>
                  ),
                },
                {
                  id: 'balance',
                  header: 'Reste dû',
                  align: 'right',
                  cell: (row: StudentBalance) => (
                    <span className="tabular font-semibold text-destructive">
                      {formatCurrency(Number(row.balance), currency)}
                    </span>
                  ),
                },
                {
                  id: 'overdue',
                  header: 'Retard',
                  align: 'right',
                  cell: (row: StudentBalance) =>
                    Number(row.days_overdue ?? 0) > 0 ? (
                      <Badge variant="outline" className="tabular text-destructive">
                        {row.days_overdue} j
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    ),
                },
              ] as Column<StudentBalance>[]
            }
            rows={balances}
            getRowId={(row) => `${row.student_id}`}
            isLoading={balancesQuery.isPending}
            emptyState={
              <EmptyState
                icon={Wallet}
                title="Aucun impayé"
                description="Toutes les factures émises sont soldées."
              />
            }
          />
        </TabsContent>

        {/* Encaissements --------------------------------------------------- */}
        <TabsContent value="payments" className="pt-4">
          <DataTable
            columns={
              [
                {
                  id: 'receipt',
                  header: 'Reçu',
                  cell: (row: PaymentRow) => (
                    <div>
                      <p className="tabular font-medium">{row.receipt_number}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(row.paid_at)}</p>
                    </div>
                  ),
                },
                {
                  id: 'student',
                  header: 'Élève',
                  cell: (row: PaymentRow) => row.student?.full_name ?? '—',
                },
                {
                  id: 'invoice',
                  header: 'Facture',
                  hideOnMobile: true,
                  cell: (row: PaymentRow) => (
                    <span className="tabular text-muted-foreground">
                      {row.invoice?.number ?? '—'}
                    </span>
                  ),
                },
                {
                  id: 'method',
                  header: 'Mode',
                  hideOnMobile: true,
                  cell: (row: PaymentRow) => (
                    <Badge variant="outline">
                      {PAYMENT_METHOD_LABELS[row.method as PaymentMethod]}
                    </Badge>
                  ),
                },
                {
                  id: 'amount',
                  header: 'Montant',
                  align: 'right',
                  cell: (row: PaymentRow) => (
                    <span className="tabular font-semibold">
                      {formatCurrency(Number(row.amount), currency)}
                    </span>
                  ),
                },
              ] as Column<PaymentRow>[]
            }
            rows={paymentsQuery.data ?? []}
            getRowId={(row) => row.id}
            isLoading={paymentsQuery.isPending}
            emptyState={
              <EmptyState
                icon={Receipt}
                title="Aucun encaissement"
                description="Les versements enregistrés apparaîtront ici, avec leur reçu numéroté."
              />
            }
          />
        </TabsContent>

        {/* Grille tarifaire ------------------------------------------------ */}
        <TabsContent value="fees" className="space-y-4 pt-4">
          <RoleGate permission="finance:write">
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="outline" onClick={() => setCategoryOpen(true)}>
                <Plus className="size-4" />
                Catégorie de frais
              </Button>
              <Button
                onClick={() => setStructureOpen(true)}
                disabled={categoriesQuery.data?.length === 0}
              >
                <Plus className="size-4" />
                Tarif
              </Button>
            </div>
          </RoleGate>

          <Card>
            <CardContent className="p-4 text-sm text-muted-foreground text-pretty">
              Un tarif peut viser une classe, une filière, un niveau, ou s&apos;appliquer à tous.
              Quand plusieurs tarifs correspondent à un élève, le plus spécifique l&apos;emporte —
              classe, puis filière, puis niveau, puis tarif général.
            </CardContent>
          </Card>

          <DataTable
            columns={
              [
                {
                  id: 'category',
                  header: 'Catégorie',
                  cell: (row: FeeStructureRow) => (
                    <span className="font-medium">{row.fee_category?.name}</span>
                  ),
                },
                {
                  id: 'scope',
                  header: 'Portée',
                  cell: (row: FeeStructureRow) =>
                    row.class?.name ? (
                      <Badge>{row.class.name}</Badge>
                    ) : row.program?.name ? (
                      <Badge variant="secondary">{row.program.name}</Badge>
                    ) : row.level?.name ? (
                      <Badge variant="secondary">{row.level.name}</Badge>
                    ) : (
                      <Badge variant="outline">Tous</Badge>
                    ),
                },
                {
                  id: 'amount',
                  header: 'Montant',
                  align: 'right',
                  cell: (row: FeeStructureRow) => (
                    <span className="tabular font-semibold">
                      {formatCurrency(Number(row.amount), row.currency)}
                    </span>
                  ),
                },
                {
                  id: 'actions',
                  header: '',
                  align: 'right',
                  width: '56px',
                  cell: (row: FeeStructureRow) =>
                    canManage ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Supprimer"
                        className="text-destructive"
                        onClick={() => deleteStructureMutation.mutate(row.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null,
                },
              ] as Column<FeeStructureRow>[]
            }
            rows={structuresQuery.data ?? []}
            getRowId={(row) => row.id}
            isLoading={structuresQuery.isPending}
            emptyState={
              <EmptyState
                icon={Coins}
                title="Aucun tarif"
                description="Créez une catégorie de frais (scolarité, inscription, cantine…), puis son montant."
              />
            }
          />
        </TabsContent>
      </Tabs>

      {/* Dialogues -------------------------------------------------------- */}
      <FormDialog
        open={categoryOpen}
        onOpenChange={setCategoryOpen}
        title="Catégorie de frais"
        schema={categorySchema}
        size="sm"
        defaultValues={{ name: '', code: null, is_mandatory: true }}
        onSubmit={(values) => categoryMutation.mutateAsync(values)}
      >
        {(form) => (
          <div className="space-y-4">
            <TextField control={form.control} name="name" label="Nom" placeholder="Scolarité" />
            <TextField control={form.control} name="code" label="Code" placeholder="SCO" />
            <SwitchField
              control={form.control}
              name="is_mandatory"
              label="Frais obligatoire"
              description="Facturé automatiquement à tous les élèves concernés."
            />
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={structureOpen}
        onOpenChange={setStructureOpen}
        title="Nouveau tarif"
        description="Laissez les portées vides pour un tarif applicable à tout l'établissement."
        schema={structureSchema}
        size="sm"
        defaultValues={{
          fee_category_id: '',
          level_id: null,
          program_id: null,
          class_id: null,
          amount: 0,
        }}
        onSubmit={(values) => structureMutation.mutateAsync(values)}
      >
        {(form) => (
          <div className="space-y-4">
            <SelectField
              control={form.control}
              name="fee_category_id"
              label="Catégorie"
              options={(categoriesQuery.data ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
            <TextField
              control={form.control}
              name="amount"
              label={`Montant (${currency})`}
              type="number"
            />
            <SelectField
              control={form.control}
              name="level_id"
              label="Niveau"
              placeholder="Tous"
              options={(levelsQuery.data ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
            <SelectField
              control={form.control}
              name="program_id"
              label="Filière"
              placeholder="Toutes"
              options={(programsQuery.data ?? []).map((item) => ({
                value: item.id,
                label: item.name,
              }))}
            />
            <SelectField
              control={form.control}
              name="class_id"
              label={settings.vocabulary.class}
              placeholder="Toutes"
              options={(classesQuery.data ?? []).map((item) => ({
                value: item.id!,
                label: item.name!,
              }))}
            />
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={billOpen}
        onOpenChange={setBillOpen}
        title={`Facturer une ${settings.vocabulary.class.toLowerCase()}`}
        description="La grille est appliquée à chaque élève, puis une facture est émise pour les frais non encore facturés."
        schema={billSchema}
        size="sm"
        defaultValues={{
          class_id: '',
          due_date: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
        }}
        onSubmit={(values) => billMutation.mutateAsync(values)}
        submitLabel="Émettre les factures"
      >
        {(form) => (
          <div className="space-y-4">
            <SelectField
              control={form.control}
              name="class_id"
              label={settings.vocabulary.class}
              options={(classesQuery.data ?? []).map((item) => ({
                value: item.id!,
                label: `${item.name} (${item.enrolled_count} élèves)`,
              }))}
            />
            <DateField control={form.control} name="due_date" label="Échéance" />
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={Boolean(payFor)}
        onOpenChange={(open) => !open && setPayFor(null)}
        title={`Encaisser — facture ${payFor?.number ?? ''}`}
        description={
          payFor
            ? `Reste à payer : ${formatCurrency(Number(payFor.balance), currency)}. Le reçu est généré immédiatement.`
            : undefined
        }
        schema={paymentSchema}
        size="sm"
        defaultValues={{
          amount: payFor ? Number(payFor.balance) : 0,
          method: 'cash',
          reference: null,
          paid_at: new Date().toISOString().slice(0, 10),
        }}
        onSubmit={(values) => paymentMutation.mutateAsync(values)}
        submitLabel="Encaisser et éditer le reçu"
      >
        {(form) => (
          <div className="space-y-4">
            <TextField
              control={form.control}
              name="amount"
              label={`Montant (${currency})`}
              type="number"
              description="Un versement partiel est accepté ; le solde reste dû."
            />
            <SelectField
              control={form.control}
              name="method"
              label="Mode de règlement"
              options={(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => ({
                value,
                label: PAYMENT_METHOD_LABELS[value],
              }))}
            />
            <TextField
              control={form.control}
              name="reference"
              label="Référence"
              placeholder="N° de transaction, de chèque…"
            />
            <DateField control={form.control} name="paid_at" label="Date du versement" />
          </div>
        )}
      </FormDialog>
    </div>
  )
}
