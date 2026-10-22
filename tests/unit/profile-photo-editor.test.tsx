import { act,cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { beforeEach,afterEach,expect,it,vi } from 'vitest'
import { ProfilePhotoEditor } from '../../src/features/account/ProfilePhotoEditor'
import { ProfilePhotoImage } from '../../src/features/account/ProfilePhotoImage'
const auth=vi.hoisted(()=>({loaded:true,session:{user:{id:'a0000000-0000-4000-8000-000000000001'},access_token:'first'},account:{}}))
vi.mock('../../src/auth/account-context',()=>({useAccount:()=>auth}))
const state0={revision:0,hasPhoto:false,updatedAt:null},state1={revision:1,hasPhoto:true,updatedAt:'2026-10-19T12:00:00Z'}
beforeEach(()=>{
 auth.session={user:{id:'a0000000-0000-4000-8000-000000000001'},access_token:'first'}
 const OriginalURL=URL;let next=0;vi.stubGlobal('URL',class extends OriginalURL{static createObjectURL=vi.fn(()=>`blob:photo-${++next}`);static revokeObjectURL=vi.fn()})
 HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};HTMLDialogElement.prototype.close=function(){this.removeAttribute('open')}
})
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
const file=()=>new File(['synthetic input'],'photo.png',{type:'image/png'})
it('withdraws a legacy fallback when peer photo authorization is no longer confirmed',async()=>{
 let allowed=true
 const fetch=vi.fn(async()=>allowed?Response.json(state0):Response.json({error:'Photo unavailable.'},{status:404}));vi.stubGlobal('fetch',fetch)
 const peer='a0000000-0000-4000-8000-000000000002'
 render(<ProfilePhotoImage owner={peer} legacy="https://images.example.test/old.jpg" alt="Peer photo" fallback={<span>No current photo</span>}/>)
 await screen.findByAltText('Peer photo');allowed=false
 act(()=>window.dispatchEvent(new CustomEvent('pebble:profile-photo-changed',{detail:peer})))
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));await waitFor(()=>expect(screen.queryByAltText('Peer photo')).toBeNull())
 expect(screen.getByText('No current photo')).toBeTruthy()
})
it('does not restore a legacy avatar after a saved-photo tombstone',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({revision:2,hasPhoto:false,updatedAt:null})))
 render(<ProfilePhotoImage owner="a0000000-0000-4000-8000-000000000002" legacy="https://images.example.test/old.jpg" alt="Peer photo" fallback={<span>No current photo</span>}/>)
 await waitFor(()=>expect(fetch).toHaveBeenCalledOnce());expect(screen.queryByAltText('Peer photo')).toBeNull()
})
it('keeps choosing a photo local until explicit upload and discards it on cancel',async()=>{
 const fetch=vi.fn(async()=>Response.json(state0));vi.stubGlobal('fetch',fetch);const close=vi.fn()
 const view=render(<MemoryRouter><ProfilePhotoEditor close={close}/></MemoryRouter>)
 await waitFor(()=>expect((screen.getByLabelText('Choose a picture') as HTMLInputElement).disabled).toBe(false))
 fireEvent.change(screen.getByLabelText('Choose a picture'),{target:{files:[file()]}})
 await screen.findByAltText('Selected photo, not uploaded yet');expect(fetch.mock.calls).toHaveLength(1)
 fireEvent.click(screen.getByRole('button',{name:'Cancel',exact:true}));expect(close).toHaveBeenCalledOnce();view.unmount();expect(URL.revokeObjectURL).toHaveBeenCalled()
})
it('preserves the exact retry key and file through an uncertain upload and confirms readback',async()=>{
 let puts=0,stored=state0;const writes:{url:string;body:unknown}[]=[]
 const fetch=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{
  if(init?.method==='PUT'){writes.push({url:String(input),body:init.body});puts++;stored=state1;if(puts===1)return Response.json({error:'Upload may already be saved. Reload or retry the same request.'},{status:503});return Response.json(stored)}
  return Response.json(stored)
 });vi.stubGlobal('fetch',fetch);const close=vi.fn()
 render(<MemoryRouter><ProfilePhotoEditor close={close}/></MemoryRouter>);await waitFor(()=>expect((screen.getByLabelText('Choose a picture') as HTMLInputElement).disabled).toBe(false))
 const selected=file();fireEvent.change(screen.getByLabelText('Choose a picture'),{target:{files:[selected]}});fireEvent.click(screen.getByRole('button',{name:'Upload profile photo',exact:true}))
 await screen.findByRole('alert');expect(close).not.toHaveBeenCalled();expect((screen.getByRole('button',{name:'Upload profile photo',exact:true}) as HTMLButtonElement).disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'Retry same photo change',exact:true}));await waitFor(()=>expect(close).toHaveBeenCalledOnce())
 expect(writes).toHaveLength(2);expect(writes[1]).toEqual(writes[0]);expect(writes[0].body).toBe(selected);expect(writes[0].url).toContain('expectedRevision=0')
})
it('fences a late upload callback after the signed-in owner changes',async()=>{
 let release:(response:Response)=>void=()=>{throw new Error('Not started')}
 const fetch=vi.fn(async(_input:RequestInfo|URL,init?:RequestInit)=>init?.method==='PUT'?new Promise<Response>(resolve=>{release=resolve}):Response.json(state0));vi.stubGlobal('fetch',fetch);const close=vi.fn()
 const view=render(<MemoryRouter><ProfilePhotoEditor close={close}/></MemoryRouter>);await waitFor(()=>expect((screen.getByLabelText('Choose a picture') as HTMLInputElement).disabled).toBe(false))
 fireEvent.change(screen.getByLabelText('Choose a picture'),{target:{files:[file()]}});fireEvent.click(screen.getByRole('button',{name:'Upload profile photo',exact:true}));await screen.findByText('Saving and confirming your photo…')
 auth.session={user:{id:'a0000000-0000-4000-8000-000000000002'},access_token:'second'};view.rerender(<MemoryRouter><ProfilePhotoEditor close={close}/></MemoryRouter>)
 await waitFor(()=>expect((screen.getByLabelText('Choose a picture') as HTMLInputElement).disabled).toBe(false));release(Response.json(state1))
 await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(3));expect(close).not.toHaveBeenCalled();expect(screen.queryByAltText('Your saved profile photo')).toBeNull()
})
