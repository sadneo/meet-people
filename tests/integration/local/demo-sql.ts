// Emits SQL only; the caller runs it in a disposable, network-isolated database.
import { demoPlan } from '../../../scripts/demo-seed/plan.js'
import { seedSql } from '../../../scripts/demo-seed/sql.js'
import { activeDemoSql } from '../../../scripts/demo-seed/active.js'
const profiles=demoPlan(3)
console.log(JSON.stringify({profiles,seed:seedSql(profiles,new Map(),true),join:activeDemoSql(3,1,'join',2,true),status:activeDemoSql(3,1,'status'),cancel:activeDemoSql(3,1,'cancel'),remove:activeDemoSql(3,1,'remove')}))
