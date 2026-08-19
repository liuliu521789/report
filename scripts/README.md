# Scripts

This directory is for project maintenance scripts that are safe to keep and
documented with their intended usage.

## Keep

- `merge-duplicate-customers.cjs`: data maintenance script for merging duplicate
  sales customers. Run with `--dry-run` first and only execute against a backed
  up database.

## One-off Refactor Scripts

The cleanup/fix/find-dead/rebuild scripts were created for temporary source
refactors and should not be reused as regular maintenance commands. They are
ignored by the root `.gitignore` to avoid committing local rewrite helpers by
accident.

Examples:

- `cleanup*.cjs`
- `fix-*.cjs`
- `find-dead*.cjs`
- `check-remaining.cjs`
- `rebuild-methods.cjs`
- `full-cleanup.cjs`

If a one-off script becomes useful again, promote it to a documented maintenance
script with a dry-run mode before committing it.

## Needs Review

- `patch-party-editor.cjs`: direct source patch for
  `admin/src/views/ContractTemplateEdit.vue`. Keep it ignored or delete it after
  confirming the patch has already been applied.
