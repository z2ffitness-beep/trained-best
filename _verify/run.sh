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
echo "== hooks below an early return =="
node _verify/hooks.mjs
echo "== unwired components and state =="
node _verify/unwired.mjs
echo
echo "Build separately:  cd ~/tbdev && cp <project>/src/App.jsx src/ && npx vite build"
