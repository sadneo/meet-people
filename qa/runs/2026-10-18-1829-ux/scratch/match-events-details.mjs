import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const run='/home/xqiu/Projects/meet-people/qa/runs/2026-10-18-1829-ux'
for(const width of [320,390,801,1280]) {
  const X=await openAs('carol',{width,height:width===320?568:width===1280?720:844})
  try {
    await X.page.goto('/matchmaking')
    await X.page.getByRole('button',{name:'Preferences',exact:true}).click()
    const fieldset=X.page.locator('dialog[open] fieldset').first()
    await fieldset.locator('textarea').first().scrollIntoViewIfNeeded()
    await X.page.screenshot({path:`${run}/screenshots/match-prefs-interests-${width}.png`,fullPage:false})
    console.log(JSON.stringify({area:'preferences',width,detail:await X.page.locator('dialog[open]').evaluate(e=>{
      const body=e.querySelector('.match-preferences-body'),label=e.querySelector('label'),interest=e.querySelector('fieldset label')
      const s=l=>({display:getComputedStyle(l).display,margin:getComputedStyle(l).margin,rowGap:getComputedStyle(l).rowGap,rect:l.getBoundingClientRect().toJSON()})
      return {dialog:e.getBoundingClientRect().toJSON(),bodyHeight:body.clientHeight,bodyScrollHeight:body.scrollHeight,label:s(label),interest:s(interest),headingFont:getComputedStyle(e.querySelector('h2')).font,footer:e.querySelector('footer').getBoundingClientRect().toJSON()}
    })}))
  }finally{await X.close()}
}
for(const width of [390,1280]){
  const X=await openAs('iris',{width,height:width===390?844:720})
  try{
    let fixture
    await X.page.route('**/api/events?*',async r=>{
      const response=await r.fetch(),data=await response.json()
      fixture={...data.events[0],title:'Autumn film weekend',description:'Two evenings of student films, conversations and community.\n\nDrop in for a screening or stay for the whole weekend.',starts_at:'2026-10-24T22:00:00Z',ends_at:'2026-10-26T18:00:00Z',location_name:'Campus cinema'}
      await r.fulfill({json:{...data,events:[fixture]}})
    })
    await X.page.goto('/events')
    await X.page.getByRole('link',{name:'See event & people'}).first().waitFor()
    await X.page.waitForTimeout(700)
    await X.page.screenshot({path:`${run}/screenshots/events-multiday-card-${width}.png`,fullPage:false})
    await X.page.route(`**/api/events/${fixture.id}`,r=>r.fulfill({json:fixture}))
    await X.page.goto(`/events/${fixture.id}`)
    await X.page.getByRole('heading',{name:fixture.title,exact:true}).waitFor()
    await X.page.locator('.ev-detail-fact').first().scrollIntoViewIfNeeded()
    await X.page.waitForTimeout(700)
    await X.page.screenshot({path:`${run}/screenshots/events-multiday-detail-${width}.png`,fullPage:false})
    console.log(JSON.stringify({area:'multiday-fixture',width,starts_at:fixture.starts_at,ends_at:fixture.ends_at,formatted:await X.page.locator('.ev-detail-fact').first().innerText()}))
  }finally{await X.close()}
}
