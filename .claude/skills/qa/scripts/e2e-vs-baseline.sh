#!/bin/sh
# Runs the Playwright suite and compares failures with qa/baseline/e2e-failures.txt
# (tests that already failed on dev before QA fixes). Test names are compared without line
# numbers, so edits that move a test do not count as new failures.
# Usage: sh .claude/skills/qa/scripts/e2e-vs-baseline.sh <output dir> [extra playwright args]
# Exit code: 0 if no new failures, 1 if any test fails that is not on the baseline.
set -u
out=${1:?output dir}; shift
project=$(cd "$(dirname "$0")/../../../.." && pwd)
mkdir -p "$out"
if [ -z "${PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH:-}" ]; then
  PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$(ls -d "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux64/chrome 2>/dev/null | sort -V | tail -1)
  export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
fi
cd "$project" && pnpm exec playwright test --reporter=list "$@" > "$out/e2e.log" 2>&1
grep -E '^\s+[0-9]+ (passed|failed|flaky|skipped)' "$out/e2e.log"
grep -E '^\s+✘' "$out/e2e.log" | sed -E 's/^\s+✘\s+[0-9]+ //; s/\s+\([0-9.]+m?s\)$//; s/:[0-9]+:[0-9]+ › / › /' | sort -u > "$out/e2e-failures.txt"
sort -u "$project/qa/baseline/e2e-failures.txt" > "$out/baseline.txt"
comm -13 "$out/baseline.txt" "$out/e2e-failures.txt" > "$out/new-failures.txt"
comm -23 "$out/baseline.txt" "$out/e2e-failures.txt" > "$out/now-passing.txt"
echo "New failures (not on baseline): $(wc -l < "$out/new-failures.txt")"
cat "$out/new-failures.txt"
echo "Baseline failures now passing: $(wc -l < "$out/now-passing.txt")"
rm -rf "$project/output"
[ ! -s "$out/new-failures.txt" ]
