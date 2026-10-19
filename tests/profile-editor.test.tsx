import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { OwnerProfile } from '../src/features/account/OwnerProfile'
import type { useSharedUserProfile } from '../src/features/account/useSharedUserProfile'
import { requiredPreferences } from './complete-profile-fixture'
vi.mock('../src/supabase', () => ({ supabase: null }))
vi.mock('../src/features/account/useProfilePhoto', () => ({ useProfilePhoto: () => ({ url: null, snapshot: { revision: 0 } }) }))
vi.mock('../src/features/account/ProfileDetails', () => ({ ProfileDetails: () => null }))
afterEach(cleanup)
it('lets a saved custom interest be removed and saved alongside preset interests through the canonical Profile controls', async () => {
 const profile={username:'grace',display_name:'Grace',bio:'Plants and yoga.',avatar_url:null,...requiredPreferences,interests:['morning yoga','plant-based cooking','Coffee']}
 const saveShared=vi.fn(async()=>true)
 const data={account:profile,profile,canWrite:true,busy:false,loading:false,error:'',saveShared} as unknown as ReturnType<typeof useSharedUserProfile>
 render(<MemoryRouter><OwnerProfile data={data} ready signedIn edit={vi.fn()}/></MemoryRouter>)
 const choices=within(screen.getByRole('group',{name:'Usual interests'})),yoga=choices.getByRole('button',{name:'morning yoga',exact:true})
 expect(yoga.getAttribute('aria-pressed')).toBe('true')
 fireEvent.click(yoga);expect(yoga.getAttribute('aria-pressed')).toBe('false')
 fireEvent.click(yoga);expect(yoga.getAttribute('aria-pressed')).toBe('true')
 fireEvent.click(yoga);fireEvent.click(choices.getByRole('button',{name:'Music',exact:true}))
 fireEvent.click(screen.getByRole('button',{name:'Save usual interests'}))
 await waitFor(()=>expect(saveShared).toHaveBeenCalledWith(expect.objectContaining({interests:['plant-based cooking','Coffee','Music']})))
})
