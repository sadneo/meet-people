import type { ReactNode } from 'react'
import { useProfilePhoto } from './useProfilePhoto'
/** Shared private photo authority; a removed-photo tombstone suppresses stale URLs. */
export function ProfilePhotoImage({owner,legacy,alt,fallback}:{owner:string;legacy:string|null;alt:string;fallback:ReactNode}){
 const photo=useProfilePhoto({owner}),src=photo.url??(!photo.loading&&!photo.error&&photo.snapshot?.revision===0?legacy:null)
 return src?<img src={src} alt={alt} referrerPolicy="no-referrer"/>:<>{fallback}</>
}
