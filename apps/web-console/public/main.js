import { workbenchBackend } from "./backend.js";

const storageKeys = {
  locale: "typechoMcp.locale",
  postListWidth: "typechoMcp.layout.postListWidth",
  inspectorWidth: "typechoMcp.layout.inspectorWidth"
};
const maxEditorTextBytes = 5 * 1024 * 1024;

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
  focusMode: false,
  sidebarBeforeFocus: false,
  inspectorCollapsed: true,
  locale: preferredLocale(),
  commandQuery: "",
  layout: {
    postListWidth: readNumberPreference(storageKeys.postListWidth, 300),
    inspectorWidth: readNumberPreference(storageKeys.inspectorWidth, 300)
  },
  status: {
    siteTitle: null,
    lastOperationId: null,
    lastError: null,
    busyCount: 0,
    busyLabel: null,
    policyLabel: "unknown",
    serviceLabel: null
  },
  startupProfile: {
    preferredProfileMode: "auto",
    configuredProfileMode: "auto",
    effectiveProfileMode: "unknown",
    currentProfileMode: "unknown",
    serviceSource: "unknown",
    nodeSource: "unknown"
  }
};

const $ = (id) => document.getElementById(id);

const elements = {
  app: document.querySelector(".app"),
  host: $("host"),
  language: $("language"),
  languageLabel: $("languageLabel"),
  site: $("site"),
  refresh: $("refresh"),
  newDraft: $("newDraft"),
  runDiagnostics: $("runDiagnostics"),
  desktopServiceStatusButton: $("desktopServiceStatusButton"),
  exportDebug: $("exportDebug"),
  startupProfileLabel: $("startupProfileLabel"),
  startupProfileMode: $("startupProfileMode"),
  saveStartupProfile: $("saveStartupProfile"),
  startupProfileStatus: $("startupProfileStatus"),
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
  importMarkdown: $("importMarkdown"),
  exportMarkdown: $("exportMarkdown"),
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
  inspectorContext: $("inspectorContext"),
  postsResize: $("postsResize"),
  inspectorResize: $("inspectorResize"),
  viewButtons: Array.from(document.querySelectorAll("[data-view-mode]")),
  toggleSidebar: $("toggleSidebar"),
  toggleInspector: $("toggleInspector"),
  statusHost: $("statusHost"),
  statusSite: $("statusSite"),
  statusPost: $("statusPost"),
  statusDirty: $("statusDirty"),
  statusPrepare: $("statusPrepare"),
  statusPolicy: $("statusPolicy"),
  statusService: $("statusService"),
  statusBusy: $("statusBusy"),
  statusLastOperation: $("statusLastOperation"),
  statusError: $("statusError"),
  commandOverlay: $("commandOverlay"),
  commandSearch: $("commandSearch"),
  commandList: $("commandList"),
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

const translations = {
  en: {
    workbench: "Workbench",
    host: "SSH Host",
    language: "Language",
    connecting: "Connecting...",
    refresh: "Refresh",
    newDraft: "New Draft",
    externalAsset: "External Asset",
    image: "Image",
    file: "File",
    snapshots: "Snapshots",
    media: "Media",
    searchPosts: "Search posts",
    all: "All",
    draft: "Draft",
    published: "Published",
    hidden: "Hidden",
    waiting: "Waiting",
    title: "Title",
    write: "Write",
    split: "Split",
    preview: "Preview",
    focus: "Focus",
    exitFocus: "Exit focus",
    showInspector: "Show inspector",
    hideInspector: "Hide inspector",
    diff: "Diff",
    save: "Save",
    prepare: "Prepare",
    publish: "Publish",
    publishInfo: "Publish Info",
    slug: "Slug",
    status: "Status",
    categories: "Categories",
    tags: "Tags",
    commaSeparated: "comma separated",
    inspector: "Inspector",
    selectPostContext: "Select a post to inspect context.",
    operations: "Operations",
    diagnosticsHistory: "Diagnostics & History",
    diagnostics: "Diagnostics",
    cache: "Cache",
    policy: "Policy",
    audit: "Audit",
    requests: "Requests",
    runChecks: "Run Checks",
    debugBundle: "Debug Bundle",
    importMarkdown: "Import MD",
    exportMarkdown: "Export MD",
    actionImportMarkdownToEditor: "Import Markdown to editor",
    actionImportTxtToEditor: "Import TXT to editor",
    actionExportEditorMarkdown: "Export editor Markdown",
    actionExportEditorTxt: "Export editor TXT",
    editorImportDesktopOnly: "Local text import is available in the desktop app.",
    editorImportCancelled: "Local text import cancelled.",
    editorImportLoaded: "Local text imported. Editor has unsaved changes.",
    editorExportCancelled: "Editor text export cancelled.",
    editorExportSaved: "Editor text exported. {bytes} bytes written.",
    editorExportDownloaded: "Editor text downloaded. {bytes} bytes prepared.",
    desktopServiceStatus: "Desktop Service Status",
    desktopServiceUnavailable: "Desktop service status is only available inside the Tauri desktop app.",
    desktopServiceLoaded: "Desktop service status\nURL: {url}\nPort: {port}\nListening: {listening}\nPreferred profile: {preferredProfileMode}\nCurrent profile: {currentProfileMode}\nService source: {serviceSource}\nNode source: {nodeSource}\nHost alias env: {hostAliasConfigured}\nPublish policy: {publishPolicy}\nStartup: {startupMode}\nOwned by desktop: {ownedByDesktop}\nChild exited: {childExited}\nExit code: {exitCode}\nUnexpected exit: {unexpectedExit}\nLogs: {logLabel} in {logLocationLabel}{recentCrashSummary}{lastError}",
    startupProfile: "Startup Profile",
    startupProfileAuto: "Auto",
    startupProfileDev: "Dev",
    startupProfileLocal: "Local",
    startupProfilePackaged: "Packaged",
    saveStartupProfile: "Save Profile",
    desktopStartupProfile: "Desktop Startup Profile",
    actionDesktopStartupProfile: "Open startup profile selector",
    startupProfileUnavailable: "Startup profile selector is only available inside the Tauri desktop app.",
    startupProfileStatus: "Profile: {preferred} / current: {current}",
    startupProfileLoaded: "Startup profile\nPreferred: {preferred}\nCurrent: {current}\nService source: {serviceSource}\nNode source: {nodeSource}",
    startupProfileSaved: "Startup profile saved. It applies on the next desktop-managed startup.",
    serviceBrowser: "Service: browser",
    serviceRunning: "Service: running",
    serviceReused: "Service: reused",
    serviceStopped: "Service: stopped",
    serviceFailed: "Service: failed",
    debugBundleCancelled: "Debug bundle export cancelled.",
    debugBundleDownloaded: "Debug bundle exported\n{fileName}\nOperation: {operationId}\nThis diagnostic bundle may include local paths and operational metadata.",
    debugBundleSaved: "Debug bundle saved\n{fileName}\n{bytes} bytes\nOperation: {operationId}\nThis diagnostic bundle may include local paths and operational metadata.",
    clear: "Clear",
    commandPalette: "Command Palette",
    commandPlaceholder: "Type a command...",
    noCommands: "No matching commands.",
    noPostSelected: "No post selected",
    clean: "Clean",
    unsaved: "Unsaved",
    prepareRequired: "Prepare required",
    prepareCurrent: "Prepare current",
    policyUnknown: "unknown",
    idle: "Idle",
    noOperation: "No operation",
    ok: "OK",
    editorViewMode: "Editor view mode",
    operationsPanel: "Operations panel",
    close: "Close",
    cancel: "Cancel",
    confirm: "Confirm",
    confirmOperation: "Confirm operation",
    copied: "Copied {label}.",
    selectPostFirst: "Select a post first.",
    saveBeforePrepare: "Save before Prepare. Local edits are not included in publish readiness checks.",
    prepareBeforeReview: "Run Prepare on the saved post before opening publish review.",
    enterExternalUrl: "Enter an external asset URL first.",
    insertedExternal: "Inserted external {kind}: {url}",
    insertedMedia: "Inserted media {filename}",
    markdownImageUrl: "Image URL",
    markdownLinkUrl: "Link URL",
    markdownLinkLabel: "Link text",
    actionOpenEditor: "Open in editor",
    actionPreviewMode: "Open preview mode",
    actionSplitMode: "Open split mode",
    actionCopyCid: "Copy cid",
    actionCopySlug: "Copy slug",
    actionCopyUrl: "Copy URL",
    actionCopyMarkdown: "Copy Markdown",
    actionNoSelection: "Select text first.",
    actionRefresh: "Refresh",
    actionPrepare: "Prepare publish",
    actionPublishReview: "Open publish review",
    actionInsertMedia: "Insert media",
    actionInsertImage: "Insert image",
    actionInsertLink: "Insert link",
    actionBold: "Bold",
    actionItalic: "Italic",
    actionInlineCode: "Inline code",
    actionHeading: "Heading",
    actionQuote: "Quote",
    actionBulletList: "Bullet list",
    actionNumberedList: "Numbered list",
    actionDivider: "Divider",
    actionCopySelection: "Copy selection",
    actionWordCount: "Word count",
    actionToggleFocus: "Toggle focus",
    actionToggleInspector: "Toggle inspector",
    actionSave: "Save current post",
    groupFile: "File",
    groupEditor: "Editor",
    groupView: "View",
    groupReview: "Review",
    groupOperations: "Operations",
    wordCountResult: "{chars} characters, {words} words",
    nativeCommandUnknown: "Native command is not available in this context: {id}"
  },
  "zh-CN": {
    workbench: "工作台",
    host: "SSH 主机",
    language: "语言",
    connecting: "正在连接...",
    refresh: "刷新",
    newDraft: "新建草稿",
    externalAsset: "外部素材",
    image: "图片",
    file: "文件",
    snapshots: "快照",
    media: "媒体",
    searchPosts: "搜索文章",
    all: "全部",
    draft: "草稿",
    published: "已发布",
    hidden: "隐藏",
    waiting: "待发布",
    title: "标题",
    write: "写作",
    split: "分屏",
    preview: "预览",
    focus: "专注",
    exitFocus: "退出专注",
    showInspector: "显示检查器",
    hideInspector: "隐藏检查器",
    diff: "差异",
    save: "保存",
    prepare: "检查",
    publish: "发布",
    publishInfo: "发布信息",
    slug: "别名",
    status: "状态",
    categories: "分类",
    tags: "标签",
    commaSeparated: "用逗号分隔",
    inspector: "检查器",
    selectPostContext: "选择一篇文章后查看上下文。",
    operations: "操作",
    diagnosticsHistory: "诊断与历史",
    diagnostics: "诊断",
    cache: "缓存",
    policy: "策略",
    audit: "审计",
    requests: "请求",
    runChecks: "运行检查",
    debugBundle: "调试包",
    importMarkdown: "导入 MD",
    exportMarkdown: "导出 MD",
    actionImportMarkdownToEditor: "导入 Markdown 到编辑器",
    actionImportTxtToEditor: "导入 TXT 到编辑器",
    actionExportEditorMarkdown: "导出编辑器 Markdown",
    actionExportEditorTxt: "导出编辑器 TXT",
    editorImportDesktopOnly: "本地文本导入仅在桌面应用中可用。",
    editorImportCancelled: "已取消导入本地文本。",
    editorImportLoaded: "已导入本地文本。编辑器有未保存更改。",
    editorExportCancelled: "已取消导出编辑器文本。",
    editorExportSaved: "编辑器文本已导出。已写入 {bytes} 字节。",
    editorExportDownloaded: "编辑器文本已下载。已准备 {bytes} 字节。",
    desktopServiceStatus: "桌面服务状态",
    desktopServiceUnavailable: "桌面服务状态仅在 Tauri 桌面应用中可用。",
    desktopServiceLoaded: "桌面服务状态\nURL：{url}\n端口：{port}\n监听：{listening}\n偏好启动配置：{preferredProfileMode}\n当前启动配置：{currentProfileMode}\n服务来源：{serviceSource}\nNode 来源：{nodeSource}\n主机别名环境变量：{hostAliasConfigured}\n发布策略：{publishPolicy}\n启动：{startupMode}\n桌面托管：{ownedByDesktop}\n子进程已退出：{childExited}\n退出码：{exitCode}\n意外退出：{unexpectedExit}\n日志：{logLabel} / {logLocationLabel}{recentCrashSummary}{lastError}",
    startupProfile: "启动配置",
    startupProfileAuto: "自动",
    startupProfileDev: "开发",
    startupProfileLocal: "本地复用",
    startupProfilePackaged: "打包",
    saveStartupProfile: "保存配置",
    desktopStartupProfile: "桌面启动配置",
    actionDesktopStartupProfile: "打开启动配置选择器",
    startupProfileUnavailable: "启动配置选择器仅在 Tauri 桌面应用中可用。",
    startupProfileStatus: "配置：{preferred} / 当前：{current}",
    startupProfileLoaded: "启动配置\n偏好：{preferred}\n当前：{current}\n服务来源：{serviceSource}\nNode 来源：{nodeSource}",
    startupProfileSaved: "启动配置已保存。将在下一次桌面托管启动时生效。",
    serviceBrowser: "服务：浏览器",
    serviceRunning: "服务：运行中",
    serviceReused: "服务：复用",
    serviceStopped: "服务：未监听",
    serviceFailed: "服务：失败",
    debugBundleCancelled: "已取消导出调试包。",
    debugBundleDownloaded: "调试包已导出\n{fileName}\n操作：{operationId}\n诊断包可能包含本机路径和运维元数据。",
    debugBundleSaved: "调试包已保存\n{fileName}\n{bytes} 字节\n操作：{operationId}\n诊断包可能包含本机路径和运维元数据。",
    clear: "清理",
    commandPalette: "命令面板",
    commandPlaceholder: "输入命令...",
    noCommands: "没有匹配的命令。",
    noPostSelected: "未选择文章",
    clean: "已保存",
    unsaved: "未保存",
    prepareRequired: "需要检查",
    prepareCurrent: "检查有效",
    policyUnknown: "未知",
    idle: "空闲",
    noOperation: "无操作",
    ok: "正常",
    editorViewMode: "编辑器视图模式",
    operationsPanel: "操作面板",
    close: "关闭",
    cancel: "取消",
    confirm: "确认",
    confirmOperation: "确认操作",
    copied: "已复制{label}。",
    selectPostFirst: "请先选择一篇文章。",
    saveBeforePrepare: "请先保存再检查。发布检查不会包含本地未保存编辑。",
    prepareBeforeReview: "请先对已保存文章运行检查，再打开发布审阅。",
    enterExternalUrl: "请先输入外部素材 URL。",
    insertedExternal: "已插入外部{kind}：{url}",
    insertedMedia: "已插入媒体 {filename}",
    markdownImageUrl: "图片 URL",
    markdownLinkUrl: "链接 URL",
    markdownLinkLabel: "链接文字",
    actionOpenEditor: "在编辑器中打开",
    actionPreviewMode: "打开预览模式",
    actionSplitMode: "打开分屏模式",
    actionCopyCid: "复制 cid",
    actionCopySlug: "复制别名",
    actionCopyUrl: "复制 URL",
    actionCopyMarkdown: "复制 Markdown",
    actionNoSelection: "请先选中文字。",
    actionRefresh: "刷新",
    actionPrepare: "发布前检查",
    actionPublishReview: "打开发布审阅",
    actionInsertMedia: "插入媒体",
    actionInsertImage: "插入图片",
    actionInsertLink: "插入链接",
    actionBold: "加粗",
    actionItalic: "斜体",
    actionInlineCode: "行内代码",
    actionHeading: "标题",
    actionQuote: "引用",
    actionBulletList: "无序列表",
    actionNumberedList: "有序列表",
    actionDivider: "分割线",
    actionCopySelection: "复制选区",
    actionWordCount: "字数统计",
    actionToggleFocus: "切换专注模式",
    actionToggleInspector: "切换检查器",
    actionSave: "保存当前文章",
    groupFile: "文件",
    groupEditor: "编辑",
    groupView: "视图",
    groupReview: "审阅",
    groupOperations: "操作",
    wordCountResult: "{chars} 个字符，{words} 个词",
    nativeCommandUnknown: "当前上下文不可执行这个原生命令：{id}"
  }
};

elements.host.addEventListener("change", () => {
  state.host = elements.host.value.trim() || "typecho-host";
  refreshAll();
});
elements.language.addEventListener("change", () => setLocale(elements.language.value));
elements.refresh.addEventListener("click", () => refreshAll(true));
elements.runDiagnostics.addEventListener("click", () => withBusy(elements.runDiagnostics, runDiagnostics));
elements.desktopServiceStatusButton.addEventListener("click", () => withBusy(elements.desktopServiceStatusButton, showDesktopServiceStatus));
elements.exportDebug.addEventListener("click", () => withBusy(elements.exportDebug, exportDebugBundle));
elements.saveStartupProfile.addEventListener("click", () => withBusy(elements.saveStartupProfile, saveStartupProfile));
elements.startupProfileMode.addEventListener("change", renderStartupProfileStatus);
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
elements.importMarkdown.addEventListener("click", () => withBusy(elements.importMarkdown, () => importEditorText("markdown")));
elements.exportMarkdown.addEventListener("click", () => withBusy(elements.exportMarkdown, () => exportEditorText("markdown")));
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
elements.markdown.addEventListener("contextmenu", (event) => {
  event.preventDefault();
  openActionMenu(editorActions(), event.clientX, event.clientY);
});
elements.commandOverlay.addEventListener("click", (event) => {
  if (event.target === elements.commandOverlay) {
    closeCommandPalette();
  }
});
elements.commandSearch.addEventListener("input", () => {
  state.commandQuery = elements.commandSearch.value;
  renderCommandPalette();
});
elements.commandSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    const first = elements.commandList.querySelector("[data-command-id]");
    if (first) {
      event.preventDefault();
      runCommand(first.dataset.commandId);
    }
  }
});
elements.commandList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-command-id]");
  if (!button) {
    return;
  }
  runCommand(button.dataset.commandId);
});
setupResizeHandle(elements.postsResize, "postListWidth", storageKeys.postListWidth, 220, 520);
setupResizeHandle(elements.inspectorResize, "inspectorWidth", storageKeys.inspectorWidth, 240, 520);
installDesktopCommandBridge();
void loadDesktopLayoutPrefs();
void loadStartupProfile();

refreshAll();
renderStatusBar();
applyLocale();
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
  scheduleDesktopLayoutPrefsSave();
}

function toggleInspector() {
  state.inspectorCollapsed = !state.inspectorCollapsed;
  applyEditorLayout();
  scheduleDesktopLayoutPrefsSave();
}

function toggleSidebar() {
  if (!state.focusMode) {
    state.sidebarBeforeFocus = state.sidebarCollapsed;
    state.focusMode = true;
    state.sidebarCollapsed = true;
    state.inspectorCollapsed = true;
  } else {
    state.focusMode = false;
    state.sidebarCollapsed = state.sidebarBeforeFocus;
  }
  applyEditorLayout();
  scheduleDesktopLayoutPrefsSave();
}

function applyEditorLayout() {
  if (!elements.editorPanel) {
    return;
  }

  elements.app?.classList.toggle("focus-mode", state.focusMode);
  elements.workspace?.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
  elements.editorPanel.classList.toggle("view-write", state.viewMode === "write");
  elements.editorPanel.classList.toggle("view-split", state.viewMode === "split");
  elements.editorPanel.classList.toggle("view-preview", state.viewMode === "preview");
  elements.editorPanel.classList.toggle("inspector-collapsed", state.inspectorCollapsed);
  elements.workspace?.style.setProperty("--post-list-width", `${state.layout.postListWidth}px`);
  elements.editorPanel.style.setProperty("--inspector-width", `${state.layout.inspectorWidth}px`);

  for (const button of elements.viewButtons) {
    const active = button.dataset.viewMode === state.viewMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }

  elements.toggleSidebar.classList.toggle("active", state.focusMode);
  elements.toggleSidebar.setAttribute("aria-pressed", String(state.focusMode));
  elements.toggleSidebar.textContent = state.focusMode ? t("exitFocus") : t("focus");

  elements.toggleInspector.classList.toggle("active", !state.inspectorCollapsed);
  elements.toggleInspector.setAttribute("aria-pressed", String(!state.inspectorCollapsed));
  elements.toggleInspector.textContent = state.inspectorCollapsed ? t("showInspector") : t("hideInspector");
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

function setLocale(locale) {
  state.locale = translations[locale] ? locale : "en";
  localStorage.setItem(storageKeys.locale, state.locale);
  applyLocale();
  scheduleDesktopLayoutPrefsSave();
}

function applyLocale() {
  document.documentElement.lang = state.locale;
  elements.language.value = state.locale;
  document.querySelector("h1").textContent = t("workbench");
  elements.languageLabel.textContent = t("language");
  document.querySelector(".field span").textContent = t("host");
  if (!state.status.siteTitle && elements.site.textContent.trim() === "Connecting...") {
    elements.site.textContent = t("connecting");
  }

  setText(elements.refresh, "refresh");
  setText(elements.newDraft, "newDraft");
  setText(elements.insertImageUrl, "image");
  setText(elements.insertFileUrl, "file");
  setText(elements.viewButtons.find((button) => button.dataset.viewMode === "write"), "write");
  setText(elements.viewButtons.find((button) => button.dataset.viewMode === "split"), "split");
  setText(elements.viewButtons.find((button) => button.dataset.viewMode === "preview"), "preview");
  setText(elements.importMarkdown, "importMarkdown");
  setText(elements.exportMarkdown, "exportMarkdown");
  setText(elements.previewDiff, "diff");
  setText(elements.save, "save");
  setText(elements.prepare, "prepare");
  setText(elements.publish, "publish");
  setText(elements.runDiagnostics, "runChecks");
  setText(elements.desktopServiceStatusButton, "desktopServiceStatus");
  setText(elements.exportDebug, "debugBundle");
  setText(elements.startupProfileLabel, "startupProfile");
  setText(elements.saveStartupProfile, "saveStartupProfile");
  setText(elements.loadCache, "status");
  setText(elements.clearCache, "clear");
  setText(elements.loadPolicy, "status");
  setText(elements.confirmClose, "close");
  setText(elements.confirmCancel, "cancel");
  setText(elements.confirmRun, "confirm");

  document.querySelector(".external-box .section-title").textContent = t("externalAsset");
  document.querySelector(".snapshots .section-title").textContent = t("snapshots");
  document.querySelector(".media .section-title").textContent = t("media");
  document.querySelector(".inspector-section .eyebrow").textContent = t("publishInfo");
  document.querySelector(".operations-head .eyebrow").textContent = t("operations");
  document.querySelector(".operations-head h2").textContent = t("diagnosticsHistory");
  elements.commandOverlay.querySelector(".eyebrow").textContent = t("commandPalette");
  const metaLabels = elements.inspector.querySelectorAll(".meta-grid label span");
  [t("slug"), t("status"), t("categories"), t("tags")].forEach((label, index) => {
    if (metaLabels[index]) {
      metaLabels[index].textContent = label;
    }
  });
  const opsLabels = {
    diagnostics: "diagnostics",
    cache: "cache",
    policy: "policy",
    audit: "audit",
    requests: "requests"
  };
  for (const tab of elements.operationTabs) {
    tab.textContent = t(opsLabels[tab.dataset.opsTab] || tab.dataset.opsTab);
  }

  elements.search.placeholder = t("searchPosts");
  elements.title.placeholder = t("title");
  elements.categories.placeholder = t("commaSeparated");
  elements.tags.placeholder = t("commaSeparated");
  elements.commandSearch.placeholder = t("commandPlaceholder");

  const statusOptions = [
    ["", "all"],
    ["draft", "draft"],
    ["publish", "published"],
    ["hidden", "hidden"],
    ["waiting", "waiting"]
  ];
  updateSelectLabels(elements.status, statusOptions);
  updateSelectLabels(elements.postStatus, statusOptions.slice(1));
  updateSelectLabels(elements.startupProfileMode, [
    ["auto", "startupProfileAuto"],
    ["dev", "startupProfileDev"],
    ["local", "startupProfileLocal"],
    ["packaged", "startupProfilePackaged"]
  ]);
  renderStartupProfileStatus();

  for (const button of elements.activityButtons) {
    const label = activityLabel(button.dataset.activity);
    button.title = label;
    button.setAttribute("aria-label", label);
  }
  document.querySelector(".view-controls")?.setAttribute("aria-label", t("editorViewMode"));
  document.querySelector(".operations-panel")?.setAttribute("aria-label", t("operationsPanel"));

  applyEditorLayout();
  renderStatusBar();
  renderInspector();
}

function activityLabel(activity) {
  const labels = {
    content: "Content",
    review: "Review",
    assets: "Assets",
    operations: t("operations"),
    site: "Site"
  };
  if (state.locale === "zh-CN") {
    return {
      content: "内容",
      review: "审阅",
      assets: "素材",
      operations: "操作",
      site: "站点"
    }[activity] || activity;
  }
  return labels[activity] || activity;
}

function setText(element, key) {
  if (element) {
    element.textContent = t(key);
  }
}

function updateSelectLabels(select, options) {
  for (const [value, key] of options) {
    const option = Array.from(select.options).find((candidate) => candidate.value === value);
    if (option) {
      option.textContent = t(key);
    }
  }
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
  const data = await backendData(workbenchBackend.site.health({ host: state.host, refresh: forceRefresh }));
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
  const data = await backendData(workbenchBackend.diagnostics.run({ host: state.host }));
  elements.diagnostics.innerHTML = renderDiagnostics(data);
  log(`${data.ok ? "Diagnostics passed" : "Diagnostics found issues"}\nOperation: ${data.operationId}`);
}

async function loadCacheStatus() {
  const data = await backendData(workbenchBackend.cache.status({ host: state.host }));
  elements.cache.innerHTML = renderCacheStatus(data);
  log(`Cache status loaded · ${data.totalEntries} entries`);
}

async function loadPolicyStatus() {
  const data = await backendData(workbenchBackend.policy.list());
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

  const data = await backendData(workbenchBackend.cache.clear({ host: state.host }));
  elements.cache.innerHTML = `<div class="diag-summary diag-ok">Cleared ${escapeHtml(data.host)} · ${escapeHtml(data.clearedAt)}</div>`;
  log(`Cache cleared for ${data.host}`);
}

async function exportDebugBundle() {
  const data = await backendData(workbenchBackend.debug.bundle({ host: state.host }));
  const filename = sanitizedDebugBundleFilename(data);
  const contents = JSON.stringify(data, null, 2);
  if (workbenchBackend.desktop?.saveExportFile) {
    const saved = await workbenchBackend.desktop.saveExportFile({
      kind: "debugBundle",
      suggestedFileName: filename,
      title: "Export Debug Bundle / 导出调试包",
      contents
    });
    if (saved?.cancelled) {
      log(t("debugBundleCancelled"));
      return;
    }
    log(formatMessage("debugBundleSaved", {
      fileName: saved.fileName || filename,
      bytes: saved.bytesWritten || contents.length,
      operationId: data.operationId
    }));
    return;
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
  log(formatMessage("debugBundleDownloaded", {
    fileName: filename,
    operationId: data.operationId
  }));
}

function sanitizedDebugBundleFilename(data) {
  const host = String(data.host || state.host || "target")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "target";
  const generatedAt = String(data.generatedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  return `typecho-debug-${host}-${generatedAt}.json`;
}

async function importEditorText(kind) {
  if (!workbenchBackend.desktop?.importEditorText) {
    log(t("editorImportDesktopOnly"));
    return;
  }

  const imported = await workbenchBackend.desktop.importEditorText({
    kind,
    title: importDialogTitle(kind)
  });
  if (imported?.cancelled) {
    log(t("editorImportCancelled"));
    return;
  }

  const text = String(imported?.text ?? "");
  elements.markdown.value = text;
  markDirty();
  renderPreview();
  log(formatMessage("editorImportLoaded", {
    chars: text.length,
    bytes: imported?.bytesRead ?? byteLength(text)
  }));
}

async function exportEditorText(kind) {
  const text = elements.markdown.value || "";
  const bytes = byteLength(text);
  if (bytes > maxEditorTextBytes) {
    const error = new Error("Editor text is too large to export.");
    error.code = "EDITOR_TEXT_TOO_LARGE";
    throw error;
  }

  const filename = editorTextFilename(kind);
  if (workbenchBackend.desktop?.saveEditorText) {
    const saved = await workbenchBackend.desktop.saveEditorText({
      kind,
      suggestedFileName: filename,
      title: exportDialogTitle(kind),
      text
    });
    if (saved?.cancelled) {
      log(t("editorExportCancelled"));
      return;
    }
    log(formatMessage("editorExportSaved", {
      bytes: saved?.bytesWritten ?? bytes
    }));
    return;
  }

  downloadTextFile(filename, text, kind);
  log(formatMessage("editorExportDownloaded", { bytes }));
}

function importDialogTitle(kind) {
  return kind === "plainText"
    ? "Import TXT To Editor / 导入 TXT 到编辑器"
    : "Import Markdown To Editor / 导入 Markdown 到编辑器";
}

function exportDialogTitle(kind) {
  return kind === "plainText"
    ? "Export Editor TXT / 导出编辑器 TXT"
    : "Export Editor Markdown / 导出编辑器 Markdown";
}

function editorTextFilename(kind) {
  const source = state.selected?.slug
    || elements.slug.value
    || state.selected?.title
    || elements.title.value
    || (state.selected?.cid ? `post-${state.selected.cid}` : timestampedDraftName());
  const extension = kind === "plainText" ? ".txt" : ".md";
  const cleaned = String(source)
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.\.+/g, ".")
    .slice(0, 80) || "typecho-draft";
  return cleaned.toLowerCase().endsWith(extension) ? cleaned : `${cleaned}${extension}`;
}

function timestampedDraftName() {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return `typecho-draft-${stamp}`;
}

function downloadTextFile(filename, text, kind) {
  const blob = new Blob([text], {
    type: kind === "plainText" ? "text/plain;charset=utf-8" : "text/markdown;charset=utf-8"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function byteLength(text) {
  return new TextEncoder().encode(text).length;
}

async function loadStartupProfile({ logStatus = false } = {}) {
  if (!workbenchBackend.desktop?.getStartupProfile) {
    elements.startupProfileMode.disabled = true;
    elements.saveStartupProfile.disabled = true;
    renderStartupProfileStatus();
    if (logStatus) {
      log(t("startupProfileUnavailable"));
    }
    return null;
  }

  const profile = await workbenchBackend.desktop.getStartupProfile();
  applyStartupProfile(profile);
  if (logStatus) {
    log(formatMessage("startupProfileLoaded", {
      preferred: startupProfileModeLabel(state.startupProfile.preferredProfileMode),
      current: startupProfileModeLabel(state.startupProfile.currentProfileMode),
      serviceSource: state.startupProfile.serviceSource || "unknown",
      nodeSource: state.startupProfile.nodeSource || "unknown"
    }));
  }
  return profile;
}

async function saveStartupProfile() {
  if (!workbenchBackend.desktop?.saveStartupProfile) {
    log(t("startupProfileUnavailable"));
    return;
  }

  const profileMode = normalizeStartupProfileMode(elements.startupProfileMode.value);
  const profile = await workbenchBackend.desktop.saveStartupProfile({ profileMode });
  applyStartupProfile(profile);
  log(t("startupProfileSaved"));
}

async function showDesktopStartupProfile() {
  switchActivity("operations");
  switchOperationsTab("diagnostics");
  await loadStartupProfile({ logStatus: true });
}

function applyStartupProfile(profile) {
  const preferredProfileMode = normalizeStartupProfileMode(
    profile?.preferredProfileMode || profile?.configuredProfileMode || profile?.profileMode
  );
  state.startupProfile = {
    preferredProfileMode,
    configuredProfileMode: normalizeStartupProfileMode(profile?.configuredProfileMode || preferredProfileMode),
    effectiveProfileMode: normalizeStartupProfileMode(profile?.effectiveProfileMode || profile?.currentProfileMode, "unknown"),
    currentProfileMode: normalizeStartupProfileMode(profile?.currentProfileMode || profile?.effectiveProfileMode, "unknown"),
    serviceSource: profile?.serviceSource || "unknown",
    nodeSource: profile?.nodeSource || "unknown"
  };
  elements.startupProfileMode.disabled = false;
  elements.saveStartupProfile.disabled = false;
  elements.startupProfileMode.value = preferredProfileMode;
  renderStartupProfileStatus();
}

function renderStartupProfileStatus() {
  const preferred = normalizeStartupProfileMode(elements.startupProfileMode.value || state.startupProfile.preferredProfileMode);
  const current = state.startupProfile.currentProfileMode || state.startupProfile.effectiveProfileMode || "unknown";
  elements.startupProfileStatus.textContent = formatMessage("startupProfileStatus", {
    preferred: startupProfileModeLabel(preferred),
    current: startupProfileModeLabel(current)
  });
}

function normalizeStartupProfileMode(value, fallback = "auto") {
  return ["auto", "dev", "local", "packaged"].includes(value) ? value : fallback;
}

function startupProfileModeLabel(value) {
  const key = {
    auto: "startupProfileAuto",
    dev: "startupProfileDev",
    local: "startupProfileLocal",
    packaged: "startupProfilePackaged"
  }[value];
  return key ? t(key) : value || "unknown";
}

async function showDesktopServiceStatus() {
  if (!workbenchBackend.desktop?.getServiceStatus) {
    state.status.serviceLabel = t("serviceBrowser");
    renderStatusBar();
    log(t("desktopServiceUnavailable"));
    return;
  }

  const status = await workbenchBackend.desktop.getServiceStatus();
  applyStartupProfile(status);
  state.status.serviceLabel = desktopServiceLabel(status);
  renderStatusBar();
  log(formatMessage("desktopServiceLoaded", {
    url: status.workbenchUrl || "http://127.0.0.1:4783",
    port: status.port ?? "unknown",
    listening: String(Boolean(status.listening)),
    preferredProfileMode: startupProfileModeLabel(status.preferredProfileMode || status.configuredProfileMode || "auto"),
    currentProfileMode: startupProfileModeLabel(status.currentProfileMode || status.effectiveProfileMode || status.profileMode || "unknown"),
    serviceSource: status.serviceSource || "unknown",
    nodeSource: status.nodeSource || "unknown",
    hostAliasConfigured: String(Boolean(status.hostAliasConfigured)),
    publishPolicy: status.publishPolicy || "manual_approval",
    startupMode: status.startupMode || "unknown",
    ownedByDesktop: String(Boolean(status.ownedByDesktop)),
    childExited: String(Boolean(status.childExited)),
    exitCode: status.exitCode ?? "unknown",
    unexpectedExit: String(Boolean(status.unexpectedExit)),
    logLocationLabel: status.logLocationLabel || "user log directory",
    logLabel: status.logLabel || "service.log",
    recentCrashSummary: status.recentCrashSummary ? `\n${status.recentCrashSummary}` : "",
    lastError: status.lastError ? `\nError: ${status.lastError}` : ""
  }));
}

function desktopServiceLabel(status) {
  if (status?.unexpectedExit || status?.lastError || status?.startupMode === "failed") {
    return t("serviceFailed");
  }
  if (!status?.listening) {
    return t("serviceStopped");
  }
  if (status?.startupMode === "reused") {
    return t("serviceReused");
  }
  return t("serviceRunning");
}

async function loadPosts({ forceRefresh = false } = {}) {
  const query = {
    host: state.host,
    limit: 30,
    includeHidden: true,
    refresh: forceRefresh
  };
  if (elements.search.value.trim()) {
    query.search = elements.search.value.trim();
  }
  if (elements.status.value) {
    query.status = elements.status.value;
  }

  const data = await backendData(workbenchBackend.posts.list(query));
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
  const data = await backendData(workbenchBackend.posts.get({ host: state.host, cid, refresh: forceRefresh }));
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
  const data = await backendData(workbenchBackend.posts.createDraft({
    host: state.host,
    title,
    markdown: "# New Typecho MCP Draft\n\nStart writing here.",
    categories: [],
    tags: ["typecho-mcp"]
  }));
  await loadPosts();
  await selectPost(data.post.cid);
  log(`Draft created #${data.post.cid}`);
}

async function savePost() {
  if (!state.selected?.cid) {
    await createDraft();
    return;
  }

  const data = await backendData(workbenchBackend.posts.update({ cid: state.selected.cid, patch: currentPatch() }));
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

  const data = await backendData(workbenchBackend.posts.previewUpdate({
    host: state.host,
    cid: state.selected.cid,
    patch: currentPatch()
  }));
  elements.publishReport.innerHTML = renderDiffReport(data);
  log(data.changed ? "Diff preview ready." : "No changes detected.");
}

async function publishPost() {
  if (!state.selected?.cid) {
    log(t("selectPostFirst"));
    return;
  }
  if (state.dirty || state.preparedCid !== state.selected.cid) {
    log(t("prepareBeforeReview"));
    return;
  }

  openPublishReview();
}

async function confirmPublish(cid) {
  const data = await backendData(workbenchBackend.posts.publish({
    host: state.host,
    cid,
    confirm: true,
    client: "web-console"
  }));
  await loadPosts();
  await loadSnapshots();
  await selectPost(data.post.cid);
  renderStatusBar();
  log(`Published #${data.post.cid}\nSnapshot: ${data.snapshotId}`);
}

async function preparePublish() {
  if (!state.selected?.cid) {
    log(t("selectPostFirst"));
    return;
  }
  if (state.dirty) {
    state.preparedCid = null;
    log(t("saveBeforePrepare"));
    return;
  }

  const data = await backendData(workbenchBackend.posts.preparePublish({ host: state.host, cid: state.selected.cid }));
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
  const data = await backendData(workbenchBackend.snapshots.list());
  elements.snapshots.innerHTML = data.snapshots.slice(0, 8).map(renderSnapshot).join("");
  bindActionMenus(elements.snapshots, ".snapshot", snapshotActions);
}

async function loadMedia({ forceRefresh = false } = {}) {
  const data = await backendData(workbenchBackend.media.list({ host: state.host, limit: 8, refresh: forceRefresh }));
  elements.media.innerHTML = data.media.map(renderMedia).join("");
  bindActionMenus(elements.media, ".snapshot", mediaActions);
}

function prefetchPostDetails(posts, { forceRefresh = false } = {}) {
  const host = state.host;
  for (const post of posts) {
    if (!post?.cid) {
      continue;
    }

    backendData(workbenchBackend.posts.get({ host, cid: post.cid, refresh: forceRefresh })).catch(() => {});
  }
}

async function loadAudit() {
  const data = await backendData(workbenchBackend.audit.list({ limit: 8 }));
  elements.audit.innerHTML = data.events.map(renderAudit).join("");
  bindActionMenus(elements.audit, ".snapshot", auditActions);
}

async function loadRequests() {
  const data = await backendData(workbenchBackend.requests.list({ limit: 8 }));
  elements.requests.innerHTML = data.requests.map(renderRequest).join("");
  bindActionMenus(elements.requests, ".snapshot", requestActions);
}

async function insertExternalAsset(kind) {
  const url = elements.externalUrl.value.trim();
  if (!url) {
    log(t("enterExternalUrl"));
    return;
  }

  const data = await backendData(workbenchBackend.media.registerExternalUrl({ url, kind }));
  elements.externalUrl.value = "";
  insertMarkdown(data.markdown, formatMessage("insertedExternal", { kind: t(kind), url }));
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
  if (!elements.inspectorContext) {
    return;
  }
  if (!state.selected?.cid) {
    elements.inspectorContext.innerHTML = `
      <p class="eyebrow">${escapeHtml(t("inspector"))}</p>
      <div class="muted">${escapeHtml(t("selectPostContext"))}</div>
    `;
    return;
  }

  const post = state.selected;
  const prepareLabel = state.preparedCid === post.cid && !state.dirty ? "current" : "required";
  const relatedSnapshots = Array.from(elements.snapshots.querySelectorAll(".snapshot"))
    .filter((item) => item.dataset.entity === String(post.cid))
    .slice(0, 3);

  elements.inspectorContext.innerHTML = `
    <p class="eyebrow">${escapeHtml(t("inspector"))}</p>
    <div class="inspector-card">
      <strong>${escapeHtml(post.title || "(untitled)")}</strong>
      <div>#${escapeHtml(post.cid)} · ${escapeHtml(post.status || "")}</div>
      <div>${escapeHtml(post.slug || "no-slug")}</div>
    </div>
    <dl class="inspector-facts">
      <div><dt>${escapeHtml(t("status"))}</dt><dd>${state.dirty ? escapeHtml(t("unsaved")) : escapeHtml(t("clean"))}</dd></div>
      <div><dt>${escapeHtml(t("prepare"))}</dt><dd>${escapeHtml(prepareLabel === "current" ? t("prepareCurrent") : t("prepareRequired"))}</dd></div>
      <div><dt>${escapeHtml(t("policy"))}</dt><dd>${escapeHtml(state.status.policyLabel)}</dd></div>
      <div><dt>${escapeHtml(t("categories"))}</dt><dd>${escapeHtml((post.categories || []).join(", ") || "none")}</dd></div>
      <div><dt>${escapeHtml(t("tags"))}</dt><dd>${escapeHtml((post.tags || []).join(", ") || "none")}</dd></div>
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
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    openCommandPalette();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "b" && document.activeElement === elements.markdown) {
    event.preventDefault();
    wrapSelection("**", "**", state.locale === "zh-CN" ? "加粗文本" : "bold text");
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "i" && document.activeElement === elements.markdown) {
    event.preventDefault();
    wrapSelection("*", "*", state.locale === "zh-CN" ? "斜体文本" : "italic text");
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    withBusy(elements.save, savePost);
    return;
  }
  if (event.key === "Escape") {
    closeActionMenu();
    if (!elements.commandOverlay.hidden) {
      closeCommandPalette();
      return;
    }
    if (!elements.confirmOverlay.hidden) {
      closeConfirmSheet();
      return;
    }
    if (state.focusMode) {
      toggleSidebar();
    }
  }
});

function openCommandPalette() {
  state.commandQuery = "";
  elements.commandSearch.value = "";
  elements.commandOverlay.hidden = false;
  renderCommandPalette();
  elements.commandSearch.focus();
}

function closeCommandPalette() {
  elements.commandOverlay.hidden = true;
}

function renderCommandPalette() {
  const query = state.commandQuery.trim().toLowerCase();
  const commands = commandActions().filter((command) => {
    const haystack = [command.label, command.id, command.group, command.shortcut].join(" ").toLowerCase();
    return haystack.includes(query);
  });
  elements.commandList.innerHTML = commands.length
    ? commands
        .map((command, index) => `
          <button class="command-item ${index === 0 ? "active" : ""}" type="button" data-command-id="${escapeHtml(command.id)}" role="option">
            <span>${escapeHtml(command.label)}</span>
            <small>
              ${command.group ? `<span>${escapeHtml(command.group)}</span>` : ""}
              <span>${escapeHtml(command.shortcut || command.id)}</span>
            </small>
          </button>
        `)
        .join("")
    : `<div class="muted">${escapeHtml(t("noCommands"))}</div>`;
}

function runCommand(id) {
  const command = commandActions().find((candidate) => candidate.id === id);
  closeCommandPalette();
  runAction(command);
}

function runDesktopCommand(id) {
  const command = commandActions().find((candidate) => candidate.id === id);
  if (!command) {
    log(formatMessage("nativeCommandUnknown", { id }));
    return false;
  }
  runAction(command);
  return true;
}

function installDesktopCommandBridge() {
  window.TypechoMcpWorkbench = {
    ...(window.TypechoMcpWorkbench || {}),
    runCommand: runDesktopCommand,
    listCommands: () => commandActions().map(({ id, label, group, shortcut }) => ({ id, label, group, shortcut }))
  };

  window.addEventListener("typecho-mcp:run-command", (event) => {
    const id = event.detail?.id || event.detail?.commandId || event.detail;
    if (typeof id === "string") {
      runDesktopCommand(id);
    }
  });

  const listen = globalThis.__TAURI__?.event?.listen || globalThis.__TAURI__?.core?.listen;
  if (typeof listen !== "function") {
    return;
  }

  Promise.resolve(listen("typecho-mcp:native-command", (event) => {
    const id = event?.payload?.commandId
      || event?.payload?.command_id
      || event?.payload?.id
      || event?.commandId
      || event?.id;
    if (typeof id === "string") {
      runDesktopCommand(id);
    }
  })).catch((error) => log(formatError(error)));
}

async function loadDesktopLayoutPrefs() {
  const prefs = await workbenchBackend.desktop?.getLayoutPrefs?.().catch((error) => {
    log(formatError(error));
    return null;
  });
  if (!prefs || typeof prefs !== "object") {
    return;
  }

  applyDesktopLayoutPrefs(prefs);
}

function applyDesktopLayoutPrefs(prefs) {
  if (prefs.locale && translations[prefs.locale]) {
    state.locale = prefs.locale;
    localStorage.setItem(storageKeys.locale, state.locale);
    applyLocale();
  }

  if (["write", "split", "preview"].includes(prefs.viewMode)) {
    state.viewMode = prefs.viewMode;
  }
  if (typeof prefs.sidebarCollapsed === "boolean") {
    state.sidebarCollapsed = prefs.sidebarCollapsed;
    state.sidebarBeforeFocus = prefs.sidebarCollapsed;
    state.focusMode = false;
  }
  if (typeof prefs.inspectorCollapsed === "boolean") {
    state.inspectorCollapsed = prefs.inspectorCollapsed;
  }

  const postListWidth = Number(prefs.postListWidth);
  if (Number.isFinite(postListWidth)) {
    state.layout.postListWidth = clamp(postListWidth, 220, 520);
    localStorage.setItem(storageKeys.postListWidth, String(state.layout.postListWidth));
  }

  const inspectorWidth = Number(prefs.inspectorWidth);
  if (Number.isFinite(inspectorWidth)) {
    state.layout.inspectorWidth = clamp(inspectorWidth, 240, 520);
    localStorage.setItem(storageKeys.inspectorWidth, String(state.layout.inspectorWidth));
  }

  applyEditorLayout();
  renderStatusBar();
}

const scheduleDesktopLayoutPrefsSave = debounce(() => {
  void saveDesktopLayoutPrefs();
}, 500);

async function saveDesktopLayoutPrefs() {
  if (!workbenchBackend.desktop?.saveLayoutPrefs) {
    return;
  }

  try {
    await workbenchBackend.desktop.saveLayoutPrefs({
      schemaVersion: 1,
      locale: state.locale,
      viewMode: state.viewMode,
      sidebarCollapsed: state.sidebarCollapsed,
      inspectorCollapsed: state.inspectorCollapsed,
      postListWidth: state.layout.postListWidth,
      inspectorWidth: state.layout.inspectorWidth
    });
  } catch (error) {
    log(formatError(error));
  }
}

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
    action("open", t("actionOpenEditor"), () => selectPost(cid)),
    action("preview-mode", t("actionPreviewMode"), async () => {
      await selectPost(cid);
      setViewMode("preview");
      elements.preview.scrollIntoView({ block: "nearest" });
      log(`Preview mode opened for #${cid}.`);
    }),
    action("split-mode", t("actionSplitMode"), async () => {
      await selectPost(cid);
      setViewMode("split");
      elements.markdown.scrollIntoView({ block: "nearest" });
      log(`Split mode opened for #${cid}.`);
    }),
    action("copy-cid", t("actionCopyCid"), () => copyText("cid", cid)),
    action("copy-slug", t("actionCopySlug"), () => copyText("slug", slug), !slug && "No slug available."),
    action("copy-url", t("actionCopyUrl"), () => copyText("post URL", url), !url && "No post URL available."),
    action(
      "copy-markdown-link",
      "Copy Markdown link",
      () => copyText("Markdown link", `[${title}](${url})`),
      !url && "No post URL available."
    ),
    action("refresh-post", t("actionRefresh"), () => selectPost(cid, { forceRefresh: true })),
    action("diff", "Open save diff", async () => {
      if (state.selected?.cid !== cid) {
        await selectPost(cid);
      }
      await previewDiff();
    }),
    action("prepare", t("actionPrepare"), async () => {
      if (state.selected?.cid !== cid) {
        await selectPost(cid);
      }
      await preparePublish();
    }),
    action(
      "review-publish",
      t("actionPublishReview"),
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
    action("insert", t("actionInsertMedia"), () => insertMarkdown(markdown, formatMessage("insertedMedia", { filename }))),
    action("preview", "Open preview", () => openUrl(url), !url && "No media URL available."),
    action("copy-url", t("actionCopyUrl"), () => copyText("media URL", url), !url && "No media URL available."),
    action("copy-markdown", t("actionCopyMarkdown"), () => copyText("media Markdown", markdown), !markdown && "No Markdown available."),
    action("refresh", t("actionRefresh"), () => loadMedia({ forceRefresh: true }))
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

function action(id, label, run, disabled = false, options = {}) {
  return { id, label, run, disabled, ...options };
}

function editorMarkdownActions() {
  return [
    action("bold", t("actionBold"), () => wrapSelection("**", "**", state.locale === "zh-CN" ? "加粗文本" : "bold text"), false, {
      group: t("groupEditor"),
      shortcut: "Cmd/Ctrl+B"
    }),
    action("italic", t("actionItalic"), () => wrapSelection("*", "*", state.locale === "zh-CN" ? "斜体文本" : "italic text"), false, {
      group: t("groupEditor")
    }),
    action("code", t("actionInlineCode"), () => wrapSelection("`", "`", "code"), false, {
      group: t("groupEditor")
    }),
    action("heading", t("actionHeading"), () => prefixSelectedLines("## ", t("actionHeading")), false, {
      group: t("groupEditor")
    }),
    action("quote", t("actionQuote"), () => prefixSelectedLines("> ", t("actionQuote")), false, {
      group: t("groupEditor")
    }),
    action("bullet-list", t("actionBulletList"), () => prefixSelectedLines("- ", t("actionBulletList")), false, {
      group: t("groupEditor")
    }),
    action("numbered-list", t("actionNumberedList"), () => prefixSelectedLines((index) => `${index + 1}. `, t("actionNumberedList")), false, {
      group: t("groupEditor")
    }),
    action("divider", t("actionDivider"), () => insertMarkdown("---", t("actionDivider")), false, {
      group: t("groupEditor")
    }),
    action("image", t("actionInsertImage"), insertImageFromPrompt, false, {
      group: t("groupEditor")
    }),
    action("link", t("actionInsertLink"), insertLinkFromPrompt, false, {
      group: t("groupEditor")
    }),
    action("copy-selection", t("actionCopySelection"), copySelectedMarkdown, () => (!selectedMarkdownText() ? t("actionNoSelection") : false), {
      group: t("groupEditor")
    }),
    action("word-count", t("actionWordCount"), showWordCount, false, {
      group: t("groupEditor")
    })
  ];
}

function editorActions() {
  return [
    ...editorMarkdownActions(),
    action("importMarkdownToEditor", t("actionImportMarkdownToEditor"), () => importEditorText("markdown"), false, {
      group: t("groupFile")
    }),
    action("importTxtToEditor", t("actionImportTxtToEditor"), () => importEditorText("plainText"), false, {
      group: t("groupFile")
    }),
    action("exportEditorMarkdown", t("actionExportEditorMarkdown"), () => exportEditorText("markdown"), false, {
      group: t("groupFile")
    }),
    action("exportEditorTxt", t("actionExportEditorTxt"), () => exportEditorText("plainText"), false, {
      group: t("groupFile")
    }),
    action("save", t("actionSave"), () => withBusy(elements.save, savePost), false, {
      group: t("groupFile"),
      shortcut: "Cmd/Ctrl+S"
    }),
    action("split", t("split"), () => setViewMode("split"), false, { group: t("groupView") }),
    action("preview", t("preview"), () => setViewMode("preview"), false, { group: t("groupView") }),
    action("focus", t("actionToggleFocus"), toggleSidebar, false, { group: t("groupView") })
  ];
}

function commandActions() {
  return [
    action("newDraft", t("newDraft"), () => withBusy(elements.newDraft, createDraft), false, { group: t("groupFile") }),
    action("importMarkdownToEditor", t("actionImportMarkdownToEditor"), () => withBusy(elements.importMarkdown, () => importEditorText("markdown")), false, {
      group: t("groupFile")
    }),
    action("importTxtToEditor", t("actionImportTxtToEditor"), () => importEditorText("plainText"), false, {
      group: t("groupFile")
    }),
    action("exportEditorMarkdown", t("actionExportEditorMarkdown"), () => withBusy(elements.exportMarkdown, () => exportEditorText("markdown")), false, {
      group: t("groupFile")
    }),
    action("exportEditorTxt", t("actionExportEditorTxt"), () => exportEditorText("plainText"), false, {
      group: t("groupFile")
    }),
    action("save", t("actionSave"), () => withBusy(elements.save, savePost), false, {
      group: t("groupFile"),
      shortcut: "Cmd/Ctrl+S"
    }),
    ...editorMarkdownActions(),
    action("diff", t("diff"), () => withBusy(elements.previewDiff, previewDiff), false, { group: t("groupReview") }),
    action("prepare", t("actionPrepare"), () => withBusy(elements.prepare, preparePublish), false, { group: t("groupReview") }),
    action("review", t("actionPublishReview"), () => openPublishReview(), false, { group: t("groupReview") }),
    action("write", t("write"), () => setViewMode("write"), false, { group: t("groupView") }),
    action("split", t("split"), () => setViewMode("split"), false, { group: t("groupView") }),
    action("preview", t("preview"), () => setViewMode("preview"), false, { group: t("groupView") }),
    action("focus", t("actionToggleFocus"), toggleSidebar, false, { group: t("groupView") }),
    action("inspector", t("actionToggleInspector"), toggleInspector, false, { group: t("groupView") }),
    action("diagnostics", t("runChecks"), () => withBusy(elements.runDiagnostics, runDiagnostics), false, { group: t("groupOperations") }),
    action("desktopServiceStatus", t("desktopServiceStatus"), showDesktopServiceStatus, false, { group: t("groupOperations") }),
    action("desktopStartupProfile", t("actionDesktopStartupProfile"), showDesktopStartupProfile, false, { group: t("groupOperations") }),
    action("exportDebugBundle", t("debugBundle"), () => withBusy(elements.exportDebug, exportDebugBundle), false, { group: t("groupOperations") })
  ];
}

async function previewSnapshot(snapshotId) {
  const data = await backendData(workbenchBackend.snapshots.preview({
    host: state.host,
    snapshotId,
    restoreDiff: true
  }));
  state.previewedSnapshot = data;
  elements.publishReport.innerHTML = renderSnapshotPreview(data);
  log(`Snapshot preview ${snapshotId}`);
  return data;
}

function openPublishReview() {
  const post = state.selected;
  if (!post?.cid) {
    log(t("selectPostFirst"));
    return;
  }
  if (state.dirty || state.preparedCid !== post.cid) {
    log(t("prepareBeforeReview"));
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
  const data = await backendData(workbenchBackend.rollback.confirm({
    host: state.host,
    snapshotId,
    confirm: true,
    client: "web-console"
  }));
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
  const textarea = elements.markdown;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const before = textarea.value.slice(0, start);
  const after = textarea.value.slice(end);
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
  const insertion = `${prefix}${markdown}${suffix}`;
  textarea.value = `${before}${insertion}${after}`;
  const cursor = before.length + insertion.length;
  textarea.focus();
  textarea.setSelectionRange(cursor, cursor);
  markDirty();
  renderPreview();
  log(message);
}

function wrapSelection(prefix, suffix = prefix, fallback = "") {
  const textarea = elements.markdown;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const selected = textarea.value.slice(start, end) || fallback;
  const replacement = `${prefix}${selected}${suffix}`;
  textarea.value = `${textarea.value.slice(0, start)}${replacement}${textarea.value.slice(end)}`;
  textarea.focus();
  textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
  markDirty();
  renderPreview();
}

function prefixSelectedLines(prefix, message) {
  const textarea = elements.markdown;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const selected = textarea.value.slice(start, end) || "";
  const lines = (selected || (state.locale === "zh-CN" ? "文本" : "text")).split(/\r?\n/);
  const next = lines.map((line, index) => `${typeof prefix === "function" ? prefix(index) : prefix}${line}`).join("\n");
  textarea.value = `${textarea.value.slice(0, start)}${next}${textarea.value.slice(end)}`;
  textarea.focus();
  textarea.setSelectionRange(start, start + next.length);
  markDirty();
  renderPreview();
  log(message);
}

function insertImageFromPrompt() {
  const url = window.prompt(t("markdownImageUrl"));
  if (!url) {
    return;
  }
  const selection = selectedMarkdownText() || "image";
  insertMarkdown(`![${selection}](${url})`, t("actionInsertImage"));
}

function insertLinkFromPrompt() {
  const selection = selectedMarkdownText();
  const url = window.prompt(t("markdownLinkUrl"));
  if (!url) {
    return;
  }
  const label = selection || window.prompt(t("markdownLinkLabel")) || url;
  insertMarkdown(`[${label}](${url})`, t("actionInsertLink"));
}

function selectedMarkdownText() {
  const textarea = elements.markdown;
  return textarea.value.slice(textarea.selectionStart || 0, textarea.selectionEnd || 0).trim();
}

function copySelectedMarkdown() {
  const selected = selectedMarkdownText();
  if (!selected) {
    return;
  }
  copyText(t("actionCopySelection"), selected);
}

function showWordCount() {
  const text = selectedMarkdownText() || elements.markdown.value;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  log(formatMessage("wordCountResult", { chars: text.length, words }));
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
  log(formatMessage("copied", { label }));
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

async function backendData(resultPromise) {
  const result = await resultPromise;
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
    : t("noPostSelected");
  const prepareLabel = state.preparedCid && state.selected?.cid === state.preparedCid && !state.dirty
    ? t("prepareCurrent")
    : t("prepareRequired");
  const busyLabel = state.status.busyCount > 0
    ? `Working: ${state.status.busyLabel || state.status.busyCount}`
    : t("idle");
  const operationLabel = state.status.lastOperationId
    ? `Op: ${truncate(state.status.lastOperationId, 18)}`
    : t("noOperation");
  const errorLabel = state.status.lastError
    ? `Error: ${state.status.lastError.code}`
    : t("ok");

  elements.statusHost.textContent = `Host: ${state.host}`;
  elements.statusSite.textContent = `Site: ${truncate(state.status.siteTitle || "loading", 24)}`;
  elements.statusPost.textContent = postLabel;
  elements.statusDirty.textContent = state.dirty ? t("unsaved") : t("clean");
  elements.statusDirty.classList.toggle("status-warn", state.dirty);
  elements.statusPrepare.textContent = prepareLabel;
  elements.statusPrepare.classList.toggle("status-ok", prepareLabel === t("prepareCurrent"));
  elements.statusPolicy.textContent = `Policy: ${state.status.policyLabel}`;
  if (elements.statusService) {
    elements.statusService.textContent = state.status.serviceLabel || t("serviceBrowser");
  }
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

function setupResizeHandle(handle, layoutKey, storageKey, min, max) {
  if (!handle) {
    return;
  }

  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = state.layout[layoutKey];
    handle.classList.add("dragging");

    const onMove = (moveEvent) => {
      const next = clamp(startWidth + moveEvent.clientX - startX, min, max);
      state.layout[layoutKey] = next;
      applyEditorLayout();
    };
    const onUp = () => {
      localStorage.setItem(storageKey, String(state.layout[layoutKey]));
      scheduleDesktopLayoutPrefsSave();
      handle.classList.remove("dragging");
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function readNumberPreference(key, fallback) {
  const value = Number.parseInt(localStorage.getItem(key) || "", 10);
  return Number.isFinite(value) ? value : fallback;
}

function preferredLocale() {
  const stored = localStorage.getItem(storageKeys.locale);
  if (stored === "zh-CN" || stored === "en") {
    return stored;
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

function t(key, values = {}) {
  return formatMessage(key, values);
}

function formatMessage(key, values = {}) {
  const template = translations[state.locale]?.[key] || translations.en[key] || key;
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
    template
  );
}
