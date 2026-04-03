# Implementation Plan: Issue #2 - Report Issue button

## Overview
Add a "Report Issue" button to the dashboard header that opens the GitHub issues page.

## Child PR Breakdown

### Child PR 1: Add report issue button to header
- Add bug icon button to Header component
- Link to https://github.com/luigiinred/agentdashboard/issues/new
- Style to match existing UI
- ~20 lines changed
- Files: `web/src/components/Header.tsx`, `web/src/styles.css`

### Child PR 2: Remove plan.md
- Cleanup: remove plan.md before merging to main

## Acceptance Criteria
- [ ] Button visible in header
- [ ] Opens GitHub issues page in new tab
- [ ] Matches existing UI style
