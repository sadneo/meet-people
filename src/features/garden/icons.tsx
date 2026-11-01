import { Icon } from '../../ui/common'
export function CurrencyIcon(){return <img src="/garden/geodes/pebble-currency.svg" width={32} height={32} alt="" aria-hidden="true" style={{imageRendering:'pixelated'}}/>}
export function GardenIcon({name}:{name:string}){
 if(name==='build')return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 12-8.373 8.373a1 1 0 0 1-3-3L12 9m6 6 4-4M21.5 11.5 19.914 9.914a2 2 0 0 1-.578-1.241L19 5l-4-4-1.293 1.293a1 1 0 0 1-1.414 0L12 2l-2 2 .293.293a1 1 0 0 1 0 1.414L7 9l3 3 2.293-2.293a1 1 0 0 1 1.414 0L16 12"/></svg>
 if(name==='history')return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>
 return <Icon name={({back:'Back',refresh:'Undo',history:'Activity',build:'Garden',close:'Skip'} as Record<string,string>)[name]??name}/>
}
