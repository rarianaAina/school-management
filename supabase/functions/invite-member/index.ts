// =============================================================================
// invite-member — invite un utilisateur dans un etablissement
//
// Deux cas :
//   1. l'adresse est inconnue  -> creation du compte + e-mail d'invitation
//   2. l'adresse existe deja   -> simple rattachement (aucun e-mail de creation)
//
// L'appelant doit etre super_admin ou school_admin de l'etablissement vise ;
// la verification s'appuie sur la RLS, avec le jeton de l'appelant.
// =============================================================================
import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ASSIGNABLE_ROLES = [
  'super_admin',
  'school_admin',
  'teacher',
  'student',
  'parent',
  'accountant',
] as const

type Role = (typeof ASSIGNABLE_ROLES)[number]

interface InvitePayload {
  school_id: string
  email: string
  role: Role
  first_name?: string
  last_name?: string
  redirect_to?: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS })
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405)

  const authorization = request.headers.get('Authorization')
  if (!authorization) return json({ error: 'Authentification requise.' }, 401)

  let payload: InvitePayload
  try {
    payload = await request.json()
  } catch {
    return json({ error: 'Corps de requête invalide.' }, 400)
  }

  const email = payload.email?.trim().toLowerCase()
  if (!email || !payload.school_id || !ASSIGNABLE_ROLES.includes(payload.role)) {
    return json({ error: 'Paramètres manquants ou rôle inconnu.' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Client "appelant" : soumis a la RLS, sert a verifier les droits.
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  })

  const { data: auth } = await caller.auth.getUser()
  if (!auth.user) return json({ error: 'Session invalide.' }, 401)

  const { data: adminRows, error: adminError } = await caller
    .from('memberships')
    .select('id')
    .eq('school_id', payload.school_id)
    .eq('user_id', auth.user.id)
    .eq('is_active', true)
    .in('role', ['super_admin', 'school_admin'])

  if (adminError) return json({ error: adminError.message }, 400)
  if (!adminRows || adminRows.length === 0) {
    return json({ error: "Vous n'administrez pas cet établissement." }, 403)
  }

  // Client privilegie : creation de compte et rattachement.
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existingId, error: lookupError } = await caller.rpc('find_user_id_by_email', {
    p_school: payload.school_id,
    p_email: email,
  })
  if (lookupError) return json({ error: lookupError.message }, 400)

  let userId = existingId as string | null
  let invited = false

  if (!userId) {
    const { data: created, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: {
        first_name: payload.first_name ?? null,
        last_name: payload.last_name ?? null,
      },
      redirectTo: payload.redirect_to,
    })

    if (inviteError || !created.user) {
      return json({ error: inviteError?.message ?? "Échec de l'invitation." }, 400)
    }

    userId = created.user.id
    invited = true
  }

  // Le profil est cree par trigger, mais l'invitation peut porter une identite
  // plus complete que celle deja enregistree.
  if (payload.first_name || payload.last_name) {
    await admin
      .from('profiles')
      .update({
        ...(payload.first_name ? { first_name: payload.first_name } : {}),
        ...(payload.last_name ? { last_name: payload.last_name } : {}),
      })
      .eq('id', userId)
  }

  const { error: membershipError } = await admin.from('memberships').upsert(
    {
      school_id: payload.school_id,
      user_id: userId,
      role: payload.role,
      is_active: true,
      invited_by: auth.user.id,
      invited_at: new Date().toISOString(),
    },
    { onConflict: 'school_id,user_id,role' },
  )

  if (membershipError) return json({ error: membershipError.message }, 400)

  return json({ user_id: userId, invited })
})
