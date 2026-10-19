import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
import { writeFileSync, mkdirSync } from 'node:fs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1829-ux'
const user = process.argv[2] ?? 'guest'
const phase = process.argv[4] ? `${process.argv[4]}-` : ''
const sizes = process.argv[3] ? [process.argv[3].split('x').map(Number)] : [[320,568], [390,844], [800,900], [801,900], [1280,720], [1920,1080]]
mkdirSync(`${run}/screenshots/home`, { recursive: true })
for (const [width,height] of sizes) {
  const {page,problems,close} = await openAs(user,{width,height})
  await page.emulateMedia({reducedMotion:'reduce'})
  const capture = async label => {
    const path = `${run}/screenshots/home/${phase}${user}-${width}x${height}-${label}.png`
    await page.screenshot({path})
    const metrics = await page.evaluate(() => {
      const selectors=['.pt-app-header','.pt-desktop-nav','.pt-account-nav','.pt-focus-toolbar','.pt-home-center','.pt-available-preview','.pt-pebble-refresh','.pt-home-center h1','.pt-discovery-action','.pt-focus-secondary','.pt-community-heading','.pt-community-village','.pt-community-world','.pt-community-history','.pt-bottom-nav','.pt-build-dialog','.pt-build-dialog > header','.pt-upgrade-list','.pt-build-footer','#pt-upgrade-title','.pt-build-balance','.pt-upgrade-item h3','.pt-upgrade-purchase','.pt-build-section-title']
      return {viewport:[innerWidth,innerHeight],document:[document.documentElement.scrollWidth,document.documentElement.scrollHeight],scroll:[scrollX,scrollY],elements: selectors.flatMap(selector=>[...document.querySelectorAll(selector)].map(el=> {const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {selector,rect:[r.x,r.y,r.width,r.height].map(Math.round),font:s.font,fontSize:s.fontSize,lineHeight:s.lineHeight,padding:s.padding,display:s.display,text:(el.innerText??'').slice(0,100)}}))}
    })
    writeFileSync(`${run}/scratch/${phase}${user}-${width}x${height}-${label}.json`,JSON.stringify(metrics,null,2))
    console.log(path,JSON.stringify({document:metrics.document,problems:problems.filter(p=>!p.includes('favicon'))}))
  }
  try {
    await page.goto('/'); await page.waitForLoadState('networkidle',{timeout:8000}).catch(()=>{}); await page.waitForTimeout(600)
    await capture('home')
    await page.getByRole('link',{name:'Community',exact:true}).click(); await page.waitForTimeout(600)
    await capture('community')
    await page.getByRole('button',{name:'Build your community',exact:true}).click(); await page.waitForTimeout(100)
    await capture('build')
    await page.locator('.pt-upgrade-list').evaluate(el=>el.scrollTop=el.scrollHeight)
    await capture('build-bottom')
  } finally {await close()}
}
