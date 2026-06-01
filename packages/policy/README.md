# Policy

Local publish policy for MCP and human operations.

The default mode is conservative:

```text
TYPECHO_MCP_PUBLISH_POLICY=manual_approval
```

Prototype modes:

- `manual_approval`: blocks publish unless `confirm: true` is passed.
- `trusted_agent`: allows publish from trusted clients or explicit `confirm: true`.
- `autopublish`: allows publish after local snapshot creation.

## Operation Policy

The package also defines a shared operation policy table for current and future write operations.

The goal is to avoid scattering confirmation logic across publish, rollback, comments, and plugin tools.

Current confirmation modes:

- `none`: read or low-risk preparation operation.
- `snapshot`: allowed only after a local snapshot exists.
- `manual`: requires explicit human/client confirmation.

Examples:

- `posts.preparePublish`: low risk, no confirmation.
- `posts.update`: high risk, requires snapshot.
- `posts.publish`: critical risk, follows publish policy and explicit confirmation.
- `posts.rollback`: critical risk, requires explicit confirmation.
- `comments.delete`: high risk, requires explicit confirmation.
- `plugins.enable`: critical risk, requires explicit confirmation.
