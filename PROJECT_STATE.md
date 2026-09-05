# Project State

Updated: 2026-09-05 10:30 +08:00

## Current goal
- Supply the Harness-side, non-secret administration boundary for FindMe compute-source onboarding.

## Confirmed decisions
- This Fork carries the private opt-in FindMe integration while upstream Harness remains the base architecture.
- The Agent may manage non-secret compute metadata; Provider credential values use a separate structured Desktop-to-API path.
- The parent Desktop repository pins this repository by Git Submodule commit.

## Completed
- Added `@deepseek-ai/dsh-experimental-tool-findme-compute` with five Admin API tools.
- Added Loader-composition tests for registration, authorization-header isolation, input secret rejection, and bounded API errors.
- Added package wiring, generated tool/config/module catalogs, bilingual docs, and an implemented Agent Note.

## Verification
- Focused Loader suite: 3 passed.
- Full typecheck and full build: passed.
- Workspace constraints and published dependency policy: passed.
- Focused lint and documentation checks: passed.
- Full `doc-sync`: relevant gates pass; one existing site test is blocked by Windows symlink privilege.

## Next step
- Validate this pinned commit on macOS through the parent Desktop bootstrap and development profile.
- Keep credential entry out of model tools when the parent Desktop adds the structured credential form.
