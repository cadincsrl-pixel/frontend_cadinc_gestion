import { useQuery } from '@tanstack/react-query'
import { apiGet }   from '@/lib/api/client'
import type { Profile } from '@/types/domain.types'

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn:  () => apiGet<Profile>('/api/me/profile'),
    staleTime: 1000 * 60 * 5, // 5 min
    retry: false,
  })
}