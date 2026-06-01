# Markdown Editor

The human interface should be a focused Markdown workbench. It should make humans good editors and reviewers while letting AI agents do the repetitive publishing work.

## Product Role

The editor is not the primary automation engine. It is the place where the user can:

- review AI-generated drafts
- make quick edits
- inspect metadata
- upload and position media
- compare diffs before publish
- approve or reject high-impact actions
- recover from mistakes

## Inspiration

Borrow principles from lightweight Markdown clients:

- fast startup
- clean editor surface
- predictable keyboard behavior
- outline navigation
- source and preview modes
- image drag and drop
- local file safety

Do not copy any specific product UI. The goal is a Typecho-focused publishing workbench, not a generic note app.

## Core Views

### Connection View

Purpose:

- add a Typecho site through SSH
- test connection
- detect Typecho root
- deploy remote agent
- show health state

Key elements:

- host, port, user
- auth method
- detected Typecho root
- PHP version
- Typecho version
- remote agent version

### Draft Inbox

Purpose:

- show drafts created by humans and AI agents
- make agent work visible

Columns:

- title
- status
- last modified
- source: human, MCP, sync
- tags
- publish readiness

### Editor

Purpose:

- edit Markdown content and metadata

Expected panels:

- left: post list or outline
- center: Markdown editor
- right: metadata and publish readiness
- bottom or side: operation log for this post

### Publish Review

Purpose:

- provide a final gate before content goes live

Show:

- title
- slug
- categories
- tags
- excerpt
- publish time
- permalink preview
- diff from last remote snapshot
- warnings
- rollback snapshot id

## Editing Features

MVP:

- Markdown source editing
- live preview
- heading outline
- word count
- image drag and drop
- paste image upload
- insert media as Markdown
- front matter style metadata panel
- save local draft
- push draft to Typecho
- preview remote post

Later:

- side-by-side diff
- local revision timeline
- style lint
- broken link check
- image compression
- front matter import/export
- custom publish checklist

## Metadata

The metadata panel should support:

- title
- slug
- status
- categories
- tags
- excerpt
- cover image
- created time
- publish time
- author
- allow comments
- custom fields later

## AI Task Visibility

Since MCP is the primary workflow, the UI should make agent actions inspectable.

For each operation, show:

- calling client
- tool name
- affected post
- time
- input summary
- result
- snapshot id
- rollback availability

Example:

```text
10:42  Codex called typecho.posts.update on #123
      Updated title, markdown, tags
      Snapshot: snap_01HX...
      Status: success
```

## Approval UX

Publish approval should be crisp.

The user should see:

- what will change
- what URL will go live
- whether rollback exists
- which agent requested it
- publish now or schedule time

Actions:

```text
Approve
Reject
Edit First
Trust This Agent
```

`Trust This Agent` should be a deliberate setting change, not a casual inline click.

## Editor Architecture

Recommended internal modules:

```text
editor-core
  document model
  markdown parser
  metadata model
  outline extraction
  diff helpers

editor-react
  editor shell
  toolbar
  preview
  metadata panel
  media picker
```

Candidate editor engines:

- CodeMirror 6 for a programmable Markdown editing surface
- Monaco only if code-editor features become important
- Milkdown or TipTap only if rich WYSIWYG becomes a goal

For MVP, CodeMirror 6 is the best fit because it is lightweight, extensible, and comfortable for Markdown source editing.

## Keyboard Behavior

Expected shortcuts:

```text
Cmd/Ctrl+S       save local draft
Cmd/Ctrl+Enter   request publish or update draft
Cmd/Ctrl+P       preview
Cmd/Ctrl+K       quick switcher
Cmd/Ctrl+B       bold
Cmd/Ctrl+I       italic
```

Shortcuts should be documented in a command palette, not as cluttered visible help text in the main editor.

## Mobile Position

Mobile should not be first.

Recommended order:

```text
1. desktop app
2. local MCP server
3. localhost web console
4. mobile review app
```

The mobile app can later focus on review, approval, and quick edits instead of full writing.
