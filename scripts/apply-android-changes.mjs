// Adds the npm scripts these Android changes need to package.json, then reports anything left to do.
// Safe to run more than once. It never overwrites a script you already changed, and it refuses to
// rewrite package.json if doing so would reformat it.
//   node scripts/apply-android-changes.mjs
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const file = 'package.json'
if (!existsSync(file)) { console.error('Run this from the project root (the folder with package.json).'); process.exit(1) }

const wanted = {
  'start:push': 'node dist/api/api/push-dispatcher-main.js',
  'build:android:dev': 'node scripts/build-android-dev.mjs',
  'android:dev': 'pnpm build:android:dev && cap open android',
  'android:dev-user': 'node --env-file-if-exists=.env.local scripts/create-android-dev-user.mjs',
}
const wantedDependencies = ['@capacitor/push-notifications', 'google-auth-library']

const text = readFileSync(file, 'utf8')
const eol = text.includes('\r\n') ? '\r\n' : '\n'
const pkg = JSON.parse(text)
const indent = /^( +|\t)"/m.exec(text)?.[1] ?? '  '
const render = value => JSON.stringify(value, null, indent).replace(/\n/g, eol) + (text.endsWith('\n') ? eol : '')
if (render(pkg) !== text) {
  console.error('package.json uses custom formatting, so it was left untouched. Add these lines under "scripts" by hand:')
  for (const [name, command] of Object.entries(wanted)) console.error(`    "${name}": ${JSON.stringify(command)},`)
  process.exit(1)
}

pkg.scripts ??= {}
const added = [], kept = []
for (const [name, command] of Object.entries(wanted)) {
  if (!(name in pkg.scripts)) { pkg.scripts[name] = command; added.push(name) }
  else if (pkg.scripts[name] !== command) kept.push(name)
}
if (added.length) writeFileSync(file, render(pkg))

console.log(added.length ? `Added scripts: ${added.join(', ')}` : 'package.json scripts are already up to date.')
if (kept.length) console.log(`Left your existing versions of: ${kept.join(', ')} (they differ from the suggested ones).`)
const have = { ...pkg.dependencies, ...pkg.devDependencies }
const missing = wantedDependencies.filter(name => !(name in have))
if (missing.length) console.log(`\nStill to do: pnpm add ${missing.join(' ')}`)
else console.log('\nDependencies are in place.')
