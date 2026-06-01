export const assetProviderTypes = Object.freeze({
  typechoLocal: "typecho-local",
  externalUrl: "external-url",
  s3Compatible: "s3-compatible",
  cloudflareR2: "cloudflare-r2",
  webdav: "webdav",
  openlist: "openlist",
  customHttp: "custom-http"
});

export function normalizeExternalAsset({ url, title, alt, kind = "image" }) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("external-url assets require an http or https URL.");
  }

  const filename = title || filenameFromUrl(url);
  const markdown =
    kind === "file"
      ? `[${alt || filename}](${url})`
      : `![${alt || filename}](${url})`;

  return {
    provider: assetProviderTypes.externalUrl,
    media: {
      filename,
      title: title || filename,
      url,
      relativePath: null,
      size: null,
      mime: null,
      external: true,
      kind
    },
    markdown
  };
}

export function filenameFromUrl(url) {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).pop();
    return decodeURIComponent(last || parsed.hostname);
  } catch {
    return "external-asset";
  }
}

