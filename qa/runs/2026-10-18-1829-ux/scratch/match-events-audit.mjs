import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run = '/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1829-ux'
const sizes = [[320,568],[390,844],[800,860],[801,860],[1280,720],[1920,1080]]
await Promise.all(['match','events'].map(async area => {
  const X = await openAs(area === 'match' ? 'carol' : 'dave')
  const page = X.page
  const shot = name => page.screenshot({ path: `${run}/screenshots/${name}.png`, fullPage: false })
  try {
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height})
      await page.goto(area === 'match' ? '/matchmaking' : '/events')
      if (area === 'match') await page.getByRole('button',{name:'Preferences',exact:true}).waitFor()
      else await page.getByRole('link',{name:'See event & people'}).first().waitFor()
      await page.waitForTimeout(700)
      await shot(`${area}-page-${width}x${height}`)
      console.log(JSON.stringify({area,width,height,page:page.url(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)}))
      if (area === 'match') {
        await page.goto('/downtime-matchmaking')
        await page.getByRole('button',{name:'Preferences',exact:true}).waitFor()
        await page.waitForTimeout(700)
        await shot(`match-downtime-${width}x${height}`)
        await page.getByRole('button',{name:'Preferences',exact:true}).click()
        await page.waitForTimeout(300)
        await shot(`match-prefs-top-${width}x${height}`)
        const interest=page.getByLabel('Interest 1',{exact:true})
        if (await interest.count()) {
          await interest.scrollIntoViewIfNeeded()
          await shot(`match-prefs-interest-${width}x${height}`)
        }
        const start=page.getByLabel('Start 1',{exact:true})
        if (await start.count()) {
          await start.scrollIntoViewIfNeeded()
          await shot(`match-prefs-time-${width}x${height}`)
        }
        console.log(JSON.stringify({area:'preferences',width,height,metrics:await page.locator('dialog[open]').evaluate(e=>({font:getComputedStyle(e.querySelector('h2')).fontFamily,heading:e.querySelector('h2').getBoundingClientRect().toJSON(),body:e.querySelector('.match-preferences-body').getBoundingClientRect().toJSON(),fields:[...e.querySelectorAll('label')].map(l=>({label:l.firstChild?.textContent?.trim(),width:l.getBoundingClientRect().width,inputWidth:l.querySelector('input,textarea,select')?.getBoundingClientRect().width,inputHeight:l.querySelector('input,textarea,select')?.getBoundingClientRect().height}))}))}))
        await page.keyboard.press('Escape')
      } else {
        const href=await page.getByRole('link',{name:'See event & people'}).first().getAttribute('href')
        if (width===1920) {
          await page.getByRole('region',{name:'Event group queue'}).last().scrollIntoViewIfNeeded()
          await shot(`events-preview-queue-${width}x${height}`)
        }
        await page.goto(href)
        const queue=page.getByRole('region',{name:'Event group queue'})
        await queue.waitFor()
        await page.waitForTimeout(700)
        await shot(`events-detail-top-${width}x${height}`)
        await queue.scrollIntoViewIfNeeded()
        await shot(`events-detail-queue-${width}x${height}`)
        console.log(JSON.stringify({area:'event-detail',width,height,text:await queue.innerText(),overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)}))
      }
    }
    console.log(JSON.stringify({area,problems:X.problems}))
  } finally {await X.close()}
}))
