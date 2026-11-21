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
dev: wasm test-packs
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
test: wasm test-packs
    cargo nextest run --workspace
    cargo test --doc --workspace
    pnpm --filter @involo/ui test
    node --test "tools/import-3x/*.test.js" "apps/web/*.test.js" "apps/web/src/*.test.js" "apps/web/build/*.test.js"

# Build the web host as WebAssembly into apps/web/src/wasm. Needs the wasm-bindgen CLI at the
# same version as the crate (decision 0010).
wasm:
    cargo build -q -p involo-web-host --target wasm32-unknown-unknown --profile wasm
    wasm-bindgen --target web --remove-name-section --remove-producers-section --out-dir apps/web/src/wasm target/wasm32-unknown-unknown/wasm/involo_web_host.wasm

# The packs the catalog publishes: every aircraft pack in packs/. The invented examples in
# packs/examples are not published. Add a new pack here to publish it.
published := "packs/ifly-737-max8"

# Build the pack catalog into <out> (decision 0028): each published pack, checked, as one
# `<id>-<version>.involo-pack`, and index.json with each one's entry, size and SHA-256. Extra packs
# may follow, for test folders.
catalog out *extra:
    cargo run -q -p involo-pack-cli -- build {{published}} {{extra}} {{out}}

# The invented example packs (decision 0030): checked and built with the others, used by the
# interface tests, never published.
examples := "packs/examples/example-twin packs/examples/example-sidestick packs/examples/example-twin-lr"

# The catalog the interface tests and the dev server read, built the same way into
# target/test-packs, with the example packs after it.
test-packs:
    just catalog target/test-packs {{examples}}

# Build the deployable web site into apps/web/dist (published to GitHub Pages): the placeholder
# front page, the work-in-progress app at app/ and the SimBrief probe page, with the WebAssembly
# module, then the catalog under packs/ as separate files, after the app's files are listed for
# the service worker, so no pack is in the app's code or precached. Last, the size budget
# (apps/web/size-budget.json): the app, the WebAssembly module and the largest script.
site: wasm
    pnpm --filter @involo/web build
    just catalog apps/web/dist/packs
    node apps/web/build/site-check.js apps/web/dist
    node apps/web/build/size-budget.js apps/web/dist apps/web/size-budget.json

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
    just wasm test-packs >/dev/null
    (cd packages/ui && PRACTICE_DUMP="$dir/branch.json" pnpm exec vitest run src/lib/practice-dump.test.ts >/dev/null)
    (cd "$dir/base" && pnpm install --frozen-lockfile --prefer-offline >/dev/null && { just wasm test-packs 2>/dev/null || just wasm web-packs; } >/dev/null \
      && cd packages/ui && PRACTICE_DUMP="$dir/base.json" pnpm exec vitest run src/lib/practice-dump.test.ts >/dev/null)
    git worktree remove --force "$dir/base"
    if diff -u "$dir/base.json" "$dir/branch.json" > "$dir/diff.txt"; then
      echo "practice-diff: no difference from {{base}} ($(grep -c '"id":' "$dir/branch.json") questions)"
    else
      echo "practice-diff: differences from {{base}} in $dir/diff.txt"; exit 1
    fi

# The end-to-end tests (apps/web/e2e): the built site in Chromium and WebKit, served locally with
# the catalog and the network blocked, through the main flows, with the layout and accessibility
# checks on every screen they visit. It builds what the flows read: the site, and the test packs
# (the example pack added from a file). Needs the browsers once:
# `pnpm --filter @involo/web exec playwright install --with-deps chromium webkit`.
e2e *args: site test-packs
    pnpm --filter @involo/web e2e {{args}}

# Fuzz one pack loader target for a time in seconds (pack_file, pack_edits, data_file,
# pack_folder; see fuzz/fuzz_targets), starting from a seed corpus of the packs and fixtures in
# target/fuzz-corpus. An input that crashes, hangs or runs out of memory is saved in
# target/fuzz-artifacts/<target>/. Needs a nightly compiler and cargo-fuzz:
# `rustup toolchain install nightly --profile minimal` and `cargo +nightly install cargo-fuzz`.
# Not part of `just ci`. The targets build for this machine's own target (rustc's host tuple):
# cargo-fuzz otherwise builds for the target it was itself built for, and a prebuilt cargo-fuzz
# (what CI installs) is built for musl, which the minimal nightly has no standard library for
# and the sanitizer can't link.
fuzz target seconds="300": test-packs
    node fuzz/seeds.mjs
    mkdir -p target/fuzz-artifacts/{{target}}
    cd fuzz && cargo +nightly fuzz run --target {{ `rustc +nightly --print host-tuple` }} {{target}} ../target/fuzz-corpus/{{target}} -- -max_total_time={{seconds}} -max_len=1048576 -timeout=10 -rss_limit_mb=1536 -artifact_prefix=../target/fuzz-artifacts/{{target}}/

# Review shots of the named screens (phone, both tablets, 1440 and 2560 unless a screen names its
# sizes; dark and light), each beside its approved board, into a folder outside the repo: for the
# screens a pull request adds or changes. The names are in SHOTS in apps/web/build/screenshots.mjs.
# Needs Firefox; not part of `just ci`.
review-shots out +screens: site test-packs
    node apps/web/build/screenshots.mjs {{out}} {{screens}}

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
    cargo run -q -p involo-pack-cli -- check packs packs/examples
    cargo run -q -p involo-pack-cli -- terms packs/ifly-737-max8

# Compare pack text with local reference files named by INVOLO_OVERLAP_REFS (optional; see
# CONTRIBUTING.md, "Optional local files").
overlap:
    cargo run -q -p involo-pack-cli -- overlap packs --allow crates/involo-pack-overlap/allow.txt
    cargo run -q -p involo-pack-cli -- overlap packs/examples --allow crates/involo-pack-overlap/allow.txt

# Licenses, advisories, banned crates and sources (Rust), then JS advisories in what the app
# ships (level and accepted advisories in pnpm-workspace.yaml: high and critical fail).
deny:
    cargo deny check
    pnpm audit --prod

# Everything a change must pass. Same command locally and in CI.
ci: fmt-check lint test generated-check packs site deny
    @echo "All checks passed."
