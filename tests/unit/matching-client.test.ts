import {afterEach,expect,it,vi} from 'vitest'
import {matchingClient,MatchingError} from '../../src/ui/matching-client'
const id='ab000000-0000-4000-8000-000000000001'
afterEach(()=>vi.unstubAllGlobals())
it('sends only exclusions in a token-bound bounded passive batch',async()=>{
 const fetch=vi.fn(async()=>Response.json({algorithmVersion:'friends-rules-v1',candidates:[]}));vi.stubGlobal('fetch',fetch)
 await matchingClient('owner-token').friends([id])
 const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit]
 expect(url).toContain('/api/matchmaking/friends/recommendations');expect(JSON.parse(String(init.body))).toEqual({excludedIds:[id],limit:10})
 expect(new Headers(init.headers).get('Authorization')).toBe('Bearer owner-token');expect(init.cache).toBe('no-store')
})
it('rejects malformed public batch responses rather than rendering private fields',async()=>{
 vi.stubGlobal('fetch',vi.fn(async()=>Response.json({algorithmVersion:'friends-rules-v1',candidates:[],privateSignals:{}})))
 await expect(matchingClient('owner').friends([])).rejects.toMatchObject({status:502})
})
it('does not retry an uncertain mutation',async()=>{
 const fetch=vi.fn(async()=>{throw new Error('offline')});vi.stubGlobal('fetch',fetch)
 await expect(matchingClient('owner').command('accept',{proposalId:id},id)).rejects.toBeInstanceOf(MatchingError)
 expect(fetch).toHaveBeenCalledOnce()
 const [url,init]=fetch.mock.calls[0] as unknown as [string,RequestInit]
 expect(url).toContain(`/proposals/${id}/accept`);expect(JSON.parse(String(init.body))).toEqual({requestId:id})
})
