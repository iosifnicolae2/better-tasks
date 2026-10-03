# better-tasks: project rules
Project rules for working on the better-tasks plugin. Open before shipping a change.

- **Releases:** after shipped changes are pushed to main, cut a release: `scripts/release.sh v<next>` (notes from the commits since the last tag; pass a notes file as the second argument to write them yourself).
- **No `version` in plugin.json:** a pinned version blocks `claude plugin update`; installs track main's commits.
