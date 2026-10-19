from pathlib import Path
import re
import subprocess
root=Path('/home/xqiu/Projects/meet-people')
run=root/'qa/runs/2026-10-18-1700'
items={
'AUTH-01':('P1','Auth','Revoked sessions trap users behind account errors.','Clear the expired local session on account 401, preserve the return destination, and retain Retry for transient errors. Refreshed tokens and switched identities are protected.',['src/auth/account.tsx'],['tests/account-recovery.test.tsx']),
'AUTH-02':('P2','Profile','Saved custom interests are absent from the editor.','Include saved custom interests alongside presets so users can remove, restore, and save them.',['src/features/prototype/Social.tsx'],['tests/profile-editor.test.tsx']),
'MOBILE-01':('P2','Mobile','Keyboard focus is hidden by compact navigation.','Reserve the shared navigation height and safe-area allowance when focused controls scroll into view.',['src/features/prototype/responsive.css'],['e2e/keyboard-clearance.spec.ts']),
'HOME-01':('P2','Home','Profile Back opens unrelated free-time planning.','Record the profile entry route and return there; retain planning navigation and a direct-entry fallback.',['src/routes/PebbleApp.tsx','src/features/prototype/Social.tsx'],['tests/routes.test.tsx']),
'MATCH-01':('P2','Matching','Rejected preferences hide feedback below the dialog viewport.','Focus the existing error alert after client validation and failed saves, including repeated invalid submissions.',['src/features/matchmaking/MatchingScreen.tsx'],['tests/matchmaking-integrated.test.tsx','e2e/matchmaking.spec.ts']),
'EVENTS-01':('P2','Events','Event errors expose raw parser/network diagnostics.','Normalize transport, JSON, and schema errors; preserve actionable server messages, retry, and cancellation.',['src/features/events/client.ts'],['tests/events-client.test.ts']),
'KNOWN-1':('P2','Messages','Disconnected chats keep an enabled composer.','Treat history/send 403 and 404 responses as loss of access, disable sending, explain the state, and remove the inbox row. Ignore obsolete successful polls after access ends.',['src/features/messaging/Feature.tsx','src/auth/authorizedRequest.ts'],['tests/messaging.test.tsx']),
'KNOWN-2':('P2','Messages','Ended conversations survive successful inbox polling.','Replace the loaded conversation pages with authoritative responses, retaining later pages and preventing stale in-flight responses from restoring removed records.',['src/features/messaging/Feature.tsx'],['tests/messaging.test.tsx']),
'KNOWN-3':('P2','Messages','Open-chat messages leave stale inbox previews.','Update the preview with the chat poll; compare message sequence numbers so delayed polls cannot replace newer sent-message previews.',['src/features/messaging/Feature.tsx'],['tests/messaging.test.tsx']),
'KNOWN-4':('P2','Messages','Failed sends show raw browser errors.','Use actionable connection feedback while retaining drafts and the existing retry request ID; avoid retry advice after access ends.',['src/features/messaging/Feature.tsx'],['tests/messaging.test.tsx']),
}
def link(path,label=None):
 p=Path(path)
 if not p.is_absolute(): p=root/p
 return f'[{label or p.name}]({p})'
verified=(run/'verify.md').exists()
status='Fixed and verified' if verified else 'Fixed, not verified'
text=f'''# QA report: 2026-10-18-1700

2026-10-18 · branch dev @ dc9e94a · AUTH, MSG, MATCH, EVENTS, HOME, MOBILE · status {status}

## Summary
Recovered Claude's interrupted six-area run from its saved scripts, screenshots, and mobile scan logs. The run had no saved findings or report when resumed. Three area testers recovered the evidence; the lead independently reproduced findings, grouped fixes by affected files, integrated isolated worktrees, and commissioned browser verification plus an independent messaging review.

**10 confirmed issues: 0 P0, 1 P1, 9 P2. All ten fixed.** Nitpicks and product questions were left alone. No database reset, schema migration, production deployment, commit, or push. All implementation changes are uncommitted and unstaged in the main working tree. Temporary worktrees and the separate UI test server were removed.

## Issues (P0–P2)

| ID | Sev | Area | Summary | Status |
| --- | --- | --- | --- | --- |
'''
for ident,(sev,area,summary,fix,files,tests) in items.items():
 text+=f'| {link(run/"findings"/f"{ident}.md",ident)} | {sev} | {area} | {summary} | {status} |\n'
for ident,(sev,area,summary,fix,files,tests) in items.items():
 finding=(run/'findings'/f'{ident}.md').read_text()
 body=re.sub(r'^---\n.*?\n---\n','',finding,flags=re.S).strip()
 text+=f'\n### {ident}: {summary}\n\n{body}\n\n**Fix:** {fix}\n\n**Files:** '+', '.join(link(f) for f in files)+'.\n\n**Regression coverage:** '+', '.join(link(t) for t in tests)+'.\n'
 shots=sorted((run/'screenshots').glob(f'{ident}-after-*.png'))
 if shots:
  text+='\n**Browser evidence:** '+', '.join(link(s,s.name) for s in shots)+'.\n'
 text+=f'\n**Verification:** {status}; see '+link(run/'verify.md','independent verification report')+'.\n'
text+='''
## Nitpicks (P3, not fixed)

- KNOWN-5: missing favicon.
- KNOWN-6: previously loaded messages remain visible after local blocking until reload.
- Minor spacing, artwork measurements, and taste observations were not promoted to functional findings.

## Design questions for you

- After sending a connection request, the candidate can disappear after refresh/checking again. Should sent requests have a persistent management view? This was retained as a product question rather than adding an unsolicited workflow. See '''+link(run/'findings/MATCH-questions.md','MATCH questions')+'''.

## Changes made

| File | Change | For |
| --- | --- | --- |
'''
file_map={}
for ident,(_,_,_,fix,files,tests) in items.items():
 for f in files: file_map.setdefault(f,[]).append(ident)
 for f in tests: file_map.setdefault(f,[]).append(ident)
for f,ids in sorted(file_map.items()):
 desc='Regression coverage' if f.startswith(('tests/','e2e/')) else 'Targeted behavior fix'
 text+=f'| {link(f,f)} | {desc} | {", ".join(ids)} |\n'
text+=f'| {link("eslint.config.js","eslint.config.js")} | Exclude local Claude/QA scratch tooling from application lint | QA integration |\n'
text+='''
Added 29 unit test cases and six browser cases, including controls around cancellation, transient errors, token refresh, identity switches, pagination, safe areas, repeated validation, and delayed messaging responses. Representative regressions were demonstrated failing before their fixes. Independent review reproduced two additional delayed-response races in the initial messaging fix; both received failing-before/passing-after regressions and browser rechecks.

Working-tree diff stat (tracked files; new files listed below):

```text
'''+subprocess.check_output(['git','diff','--stat'],cwd=root,text=True)+'''```

New files:

'''+''.join('- '+link(p,p)+'\n' for p in subprocess.check_output(['git','ls-files','--others','--exclude-standard'],cwd=root,text=True).splitlines())+'''
## Checks

| Check | Result |
| --- | --- |
| `pnpm typecheck` | Passed |
| `pnpm lint` | Passed |
| `pnpm test` | 320 passed; original baseline was 291 passed |
| `pnpm build` | Passed web and API builds; existing bundle-size advisory remains |
| Full Playwright suite | 121 executed: 102 passed, 19 failed |
| E2E comparison | All 19 failures exactly match Claude's saved baseline; zero new failures |
| New keyboard/preference browser tests | All six passed |
| Browser issue retests | See independent verification report for per-ID evidence |
| `git diff --check` | Passed |

The suite is not fully green: its 19 existing failures remain explicitly recorded in '''+link(run/'verify/e2e-failures.txt','e2e failures')+'''. They were compared with '''+link(root/'qa/baseline/e2e-failures.txt','the preserved pre-fix baseline')+''' rather than silently ignored. Raw results: '''+link(run/'verify/e2e.log','full e2e log')+'''. The original lint failure came from more than 700 errors in local scratch scripts; those directories now have an explicit lint exclusion.

## Not covered

- Google OAuth, provider-backed matching/embeddings, hosted event ingestion, and background event-group generation were unavailable locally.
- Browser tests used Chromium at simulated phone/tablet/desktop viewports, not physical devices, Safari, or a real mobile keyboard.
- Network, access-loss, incoming-message, and gateway failure fixtures are explicitly identified. Real seeded accounts were used for authentication/profile/preferences checks; injected response tests make no database-proof claim.
- Fictional Home profiles, Community history, and free-time planning remain intentional local fixtures. A sample person's in-memory selection resetting on reload was not promoted to a new persistence requirement.
- This recovers the interrupted run; it does not claim exhaustive coverage of every possible user state.
'''
(run/'REPORT.md').write_text(text)
(root/'qa/REPORT.md').write_text(text)
