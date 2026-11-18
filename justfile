# SPDX-FileCopyrightText: 2026 offbyonce
# SPDX-License-Identifier: MIT
#
# Every task lives here. Git hooks and GitHub Actions call these recipes, so a
# check that passes locally passes everywhere. Run `just` to list them.

set windows-shell := ["powershell.exe", "-NoLogo", "-NoProfile", "-Command"]

# List the recipes.
default:
    @just --list

# Install JS packages and fetch Rust crates (run once after cloning).
setup:
    pnpm install
    cargo fetch

# Run the web app's dev server (the app is at /app/).
dev: wasm web-packs
    pnpm --filter @involo/web dev

# Format everything in place.
fmt:
    cargo fmt --all
    pnpm exec biome check --write .

# Fail if anything is not formatted.
fmt-check:
    cargo fmt --all --check
    pnpm exec biome format .

# Lints and type checks (warnings fail).
lint: wasm
    cargo clippy --workspace --all-targets -- -D warnings
    pnpm exec biome check --error-on-warnings .
    pnpm --filter @involo/ui check
    pnpm --filter @involo/web check

# All tests: Rust (nextest + doctests), the interface (Vitest), the 3.0 converter and the web site.
test: wasm web-packs
    cargo nextest run --workspace
    cargo test --doc --workspace
    pnpm --filter @involo/ui test
    node --test "tools/import-3x/*.test.js" "apps/web/*.test.js" "apps/web/src/*.test.js" "apps/web/build/*.test.js"

# Build the web host as WebAssembly into apps/web/src/wasm. Needs the wasm-bindgen CLI at the
# same version as the crate (decision 0010).
wasm:
    cargo build -q -p involo-web-host --target wasm32-unknown-unknown --profile wasm
    wasm-bindgen --target web --remove-name-section --remove-producers-section --out-dir apps/web/src/wasm target/wasm32-unknown-unknown/wasm/involo_web_host.wasm

# Check the published packs and write them as flattened JSON for the web app to fetch. The
# example pack is a format demo for authors and is not published.
web-packs:
    cargo run -q -p involo-pack-cli -- build packs/ifly-737-max8 apps/web/public/packs
    # The invented example pack, for interface tests only (it draws every format 6 control).
    cargo run -q -p involo-pack-cli -- build packs/example-trainer target/test-packs

# Build the deployable web site into apps/web/dist (published to GitHub Pages): the placeholder
# front page, the work-in-progress app at app/ and the SimBrief probe page, with the WebAssembly
# module and the flattened packs.
site: wasm web-packs
    pnpm --filter @involo/web build

# The service worker's version-to-version update test in headless Firefox (needs Firefox; not
# part of `just ci`). See apps/web/build/update-test.mjs.
update-test: site
    node apps/web/build/update-test.mjs

# Builds <base> in a worktree under target/practice-diff and writes every question from each with
# packages/ui/src/lib/practice-dump.test.ts; the diff is empty when a change leaves the questions
# word for word as they were. Not part of `just ci`.
# Diff every iFly practice question on <base> (main by default) against this checkout.
practice-diff base="main":
    #!/usr/bin/env bash
    set -euo pipefail
    dir="$PWD/target/practice-diff"
    dump="packages/ui/src/lib/practice-dump.test.ts"
    rm -rf "$dir" && mkdir -p "$dir"
    git worktree remove --force "$dir/base" 2>/dev/null || true
    git worktree add --detach "$dir/base" "{{base}}" >/dev/null
    cp "$dump" "$dir/base/$dump"
    just wasm web-packs >/dev/null
    (cd packages/ui && PRACTICE_DUMP="$dir/branch.json" pnpm exec vitest run src/lib/practice-dump.test.ts >/dev/null)
    (cd "$dir/base" && pnpm install --frozen-lockfile --prefer-offline >/dev/null && just wasm web-packs >/dev/null \
      && cd packages/ui && PRACTICE_DUMP="$dir/base.json" pnpm exec vitest run src/lib/practice-dump.test.ts >/dev/null)
    git worktree remove --force "$dir/base"
    if diff -u "$dir/base.json" "$dir/branch.json" > "$dir/diff.txt"; then
      echo "practice-diff: no difference from {{base}} ($(grep -c '"id":' "$dir/branch.json") questions)"
    else
      echo "practice-diff: differences from {{base}} in $dir/diff.txt"; exit 1
    fi

# Screenshots of the built app for review (phone, both tablets, 1440 and 2560, dark and light), to a
# folder outside the repo. Needs Firefox; not part of `just ci`.
screenshots out: site
    node apps/web/build/screenshots.mjs {{out}}

# The drawing renderer's review images (gallery, each control state, the board's drawings), both
# themes, into <out>, outside the repo. Needs Firefox; not part of `just ci`.
drawing-shots out: site
    node apps/web/build/drawing-shots.mjs {{out}}

# Regenerate the pack JSON Schemas from the Rust types.
schemas:
    cargo run -q -p involo-pack-cli -- schema schemas

# Regenerate the TypeScript types from the Rust types.
bindings:
    cargo test -q --workspace export_bindings

# Regenerate the interface's design tokens from docs/design/tokens.json (decision 0021).
tokens:
    node packages/ui/build/tokens.mjs

# Fail if generated schemas, bindings or tokens differ from what is committed.
generated-check: schemas bindings tokens
    git diff --exit-code -- schemas packages/bindings/src/generated packages/ui/src/theme/tokens.generated.css packages/ui/src/theme/tokens.generated.ts

# Validate every pack, including the content rules.
packs:
    cargo run -q -p involo-pack-cli -- check packs
    cargo run -q -p involo-pack-cli -- terms packs/ifly-737-max8

# Compare pack text with local reference files named by INVOLO_OVERLAP_REFS (optional; see
# CONTRIBUTING.md, "Optional local files").
overlap:
    cargo run -q -p involo-pack-cli -- overlap packs --allow crates/involo-pack-overlap/allow.txt

# Licenses, advisories, banned crates and sources (Rust), then JS advisories.
deny:
    cargo deny check
    pnpm audit --prod

# Everything a change must pass. Same command locally and in CI.
ci: fmt-check lint test generated-check packs site deny
    @echo "All checks passed."
