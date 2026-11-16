import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAccount } from '../../auth/account-context'
import { profilePhotoClient } from './profile-photo-client'

export function usePhotoGallery(owner: string | undefined, enabled = true) {
  const account = useAccount()
  const token = account?.loaded ? account.session?.access_token : undefined
  const client = useMemo(() => token ? profilePhotoClient(token) : null, [token])
  const query = useQuery({
    queryKey: ['profile-photo', owner, 'gallery'],
    enabled: !!client && !!owner && enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => client!.gallery(owner!, signal),
  })
  return { client, query }
}

export function usePhotoSlot(token: string, owner: string, revision: number, position: number, enabled = true) {
  return useQuery({
    queryKey: ['profile-photo', owner, 'slot', revision, position],
    enabled: enabled && revision > 0,
    retry: false,
    staleTime: 30_000,
    queryFn: async ({signal}) => {
      const blob = await profilePhotoClient(token).slot(owner, revision, position, signal)
      if (signal.aborted) throw new Error('Photo read cancelled')
      return { url: URL.createObjectURL(blob) }
    },
  })
}
