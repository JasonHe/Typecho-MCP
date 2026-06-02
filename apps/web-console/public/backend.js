export const workbenchBackend = createWorkbenchBackend();

const DESKTOP_LOCAL_SERVICE_URL = "http://127.0.0.1:4783";

export function createWorkbenchBackend() {
  const invoke = detectTauriInvoke();
  if (invoke) {
    return createTauriBackend({
      fallback: createHttpBackend({ baseUrl: DESKTOP_LOCAL_SERVICE_URL }),
      invoke
    });
  }
  return createHttpBackend();
}

export function createHttpBackend({ baseUrl = "" } = {}) {
  const request = async (path, options = {}) => {
    const url = baseUrl ? new URL(path, baseUrl).toString() : path;
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "content-type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    const operationId = response.headers.get("x-typecho-operation-id");
    return {
      ok: response.ok,
      statusText: response.statusText,
      operationId,
      data
    };
  };

  return {
    kind: "http",
    request,
    site: {
      health: ({ host, refresh = false }) => request(`/api/health?${query({ host, refresh })}`),
      info: ({ host, refresh = false }) => request(`/api/site?${query({ host, refresh })}`)
    },
    diagnostics: {
      run: ({ host }) => request(`/api/diagnostics?${query({ host })}`)
    },
    debug: {
      bundle: ({ host }) => request(`/api/debug-bundle?${query({ host })}`)
    },
    cache: {
      status: ({ host }) => request(`/api/cache?${query({ host })}`),
      clear: ({ host, namespaces }) => request("/api/cache/clear", {
        method: "POST",
        body: { host, namespaces }
      })
    },
    policy: {
      list: () => request("/api/policy")
    },
    requests: {
      list: ({ limit = 50 } = {}) => request(`/api/requests?${query({ limit })}`)
    },
    posts: {
      list: ({ host, limit = 20, includeHidden = false, search, status, refresh = false }) =>
        request(`/api/posts?${query({ host, limit, includeHidden, search, status, refresh })}`),
      get: ({ host, cid, refresh = false }) => request(`/api/posts/${encodeURIComponent(cid)}?${query({ host, refresh })}`),
      createDraft: ({ host, title, markdown, categories = [], tags = [] }) => request("/api/posts/draft", {
        method: "POST",
        body: { host, title, markdown, categories, tags }
      }),
      update: ({ cid, patch }) => request(`/api/posts/${encodeURIComponent(cid)}`, {
        method: "PATCH",
        body: patch
      }),
      previewUpdate: ({ host, cid, patch }) => request(`/api/posts/${encodeURIComponent(cid)}/diff?${query({ host })}`, {
        method: "POST",
        body: patch
      }),
      preparePublish: ({ host, cid, checkLinks = true }) =>
        request(`/api/posts/${encodeURIComponent(cid)}/publish-prepare?${query({ host, checkLinks: checkLinks ? undefined : "0" })}`),
      publish: ({ host, cid, confirm = false, client = "web-console" }) =>
        request(`/api/posts/${encodeURIComponent(cid)}/publish`, {
          method: "POST",
          body: { host, confirm, client }
        })
    },
    snapshots: {
      list: () => request("/api/snapshots"),
      preview: ({ host, snapshotId, restoreDiff = false }) =>
        request(`/api/snapshots/${encodeURIComponent(snapshotId)}?${query({ host, restoreDiff })}`)
    },
    rollback: {
      confirm: ({ host, snapshotId, confirm = false, client = "web-console" }) => request("/api/rollback", {
        method: "POST",
        body: { host, snapshotId, confirm, client }
      })
    },
    media: {
      list: ({ host, limit = 20, refresh = false }) => request(`/api/media?${query({ host, limit, refresh })}`),
      upload: ({ host, filePath, filename }) => request("/api/media/upload", {
        method: "POST",
        body: { host, filePath, filename }
      }),
      registerExternalUrl: ({ url, kind }) => request("/api/media/register-url", {
        method: "POST",
        body: { url, kind }
      })
    },
    audit: {
      list: ({ limit = 50 } = {}) => request(`/api/audit?${query({ limit })}`)
    }
  };
}

export function createTauriBackend({ fallback = createHttpBackend(), invoke = detectTauriInvoke() } = {}) {
  if (!invoke) {
    return fallback;
  }

  const call = (command, args = {}) => invoke(command, args);
  return {
    ...fallback,
    kind: "tauri",
    desktop: {
      appInfo: () => call("desktop_get_app_info"),
      getWindowState: () => call("desktop_get_window_state"),
      saveWindowState: (state) => call("desktop_save_window_state", { windowState: state }),
      getLayoutPrefs: () => call("desktop_get_layout_prefs"),
      saveLayoutPrefs: (prefs) => call("desktop_save_layout_prefs", { prefs }),
      emitCommand: (commandId) => call("desktop_emit_command", { commandId }),
      getServiceStatus: () => call("desktop_get_service_status"),
      getStartupProfile: () => call("desktop_get_startup_profile"),
      saveStartupProfile: (request) => call("desktop_save_startup_profile", { request }),
      importEditorText: (request) => call("desktop_import_editor_text", { request }),
      saveEditorText: (request) => call("desktop_save_editor_text", { request }),
      saveExportFile: (request) => call("desktop_save_export_file", { request })
    }
  };
}

function detectTauriInvoke() {
  return globalThis.__TAURI__?.core?.invoke
    || globalThis.__TAURI__?.invoke
    || globalThis.__TAURI_INTERNALS__?.invoke
    || null;
}

function query(values) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined || value === null || value === "" || value === false) {
      continue;
    }
    params.set(key, value === true ? "1" : String(value));
  }
  return params.toString();
}
