import type { ReactNode } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { BrowserRouter } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { queryClient } from '@/lib/queryClient'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { SchoolProvider } from '@/features/schools/SchoolProvider'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <SchoolProvider>
            <TooltipProvider delayDuration={200}>
              {children}
              <Toaster position="top-right" richColors closeButton />
            </TooltipProvider>
          </SchoolProvider>
        </AuthProvider>
      </BrowserRouter>
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  )
}
