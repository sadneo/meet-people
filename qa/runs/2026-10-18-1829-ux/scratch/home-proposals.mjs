import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { writeFileSync } from 'node:fs'
const run='/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1829-ux'
for (const [width,height] of [[801,900],[1280,720],[1920,1080],[801,568]]) {
 const {page,close}=await openAs('guest',{width,height})
 try {
  await page.emulateMedia({reducedMotion:'reduce'})
  await page.goto('/');await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{})
  await page.addStyleTag({content:`@media(width > 800px){.pt-app.pt-scene-home{--pt-focus-size:clamp(220px,min(38vw,37dvh),580px)}.pt-app.pt-scene-home .pt-discovery-action{width:min(100%,300px)}}`})
  await page.screenshot({path:`${run}/screenshots/home/proposal-guest-${width}x${height}-home.png`})
  const metrics=await page.evaluate(()=>Object.fromEntries(['.pt-pebble-refresh','.pt-discovery-action'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,[r.x,r.y,r.width,r.height].map(Math.round)]})))
  writeFileSync(`${run}/scratch/proposal-guest-${width}x${height}-home.json`,JSON.stringify(metrics,null,2));console.log(width,height,JSON.stringify(metrics))
 } finally{await close()}
}
const {page,close}=await openAs('frank',{width:320,height:568})
try {
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/community');await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{});await page.waitForTimeout(500)
 await page.addStyleTag({content:`.pt-app.pt-scene-community{position:relative}.pt-scene-community .pt-inbox-controls{position:absolute;top:calc(var(--pt-header-height) + 18px);left:calc(var(--pt-gutter) + 56px);padding:0;z-index:25}@media(max-width:800px){.pt-scene-community .pt-inbox-controls{top:32px}}`})
 await page.screenshot({path:`${run}/screenshots/home/proposal-frank-320x568-community.png`})
 const data=await page.evaluate(()=>Object.fromEntries(['.pt-inbox-controls','.pt-community-heading','.pt-history-dates','.pt-bottom-nav'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return[s,[r.x,r.y,r.width,r.height].map(Math.round)]})))
 writeFileSync(`${run}/scratch/proposal-frank-320x568-community.json`,JSON.stringify(data,null,2));console.log(JSON.stringify(data))
}finally{await close()}
