import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { supabase, describeSupabaseError } from '@/lib/supabase'
import {
  magicLinkSchema,
  passwordLoginSchema,
  type MagicLinkValues,
  type PasswordLoginValues,
} from '../schemas/auth.schema'

function PasswordForm() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const form = useForm<PasswordLoginValues>({
    resolver: zodResolver(passwordLoginSchema),
    defaultValues: { email: '', password: '' },
  })

  async function onSubmit(values: PasswordLoginValues) {
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword(values)

    if (signInError) {
      // Message volontairement générique : ne pas révéler l'existence d'un compte.
      setError(
        signInError.message.toLowerCase().includes('invalid')
          ? 'Adresse e-mail ou mot de passe incorrect.'
          : describeSupabaseError(signInError),
      )
      return
    }

    navigate('/', { replace: true })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Adresse e-mail</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  placeholder="prenom.nom@etablissement.fr"
                />
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
              <div className="flex items-center justify-between">
                <FormLabel>Mot de passe</FormLabel>
                <Link
                  to="/mot-de-passe-oublie"
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Oublié ?
                </Link>
              </div>
              <FormControl>
                <Input {...field} type="password" autoComplete="current-password" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Se connecter
        </Button>
      </form>
    </Form>
  )
}

function MagicLinkForm() {
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm<MagicLinkValues>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: { email: '' },
  })

  async function onSubmit(values: MagicLinkValues) {
    const { error } = await supabase.auth.signInWithOtp({
      email: values.email,
      options: {
        emailRedirectTo: `${window.location.origin}/`,
        // Pas de création de compte à la volée : les comptes sont créés par
        // l'administration de l'établissement.
        shouldCreateUser: false,
      },
    })

    if (error) {
      toast.error(describeSupabaseError(error))
      return
    }

    setSentTo(values.email)
  }

  if (sentTo) {
    return (
      <div className="space-y-4 text-center">
        <span className="mx-auto grid size-12 place-items-center rounded-full bg-primary/10 text-primary">
          <Mail className="size-6" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">Lien envoyé</p>
          <p className="text-sm text-muted-foreground text-pretty">
            Si un compte existe pour <strong>{sentTo}</strong>, un lien de connexion vient d&apos;y
            être envoyé. Il est valable une heure.
          </p>
        </div>
        <Button variant="outline" className="w-full" onClick={() => setSentTo(null)}>
          Utiliser une autre adresse
        </Button>
      </div>
    )
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Adresse e-mail</FormLabel>
              <FormControl>
                <Input {...field} type="email" autoComplete="email" placeholder="prenom.nom@etablissement.fr" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Recevoir un lien de connexion
        </Button>

        <p className="text-center text-xs text-muted-foreground text-pretty">
          Pratique pour les parents : aucun mot de passe à retenir.
        </p>
      </form>
    </Form>
  )
}

export function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Connexion</h1>
        <p className="text-sm text-muted-foreground">
          Accédez à l&apos;espace de votre établissement.
        </p>
      </div>

      <Tabs defaultValue="password">
        <TabsList className="w-full">
          <TabsTrigger value="password" className="flex-1">
            Mot de passe
          </TabsTrigger>
          <TabsTrigger value="magic" className="flex-1">
            Lien magique
          </TabsTrigger>
        </TabsList>
        <TabsContent value="password" className="pt-4">
          <PasswordForm />
        </TabsContent>
        <TabsContent value="magic" className="pt-4">
          <MagicLinkForm />
        </TabsContent>
      </Tabs>
    </div>
  )
}
