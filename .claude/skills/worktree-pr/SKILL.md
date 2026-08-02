---
name: worktree-pr
description: Use this skill at the start of any task that will produce code changes — before editing files, set up a dedicated worktree and branch, and use it to open a PR via the Gitea `tea` CLI when the work is done. Trigger on any request to implement, fix, or change code in a git repo, not just when the user mentions worktrees or PRs directly.
---

# Worktree + branch + PR workflow

Never make changes directly in the main worktree's checked-out branch. Every task gets its own
worktree and branch, and finishes as a PR opened via `tea`.

## Setup (before touching any files)

1. Determine the repo name and a short branch name from the task description, e.g.
   `feature/type-export-fix`. Prefer `feature/`, `fix/`, or `chore/` as the prefix based on the
   nature of the task.
2. Create the worktree as a sibling directory outside the main repo:
   ```bash
   git worktree add ~/repo-worktrees/<branch-name> -b <branch-name>
   ```
   (Substitute the actual branch name for the directory name — keep them identical for easy lookup.)
   This avoids the main repo, so there's nothing to gitignore and no risk of tooling getting
   confused by a nested worktree.
3. `cd` into that worktree directory and do all work there — edits, tests, commits — never in the
   original repo checkout.

## During the task

- Commit normally within the worktree as work progresses.
- Run verification (see the `run` skill) from within the worktree.

## Opening the PR

1. Push the branch:
   ```bash
   git push -u origin <branch-name>
   ```
2. Open the PR against the default branch using `tea`:
   ```bash
   tea pr create --title "<short title>" --description "<brief summary>"
   ```
   Keep the description minimal — a short summary of what changed and why is enough, no required
   template.
3. Report the PR URL/number back once created.

## Cleanup

- Don't remove the worktree automatically after opening the PR — leave it in place in case of review
  feedback or follow-up commits, unless asked to clean up.
