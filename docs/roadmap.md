# Roadmap

The project should grow in public, but the first releases must be reliable. A GitHub-friendly roadmap needs visible progress, small milestones, and real demos.

## Phase 0: Foundation

Goal: make the repository credible.

Deliverables:

- README
- architecture docs
- project structure
- contribution guide
- issue templates
- basic monorepo setup
- package READMEs

Exit criteria:

- a new contributor understands what the project is
- the first implementation tasks are obvious
- security and MCP positioning are documented

## Phase 1: SSH Read-Only Prototype

Goal: connect to a remote Typecho site and read data safely.

Deliverables:

- SSH connector
- remote Typecho root detection
- PHP CLI and Docker execution detection
- remote agent upload
- `system.health`
- `site.info`
- `posts.list`
- `posts.get`
- local operation logs

Exit criteria:

- user can connect to a real Typecho server over SSH
- local CLI can list recent posts
- no write operations exist yet

Current status:

- SSH detection works against `your-ssh-alias`
- Docker Typecho target detection works against `typecho-container`
- remote PHP agent health check works
- read-only post listing works against SQLite Typecho
- draft creation, update, publish, and local rollback snapshots work against SQLite Typecho
- media upload writes files into Typecho's upload directory and returns Markdown references
- external URL assets can be inserted without consuming blog server storage
- localhost web console works as the first human Markdown workbench

## Phase 2: Local MCP Alpha

Goal: expose read-only blog context to AI agents.

Deliverables:

- MCP stdio server
- local Streamable HTTP server on `127.0.0.1`
- read-only MCP tools
- MCP resources for recent posts and taxonomy
- structured errors
- basic client config examples

Exit criteria:

- an AI agent can inspect recent Typecho posts through MCP
- no write operation is possible yet

## Phase 3: Draft Write Workflow

Goal: let AI create and update drafts safely.

Deliverables:

- `posts.create`
- `posts.update`
- `media.upload`
- `taxonomy.ensure_tags`
- local snapshots before updates
- local SQLite cache
- operation log viewer

Exit criteria:

- AI can create a Typecho draft
- AI can update a draft
- user can inspect every operation
- published posts are not modified by default

## Phase 4: Minimal Desktop Workbench

Goal: provide a human review and editing surface.

Deliverables:

- site connection UI
- draft inbox
- Markdown editor
- preview
- metadata panel
- media insertion
- operation log panel

Exit criteria:

- user can review and edit AI-generated drafts
- user can push edits back to Typecho

## Phase 5: Publish Gate

Goal: support safe publishing.

Deliverables:

- `posts.preview`
- `posts.publish`
- publish review UI
- `manual_approval` policy
- rollback snapshots
- publish audit log

Exit criteria:

- AI can request publish
- human can approve or reject
- published URL is returned to MCP
- rollback path exists

## Phase 6: Trusted Agent Mode

Goal: support real AI-run publishing workflows.

Deliverables:

- MCP client identity tracking
- trusted agent allowlist
- per-tool permission policy
- publish limits
- automatic readiness checks
- `trusted_agent` publish mode

Exit criteria:

- selected agents can publish directly
- all actions remain auditable

## Phase 7: Autopublish and Content QA

Goal: support autonomous article publishing.

Deliverables:

- `autopublish` mode
- content readiness checks
- broken link scan
- title and slug checks
- excerpt generation
- image presence checks
- schedule support

Exit criteria:

- user can define a policy for automatic publishing
- agent can publish without direct confirmation within that policy

## Phase 8: Ecosystem Polish

Goal: make the project pleasant to adopt and contribute to.

Deliverables:

- signed releases
- installers
- demo video
- screenshots
- example blog fixture
- integration tests
- plugin fallback research
- community templates

Exit criteria:

- a new user can try the project in under 10 minutes
- a contributor can run tests locally
- GitHub visitors can see the value immediately

## Release Names

Suggested release path:

```text
v0.1.0  SSH read-only prototype
v0.2.0  MCP read-only alpha
v0.3.0  draft write workflow
v0.4.0  desktop workbench alpha
v0.5.0  publish approval workflow
v0.6.0  trusted agent mode
v0.7.0  autopublish beta
v1.0.0  stable local-first Typecho MCP workbench
```
