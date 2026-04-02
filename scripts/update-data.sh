#!/bin/bash
# Generate JSON data for session dashboard

set -e

# Get session file path
PROJECT_NAME=$(basename "$(pwd)" | tr '[:upper:]' '[:lower:]' | tr ' ' '-')
BRANCH_DISPLAY=$(git branch --show-current 2>/dev/null || echo "no-branch")
BRANCH_SAFE=$(echo "$BRANCH_DISPLAY" | tr '/' '-')
SESSION_DIR="$HOME/.claude/sessions"
mkdir -p "$SESSION_DIR"
DATA_FILE="$SESSION_DIR/${PROJECT_NAME}-${BRANCH_SAFE}.json"

# Default base branch
BASE_BRANCH="main"

# Get GitHub username
GH_USER=$(gh api user --jq '.login' 2>/dev/null || echo "")

# Check for PR
PR_INFO=$(gh pr view --json url,state,isDraft,baseRefName,number,title 2>/dev/null || echo "")

if [ -n "$PR_INFO" ] && [ "$PR_INFO" != "null" ]; then
    PR_URL=$(echo "$PR_INFO" | jq -r '.url // empty')
    PR_STATE=$(echo "$PR_INFO" | jq -r '.state // empty')
    PR_DRAFT=$(echo "$PR_INFO" | jq -r '.isDraft // false')
    PR_BASE=$(echo "$PR_INFO" | jq -r '.baseRefName // empty')
    PR_NUMBER=$(echo "$PR_INFO" | jq -r '.number // empty')
    PR_TITLE=$(echo "$PR_INFO" | jq -r '.title // empty')
    [ -n "$PR_BASE" ] && BASE_BRANCH="$PR_BASE"
else
    PR_URL=""
    PR_STATE=""
    PR_DRAFT="false"
    PR_NUMBER=""
    PR_TITLE=""
fi

# Build PR stack
build_pr_stack() {
    local stack="[]"
    local parents=()
    local current_base="$PR_BASE"

    # Walk up to find parent PRs
    while [ -n "$current_base" ] && [ "$current_base" != "main" ] && [ "$current_base" != "master" ]; do
        parent_pr=$(gh pr list --head "$current_base" --json number,url,title,baseRefName,state --jq '.[0]' 2>/dev/null)
        if [ -n "$parent_pr" ] && [ "$parent_pr" != "null" ]; then
            parents+=("$parent_pr")
            current_base=$(echo "$parent_pr" | jq -r '.baseRefName')
        else
            break
        fi
    done

    # Build stack JSON (parents in reverse order, then current, then children)
    local indent=0
    stack="["

    # Parents (oldest first)
    for ((i=${#parents[@]}-1; i>=0; i--)); do
        p="${parents[$i]}"
        if [ "$stack" != "[" ]; then stack+=","; fi
        stack+=$(echo "$p" | jq --argjson indent "$indent" '{
            number: .number,
            url: .url,
            title: .title,
            state: .state,
            indent: $indent,
            isCurrent: false
        }')
        ((indent++))
    done

    # Current branch/PR
    if [ -n "$PR_NUMBER" ]; then
        if [ "$stack" != "[" ]; then stack+=","; fi
        stack+="{\"number\":$PR_NUMBER,\"url\":\"$PR_URL\",\"title\":$(echo "$PR_TITLE" | jq -Rs .),\"state\":\"$PR_STATE\",\"indent\":$indent,\"isCurrent\":true}"
    else
        if [ "$stack" != "[" ]; then stack+=","; fi
        stack+="{\"title\":\"$BRANCH_DISPLAY\",\"indent\":$indent,\"isCurrent\":true}"
    fi

    # Children (PRs based on this branch)
    local children=$(gh pr list --base "$BRANCH_DISPLAY" --state all --json number,url,title,state 2>/dev/null || echo "[]")
    local child_indent=$((indent + 1))
    echo "$children" | jq -c '.[]' 2>/dev/null | while read child; do
        echo ",$(echo "$child" | jq --argjson indent "$child_indent" '. + {indent: $indent, isCurrent: false}')"
    done | tr -d '\n' >> /tmp/stack_children.tmp

    if [ -f /tmp/stack_children.tmp ]; then
        stack+=$(cat /tmp/stack_children.tmp)
        rm -f /tmp/stack_children.tmp
    fi

    stack+="]"
    echo "$stack"
}

# Get comments from GraphQL
get_comments() {
    if [ -z "$PR_NUMBER" ]; then
        echo "[]"
        return
    fi

    local repo_info=$(gh repo view --json owner,name 2>/dev/null)
    local owner=$(echo "$repo_info" | jq -r '.owner.login')
    local repo=$(echo "$repo_info" | jq -r '.name')

    gh api graphql -f query='
        query($owner: String!, $repo: String!, $pr: Int!) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $pr) {
                    reviewThreads(first: 50) {
                        nodes {
                            isResolved
                            isOutdated
                            path
                            comments(first: 20) {
                                nodes {
                                    author { login }
                                    body
                                    createdAt
                                    url
                                    diffHunk
                                }
                            }
                        }
                    }
                }
            }
        }
    ' -f owner="$owner" -f repo="$repo" -F pr="$PR_NUMBER" 2>/dev/null | jq '
        [.data.repository.pullRequest.reviewThreads.nodes[] |
        {
            isResolved,
            isOutdated,
            path,
            comments: [.comments.nodes[] | {
                author: .author.login,
                body,
                createdAt,
                url,
                diffHunk
            }]
        }] | sort_by([.isResolved, .comments[0].createdAt]) | reverse
    ' 2>/dev/null || echo "[]"
}

# Get comment counts per file
get_comment_counts() {
    if [ -z "$PR_NUMBER" ]; then
        echo "{}"
        return
    fi

    local repo_info=$(gh repo view --json owner,name 2>/dev/null)
    local owner=$(echo "$repo_info" | jq -r '.owner.login')
    local repo=$(echo "$repo_info" | jq -r '.name')

    gh api graphql -f query='
        query($owner: String!, $repo: String!, $pr: Int!) {
            repository(owner: $owner, name: $repo) {
                pullRequest(number: $pr) {
                    reviewThreads(first: 100) {
                        nodes { path }
                    }
                }
            }
        }
    ' -f owner="$owner" -f repo="$repo" -F pr="$PR_NUMBER" 2>/dev/null | jq '
        [.data.repository.pullRequest.reviewThreads.nodes[].path] |
        group_by(.) | map({(.[0]): length}) | add // {}
    ' 2>/dev/null || echo "{}"
}

# Get file stats
REMOTE_BASE="origin/$BASE_BRANCH"
MERGE_BASE=$(git merge-base HEAD "$REMOTE_BASE" 2>/dev/null || echo "")

if [ -n "$MERGE_BASE" ]; then
    FILE_COUNT=$(git diff --name-only "$MERGE_BASE"..HEAD 2>/dev/null | wc -l | tr -d ' ')
    ADDITIONS=$(git diff --stat "$MERGE_BASE"..HEAD 2>/dev/null | tail -1 | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo "0")
    DELETIONS=$(git diff --stat "$MERGE_BASE"..HEAD 2>/dev/null | tail -1 | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo "0")

    # Get files with stats and diffs
    FILES_JSON="["
    first=true
    while IFS=$'\t' read -r add del path; do
        [ -z "$path" ] && continue
        # Get diff for this file
        diff_content=$(git diff "$MERGE_BASE"..HEAD -- "$path" 2>/dev/null | jq -Rs .)
        [ "$first" = true ] && first=false || FILES_JSON+=","
        FILES_JSON+="{\"add\":\"$add\",\"del\":\"$del\",\"path\":$(echo "$path" | jq -Rs .),\"diff\":$diff_content}"
    done < <(git diff --numstat "$MERGE_BASE"..HEAD 2>/dev/null)
    FILES_JSON+="]"
else
    FILE_COUNT="0"
    ADDITIONS="0"
    DELETIONS="0"
    FILES_JSON="[]"
fi

# Build final JSON
PR_STACK=$(build_pr_stack)
COMMENTS=$(get_comments)
COMMENT_COUNTS=$(get_comment_counts)
UPDATED=$(date '+%Y-%m-%d %H:%M:%S')

JSON_DATA=$(cat << EOF
{
  "project": "$PROJECT_NAME",
  "branch": "$BRANCH_DISPLAY",
  "baseBranch": "$BASE_BRANCH",
  "user": $([ -n "$GH_USER" ] && echo "\"$GH_USER\"" || echo "null"),
  "pr": {
    "number": ${PR_NUMBER:-null},
    "url": $([ -n "$PR_URL" ] && echo "\"$PR_URL\"" || echo "null"),
    "title": $([ -n "$PR_TITLE" ] && echo "$PR_TITLE" | jq -Rs . || echo "null"),
    "status": $([ -n "$PR_STATE" ] && echo "\"$PR_STATE\"" || echo "null"),
    "draft": $PR_DRAFT
  },
  "prStack": $PR_STACK,
  "stats": {
    "fileCount": $FILE_COUNT,
    "additions": ${ADDITIONS:-0},
    "deletions": ${DELETIONS:-0}
  },
  "files": $FILES_JSON,
  "comments": $COMMENTS,
  "commentCounts": $COMMENT_COUNTS,
  "updated": "$UPDATED"
}
EOF
)

# Save JSON file
echo "$JSON_DATA" > "$DATA_FILE"

# Also create HTML with embedded data
HTML_FILE="$SESSION_DIR/${PROJECT_NAME}-${BRANCH_SAFE}.html"
SKILL_DIR="$HOME/.claude/skills/session-dashboard"

# Read the template and inject the data
# Split on the placeholder and write in parts
{
  # Write everything before the placeholder
  sed -n '1,/\/\/ INJECT_DATA_HERE/p' "$SKILL_DIR/dashboard.html" | sed '$d'
  # Write the data assignment
  echo "        window.DASHBOARD_DATA = $JSON_DATA;"
  # Write everything after the placeholder
  sed -n '/\/\/ INJECT_DATA_HERE/,$p' "$SKILL_DIR/dashboard.html" | sed '1d'
} > "$HTML_FILE"

echo "$DATA_FILE"
