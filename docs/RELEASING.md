# Releasing SpecPilot

The release ritual, as done for 2.13.0. `X.Y.Z` is the new version. One npm publish per day, at the end of the day, after everything doable that day has landed.

## 1. Prepare on `main` (one commit)

- [ ] `npm version X.Y.Z --no-git-tag-version` (sets `package.json` and both version fields in `package-lock.json`)
- [ ] `.specs/project/project.yaml`: `version: "X.Y.Z"`
- [ ] `.specs/architecture/api.yaml`: `cli.version: X.Y.Z`, header `lastUpdated` and `version`
- [ ] `CHANGELOG.md`: add `## [X.Y.Z] - YYYY-MM-DD` under `## [Unreleased]`, so `[Unreleased]` stays, empty
- [ ] `.specs/planning/roadmap.md`: one Timeline line, `- YYYY-MM-DD: vX.Y.Z — …` naming the BL items, the release-group heading's version range (e.g. `### v2.3.0–vX.Y.Z`), and the steps that now say "in vX.Y.Z"
- [ ] `.specs/development/context.md`: the CTX-002 Phase line names the current version
- [ ] `.specs/planning/tasks.md`: a neutral release row, `vX.Y.Z release prepared (BL-…): version bumped, CHANGELOG [Unreleased] promoted to [X.Y.Z], annotated tag vX.Y.Z; not pushed or published`
- [ ] `.specs/development/prompts.md`: an entry for the release prep
- [ ] Each spec file touched (`project.yaml`, `roadmap.md`, `context.md`, `tasks.md`, `prompts.md`): bump its header `lastUpdated` and `version`

## 2. Check

- [ ] `FORCE_COLOR=1 npm test` and `FORCE_COLOR=0 npm test`
- [ ] `npm run test:browser`, three runs
- [ ] `npm run lint` (no new problems)
- [ ] `specpilot validate` (clean)
- [ ] `npm run build`
- [ ] `npm pack --dry-run`:
  - present: `ui/`, `dist/core/`, `ui/OFL-Sixtyfour.txt`
  - absent: `scripts/`, `src/__browser__/`, `jest.browser.config.js`, `dist/__tests__/`

## 3. Commit and tag

- [ ] Read the `tasks.md` diff line by line; only the release row and header changed
- [ ] `git commit -m "chore(release): vX.Y.Z"`
- [ ] Tag with the CHANGELOG `## [X.Y.Z]` section as the message (heading to the line before the next `## [`, trailing blank lines dropped):

  ```bash
  NOTES=$(mktemp)
  awk '/^## \[X\.Y\.Z\]/{f=1;print;next} f&&/^## \[/{exit} f' CHANGELOG.md \
    | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}' > "$NOTES"
  git tag -a vX.Y.Z -F "$NOTES" --cleanup=verbatim
  git cat-file -p vX.Y.Z                         # read it
  git cat-file -p vX.Y.Z | sed '1,/^$/d' | cmp - "$NOTES"   # no output
  ```

- [ ] spec-reviewer, section D (release prep). Nothing pushed or published.

## 4. Ship (the developer runs these)

```bash
git push origin main vX.Y.Z
rm -rf dist && npm publish
gh release create vX.Y.Z --title "vX.Y.Z" --notes-from-tag
```

## 5. Record

- [ ] Check: `origin/main` and the tag on origin, `npm view specpilot dist-tags`, `gh release view vX.Y.Z`
- [ ] New commit `docs(tasks): vX.Y.Z shipped`: the release row reworded and a shipped row added; push
