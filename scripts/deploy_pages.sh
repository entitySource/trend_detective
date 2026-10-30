#!/usr/bin/env bash
# Publish web/dist to the gh-pages branch of a GitHub repo (GitHub Pages).
#
#   bash scripts/deploy_pages.sh                 # pushes to the "origin" remote
#   bash scripts/deploy_pages.sh <repo-url>      # or to an explicit repo URL
#
# The data (~320 MB) is not in the main branch, so this pushes the built site from a throwaway repo
# as a single fresh commit each time: gh-pages never accumulates old copies of the data.
# Run "npm run build" in web/ first (with web/public/data exported).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
dist="$root/web/dist"
remote="${1:-$(git -C "$root" remote get-url origin)}"

[ -f "$dist/index.html" ] || { echo "No build in web/dist. Run: cd web && npm run build"; exit 1; }
[ -f "$dist/data/manifest.json" ] || { echo "web/dist has no data/. Export first, then rebuild."; exit 1; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
cp -r "$dist/." "$tmp/"
touch "$tmp/.nojekyll"  # serve files as-is, skip Jekyll

cd "$tmp"
git init -q -b gh-pages
git add -A
git commit -q -m "Deploy Trend Detective $(git -C "$root" rev-parse --short HEAD)"
git push --force "$remote" gh-pages
echo "Pushed. Turn on Pages once: repo Settings > Pages > Deploy from branch > gh-pages / (root)."
