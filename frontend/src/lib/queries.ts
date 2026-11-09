import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import type { Workspace } from './types'

export const useWorkspace = () =>
  useQuery({
    queryKey: ['workspace'],
    queryFn: () => api<Workspace>('/workspace'),
    staleTime: 60_000,
  })
export function useRefresh() {
  const client = useQueryClient()
  return () =>
    Promise.all(
      ['dashboard', 'records', 'audit', 'alerts', 'staff', 'workspace', 'search'].map(key =>
        client.invalidateQueries({ queryKey: [key] }),
      ),
    )
}
