# Project instructions

## Local workspace

On the owner's Windows machine, use `H:\DSHworkspace` for project work.
The main checkout is `H:\DSHworkspace\Codex\MLAFMT`.

- Put auxiliary Git worktrees, downloads, build output, test temporary files
  and dependency caches under that drive. Do not create new project worktrees
  or build caches in `C:\Users\Ooze`.
- If an app's managed-worktree tool defaults to C, create an ordinary Git
  worktree under H instead. Do not change system-wide folders or move installed
  tools to satisfy this rule; existing installed-tool paths can be read.
- Set temporary/cache paths explicitly when running tools which would otherwise
  place large project artifacts on C. Verify the resolved target before any
  recursive cleanup, and preserve other worktrees' uncommitted changes.
- On other machines without that drive, use the current project workspace.

## Website and privacy

- The public website is a static, anonymous application. Keep document
  processing in the user's browser; do not automatically upload drafts.
- Do not add visitor accounts, a database or a server conversion service
  without an explicit new request.
- Template export contains layout settings, not draft bytes, paper details,
  paragraph-preservation choices or generated document state. Proposed sharing
  features must retain that separation.
