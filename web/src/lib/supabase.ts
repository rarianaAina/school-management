import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    "Configuration Supabase manquante. Copiez .env.example vers .env.local et renseignez VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY.",
  )
}

export const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

/**
 * Traduit les erreurs Postgres/PostgREST en messages affichables.
 * Les codes couverts correspondent aux contraintes posées par les migrations :
 * unicité (matricule, nom de classe), exclusion (conflit d'horaire), RLS.
 */
export function describeSupabaseError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Une erreur inattendue est survenue.'

  const { code, message, details } = error as {
    code?: string
    message?: string
    details?: string
  }

  switch (code) {
    case '23505':
      return "Cet enregistrement existe déjà (valeur en double)."
    case '23503':
      return "Impossible : cet élément est référencé ailleurs."
    case '23514':
      return "Valeur refusée par une règle de validation de la base."
    case '23P01':
      return "Conflit de créneau : la salle, l'enseignant ou la classe est déjà occupé sur ce créneau."
    case '42501':
    case 'PGRST301':
      return "Vous n'avez pas les droits nécessaires pour cette action."
    case 'PGRST116':
      return 'Aucun résultat trouvé.'
    default:
      return message ?? details ?? 'Une erreur inattendue est survenue.'
  }
}
