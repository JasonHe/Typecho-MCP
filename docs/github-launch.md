# GitHub Launch Plan

The project can become popular if it solves a real pain clearly: Typecho users want a lightweight blog, while AI users need a reliable way to publish through agents. The hook is strong: local-first, SSH-based, MCP-native Typecho publishing.

## Positioning

Short description:

```text
Local-first MCP publishing workbench for Typecho blogs.
```

Longer description:

```text
Connect to your Typecho blog over SSH, expose it as a local MCP server, and let AI agents draft, revise, upload media, and publish with audit logs and rollback.
```

Avoid vague descriptions like:

```text
AI blog client
Markdown editor
Typecho manager
```

Those undersell the project.

## Audience

Primary audience:

- Typecho bloggers
- independent developers with SSH access to their servers
- people building AI-agent publishing workflows
- MCP tool users
- Chinese open-source community

Secondary audience:

- static blog users curious about dynamic publishing
- WordPress users who want lighter infrastructure
- developers studying MCP tool design

## GitHub Front Page Checklist

The repository front page should quickly show:

- what problem it solves
- how it works
- why SSH is used
- why MCP is central
- screenshots or terminal demo
- safety model
- current status
- roadmap

Recommended assets:

```text
docs/assets/hero-screenshot.png
docs/assets/mcp-demo.gif
docs/assets/ssh-onboarding.png
docs/assets/publish-review.png
```

The first image should show the actual product once UI exists. Before UI exists, use a clean architecture diagram.

## README Shape

Suggested README order:

```text
1. one-line value proposition
2. architecture diagram
3. why this exists
4. feature list
5. quick start
6. MCP usage
7. security model
8. roadmap
9. contribution
```

Do not start with a long installation section before the value is clear.

## Demo Strategy

The first viral demo should show an AI agent publishing to Typecho.

Demo script:

```text
1. User connects SSH.
2. App detects Typecho.
3. MCP server starts.
4. AI asks: "Draft an article about local-first blogging."
5. Tool call creates a Typecho draft.
6. User reviews diff in desktop app.
7. User approves publish.
8. Final Typecho URL opens.
```

This tells the whole story in under two minutes.

## First Issues

Create beginner-friendly issues:

```text
docs: add Typecho deployment examples
core: define Post domain model
ssh: implement PHP CLI health check
agent: implement system.health
mcp: expose read-only posts.list tool
ui: create connection status panel
tests: add remote response fixture tests
```

Create advanced issues:

```text
agent: load Typecho bootstrap safely
sync: snapshot before remote writes
mcp: implement publish policy middleware
security: redact secrets in operation logs
desktop: implement publish review diff
```

## Labels

Recommended labels:

```text
area:mcp
area:ssh
area:remote-agent
area:desktop
area:editor
area:security
area:docs
good first issue
help wanted
needs:typecho-testing
```

## Community Tone

The project should feel serious but welcoming.

Good tone:

- practical
- transparent about limitations
- security-aware
- friendly to Typecho users
- friendly to AI-agent builders

Avoid:

- claiming the project is production-ready too early
- promising support for every hosting provider
- treating AI publishing as risk-free

## Public Launch Milestone

Do not launch hard until this exists:

- README with clear value
- architecture diagram
- working read-only SSH demo
- working read-only MCP tool
- short screen recording or terminal GIF
- security notes
- roadmap

Soft launch earlier is fine in Chinese Typecho communities to collect deployment examples.

## Differentiators

The strongest differentiators:

- no Typecho admin plugin installation required
- no public remote API
- local MCP server as first-class interface
- SSH zero-touch deployment
- AI publish workflow with audit and rollback
- lightweight Markdown review UI

## Suggested Tagline Options

```text
Turn your Typecho blog into a local MCP publishing target.
```

```text
AI-agent publishing for Typecho, over SSH, with local control.
```

```text
A local-first Typecho workbench for humans and AI agents.
```

Best default:

```text
AI-agent publishing for Typecho, over SSH, with local control.
```
