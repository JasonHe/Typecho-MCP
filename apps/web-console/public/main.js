import { workbenchBackend } from "./backend.js";

const state = {
  host: "typecho-host",
  posts: [],
  selected: null,
  preparedCid: null,
  dirty: false,
  pendingConfirm: null,
  previewedSnapshot: null,
  viewMode: "write",
  sidebarCollapsed: false,
  inspectorCollapsed: true,
  status: {
    siteTitle: null,
    lastOperationId: null,
    lastError: null,
    busyCount: 0,
    busyLabel: null,
    policyLabel: "unknown"
  }
};

const $ = (id) => document.getElementById(id);

const elements = {
  host: $("host"),
  site: $("site"),
  refresh: $("refresh"),
  newDraft: $("newDraft"),
  runDiagnostics: $("runDiagnostics"),
  exportDebug: $("exportDebug"),
  diagnostics: $("diagnostics"),
  loadCache: $("loadCache"),
  clearCache: $("clearCache"),
  cache: $("cache"),
  loadPolicy: $("loadPolicy"),
  policy: $("policy"),
  externalUrl: $("externalUrl"),
  insertImageUrl: $("insertImageUrl"),
  insertFileUrl: $("insertFileUrl"),
  posts: $("posts"),
  search: $("search"),
  status: $("status"),
  title: $("title"),
  slug: $("slug"),
  postStatus: $("postStatus"),
  categories: $("categories"),
  tags: $("tags"),
  markdown: $("markdown"),
  preview: $("preview"),
  previewDiff: $("previewDiff"),
  save: $("save"),
  prepare: $("prepare"),
  publish: $("publish"),
  publishReport: $("publishReport"),
  snapshots: $("snapshots"),
  media: $("media"),
  audit: $("audit"),
  requests: $("requests"),
  log: $("log"),
  workspace: document.querySelector(".workspace"),
  editorPanel: document.querySelector(".editor-panel"),
  inspector: $("inspector"),
  viewButtons: Array.from(document.querySelectorAll("[data-view-mode]")),
  toggleSidebar: $("toggleSidebar"),
  toggleInspector: $("toggleInspector"),
  statusHost: $("statusHost"),
  statusSite: $("statusSite"),
  statusPost: $("statusPost"),
  statusDirty: $("statusDirty"),
  statusPrepare: $("statusPrepare"),
  statusPolicy: $("statusPolicy"),
  statusBusy: $("statusBusy"),
  statusLastOperation: $("statusLastOperation"),
  statusError: $("statusError"),
  activityButtons: Array.from(document.querySelectorAll(".activity-button")),
  operationTabs: Array.from(document.querySelectorAll(".ops-tab")),
  operationSections: Array.from(document.querySelectorAll(".ops-section")),
  confirmOverlay: $("confirmOverlay"),
  confirmSheet: document.querySelector(".confirm-sheet"),
  confirmEyebrow: $("confirmEyebrow"),
  confirmTitle: $("confirmTitle"),
  confirmBody: $("confirmBody"),
  confirmCancel: $("confirmCancel"),
  confirmClose: $("confirmClose"),
  confirmRun: $("confirmRun")
};

elements.host.addEventListener("change", () => {
  state.host = elements.host.value.trim() || "typecho-host";
  refreshAll();
});
elements.refresh.addEventListener("click", () => refreshAll(true));
elements.runDiagnostics.addEventListener("click", () => withBusy(elements.runDiagnostics, runDiagnostics));
elements.exportDebug.addEventListener("click", () => withBusy(elements.exportDebug, exportDebugBundle));
elements.loadCache.addEventListener("click", () => withBusy(elements.loadCache, loadCacheStatus));
elements.clearCache.addEventListener("click", () => withBusy(elements.clearCache, clearCache));
elements.loadPolicy.addEventListener("click", () => withBusy(elements.loadPolicy, loadPolicyStatus));
elements.search.addEventListener("input", debounce(() => runPanel("posts", loadPosts, elements.posts), 300));
elements.status.addEventListener("change", () => runPanel("posts", loadPosts, elements.posts));
for (const input of [elements.title, elements.slug, elements.postStatus, elements.categories, elements.tags]) {
  input.addEventListener("input", markDirty);
  input.addEventListener("change", markDirty);
}
elements.markdown.addEventListener("input", () => {
  markDirty();
  renderPreview();
});
elements.previewDiff.addEventListener("click", () => withBusy(elements.previewDiff, previewDiff));
elements.save.addEventListener("click", () => withBusy(elements.save, savePost));
elements.prepare.addEventListener("click", () => withBusy(elements.prepare, preparePublish));
elements.publish.addEventListener("click", () => withBusy(elements.publish, publishPost));
elements.newDraft.addEventListener("click", () => withBusy(elements.newDraft, createDraft));
elements.insertImageUrl.addEventListener("click", () => withBusy(elements.insertImageUrl, () => insertExternalAsset("image")));
elements.insertFileUrl.addEventListener("click", () => withBusy(elements.insertFileUrl, () => insertExternalAsset("file")));
elements.statusLastOperation.addEventListener("click", () => copyLastOperationId());
for (const button of elements.viewButtons) {
  button.addEventListener("click", () => setViewMode(button.dataset.viewMode));
}
elements.toggleSidebar.addEventListener("click", toggleSidebar);
elements.toggleInspector.addEventListener("click", toggleInspector);
for (const button of elements.activityButtons) {
  button.addEventListener("click", () => switchActivity(button.dataset.activity));
}
for (const tab of elements.operationTabs) {
  tab.addEventListener("click", () => switchOperationsTab(tab.dataset.opsTab));
}
elements.confirmCancel.addEventListener("click", closeConfirmSheet);
elements.confirmClose.addEventListener("click", closeConfirmSheet);
elements.confirmRun.addEventListener("click", runPendingConfirm);
elements.confirmOverlay.addEventListener("click", (event) => {
  if (event.target === elements.confirmOverlay) {
    closeConfirmSheet();
  }
});

refreshAll();
renderStatusBar();
applyEditorLayout();

function switchOperationsTab(name) {
  for (const tab of elements.operationTabs) {
    tab.classList.toggle("active", tab.dataset.opsTab === name);
  }
  for (const section of elements.operationSections) {
    section.classList.toggle("active", section.dataset.opsSection === name);
  }
}

function setViewMode(mode) {
  state.viewMode = ["write", "split", "preview"].includes(mode) ? mode : "write";
  applyEditorLayout();
}

function toggleInspector() {
  state.inspectorCollapsed = !state.inspectorCollapsed;
  applyEditorLayout();
}

function toggleSidebar() {
  state.sidebarCollapsed = !state.sidebarCollapsed;
  applyEditorLayout();
}

function applyEditorLayout() {
  if (!elements.editorPanel) {
    return;
  }

  elements.workspace?.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  elements.editorPanel.classList.toggle("view-write", state.viewMode === "write");
  elements.editorPanel.classList.toggle("view-split", state.viewMode === "split");
  elements.editorPanel.classList.toggle("view-preview", state.viewMode === "preview");
  elements.editorPanel.classList.toggle("inspector-collapsed", state.inspectorCollapsed);

  for (const button of elements.viewButtons) {
    const active = button.dataset.viewMode === state.viewMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  elements.toggleSidebar.classList.toggle("active", state.sidebarCollapsed);
  elements.toggleSidebar.setAttribute("aria-pressed", String(state.sidebarCollapsed));
  elements.toggleSidebar.textContent = state.sidebarCollapsed ? "Show posts" : "Focus";

  elements.toggleInspector.classList.toggle("active", !state.inspectorCollapsed);
  elements.toggleInspector.setAttribute("aria-pressed", String(!state.inspectorCollapsed));
  elements.toggleInspector.textContent = state.inspectorCollapsed ? "Show inspector" : "Hide inspector";
}

function switchActivity(name) {
  for (const button of elements.activityButtons) {
    button.classList.toggle("active", button.dataset.activity === name);
  }

  const target = activityTarget(name);
  target?.scrollIntoView({ block: "nearest", inline: "nearest" });

  if (name === "operations") {
    switchOperationsTab("requests");
  }
  if (name === "review") {
    elements.publishReport.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function activityTarget(name) {
  if (name === "content") {
    return elements.posts;
  }
  if (name === "review") {
    return elements.publishReport || elements.log;
  }
  if (name === "assets") {
    return elements.media;
  }
  if (name === "operations") {
    return document.querySelector(".operations-panel");
  }
  if (name === "site") {
    return elements.site;
  }
  return null;
}

async function refreshAll(forceRefresh = false) {
  state.host = elements.host.value.trim() || "typecho-host";
  renderStatusBar();
  log(`${forceRefresh ? "Refreshing from remote" : "Loading"} ${state.host}...`);
  const results = await Promise.all([
    runPanel("site", () => loadHealth({ forceRefresh }), elements.site),
    runPanel("posts", () => loadPosts({ forceRefresh }), elements.posts),
    runPanel("snapshots", loadSnapshots, elements.snapshots),
    runPanel("media", () => loadMedia({ forceRefresh }), elements.media),
    runPanel("cache", loadCacheStatus, elements.cache),
    runPanel("policy", loadPolicyStatus, elements.policy),
    runPanel("audit", loadAudit, elements.audit),
    runPanel("requests", loadRequests, elements.requests)
  ]);
  const failed = results.filter((result) => !result.ok);
  log(failed.length === 0 ? "Refresh complete." : `Refresh completed with ${failed.length} failed panel(s).`);
}

async function loadHealth({ forceRefresh = false } = {}) {
  const query = new URLSearchParams({ host: state.host });
  if (forceRefresh) {
    query.set("refresh", "1");
  }

  const data = await api(`/api/health?${query.toString()}`);
  const compatibility = data.site?.database?.compatibility;
  const compatibilityLabel = compatibility
    ? `${compatibility.status}${compatibility.writeSupported ? "" : " · read-only/blocked"}`
    : "unknown";
  elements.site.innerHTML = `
    <strong>${escapeHtml(data.site?.title || "Typecho")}</strong>
    <div>${escapeHtml(data.site?.siteUrl || "")}</div>
    <div>PHP ${escapeHtml(data.php?.version || "?")} · ${escapeHtml(data.site?.database?.kind || "?")} · ${escapeHtml(compatibilityLabel)}</div>
  `;
  state.status.siteTitle = data.site?.title || "Typecho";
  renderStatusBar();
}

async function runDiagnostics() {
  elements.diagnostics.innerHTML = `<div class="muted">Running checks...</div>`;
  const data = await api(`/api/diagnostics?host=${encodeURIComponent(state.host)}`);
  elements.diagnostics.innerHTML = renderDiagnostics(data);
  log(`${data.ok ? "Diagnostics passed" : "Diagnostics found issues"}\nOperation: ${data.operationId}`);
}

async function loadCacheStatus() {
  const data = await api(`/api/cache?host=${encodeURIComponent(state.host)}`);
  elements.cache.innerHTML = renderCacheStatus(data);
  log(`Cache status loaded · ${data.totalEntries} entries`);
}

async function loadPolicyStatus() {
  const data = await api("/api/policy");
  elements.policy.innerHTML = renderPolicyStatus(data);
  state.status.policyLabel = data.publishPolicy || "unknown";
  renderStatusBar();
  log(`Policy status loaded · ${data.operations.length} operations`);
}

async function clearCache() {
  const confirmed = window.confirm(`Clear local read cache for ${state.host}?`);
  if (!confirmed) {
    log("Cache clear cancelled.");
    return;
  }

  const data = await api("/api/cache/clear", {
    method: "POST",
    body: { host: state.host }
  });
  elements.cache.innerHTML = `<div class="diag-summary diag-ok">Cleared ${escapeHtml(data.host)} · ${escapeHtml(data.clearedAt)}</div>`;
  log(`Cache cleared for ${data.host}`);
}

async function exportDebugBundle() {
  const data = await api(`/api/debug-bundle?host=${encodeURIComponent(state.host)}`);
  const filename = `typecho-debug-${data.host}-${data.generatedAt.replace(/[:.]/g, "-")}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  log(`Debug bundle exported\n${filename}\nOperation: ${data.operationId}`);
}

async function loadPosts({ forceRefresh = false } = {}) {
  const query = new URLSearchParams({
    host: state.host,
    limit: "30",
    includeHidden: "1"
  });
  if (forceRefresh) {
    query.set("refresh", "1");
  }
  if (elements.search.value.trim()) {
    query.set("search", elements.search.value.trim());
  }
  if (elements.status.value) {
    query.set("status", elements.status.value);
  }

  const data = await api(`/api/posts?${query.toString()}`);
  state.posts = data.posts;
  elements.posts.innerHTML = data.posts.map(renderPostListItem).join("");

  for (const item of elements.posts.querySelectorAll(".post")) {
    item.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      selectPost(Number.parseInt(item.dataset.cid, 10));
    });
  }
  bindActionMenus(elements.posts, ".post", postActions);

  prefetchPostDetails(data.posts.slice(0, 5), { forceRefresh });
}

async function selectPost(cid, { forceRefresh = false } = {}) {
  const query = new URLSearchParams({ host: state.host });
  if (forceRefresh) {
    query.set("refresh", "1");
  }

  const data = await api(`/api/posts/${cid}?${query.toString()}`);
  state.selected = data.post;
  elements.title.value = data.post.title || "";
  elements.slug.value = data.post.slug || "";
  elements.postStatus.value = data.post.status || "draft";
  elements.categories.value = (data.post.categories || []).join(", ");
  elements.tags.value = (data.post.tags || []).join(", ");
  elements.markdown.value = stripMarkdownMarker(data.post.text || "");
  state.dirty = false;
  state.preparedCid = null;
  renderPreview();
  markActive(cid);
  renderStatusBar();
  renderInspector();
  log(`Loaded #${cid}${data.cache ? `\nCache: ${cacheLabel(data.cache)}` : ""}`);
}

async function createDraft() {
  const title = "New Typecho MCP Draft";
  const data = await api("/api/posts/draft", {
    method: "POST",
    body: {
      host: state.host,
      title,
      markdown: "# New Typecho MCP Draft\n\nStart writing here.",
      categories: [],
      tags: ["typecho-mcp"]
    }
  });
  await loadPosts();
  await selectPost(data.post.cid);
  log(`Draft created #${data.post.cid}`);
}

async function savePost() {
  if (!state.selected?.cid) {
    await createDraft();
    return;
  }

  const data = await api(`/api/posts/${state.selected.cid}`, {
    method: "PATCH",
    body: currentPatch()
  });
  await loadPosts();
  await loadSnapshots();
  await selectPost(data.post.cid);
  log(`Saved #${data.post.cid}\nSnapshot: ${data.snapshotId || "none"}`);
}

async function previewDiff() {
  if (!state.selected?.cid) {
    log("Select a post first.");
    return;
  }

  const data = await api(`/api/posts/${state.selected.cid}/diff`, {
    method: "POST",
    body: currentPatch()
  });
  elements.publishReport.innerHTML = renderDiffReport(data);
  log(data.changed ? "Diff preview ready." : "No changes detected.");
}

async function publishPost() {
  if (!state.selected?.cid) {
    log("Select a post first.");
    return;
  }
  if (state.dirty || state.preparedCid !== state.selected.cid) {
    log("Run Prepare on the saved post before opening publish review.");
    return;
  }

  openPublishReview();
}

async function confirmPublish(cid) {
  const data = await api(`/api/posts/${cid}/publish`, {
    method: "POST",
    body: { host: state.host, confirm: true, client: "web-console" }
  });
  await loadPosts();
  await loadSnapshots();
  await selectPost(data.post.cid);
  renderStatusBar();
  log(`Published #${data.post.cid}\nSnapshot: ${data.snapshotId}`);
}

async function preparePublish() {
  if (!state.selected?.cid) {
    log("Select a post first.");
    return;
  }
  if (state.dirty) {
    state.preparedCid = null;
    log("Save before Prepare. Local edits are not included in publish readiness checks.");
    return;
  }

  const data = await api(
    `/api/posts/${state.selected.cid}/publish-prepare?host=${encodeURIComponent(state.host)}`
  );
  elements.publishReport.innerHTML = renderPublishReport(data);
  state.preparedCid = state.selected.cid;
  renderStatusBar();
  renderInspector();
  log(
    `${data.ready ? "Ready to publish" : "Publish has blockers"}\n` +
      `Blockers: ${data.summary.blockers} · Warnings: ${data.summary.warnings}`
  );
}

async function loadSnapshots() {
  const data = await api("/api/snapshots");
  elements.snapshots.innerHTML = data.snapshots.slice(0, 8).map(renderSnapshot).join("");
  bindActionMenus(elements.snapshots, ".snapshot", snapshotActions);
}

async function loadMedia({ forceRefresh = false } = {}) {
  const query = new URLSearchParams({ host: state.host, limit: "8" });
  if (forceRefresh) {
    query.set("refresh", "1");
  }

  const data = await api(`/api/media?${query.toString()}`);
  elements.media.innerHTML = data.media.map(renderMedia).join("");
  bindActionMenus(elements.media, ".snapshot", mediaActions);
}

function prefetchPostDetails(posts, { forceRefresh = false } = {}) {
  const host = state.host;
  for (const post of posts) {
    if (!post?.cid) {
      continue;
    }

    const query = new URLSearchParams({ host });
    if (forceRefresh) {
      query.set("refresh", "1");
    }

    api(`/api/posts/${post.cid}?${query.toString()}`).catch(() => {});
  }
}

async function loadAudit() {
  const data = await api("/api/audit?limit=8");
  elements.audit.innerHTML = data.events.map(renderAudit).join("");
  bindActionMenus(elements.audit, ".snapshot", auditActions);
}

async function loadRequests() {
  const data = await api("/api/requests?limit=8");
  elements.requests.innerHTML = data.requests.map(renderRequest).join("");
  bindActionMenus(elements.requests, ".snapshot", requestActions);
}

async function insertExternalAsset(kind) {
  const url = elements.externalUrl.value.trim();
  if (!url) {
    log("Enter an external asset URL first.");
    return;
  }

  const data = await api("/api/media/register-url", {
    method: "POST",
    body: {
      url,
      kind
    }
  });
  elements.externalUrl.value = "";
  insertMarkdown(data.markdown, `Inserted external ${kind}: ${url}`);
}

function currentPatch() {
  return {
    host: state.host,
    title: elements.title.value.trim(),
    slug: elements.slug.value.trim(),
    status: elements.postStatus.value,
    markdown: elements.markdown.value,
    categories: csv(elements.categories.value),
    tags: csv(elements.tags.value)
  };
}

function renderPostListItem(post) {
  return `
    <div class="post" data-cid="${escapeHtml(post.cid)}" data-slug="${escapeHtml(post.slug || "")}" data-url="${escapeHtml(post.url || post.permalink || "")}" data-title="${escapeHtml(post.title || "(untitled)")}" data-status="${escapeHtml(post.status || "")}">
      <div class="row-head">
        <div class="post-title">${escapeHtml(post.title || "(untitled)")}</div>
        ${renderMoreButton("Post actions")}
      </div>
      <div class="post-meta">
        #${post.cid} · <span class="status-${escapeHtml(post.status)}">${escapeHtml(post.status)}</span> · ${escapeHtml(post.modified || "")}
      </div>
    </div>
  `;
}

function renderSnapshot(snapshot) {
  return `
    <div class="snapshot" data-snapshot="${escapeHtml(snapshot.snapshotId)}" data-entity="${escapeHtml(snapshot.entityId)}" data-reason="${escapeHtml(snapshot.reason || "")}">
      <div class="row-head">
        <strong>${escapeHtml(snapshot.reason)}</strong>
        ${renderMoreButton("Snapshot actions")}
      </div>
      <div>#${escapeHtml(snapshot.entityId)} · ${escapeHtml(snapshot.createdAt)}</div>
    </div>
  `;
}

function renderDiagnostics(data) {
  const database = data.site?.database;
  const compatibility = database?.compatibility;
  const databaseClass = compatibility?.supported === false ? "diag-fail" : compatibility ? "diag-ok" : "diag-warn";
  return `
    <div class="diag-summary ${data.ok ? "diag-ok" : "diag-fail"}">
      ${data.ok ? "Healthy" : "Needs attention"} · ${escapeHtml(data.host)} · ${escapeHtml(data.operationId)}
    </div>
    <div class="diag-check ${databaseClass}">
      <strong>Database · ${escapeHtml(database?.kind || "unknown")}</strong>
      <div>${escapeHtml(compatibility?.status || "unknown")} · supported: ${escapeHtml((compatibility?.supportedKinds || []).join(", ") || "unknown")}</div>
      <div>${escapeHtml(compatibility?.message || "")}</div>
    </div>
    ${data.checks.map(renderDiagnosticCheck).join("")}
  `;
}

function renderCacheStatus(cache) {
  const namespaces = Object.entries(cache.byNamespace || {});
  return `
    <div class="diag-summary ${cache.totalEntries > 0 ? "diag-ok" : "diag-warn"}">
      ${escapeHtml(cache.totalEntries)} entries · ${escapeHtml(cache.host || state.host)}
    </div>
    ${namespaces
      .map(([namespace, summary]) => `
        <div class="diag-check ${summary.expired > 0 ? "diag-warn" : "diag-ok"}">
          <strong>${escapeHtml(namespace)}</strong>
          <div>${escapeHtml(summary.entries)} entries · ${escapeHtml(summary.expired)} expired</div>
          <div>${escapeHtml(summary.newestCachedAt || "")}</div>
        </div>
      `)
      .join("")}
  `;
}

function renderPolicyStatus(policy) {
  const operations = policy.operations || [];
  const visible = operations.filter((item) =>
    [
      "posts.publish",
      "posts.rollback",
      "posts.update",
      "comments.delete",
      "comments.reply",
      "plugins.enable",
      "plugins.disable",
      "cache.clear"
    ].includes(item.operation)
  );
  return `
    <div class="diag-summary diag-ok">
      ${escapeHtml(policy.publishPolicy)} · ${escapeHtml(operations.length)} operations
    </div>
    ${visible
      .map((item) => `
        <div class="diag-check ${policyClass(item.risk)}">
          <strong>${escapeHtml(item.risk.toUpperCase())} · ${escapeHtml(item.operation)}</strong>
          <div>confirmation: ${escapeHtml(item.confirmation)}</div>
        </div>
      `)
      .join("")}
  `;
}

function renderDiagnosticCheck(check) {
  const detail = check.ok ? compactSummary(check.summary) : check.error?.message;
  return `
    <div class="diag-check ${check.ok ? "diag-ok" : "diag-fail"}">
      <strong>${check.ok ? "OK" : "FAIL"} · ${escapeHtml(check.name)}</strong>
      <div>${escapeHtml(check.durationMs)}ms</div>
      <div>${escapeHtml(detail || "")}</div>
    </div>
  `;
}

function renderPublishReport(report) {
  return `
    <div class="report-summary ${report.ready ? "diag-ok" : "diag-fail"}">
      <strong>${report.ready ? "Ready" : "Blocked"} · #${escapeHtml(report.post.cid)} ${escapeHtml(report.post.title)}</strong>
      <div>${escapeHtml(report.post.status)} · ${escapeHtml(report.post.slug)} · ${escapeHtml(report.post.markdownLength)} chars</div>
      <div>${escapeHtml(report.summary.blockers)} blockers · ${escapeHtml(report.summary.warnings)} warnings · ${escapeHtml(report.summary.images)} images · ${escapeHtml(report.summary.externalLinks)} links</div>
    </div>
    <div class="report-grid">
      ${report.checks.map(renderPublishCheck).join("")}
    </div>
  `;
}

function renderPublishCheck(check) {
  const className = check.ok ? "diag-ok" : check.severity === "blocker" ? "diag-fail" : "diag-warn";
  return `
    <div class="report-check ${className}">
      <strong>${check.ok ? "OK" : check.severity.toUpperCase()} · ${escapeHtml(check.name)}</strong>
      <div>${escapeHtml(check.message)}</div>
    </div>
  `;
}

function renderDiffReport(diff) {
  return `
    <div class="report-summary ${diff.changed ? "diag-warn" : "diag-ok"}">
      <strong>${diff.changed ? "Changes detected" : "No changes"} · #${escapeHtml(diff.post.cid)} ${escapeHtml(diff.post.title)}</strong>
      <div>${escapeHtml(diff.markdown.beforeLines)} -> ${escapeHtml(diff.markdown.afterLines)} lines · ${escapeHtml(diff.markdown.removedLines)} removed · ${escapeHtml(diff.markdown.addedLines)} added</div>
    </div>
    <div class="report-grid">
      ${diff.fields.map(renderDiffField).join("")}
      <div class="report-check ${diff.markdown.changed ? "diag-warn" : "diag-ok"}">
        <strong>${diff.markdown.changed ? "CHANGED" : "OK"} · markdown</strong>
        <div>${escapeHtml(diff.markdown.beforeLength)} -> ${escapeHtml(diff.markdown.afterLength)} chars</div>
        ${diff.markdown.truncated ? `<div class="muted">${escapeHtml(diff.markdown.reason)}</div>` : ""}
        ${renderDiffHunks(diff.markdown.hunks || [])}
      </div>
    </div>
  `;
}

function renderDiffHunks(hunks) {
  if (!hunks.length) {
    return `<div class="muted">No line-level changes.</div>`;
  }

  return hunks
    .map((hunk) => `
      <pre class="diff-hunk">${hunk.lines
        .map((line) => `${diffPrefix(line.type)} ${line.text}`)
        .map(escapeHtml)
        .join("\n")}</pre>
    `)
    .join("");
}

function renderDiffField(field) {
  return `
    <div class="report-check ${field.changed ? "diag-warn" : "diag-ok"}">
      <strong>${field.changed ? "CHANGED" : "OK"} · ${escapeHtml(field.name)}</strong>
      <div>${escapeHtml(formatFieldValue(field.before))}</div>
      <div>${escapeHtml(formatFieldValue(field.after))}</div>
    </div>
  `;
}

function renderSnapshotPreview(snapshot) {
  if (!snapshot.post) {
    return `<div class="report-summary diag-fail"><strong>Snapshot has no post data.</strong></div>`;
  }

  return `
    <div class="report-summary diag-warn">
      <strong>Snapshot Preview · ${escapeHtml(snapshot.snapshotId)}</strong>
      <div>#${escapeHtml(snapshot.post.cid)} · ${escapeHtml(snapshot.post.title)} · ${escapeHtml(snapshot.post.status)}</div>
      <div>${escapeHtml(snapshot.post.markdownLines)} lines · ${escapeHtml(snapshot.post.markdownLength)} chars</div>
    </div>
    <div class="report-check diag-warn">
      <strong>Restore target</strong>
      <div>Slug: ${escapeHtml(snapshot.post.slug)}</div>
      <div>Categories: ${escapeHtml(snapshot.post.categories.join(", "))}</div>
      <div>Tags: ${escapeHtml(snapshot.post.tags.join(", "))}</div>
      <pre>${escapeHtml(snapshot.post.excerpt)}</pre>
    </div>
    ${
      snapshot.restoreDiff
        ? `
          <div class="report-check ${snapshot.restoreDiff.changed ? "diag-warn" : "diag-ok"}">
            <strong>${snapshot.restoreDiff.changed ? "RESTORE CHANGES" : "NO RESTORE CHANGES"} · current remote vs snapshot</strong>
            <div>${escapeHtml(snapshot.restoreDiff.markdown.beforeLines)} -> ${escapeHtml(snapshot.restoreDiff.markdown.afterLines)} lines · ${escapeHtml(snapshot.restoreDiff.markdown.removedLines)} removed · ${escapeHtml(snapshot.restoreDiff.markdown.addedLines)} added</div>
            ${snapshot.restoreDiff.fields.map(renderDiffField).join("")}
            ${snapshot.restoreDiff.markdown.truncated ? `<div class="muted">${escapeHtml(snapshot.restoreDiff.markdown.reason)}</div>` : ""}
            ${renderDiffHunks(snapshot.restoreDiff.markdown.hunks || [])}
          </div>
        `
        : ""
    }
  `;
}

function renderMedia(media) {
  const markdown = `![${media.filename}](${media.url})`;
  return `
    <div class="snapshot" data-url="${escapeHtml(media.url || "")}" data-filename="${escapeHtml(media.filename || "")}" data-markdown="${escapeHtml(markdown)}">
      <div class="row-head">
        <strong>${escapeHtml(media.filename)}</strong>
        ${renderMoreButton("Media actions")}
      </div>
      <div>${escapeHtml(media.mime || "")} · ${media.size || 0} bytes</div>
    </div>
  `;
}

function renderAudit(event) {
  return `
    <div class="snapshot" data-operation="${escapeHtml(event.operationId || "")}" data-audit-id="${escapeHtml(event.id || "")}" data-entity="${escapeHtml(event.entityId || "")}" data-action="${escapeHtml(event.action || "")}">
      <div class="row-head">
        <strong>${escapeHtml(event.action)}</strong>
        ${renderMoreButton("Audit actions")}
      </div>
      <div>${escapeHtml(event.entityType || "")} ${escapeHtml(event.entityId || "")}</div>
      <div>${escapeHtml(event.timestamp || "")}</div>
    </div>
  `;
}

function renderRequest(request) {
  const okClass = request.ok ? "diag-ok" : "diag-fail";
  return `
    <div class="snapshot" data-operation="${escapeHtml(request.operationId || "")}" data-url="${escapeHtml(request.url || "")}" data-surface="${escapeHtml(request.surface || "")}">
      <div class="row-head">
        <strong>${escapeHtml(request.method || request.command || request.tool || request.surface || "request")}</strong>
        ${renderMoreButton("Request actions")}
      </div>
      <div class="${okClass}">${request.ok ? "OK" : "FAIL"} · ${escapeHtml(request.statusCode || "")} · ${escapeHtml(request.durationMs || "")}ms</div>
      <div>${escapeHtml(request.url || request.command || request.tool || "")}</div>
    </div>
  `;
}

function renderInspector() {
  if (!elements.inspector) {
    return;
  }
  if (!state.selected?.cid) {
    elements.inspector.innerHTML = `
      <p class="eyebrow">Inspector</p>
      <div class="muted">Select a post to inspect context.</div>
    `;
    return;
  }

  const post = state.selected;
  const prepareLabel = state.preparedCid === post.cid && !state.dirty ? "current" : "required";
  const relatedSnapshots = Array.from(elements.snapshots.querySelectorAll(".snapshot"))
    .filter((item) => item.dataset.entity === String(post.cid))
    .slice(0, 3);

  elements.inspector.innerHTML = `
    <p class="eyebrow">Inspector</p>
    <div class="inspector-card">
      <strong>${escapeHtml(post.title || "(untitled)")}</strong>
      <div>#${escapeHtml(post.cid)} · ${escapeHtml(post.status || "")}</div>
      <div>${escapeHtml(post.slug || "no-slug")}</div>
    </div>
    <dl class="inspector-facts">
      <div><dt>Dirty</dt><dd>${state.dirty ? "unsaved" : "clean"}</dd></div>
      <div><dt>Prepare</dt><dd>${escapeHtml(prepareLabel)}</dd></div>
      <div><dt>Policy</dt><dd>${escapeHtml(state.status.policyLabel)}</dd></div>
      <div><dt>Categories</dt><dd>${escapeHtml((post.categories || []).join(", ") || "none")}</dd></div>
      <div><dt>Tags</dt><dd>${escapeHtml((post.tags || []).join(", ") || "none")}</dd></div>
      <div><dt>Snapshots</dt><dd>${escapeHtml(relatedSnapshots.length || "recent panel")}</dd></div>
    </dl>
    <div class="inspector-note">
      Context only. Publish, rollback, delete, and future risky writes still require Review/Confirm.
    </div>
  `;
}

function renderMoreButton(label) {
  return `<button class="more-button" type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}">⋮</button>`;
}

function bindActionMenus(container, itemSelector, getActions) {
  container._actionMenu = { itemSelector, getActions };
  if (container._actionMenuBound) {
    return;
  }

  container._actionMenuBound = true;
  container.addEventListener("click", (event) => {
    const item = event.target.closest(container._actionMenu.itemSelector);
    if (!item) {
      return;
    }

    if (event.target.closest(".more-button")) {
      event.preventDefault();
      event.stopPropagation();
      openActionMenu(container._actionMenu.getActions(item), event.clientX, event.clientY);
      return;
    }

    const actionButton = event.target.closest("button[data-action]");
    if (actionButton) {
      event.preventDefault();
      event.stopPropagation();
      const action = container._actionMenu
        .getActions(item)
        .find((candidate) => candidate.id === actionButton.dataset.action);
      runAction(action);
    }
  });

  container.addEventListener("contextmenu", (event) => {
    const item = event.target.closest(container._actionMenu.itemSelector);
    if (!item) {
      return;
    }

    event.preventDefault();
    openActionMenu(container._actionMenu.getActions(item), event.clientX, event.clientY);
  });
}

function openActionMenu(actions, x, y) {
  closeActionMenu();
  const menu = document.createElement("div");
  menu.className = "action-menu";
  menu.setAttribute("role", "menu");
  menu.innerHTML = actions
    .map((action) => {
      const disabled = actionDisabled(action);
      return `
        <button type="button" role="menuitem" data-action-id="${escapeHtml(action.id)}" ${disabled ? "disabled" : ""}>
          <span>${escapeHtml(action.label)}</span>
          ${disabled && typeof disabled === "string" ? `<small>${escapeHtml(disabled)}</small>` : ""}
        </button>
      `;
    })
    .join("");
  document.body.appendChild(menu);

  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - rect.width - 8)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - rect.height - 8)}px`;

  menu.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action-id]");
    if (!button) {
      return;
    }

    const action = actions.find((candidate) => candidate.id === button.dataset.actionId);
    closeActionMenu();
    runAction(action);
  });

  window.setTimeout(() => {
    document.addEventListener("click", closeActionMenu, { once: true });
  }, 0);
}

function closeActionMenu() {
  document.querySelector(".action-menu")?.remove();
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeActionMenu();
    if (!elements.confirmOverlay.hidden) {
      closeConfirmSheet();
    }
  }
});

async function runAction(action) {
  const disabled = actionDisabled(action);
  if (!action || disabled) {
    if (typeof disabled === "string") {
      log(disabled);
    }
    return;
  }

  try {
    await action.run();
  } catch (error) {
    log(formatError(error));
  }
}

function actionDisabled(action) {
  if (!action) {
    return true;
  }
  return typeof action.disabled === "function" ? action.disabled() : action.disabled;
}

function postActions(item) {
  const cid = Number.parseInt(item.dataset.cid, 10);
  const slug = item.dataset.slug || "";
  const url = item.dataset.url || "";
  const title = item.dataset.title || `#${cid}`;
  return [
    action("open", "Open in editor", () => selectPost(cid)),
    action("preview-mode", "Open preview mode", async () => {
      await selectPost(cid);
      setViewMode("preview");
      elements.preview.scrollIntoView({ block: "nearest" });
      log(`Preview mode opened for #${cid}.`);
    }),
    action("split-mode", "Open split mode", async () => {
      await selectPost(cid);
      setViewMode("split");
      elements.markdown.scrollIntoView({ block: "nearest" });
      log(`Split mode opened for #${cid}.`);
    }),
    action("copy-cid", "Copy cid", () => copyText("cid", cid)),
    action("copy-slug", "Copy slug", () => copyText("slug", slug), !slug && "No slug available."),
    action("copy-url", "Copy post URL", () => copyText("post URL", url), !url && "No post URL available."),
    action(
      "copy-markdown-link",
      "Copy Markdown link",
      () => copyText("Markdown link", `[${title}](${url})`),
      !url && "No post URL available."
    ),
    action("refresh-post", "Refresh this post", () => selectPost(cid, { forceRefresh: true })),
    action("diff", "Open save diff", async () => {
      if (state.selected?.cid !== cid) {
        await selectPost(cid);
      }
      await previewDiff();
    }),
    action("prepare", "Prepare publish", async () => {
      if (state.selected?.cid !== cid) {
        await selectPost(cid);
      }
      await preparePublish();
    }),
    action(
      "review-publish",
      "Open publish review",
      async () => {
        if (state.selected?.cid !== cid) {
          await selectPost(cid);
        }
        openPublishReview();
      },
      () => (state.preparedCid === cid && !state.dirty ? false : "Run Prepare first.")
    ),
    action("show-snapshots", "Show related snapshots", () => log(`Snapshots panel is showing recent snapshots. Filter target: #${cid}.`)),
    action("show-audit", "Show related audit events", () => log(`Audit panel is showing recent events. Filter target: #${cid}.`))
  ];
}

function mediaActions(item) {
  const url = item.dataset.url || "";
  const filename = item.dataset.filename || "media";
  const markdown = item.dataset.markdown || "";
  return [
    action("insert", "Insert media", () => insertMarkdown(markdown, `Inserted media ${filename}`)),
    action("preview", "Open preview", () => openUrl(url), !url && "No media URL available."),
    action("copy-url", "Copy URL", () => copyText("media URL", url), !url && "No media URL available."),
    action("copy-markdown", "Copy Markdown", () => copyText("media Markdown", markdown), !markdown && "No Markdown available."),
    action("refresh", "Refresh media", () => loadMedia({ forceRefresh: true }))
  ];
}

function snapshotActions(item) {
  const snapshotId = item.dataset.snapshot || "";
  const entityId = item.dataset.entity || "";
  return [
    action("preview", "Preview snapshot", () => previewSnapshot(snapshotId)),
    action("review-rollback", "Open rollback review", async () => {
      const snapshot = await previewSnapshot(snapshotId);
      openRollbackReview(snapshot);
    }),
    action("copy-snapshot", "Copy snapshot ID", () => copyText("snapshot ID", snapshotId)),
    action("copy-entity", "Copy entity ID", () => copyText("entity ID", entityId), !entityId && "No entity ID available.")
  ];
}

function auditActions(item) {
  const operationId = item.dataset.operation || "";
  const auditId = item.dataset.auditId || "";
  const entityId = item.dataset.entity || "";
  return [
    action("copy-operation", "Copy operation ID", () => copyText("operation ID", operationId), !operationId && "No operation ID available."),
    action("copy-audit", "Copy audit ID", () => copyText("audit ID", auditId), !auditId && "No audit ID available."),
    action("copy-entity", "Copy entity ID", () => copyText("entity ID", entityId), !entityId && "No entity ID available."),
    action("open-review", "Open review", () => log(`Opened audit review context for ${operationId || auditId || "event"}.`)),
    action("refresh", "Refresh audit", loadAudit)
  ];
}

function requestActions(item) {
  const operationId = item.dataset.operation || "";
  const url = item.dataset.url || "";
  return [
    action("copy-operation", "Copy operation ID", () => copyText("operation ID", operationId), !operationId && "No operation ID available."),
    action("copy-url", "Copy request path", () => copyText("request path", url), !url && "No request path available."),
    action("open-review", "Open review", () => log(`Opened request review context for ${operationId || url || "request"}.`)),
    action("refresh", "Refresh request log", loadRequests)
  ];
}

function action(id, label, run, disabled = false) {
  return { id, label, run, disabled };
}

async function previewSnapshot(snapshotId) {
  const query = new URLSearchParams({
    host: state.host,
    restoreDiff: "1"
  });
  const data = await api(`/api/snapshots/${snapshotId}?${query.toString()}`);
  state.previewedSnapshot = data;
  elements.publishReport.innerHTML = renderSnapshotPreview(data);
  log(`Snapshot preview ${snapshotId}`);
  return data;
}

function openPublishReview() {
  const post = state.selected;
  if (!post?.cid) {
    log("Select a post first.");
    return;
  }
  if (state.dirty || state.preparedCid !== post.cid) {
    log("Run Prepare on the saved post before opening publish review.");
    return;
  }

  openConfirmSheet({
    eyebrow: "Publish Review",
    title: `Publish #${post.cid}`,
    confirmLabel: "Confirm publish",
    bodyHtml: `
      ${renderConfirmFacts([
        ["Operation", "posts.publish"],
        ["Risk", "critical"],
        ["Policy", "manual approval"],
        ["Host", state.host],
        ["Post", `#${post.cid} ${post.title || "(untitled)"}`],
        ["Status", post.status || "draft"],
        ["Slug", post.slug || ""],
        ["Prepare", "current for the saved post"]
      ])}
      <div class="confirm-note">
        Publishing sends <code>confirm=true</code> through the local service after this human review.
        The operation will create audit/request records and refresh post/snapshot state.
      </div>
    `,
    run: () => confirmPublish(post.cid)
  });
  log(`Publish review opened for #${post.cid}.`);
}

function openRollbackReview(snapshot) {
  if (!snapshot?.snapshotId) {
    log("Preview a snapshot before opening rollback review.");
    return;
  }
  if (!snapshot.post) {
    log("Snapshot has no post data.");
    return;
  }

  const diff = snapshot.restoreDiff;
  const diffSummary = diff
    ? `${diff.changed ? "changes detected" : "no restore changes"} · ${diff.markdown.beforeLines} -> ${diff.markdown.afterLines} lines · ${diff.markdown.removedLines} removed · ${diff.markdown.addedLines} added`
    : "restore diff unavailable";

  openConfirmSheet({
    eyebrow: "Rollback Review",
    title: `Rollback ${snapshot.snapshotId}`,
    confirmLabel: "Confirm rollback",
    bodyHtml: `
      ${renderConfirmFacts([
        ["Operation", "posts.rollback"],
        ["Risk", "critical"],
        ["Policy", "manual approval"],
        ["Host", state.host],
        ["Snapshot", snapshot.snapshotId],
        ["Target", `#${snapshot.post.cid} ${snapshot.post.title || "(untitled)"}`],
        ["Target status", snapshot.post.status || ""],
        ["Restore diff", diffSummary]
      ])}
      <div class="confirm-note">
        Rollback sends <code>confirm=true</code> only from this review sheet.
        Snapshot preview stays visible below the editor so the restore target can be inspected before confirming.
      </div>
    `,
    run: () => confirmRollback(snapshot.snapshotId)
  });
  log(`Rollback review opened for snapshot ${snapshot.snapshotId}.`);
}

async function confirmRollback(snapshotId) {
  const data = await api("/api/rollback", {
    method: "POST",
    body: { host: state.host, snapshotId, confirm: true, client: "web-console" }
  });
  await loadPosts();
  await loadSnapshots();
  if (data.post?.cid) {
    await selectPost(data.post.cid);
  }
  renderStatusBar();
  log(`Rolled back #${data.post?.cid || "unknown"}\nSnapshot: ${snapshotId}`);
}

function openConfirmSheet({ eyebrow, title, bodyHtml, confirmLabel, run }) {
  state.pendingConfirm = { run };
  elements.confirmEyebrow.textContent = eyebrow;
  elements.confirmTitle.textContent = title;
  elements.confirmBody.innerHTML = bodyHtml;
  elements.confirmRun.textContent = confirmLabel;
  elements.confirmOverlay.hidden = false;
  elements.confirmSheet?.scrollTo?.(0, 0);
  elements.confirmClose.focus();
}

function closeConfirmSheet() {
  state.pendingConfirm = null;
  elements.confirmOverlay.hidden = true;
  elements.confirmRun.disabled = false;
}

async function runPendingConfirm() {
  if (!state.pendingConfirm) {
    return;
  }

  const pending = state.pendingConfirm;
  elements.confirmRun.disabled = true;
  try {
    await pending.run();
    closeConfirmSheet();
  } catch (error) {
    log(formatError(error));
    elements.confirmRun.disabled = false;
  }
}

function renderConfirmFacts(facts) {
  return `
    <dl class="confirm-facts">
      ${facts
        .map(([label, value]) => `
          <div>
            <dt>${escapeHtml(label)}</dt>
            <dd>${escapeHtml(value)}</dd>
          </div>
        `)
        .join("")}
    </dl>
  `;
}

function insertMarkdown(markdown, message) {
  elements.markdown.value += `\n\n${markdown}\n`;
  markDirty();
  renderPreview();
  log(message);
}

function openUrl(url) {
  window.open(url, "_blank", "noopener,noreferrer");
  log(`Opened ${url}`);
}

async function copyText(label, value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(String(value));
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = String(value);
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  log(`Copied ${label}.`);
}

function markActive(cid) {
  for (const item of elements.posts.querySelectorAll(".post")) {
    item.classList.toggle("active", Number.parseInt(item.dataset.cid, 10) === cid);
  }
}

function renderPreview() {
  elements.preview.innerHTML = markdownToHtml(elements.markdown.value);
}

function markdownToHtml(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      closeList();
      html.push(`<h3>${inline(line.slice(4))}</h3>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inline(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (line.trim() === "") {
      closeList();
    } else {
      closeList();
      html.push(`<p>${inline(line)}</p>`);
    }
  }

  closeList();
  return html.join("\n");

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }
}

function inline(value) {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

async function api(path, options = {}) {
  const result = await workbenchBackend.request(path, options);
  const data = result.data || {};
  const operationId = result.operationId;
  if (operationId && data && typeof data === "object" && !data.operationId) {
    data.operationId = operationId;
  }
  if (operationId) {
    setLastOperation(operationId);
  }
  if (!result.ok) {
    const error = new Error(data.error?.message || result.statusText);
    error.code = data.error?.code || "HTTP_ERROR";
    error.operationId = data.error?.operationId || operationId;
    rememberError(error);
    throw error;
  }
  clearError();
  return data;
}

async function runPanel(name, fn, target) {
  beginBusy(name);
  try {
    await fn();
    return { name, ok: true };
  } catch (error) {
    rememberError(error);
    target.innerHTML = `<div class="error-box">${escapeHtml(formatError(error))}</div>`;
    log(`${name} failed\n${formatError(error)}`);
    return { name, ok: false, error };
  } finally {
    endBusy();
  }
}

async function withBusy(button, fn) {
  const previous = button.textContent;
  button.disabled = true;
  button.textContent = "Working...";
  beginBusy(previous);
  try {
    await fn();
  } catch (error) {
    rememberError(error);
    log(formatError(error));
  } finally {
    button.disabled = false;
    button.textContent = previous;
    endBusy();
  }
}

function formatError(error) {
  const suffix = error.operationId ? `\nOperation: ${error.operationId}` : "";
  return `${error.code || "ERROR"}: ${error.message}${suffix}`;
}

function compactSummary(value) {
  if (value == null) {
    return "";
  }

  if (typeof value !== "object") {
    return String(value);
  }

  return Object.entries(value)
    .map(([key, item]) => `${key}: ${typeof item === "object" && item !== null ? JSON.stringify(item) : item}`)
    .join(" · ");
}

function formatFieldValue(value) {
  return Array.isArray(value) ? value.join(", ") : String(value ?? "");
}

function cacheLabel(cache) {
  const ageSeconds = Math.round((cache.ageMs || 0) / 1000);
  return `${cache.source || (cache.hit ? "cache" : "remote")} · ${ageSeconds}s old`;
}

function diffPrefix(type) {
  if (type === "add") {
    return "+";
  }
  if (type === "remove") {
    return "-";
  }
  return " ";
}

function policyClass(risk) {
  if (risk === "critical" || risk === "high") {
    return "diag-warn";
  }
  return "diag-ok";
}

function stripMarkdownMarker(text) {
  return text.startsWith("<!--markdown-->") ? text.slice("<!--markdown-->".length) : text;
}

function markDirty() {
  state.dirty = true;
  state.preparedCid = null;
  renderStatusBar();
  renderInspector();
}

function csv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function log(value) {
  elements.log.textContent = value;
}

function beginBusy(label) {
  state.status.busyCount += 1;
  state.status.busyLabel = label || "Working";
  renderStatusBar();
}

function endBusy() {
  state.status.busyCount = Math.max(0, state.status.busyCount - 1);
  if (state.status.busyCount === 0) {
    state.status.busyLabel = null;
  }
  renderStatusBar();
}

function setLastOperation(operationId) {
  state.status.lastOperationId = operationId;
  renderStatusBar();
}

function rememberError(error) {
  state.status.lastError = {
    code: error.code || "ERROR",
    message: error.message || "Operation failed"
  };
  renderStatusBar();
}

function clearError() {
  state.status.lastError = null;
  renderStatusBar();
}

async function copyLastOperationId() {
  if (!state.status.lastOperationId) {
    log("No operation ID available.");
    return;
  }
  await copyText("operation ID", state.status.lastOperationId);
}

function renderStatusBar() {
  if (!elements.statusHost) {
    return;
  }

  const postLabel = state.selected?.cid
    ? `Post: #${state.selected.cid} ${truncate(state.selected.title || "(untitled)", 28)}`
    : "No post selected";
  const prepareLabel = state.preparedCid && state.selected?.cid === state.preparedCid && !state.dirty
    ? "Prepare current"
    : "Prepare required";
  const busyLabel = state.status.busyCount > 0
    ? `Working: ${state.status.busyLabel || state.status.busyCount}`
    : "Idle";
  const operationLabel = state.status.lastOperationId
    ? `Op: ${truncate(state.status.lastOperationId, 18)}`
    : "No operation";
  const errorLabel = state.status.lastError
    ? `Error: ${state.status.lastError.code}`
    : "OK";

  elements.statusHost.textContent = `Host: ${state.host}`;
  elements.statusSite.textContent = `Site: ${truncate(state.status.siteTitle || "loading", 24)}`;
  elements.statusPost.textContent = postLabel;
  elements.statusDirty.textContent = state.dirty ? "Unsaved" : "Clean";
  elements.statusDirty.classList.toggle("status-warn", state.dirty);
  elements.statusPrepare.textContent = prepareLabel;
  elements.statusPrepare.classList.toggle("status-ok", prepareLabel === "Prepare current");
  elements.statusPolicy.textContent = `Policy: ${state.status.policyLabel}`;
  elements.statusBusy.textContent = busyLabel;
  elements.statusLastOperation.textContent = operationLabel;
  elements.statusLastOperation.disabled = !state.status.lastOperationId;
  elements.statusError.textContent = errorLabel;
  elements.statusError.classList.toggle("status-fail", Boolean(state.status.lastError));
}

function truncate(value, length) {
  const text = String(value || "");
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
