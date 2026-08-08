// =============================================================================
// send-payment-reminders — relance des factures impayees
//
// Deux usages :
//   POST { invoice_ids: [...] }  relance ciblee depuis l'interface
//   POST { school_id, days_overdue } relance automatique (pg_cron)
//
// L'envoi passe par Resend si RESEND_API_KEY est defini ; sinon la relance est
// seulement journalisee dans payment_reminders, ce qui permet de valider le
// ciblage avant de brancher un fournisseur.
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Payload {
  invoice_ids?: string[]
  school_id?: string
  days_overdue?: number
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)

  let payload: Payload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Corps de requête invalide.' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const resendKey = Deno.env.get('RESEND_API_KEY')
  const fromAddress = Deno.env.get('REMINDER_FROM') ?? 'scolarite@exemple.test'

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Ciblage
  let query = admin
    .from('invoices')
    .select(
      'id, number, school_id, student_id, due_date, balance, currency, ' +
        'student:students(full_name, email), school:schools(name, email)',
    )
    .gt('balance', 0)
    .neq('status', 'cancelled')

  if (payload.invoice_ids?.length) {
    query = query.in('id', payload.invoice_ids)
  } else if (payload.school_id) {
    const threshold = new Date()
    threshold.setDate(threshold.getDate() - (payload.days_overdue ?? 0))
    query = query.eq('school_id', payload.school_id).lt('due_date', threshold.toISOString().slice(0, 10))
  } else {
    return json({ error: 'Fournir invoice_ids ou school_id.' }, 400)
  }

  const { data: invoices, error } = await query
  if (error) return json({ error: error.message }, 400)

  let sent = 0
  const logs: Array<Record<string, unknown>> = []

  for (const invoice of invoices ?? []) {
    const student = invoice.student as unknown as {
      full_name: string | null
      email: string | null
    } | null
    const school = invoice.school as unknown as { name: string; email: string | null } | null

    // À défaut d'adresse sur l'élève, on cherche le tuteur destinataire des factures.
    let recipient = student?.email ?? null
    if (!recipient) {
      const { data: guardians } = await admin
        .from('student_guardians')
        .select('guardian:guardians(email)')
        .eq('student_id', invoice.student_id)
        .eq('receives_invoices', true)
        .limit(1)

      const guardian = guardians?.[0]?.guardian as unknown as { email: string | null } | null
      recipient = guardian?.email ?? null
    }

    let status = 'skipped'
    let errorMessage: string | null = 'Aucune adresse e-mail connue'

    if (recipient) {
      if (resendKey) {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromAddress,
            to: recipient,
            subject: `Relance — facture ${invoice.number}`,
            html: `
              <p>Bonjour,</p>
              <p>La facture <strong>${invoice.number}</strong> concernant
              ${student?.full_name ?? "l'élève"} présente un solde de
              <strong>${money(Number(invoice.balance), invoice.currency)}</strong>,
              échu le ${new Date(invoice.due_date).toLocaleDateString('fr-FR')}.</p>
              <p>Nous vous remercions de bien vouloir procéder au règlement.</p>
              <p>${school?.name ?? ''}</p>
            `,
          }),
        })

        if (response.ok) {
          status = 'sent'
          errorMessage = null
          sent += 1
        } else {
          status = 'failed'
          errorMessage = `Resend ${response.status}`
        }
      } else {
        // Sans fournisseur configure, la relance est tracee mais pas expediee.
        status = 'logged'
        errorMessage = 'RESEND_API_KEY absent : relance journalisée sans envoi'
        sent += 1
      }
    }

    logs.push({
      school_id: invoice.school_id,
      student_id: invoice.student_id,
      invoice_id: invoice.id,
      channel: 'email',
      template: 'unpaid-reminder',
      sent_to: recipient,
      status,
      error: errorMessage,
    })
  }

  if (logs.length > 0) {
    await admin.from('payment_reminders').insert(logs)
  }

  return json({ sent, targeted: invoices?.length ?? 0 })
})
