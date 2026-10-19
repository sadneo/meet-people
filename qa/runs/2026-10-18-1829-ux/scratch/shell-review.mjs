import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { writeFileSync } from 'node:fs'
const run='/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1829-ux'
const [size='1280x720',tag='a']=process.argv.slice(2)
const [width,height]=size.split('x').map(Number)
const {page,close}=await openAs('frank',{width,height})
try{
 await page.emulateMedia({reducedMotion:'reduce'})
 await page.goto('/'); await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{}); await page.waitForTimeout(500)
 await page.screenshot({path:`${run}/screenshots/home/frank-${size}-shell-${tag}.png`})
 await page.getByRole('button',{name:'Account menu',exact:true}).click()
 await page.screenshot({path:`${run}/screenshots/home/frank-${size}-account-${tag}.png`})
 const data=await page.locator('.pt-account-options').evaluate(el=>[...el.querySelectorAll('a,button')].map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return{text:n.textContent,font:s.font,rect:[r.x,r.y,r.width,r.height]}}))
 writeFileSync(`${run}/scratch/frank-${size}-account-${tag}.json`,JSON.stringify(data,null,2));console.log(JSON.stringify(data))
 await page.keyboard.press('Escape')
}finally{await close()}
