# Implementation Plan: Issue #1 - Untracked files diff preview

## Overview
Show file contents as a diff (all lines as additions) for untracked files in the Files tab, instead of "No diff available".

## Child PR Breakdown

### Child PR 1: Generate diff content for untracked files
- Modify `server.js` to read untracked file content and format as diff
- ~20 lines changed
- Files: `server.js`

### Child PR 2: Remove plan.md
- Cleanup: remove plan.md before merging to main

## Acceptance Criteria
- [ ] Untracked files show their contents in the diff viewer
- [ ] Content is formatted as additions (+ prefix on each line)
- [ ] Binary files handled gracefully (show placeholder message)

## Open Questions
- None - straightforward implementation
