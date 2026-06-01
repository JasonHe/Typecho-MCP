# Asset Providers

Media in this project is provider-based. Typecho local upload is only one backend.

Supported in the prototype:

- `typecho-local`: upload into the Typecho server and register an attachment.
- `external-url`: register an already-hosted image or file URL and return Markdown.

Planned providers:

- S3-compatible storage
- Cloudflare R2
- WebDAV
- OpenList/AList
- custom HTTP upload endpoint

