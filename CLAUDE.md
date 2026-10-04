# better-tasks: project rules
Project rules for working on the better-tasks plugin. Open before shipping a change.

- **Releases:** after shipped changes are pushed to main, cut a release: `scripts/release.sh v<next>`. It pins the marketplace entry to the new tag in a "Release v<next>" commit, tags that commit, pushes, and creates the GitHub release (notes from the commits since the last tag; pass a notes file as the second argument to write them yourself).
- **Installs get releases, not main:** `.claude-plugin/marketplace.json` points at the latest tag (`github` source `ref` and entry `version`; only release.sh edits them). A push to main reaches users with the next release.
- **No `version` in plugin.json:** it would win over the entry's `version` and freeze updates.
