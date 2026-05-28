# Release Checklist

Relay Baton releases should be cut only after the local release gate and GitHub CI agree on the same commit.

## Local Gate

```bash
npm test
npm run build
npm run release:check
npm pack --dry-run --json
```

`relay-baton release check` verifies package metadata, package-lock sync, changelog entry, built CLI, README install paths, v1 docs, competitive analysis, cross-platform CI, and clean git state.

## Online Gate

After pushing the release commit and waiting for CI:

```bash
relay-baton release check --online
```

Online checks add matching GitHub Release tag, latest GitHub CI success for the current commit, npm authentication, and npm registry publication for the current package version.

For v1.0, `--online` must pass. Before npm publication, it is expected to fail on `npm auth` or `npm package version`; that failure is the distribution blocker.

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
npm whoami
npm publish
npm view codex-relay-baton-guardian version
relay-baton release check --online
```
