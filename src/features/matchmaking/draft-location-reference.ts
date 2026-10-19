import { SearchLocationReceiptSchema, type SearchLocationReceipt } from '../../../shared/search-locations'
import type { SearchOptions } from './search-preferences'
export function draftLocationReference(receipt:SearchLocationReceipt|null,mode:'friends'|'dating',options:SearchOptions,home:string|null){
 if(!receipt)return undefined
 const parsed=SearchLocationReceiptSchema.safeParse(receipt)
 const label=options.source==='home'?home:options.area
 if(!parsed.success||!parsed.data.usable||parsed.data.mode!==mode||parsed.data.source!==options.source||parsed.data.areaLabel!==label)throw new Error('Choose a current search location again.')
 return parsed.data.id
}
