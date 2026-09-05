# Project State

Updated: 2026-09-05 11:08 +08:00

## Current goal
- Supply the Harness-side, non-secret administration boundary and shared host API client for the FindMe Compute Center.

## Confirmed decisions
- This Fork carries the private opt-in FindMe integration while upstream Harness remains the base architecture.
- The Agent may manage non-secret compute metadata; Provider credential values use a separate structured Desktop-to-API path.
- The parent Desktop repository pins this repository by Git Submodule commit.

## Completed
- Added `@deepseek-ai/dsh-experimental-tool-findme-compute` with five Admin API tools.
- Added Loader-composition tests for registration, authorization-header isolation, input secret rejection, and bounded API errors.
- Added package wiring, generated tool/config/module catalogs, bilingual docs, and an implemented Agent Note.
- Fixed Windows startup by loading the POSIX-only `fs-ext` binding only when the POSIX lease path runs.
- Added a Windows regression test for importing the JSONL lease module without the POSIX native binding.
- Extracted the authenticated, response-validating API client for reuse by the parent Desktop host plugin.
- Added Agent tools for logical-model drafts, routing-policy drafts/tests, and invocation traces.
- Kept credential entry, target suspension, and route publication outside Agent tools for human confirmation.

## Verification
- Focused Loader suite: 3 passed.
- Full typecheck, build, and lint: passed.
- Workspace constraints and published dependency policy: passed.
- Focused lint and documentation checks: passed.
- Session lease tests: 22 passed, 9 platform-specific tests skipped.
- Windows Desktop profile: started successfully and served the authenticated local endpoint on port 3080.
- Full `doc-sync`: relevant gates pass; one existing site test is blocked by Windows symlink privilege.

## Next step
- Pin this feature commit from the parent Desktop WIP branch and validate the Compute Center against the local API.
- Validate the stable pinned baseline and this feature branch on macOS through the parent Desktop bootstrap.
