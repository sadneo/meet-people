// stdin is a synthetic private pool from the isolated SQL acceptance runner.
import { readFileSync } from 'node:fs'
import { chooseActiveGroup } from '../../../api/matching/active-search.js'
console.log(JSON.stringify(chooseActiveGroup(JSON.parse(readFileSync(0, 'utf8')))))
