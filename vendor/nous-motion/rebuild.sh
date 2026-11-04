#!/usr/bin/env bash
set -euo pipefail

# Gera em /tmp para preservar o pacote versionado até a comparação/revisão.
source_commit=28d145f6c71e1b386ccc471813c907ceb24968f5
provenance_dir=$(cd -- "$(dirname -- "$0")" && pwd)
build_dir=$(mktemp -d /tmp/fastbar-nous-motion.XXXXXX)
git clone --quiet https://github.com/sovive89/-Nous_motion.git "$build_dir/source"
git -C "$build_dir/source" checkout --quiet --detach "$source_commit"
cp "$provenance_dir/build-lock.yaml" "$build_dir/source/pnpm-lock.yaml"
cd "$build_dir/source"
pnpm install --frozen-lockfile --ignore-scripts
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
./node_modules/.bin/vite build
./node_modules/.bin/tsc -p tsconfig.build.json
node scripts/measure-size.mjs
npm pack --pack-destination "$build_dir"
sha256sum "$build_dir/nous-motion-0.1.0.tgz"
