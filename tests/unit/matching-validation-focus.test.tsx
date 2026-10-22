import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, expect, it, vi } from 'vitest'
import { MatchingSetup } from '../../src/features/matchmaking/MatchingScreen'
import { requiredPreferences } from './complete-profile-fixture'
const identity={username:'fixture',display_name:'Fixture',bio:null,avatar_url:null}
const profile={...identity,...requiredPreferences}
afterEach(cleanup)
it('focuses every rejected validation attempt and retains the invalid exact-time draft without writing',async()=>{
 const save=vi.fn(async()=>false)
 render(<MemoryRouter><MatchingSetup token="fixture" initial={profile} canonicalIdentity={identity} busy={false} error="" save={save} presentation="profile"/></MemoryRouter>)
 fireEvent.click(screen.getByText('Exact time windows (1)'));fireEvent.click(screen.getByRole('button',{name:'Add time window'}))
 fireEvent.change(screen.getByLabelText('Day 2'),{target:{value:'0'}})
 fireEvent.change(screen.getByLabelText('Start 2'),{target:{value:'21:00:00'}})
 fireEvent.change(screen.getByLabelText('End 2'),{target:{value:'24:00:00'}})
 const button=screen.getByRole('button',{name:'Save shared preferences'})
 for(let attempt=0;attempt<2;attempt++){
  button.focus();fireEvent.click(button)
  await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('alert')))
  expect((screen.getByLabelText('Start 2') as HTMLInputElement).value).toBe('21:00:00')
 }
 expect(save).not.toHaveBeenCalled()
})
it('focuses a failed server save response and keeps the shared preference draft',async()=>{
 const save=vi.fn(async()=>false)
 const view=(error:string)=><MemoryRouter><MatchingSetup token="fixture" initial={profile} canonicalIdentity={identity} busy={false} error={error} save={save} presentation="profile"/></MemoryRouter>
 const rendered=render(view(''))
 fireEvent.change(screen.getByLabelText('City or campus area'),{target:{value:'Unconfirmed campus'}})
 fireEvent.click(screen.getByRole('button',{name:'Save shared preferences'}));await waitFor(()=>expect(save).toHaveBeenCalledOnce())
 rendered.rerender(view('The save could not be confirmed.'))
 await waitFor(()=>expect(document.activeElement).toBe(screen.getByRole('alert')))
 expect((screen.getByLabelText('City or campus area') as HTMLInputElement).value).toBe('Unconfirmed campus')
})
