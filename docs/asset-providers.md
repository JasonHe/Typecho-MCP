# Asset Providers

Blog content should not assume every image or file lives on the Typecho server.

The project treats media as an asset provider problem. Typecho local upload is the default provider, but AI agents and the human editor should also be able to insert links from external image hosts, file beds, object storage, or private CDN workflows.

## Goals

- Save blog server bandwidth and disk.
- Let images and downloadable files live on specialized storage.
- Keep article Markdown portable.
- Let MCP agents choose a storage provider explicitly.
- Avoid forcing Typecho to proxy every asset.

## Provider Interface

All providers should return the same shape:

```json
{
  "provider": "external-url",
  "media": {
    "filename": "image.png",
    "url": "https://cdn.example.com/image.png",
    "relativePath": null,
    "size": null,
    "mime": "image/png",
    "external": true,
    "kind": "image"
  },
  "markdown": "![image.png](https://cdn.example.com/image.png)"
}
```

## Providers

### `typecho-local`

Uploads into:

```text
<typecho-root>/usr/uploads/YYYYMM/
```

The agent also registers an attachment row in Typecho's contents table.

Use for:

- small images
- compatibility
- first-run testing

Avoid for:

- large videos
- big downloads
- high-traffic image hosting

### `external-url`

Registers an already-hosted URL without uploading anything.

Use for:

- existing CDN links
- image hosts
- file beds
- manually uploaded OpenList/AList files
- R2/S3 objects uploaded outside this app

Current MCP tool:

```text
typecho.media.register_external_url
```

### `s3-compatible`

Planned.

Use for:

- MinIO
- AWS S3
- Tencent COS S3-compatible mode
- other object stores with S3 APIs

Needed config:

```json
{
  "endpoint": "https://s3.example.com",
  "bucket": "blog-assets",
  "region": "auto",
  "accessKeyIdRef": "keychain:s3-access-key",
  "secretAccessKeyRef": "keychain:s3-secret",
  "publicBaseUrl": "https://cdn.example.com"
}
```

### `cloudflare-r2`

Planned as a specialized S3-compatible profile.

Use for:

- low-cost image/file hosting
- CDN-backed blog assets

### `webdav`

Planned.

Use for:

- NAS storage
- self-hosted file servers
- simple provider compatibility

### `openlist`

Planned.

Use for:

- OpenList/AList-backed file beds
- large downloadable files
- user-managed storage mounts

Needed config:

```json
{
  "baseUrl": "https://files.example.com",
  "uploadPath": "/blog-assets",
  "tokenRef": "keychain:openlist-token",
  "publicBaseUrl": "https://files.example.com/d/blog-assets"
}
```

## MCP Tool Design

Current:

```text
typecho.media.upload
typecho.media.list
typecho.media.register_external_url
```

Planned:

```text
typecho.assets.providers.list
typecho.assets.upload
typecho.assets.register_url
typecho.assets.prepare_markdown
```

The future `typecho.assets.upload` should accept:

```json
{
  "provider": "cloudflare-r2",
  "filePath": "/local/path/image.png",
  "kind": "image",
  "alt": "Diagram",
  "targetPath": "2026/05/diagram.png"
}
```

## UI Requirements

The human workbench should support:

- uploading to Typecho local storage
- inserting external image URLs
- inserting external file links
- showing whether an asset is local or external
- letting users choose a default provider per site

## Security Notes

- Provider credentials must stay local.
- Never store object storage secrets on the Typecho server.
- External URLs should be inserted as links, not fetched through the blog server by default.
- AI agents should not be allowed to upload huge files without a size policy.

