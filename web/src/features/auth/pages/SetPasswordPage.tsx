import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { supabase, describeSupabaseError } from '@/lib/supabase'
import { useAuth } from '../AuthProvider'
import { newPasswordSchema } from '../schemas/auth.schema'

const schema = newPasswordSchema.and(
  z.object({
    first_name: z.string().min(1, 'Prénom requis').max(80),
    last_name: z.string().min(1, 'Nom requis').max(80),
  }),
)

type Values = z.infer<typeof schema>

/**
 * Écran commun à la réinitialisation de mot de passe et à la première connexion
 * après invitation : dans les deux cas Supabase a déjà ouvert une session via
 * le lien reçu par e-mail.
 */
export function SetPasswordPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isReady, profile, reload } = useAuth()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      password: '',
      confirmation: '',
      first_name: profile?.first_name ?? '',
      last_name: profile?.last_name ?? '',
    },
  })

  if (!isReady) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">
          <AlertDescription>
            Ce lien est invalide ou a expiré. Demandez-en un nouveau depuis la page de connexion.
          </AlertDescription>
        </Alert>
        <Button asChild variant="outline" className="w-full">
          <Link to="/mot-de-passe-oublie">Demander un nouveau lien</Link>
        </Button>
      </div>
    )
  }

  async function onSubmit(values: Values) {
    setError(null)

    const { error: updateError } = await supabase.auth.updateUser({
      password: values.password,
      data: { first_name: values.first_name, last_name: values.last_name },
    })

    if (updateError) {
      setError(describeSupabaseError(updateError))
      return
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .update({ first_name: values.first_name, last_name: values.last_name })
      .eq('id', (await supabase.auth.getUser()).data.user!.id)

    if (profileError) {
      setError(describeSupabaseError(profileError))
      return
    }

    await reload()
    toast.success('Mot de passe enregistré.')
    navigate('/', { replace: true })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Définir votre mot de passe</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Complétez votre identité et choisissez un mot de passe pour accéder à votre espace.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Prénom</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="given-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom</FormLabel>
                  <FormControl>
                    <Input {...field} autoComplete="family-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Mot de passe</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="new-password" />
                </FormControl>
                <FormDescription>
                  10 caractères minimum, avec majuscule, minuscule et chiffre.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmation"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirmation</FormLabel>
                <FormControl>
                  <Input {...field} type="password" autoComplete="new-password" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            Enregistrer et continuer
          </Button>
        </form>
      </Form>
    </div>
  )
}
