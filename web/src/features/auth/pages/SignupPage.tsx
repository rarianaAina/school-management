import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2, MailCheck } from 'lucide-react'
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
import { newPasswordSchema } from '../schemas/auth.schema'

const schema = newPasswordSchema.and(
  z.object({
    first_name: z.string().min(1, 'Prénom requis').max(80),
    last_name: z.string().min(1, 'Nom requis').max(80),
    email: z
      .string()
      .min(1, 'Adresse e-mail requise')
      .email('Adresse e-mail invalide')
      .transform((value) => value.trim().toLowerCase()),
  }),
)

type Values = z.infer<typeof schema>

/**
 * Création du premier compte d'un établissement.
 *
 * Les enseignants, élèves et parents ne passent pas par ici : ils sont invités
 * par l'administration. Cet écran sert à celui qui installe l'établissement et
 * en devient super administrateur, via l'onboarding qui suit.
 */
export function SignupPage() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null)

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      confirmation: '',
    },
  })

  async function onSubmit(values: Values) {
    setError(null)

    const { data, error: signUpError } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        data: { first_name: values.first_name, last_name: values.last_name },
        emailRedirectTo: `${window.location.origin}/`,
      },
    })

    if (signUpError) {
      setError(describeSupabaseError(signUpError))
      return
    }

    // Selon le réglage « Confirm email » du projet, la session est ouverte
    // immédiatement ou seulement après clic sur le lien reçu.
    if (data.session) {
      navigate('/bienvenue', { replace: true })
      return
    }

    setConfirmationSentTo(values.email)
  }

  if (confirmationSentTo) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <MailCheck className="size-6" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Confirmez votre adresse</p>
          <p className="text-sm text-muted-foreground text-pretty">
            Un lien de confirmation vient d&apos;être envoyé à{' '}
            <strong>{confirmationSentTo}</strong>. Ouvrez-le pour activer votre compte, puis
            créez votre établissement.
          </p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link to="/connexion">Retour à la connexion</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Créer un établissement</h1>
        <p className="text-sm text-muted-foreground text-pretty">
          Vous êtes attendu par un établissement existant ? Votre invitation arrive par e-mail —
          inutile de créer un compte ici.
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
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Adresse e-mail professionnelle</FormLabel>
                <FormControl>
                  <Input {...field} type="email" autoComplete="email" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

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
            Créer mon compte
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-muted-foreground">
        Déjà un compte ?{' '}
        <Link to="/connexion" className="font-medium text-foreground underline-offset-4 hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  )
}
