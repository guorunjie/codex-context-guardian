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

For app-server releases, also run:

```bash
relay-baton app-server status
relay-baton recover --last --strategy fork --app-server --dry-run
```

`relay-baton release check` verifies package metadata, npm-safe bin paths, package-lock sync, changelog entry, built CLI, README install paths, v1 docs, v1 launch audit, support intake template, competitive analysis, cross-platform CI, publish dry-run coverage, npm publish workflow presence, and clean git state.
It also verifies that the manual host-validation workflow exists so maintainers can collect packed-CLI evidence on Linux, macOS, and Windows.

## Online Gate

After pushing the release commit and waiting for CI:

```bash
relay-baton release check --online
relay-baton release check --v1 --online
```

Online checks add matching GitHub Release tag, GitHub Release target matching the current commit, latest GitHub CI success for the current commit, npm authentication, and npm registry publication for the current package version.

For v1.0, `--v1 --online` must pass. Before npm publication, it is expected to fail on `npm auth` or `npm package version`; that failure is the distribution blocker.

Before tagging `v1.0.0`, reconcile every row in [docs/v1-launch-audit.md](v1-launch-audit.md) and attach the required validation evidence to the release notes.

## Host Validation Evidence

For v1.0 candidates, run the manual workflow and download its artifacts:

```bash
gh workflow run host-validation.yml
gh run list --workflow "Host Validation"
gh run download <run-id> --name host-validation-linux
gh run download <run-id> --name host-validation-windows
gh run download <run-id> --name host-validation-macos
```

Commit or attach only redacted reports whose `VALIDATION_REPORT.json` proves `summary.ok`, `summary.doctorOk`, `summary.monitorInstalled`, and `summary.monitorLoaded` are all `true`. Failed artifacts are useful for debugging, but they do not satisfy the v1 support matrix.

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
VERSION=$(node -p "require('./package.json').version")
gh workflow run publish-npm.yml -f tag="v$VERSION"
npm view codex-relay-baton-guardian version
relay-baton release check --online
```

The workflow requires an `NPM_TOKEN` repository secret with publish permission. It checks out the requested tag, verifies the tag matches `package.json`, runs tests/build/release check, and publishes with npm provenance.

### Maintainer Token Runbook

Use this path when `relay-baton release check --online` fails on `npm auth` or `npm package version` while the GitHub Release and CI are already green.

Current package ownership must include the npm maintainer account:

```bash
npm view codex-relay-baton-guardian maintainers --json
```

For the current package line, the publishing account is expected to be `guorunjie <15911869@qq.com>`.

Recommended GitHub Actions path:

1. Log in to npmjs.com as the package maintainer.
2. Create an automation/granular access token that can publish `codex-relay-baton-guardian`.
3. Replace the GitHub repository secret `NPM_TOKEN` with that token.
4. Run:

```bash
VERSION=$(node -p "require('./package.json').version")
gh workflow run publish-npm.yml -f tag="v$VERSION"
gh run list --workflow "Publish npm"
npm view codex-relay-baton-guardian version dist-tags.latest --json
relay-baton release check --online
```

Local fallback path:

```bash
npm login --auth-type=web
npm whoami
npm publish --access public
npm view codex-relay-baton-guardian version dist-tags.latest --json
relay-baton release check --online
```

Do not publish from a non-maintainer npm account. If npm returns `E401`, the local machine is not logged in. If npm returns `E404` while publishing an existing package, the token is missing package publish permission.

If GitHub Actions reaches `Publish to npm`, prints the tarball contents, signs provenance, and then fails on `PUT https://registry.npmjs.org/codex-relay-baton-guardian` with `E404`, treat it as an invalid or under-scoped `NPM_TOKEN`. Confirm:

```bash
npm owner ls codex-relay-baton-guardian
npm view codex-relay-baton-guardian version dist-tags.latest maintainers --json
```

If the package owner is still `guorunjie <15911869@qq.com>` and the registry package exists, replace the GitHub repository secret `NPM_TOKEN` with a fresh maintainer-owned token, then rerun `publish-npm.yml`.
