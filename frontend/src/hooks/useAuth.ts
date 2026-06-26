'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentUser, isAuthenticated } from '../lib/api'

export interface User {
  id:                   string
  name:                 string
  email:                string
  plan:                 string
  mpSubscriptionStatus: string
  trialEndsAt:          string | null
  paidSince:            string | null
  specsUsedTrial:       number
  emailVerified:        boolean
  currentOrganizationId: string | null
  createdAt:            string
}

export function useAuth(requireAuth = true) {
  const router  = useRouter()
  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function check() {
      if (!isAuthenticated()) {
        if (requireAuth) {
          router.replace('/login')
        }
        setLoading(false)
        return
      }

      const me = await getCurrentUser()
      if (!me) {
        if (requireAuth) router.replace('/login')
        setLoading(false)
        return
      }

      setUser(me)
      setLoading(false)
    }

    check()
  }, [requireAuth, router])

  return { user, loading }
}

// Versión que también verifica si el trial expiró
export function useAuthWithTrial(requireAuth = true) {
  const { user, loading } = useAuth(requireAuth)
  const router = useRouter()

  const trialExpired = user?.plan === 'trial'
    && user?.trialEndsAt
    && new Date(user.trialEndsAt) < new Date()

  const hasActivePlan = user?.plan && user.plan !== 'trial'
  const isActive      = hasActivePlan || (user?.plan === 'trial' && !trialExpired)

  return { user, loading, trialExpired, hasActivePlan, isActive }
}
