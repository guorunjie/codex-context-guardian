# Release Checklist

Relay Baton releases should be cut only after the local release gate and GitHub CI agree on the same commit.

## Local Gate

```bash
npm test
npm run build
npm run release:check
npm pack --dry-run --json
npm publish --dry-run --json
```

`relay-baton release check` verifies package metadata, npm-safe bin paths, package-lock sync, changelog entry, built CLI, README install paths, v1 docs, v1 launch audit, support intake template, competitive analysis, cross-platform CI, publish dry-run coverage, npm publish workflow presence, and clean git state.

## Online Gate

After pushing the release commit and waiting for CI:

```bash
relay-baton release check --online
relay-baton release check --v1 --online
```

Online checks add matching GitHub Release tag, latest GitHub CI success for the current commit, npm authentication, and npm registry publication for the current package version.

For v1.0, `--v1 --online` must pass. Before npm publication, it is expected to fail on `npm auth` or `npm package version`; that failure is the distribution blocker.

Before tagging `v1.0.0`, reconcile every row in [docs/v1-launch-audit.md](v1-launch-audit.md) and attach the required validation evidence to the release notes.

Run the strict v1 gate before creating the final tag:

```bash
relay-baton release check --v1 --online
```

## Cut A GitHub Release

```bash
VERSION=$(node -p "require('./package.json').version")
RELEASE_DIR="/tmp/relay-baton-release-$VERSION"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"
TARBALL=$(npm pack --pack-destination "$RELEASE_DIR" --silent)
(cd "$RELEASE_DIR" && LC_ALL=C LANG=C shasum -a 256 "$TARBALL" > SHA256SUMS)
gh release create "v$VERSION" "$RELEASE_DIR/$TARBALL" "$RELEASE_DIR/SHA256SUMS" \
  --repo guorunjie/codex-relay-baton-guardian \
  --title "Relay Baton v$VERSION" \
  --notes-file CHANGELOG.md
```

## npm Publish Gate

```bash
gh workflow run publish-npm.yml -f tag=v1.0.0
npm view codex-relay-baton-guardian version
relay-baton release check --online
```

The workflow requires an `NPM_TOKEN` repository secret with publish permission. It checks out the requested tag, verifies the tag matches `package.json`, runs tests/build/release check, and publishes with npm provenance.
