# Contributing

Thanks for helping. Bugs, ideas, plugins, styles and pull requests are all welcome.

## Set up

```bash
git clone https://github.com/ru-dr/qryg-search.git
cd qryg-search
npm install          # ESLint
make link            # install as a symlink to this checkout
```

Log out and back in once, because GNOME Shell only loads extension code at login. Settings, styles and plugin reloads apply live. Code changes need another login.

## Before you open a pull request

```bash
make check           # syntax, schema, lint, JavaScript and Python tests
```

- Keep each file to one job, and match the code around it.
- Don't add comments, except the SPDX licence line at the top of each file.
- Add a test for logic that can run without GNOME Shell, such as `lib/core/css.js`, `lib/results/ranking.js` or the calculator engine.
- Add a line under `## Unreleased` in `CHANGELOG.md` for anything users will notice.
- If you add a feature that isn't part of GNOME, consider making it a plugin. See [docs/PLUGINS.md](docs/PLUGINS.md).

## Branches and merging

- `main` is protected. Every change goes through a pull request, and CI must pass.
- Pull requests are squash-merged, so the title becomes the commit message. Write it as a short imperative sentence, such as "Add a weather plugin".
- Branches are deleted after merging.

## Releases

QryG uses [semantic versioning](https://semver.org):

| Change | Version |
|---|---|
| Bug fixes only | patch, `1.0.1` |
| New features, plugins or options, compatible with existing plugins and settings | minor, `1.1.0` |
| Removes or changes something plugins or users rely on, including a new plugin API version | major, `2.0.0` |

To release:

1. On a branch, run `python3 scripts/release.py bump 1.1.0`. It moves the `Unreleased` notes into a `1.1.0` section and sets the version in `metadata.json`, `package.json` and the CLI.
2. Open a pull request, and merge it once CI passes.
3. Tag the merge commit on `main` and push the tag:

   ```bash
   git switch main && git pull
   git tag v1.1.0
   git push origin v1.1.0
   ```

4. The release workflow checks that the tag matches the version, runs `make check`, builds `qryg-search@ru-dr.shell-extension.zip`, and publishes a GitHub release with the changelog notes. Tags with a suffix, such as `v1.1.0-beta.1`, become pre-releases.
5. Upload the zip to [extensions.gnome.org](https://extensions.gnome.org/upload/) if the release should reach users there.
