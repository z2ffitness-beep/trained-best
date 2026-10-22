#!/bin/sh
# The standing verification stack. Run from the project root.
#
# The build step is deliberately not here. node_modules in this folder is
# built for macOS; the build runs in a Linux copy of the project with its own
# node_modules, because rollup ships a platform-specific native binary and
# running the macOS one under Linux fails with MODULE_NOT_FOUND.
set -e
for t in _verify/*.test.mjs; do
  echo "== $t =="
  node "$t"
done
echo "== privacy page =="
# Warns rather than fails: the placeholders are a release blocker, not a
# reason to stop the rest of the checks while the app is still being built.
node _verify/build-privacy.mjs || echo "   (fill these in before submitting)"
echo "== the checker that reads line order, checked against itself =="
node _verify/tdz-selftest.mjs
echo "== names read too early, or pointing at nothing =="
# The two crashes of 20 Oct, both caught here now, both at source level with
# no build needed:
#   "Cannot access 've' before initialization"  - shownWeek was read 47 lines
#   above the line that made it, on the Program tab.
#   "Can't find variable: bubbleBg"             - declared inside the Messages
#   screen, read from a different function, on the Coach tab.
node _verify/tdz.mjs
echo "== hooks below an early return =="
node _verify/hooks.mjs
echo "== unwired components and state =="
node _verify/unwired.mjs
echo "== names leaking into the bundle as globals =="
# Reads the BUILT bundle, so it must run after a build. This is the only
# check in the repo that would have caught "Can't find variable:
# SIGNUP_V2_SECTIONS" - every source-level test passed against code that
# could not run.
node _verify/scope.mjs
echo "== migrations, against a real Postgres =="
# Every other check reads the .sql as text. This one RUNS it. A migration
# that has never been executed anywhere is one Isaiah meets for the first
# time on production, with nobody around to fix it. Skips itself, loudly,
# where there is no Postgres.
sh _verify/sql/run-sql-tests.sh
echo
echo "Build separately:  cd ~/tbdev && cp <project>/src/App.jsx src/ && npx vite build"
