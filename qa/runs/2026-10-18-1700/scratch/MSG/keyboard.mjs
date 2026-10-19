import { openAs } from '/home/xqiu/Projects/meet-people/.claude/skills/qa/scripts/qa-browser.mjs'
const [w, h] = [+(process.argv[2] ?? 390), +(process.argv[3] ?? 844)]
const A = await openAs('alice', { width: w, height: h })
await A.page.goto('/messages'); await A.page.getByRole('button', { name: /Bob/ }).waitFor()
const where = () => A.page.evaluate(() => { const e = document.activeElement; return `${e.tagName}${e.id ? '#' + e.id : ''} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 30)}" visible=${!!(e.offsetWidth || e.offsetHeight)}` })
await A.page.getByRole('button', { name: /Bob/ }).focus()
await A.page.keyboard.press('Enter'); await A.page.waitForTimeout(1500)
console.log('after Enter on conversation:', await where())
const seq = []
for (let i = 0; i < 6; i++) { await A.page.keyboard.press('Tab'); seq.push(await where()) }
console.log('next tabs:\n  ' + seq.join('\n  '))
await A.close()
