import { supabase } from '@/lib/supabase'
import type {
  FeeCategory,
  FeeStructure,
  Invoice,
  MonthlyRevenue,
  Payment,
  PaymentMethod,
  StudentBalance,
} from '@/types/domain'

// -----------------------------------------------------------------------------
// Grilles tarifaires
// -----------------------------------------------------------------------------
export async function listFeeCategories(schoolId: string): Promise<FeeCategory[]> {
  const { data, error } = await supabase
    .from('fee_categories')
    .select('*')
    .eq('school_id', schoolId)
    .order('name')
  if (error) throw error
  return data ?? []
}

export async function createFeeCategory(row: {
  school_id: string
  name: string
  code: string | null
  is_mandatory: boolean
}): Promise<void> {
  const { error } = await supabase.from('fee_categories').insert(row)
  if (error) throw error
}

export interface FeeStructureRow extends FeeStructure {
  fee_category: { name: string } | null
  level: { name: string } | null
  program: { name: string } | null
  class: { name: string } | null
}

export async function listFeeStructures(
  schoolId: string,
  academicYearId: string,
): Promise<FeeStructureRow[]> {
  const { data, error } = await supabase
    .from('fee_structures')
    .select(
      '*, fee_category:fee_categories(name), level:levels(name), program:programs(name), class:classes(name)',
    )
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
    .order('amount', { ascending: false })
  if (error) throw error
  return (data ?? []) as FeeStructureRow[]
}

export async function createFeeStructure(row: {
  school_id: string
  academic_year_id: string
  fee_category_id: string
  level_id: string | null
  program_id: string | null
  class_id: string | null
  amount: number
  currency: string
}): Promise<void> {
  const { error } = await supabase.from('fee_structures').insert(row)
  if (error) throw error
}

export async function deleteFeeStructure(id: string): Promise<void> {
  const { error } = await supabase.from('fee_structures').delete().eq('id', id)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Affectation et facturation
// -----------------------------------------------------------------------------
export async function assignFeesToStudent(
  studentId: string,
  yearId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc('assign_fees_to_student', {
    p_student_id: studentId,
    p_year_id: yearId,
  })
  if (error) throw error
  return data ?? 0
}

export async function issueInvoice(
  studentId: string,
  yearId: string,
  dueDate: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc('issue_invoice', {
    p_student_id: studentId,
    p_year_id: yearId,
    // Les parametres optionnels d'une RPC attendent `undefined`, pas `null`.
    p_due_date: dueDate ?? undefined,
  })
  if (error) throw error
  return data as string
}

/** Applique la grille puis facture toute une classe, élève par élève. */
export async function billClass(
  classId: string,
  yearId: string,
  dueDate: string | null,
): Promise<{ billed: number; skipped: number }> {
  const { data: enrollments, error } = await supabase
    .from('enrollments')
    .select('student_id')
    .eq('class_id', classId)
    .eq('status', 'active')
  if (error) throw error

  let billed = 0
  let skipped = 0

  for (const enrollment of enrollments ?? []) {
    await assignFeesToStudent(enrollment.student_id, yearId)
    try {
      await issueInvoice(enrollment.student_id, yearId, dueDate)
      billed += 1
    } catch (invoiceError) {
      // P0002 : plus rien à facturer pour cet élève — ce n'est pas un échec.
      if ((invoiceError as { code?: string })?.code === 'P0002') skipped += 1
      else throw invoiceError
    }
  }

  return { billed, skipped }
}

// -----------------------------------------------------------------------------
// Factures
// -----------------------------------------------------------------------------
export interface InvoiceRow extends Invoice {
  student: { id: string; full_name: string | null; matricule: string } | null
}

export interface InvoiceFilters {
  search?: string
  status?: string | null
  overdueOnly?: boolean
}

export async function listInvoices(
  schoolId: string,
  academicYearId: string,
  filters: InvoiceFilters,
): Promise<InvoiceRow[]> {
  let query = supabase
    .from('invoices')
    .select('*, student:students(id, full_name, matricule)')
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
    .order('issue_date', { ascending: false })

  if (filters.status) query = query.eq('status', filters.status as never)
  if (filters.overdueOnly) query = query.gt('balance', 0).lt('due_date', new Date().toISOString().slice(0, 10))

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []) as InvoiceRow[]
  const needle = filters.search?.trim().toLowerCase()
  if (!needle) return rows

  return rows.filter((row) =>
    [row.number, row.student?.full_name, row.student?.matricule]
      .filter(Boolean)
      .some((field) => field!.toLowerCase().includes(needle)),
  )
}

export async function getInvoice(invoiceId: string) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, student:students(id, full_name, matricule, email), invoice_lines(*)')
    .eq('id', invoiceId)
    .single()
  if (error) throw error
  return data
}

export async function cancelInvoice(invoiceId: string): Promise<void> {
  const { error } = await supabase
    .from('invoices')
    .update({ status: 'cancelled' })
    .eq('id', invoiceId)
  if (error) throw error
}

// -----------------------------------------------------------------------------
// Paiements
// -----------------------------------------------------------------------------
export async function recordPayment(input: {
  invoiceId: string
  amount: number
  method: PaymentMethod
  reference: string | null
  paidAt: string
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_payment', {
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference ?? undefined,
    p_paid_at: input.paidAt,
  })
  if (error) throw error
  return data as string
}

export interface PaymentRow extends Payment {
  student: { full_name: string | null; matricule: string } | null
  invoice: { number: string } | null
}

export async function listPayments(
  schoolId: string,
  from: string,
  to: string,
): Promise<PaymentRow[]> {
  const { data, error } = await supabase
    .from('payments')
    .select('*, student:students(full_name, matricule), invoice:invoices(number)')
    .eq('school_id', schoolId)
    .gte('paid_at', from)
    .lte('paid_at', `${to}T23:59:59`)
    .order('paid_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PaymentRow[]
}

export async function getPayment(paymentId: string) {
  const { data, error } = await supabase
    .from('payments')
    .select('*, student:students(full_name, matricule), invoice:invoices(number, total_amount, balance)')
    .eq('id', paymentId)
    .single()
  if (error) throw error
  return data
}

// -----------------------------------------------------------------------------
// Soldes et impayés
// -----------------------------------------------------------------------------
export async function listBalances(
  schoolId: string,
  academicYearId: string,
  overdueOnly: boolean,
): Promise<StudentBalance[]> {
  let query = supabase
    .from('student_balances')
    .select('*')
    .eq('school_id', schoolId)
    .eq('academic_year_id', academicYearId)
    .order('balance', { ascending: false })

  if (overdueOnly) query = query.gt('balance', 0)

  const { data, error } = await query
  if (error) throw error
  return data ?? []
}

export async function listMonthlyRevenue(schoolId: string): Promise<MonthlyRevenue[]> {
  const { data, error } = await supabase
    .from('monthly_revenue')
    .select('*')
    .eq('school_id', schoolId)
    .order('month')
  if (error) throw error
  return data ?? []
}

/** Journalise une relance ; l'envoi effectif est fait par l'Edge Function. */
export async function logReminder(rows: Array<{
  school_id: string
  student_id: string
  invoice_id: string
  sent_to: string | null
}>): Promise<void> {
  const { error } = await supabase.from('payment_reminders').insert(
    rows.map((row) => ({ ...row, channel: 'email' as const, template: 'unpaid-reminder' })),
  )
  if (error) throw error
}

export async function sendReminders(invoiceIds: string[]): Promise<{ sent: number }> {
  const { data, error } = await supabase.functions.invoke<{ sent: number }>(
    'send-payment-reminders',
    { body: { invoice_ids: invoiceIds } },
  )
  if (error) {
    const context = (error as { context?: Response }).context
    if (context) {
      const body = await context.json().catch(() => null)
      if (body?.error) throw new Error(body.error)
    }
    throw error
  }
  return data ?? { sent: 0 }
}

export async function storeReceipt(
  schoolId: string,
  paymentId: string,
  blob: Blob,
): Promise<string> {
  const path = `${schoolId}/receipts/${paymentId}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('finance')
    .upload(path, blob, { upsert: true, contentType: 'application/pdf' })
  if (uploadError) throw uploadError

  const { error } = await supabase
    .from('payments')
    .update({ receipt_pdf_path: path })
    .eq('id', paymentId)
  if (error) throw error

  return path
}

export async function storeInvoicePdf(
  schoolId: string,
  invoiceId: string,
  blob: Blob,
): Promise<string> {
  const path = `${schoolId}/invoices/${invoiceId}.pdf`

  const { error: uploadError } = await supabase.storage
    .from('finance')
    .upload(path, blob, { upsert: true, contentType: 'application/pdf' })
  if (uploadError) throw uploadError

  const { error } = await supabase.from('invoices').update({ pdf_path: path }).eq('id', invoiceId)
  if (error) throw error

  return path
}
