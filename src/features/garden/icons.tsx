import { Icon } from '../../ui/common'
export function CurrencyIcon(){return <img src="/garden/geodes/pebble-currency.svg" width={32} height={32} alt="" aria-hidden="true" style={{imageRendering:'pixelated'}}/>}
const paths: Record<string, string> = {
 build: 'M4 3h11l5 4v3l-5-3h-2v3H4Z M9 10v11h4V10',
 history: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
 landscape: 'm2 20 7-14 5 9 3-6 5 11Z M6 12l3 2 3-2',
 building: 'm3 10 9-7 9 7 M5 9v12h14V9 M10 21v-7h4v7',
 flower: 'M12 12v10 M12 17c-6 0-7-4-7-4s5-1 7 4 M12 12c-5 2-8-2-5-5-2-5 3-7 5-3 3-4 7-2 5 3 3 3 0 7-5 5Z',
 gem: 'm3 8 4-5h10l4 5-9 13Z M3 8h18 M7 3l2 5 3 13 3-13 2-5',
 random: 'm8 3 8 1 5 8-3 8H6l-4-7Z M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4 M12 16h.01',
 down: 'm6 9 6 6 6-6',
 reset: 'M4 7h16 M9 7V4h6v3 M6 7l1 14h10l1-14 M10 11v6 M14 11v6',
}
export function GardenIcon({name}:{name:string}){
 if(paths[name])return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]}/></svg>
 return <Icon name={({back:'Back',refresh:'Undo',close:'Skip'} as Record<string,string>)[name]??name}/>
}
