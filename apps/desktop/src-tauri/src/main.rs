use std::{
    env,
    fs::{self, OpenOptions},
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, SystemTime},
};

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, Submenu},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, Runtime, State, WebviewWindow,
    Window,
};
use tauri_plugin_dialog::DialogExt;

const WORKBENCH_PORT: u16 = 4783;
const DESKTOP_PREFERENCES_FILE: &str = "desktop-preferences.v1.json";
const MAX_EXPORT_BYTES: usize = 25 * 1024 * 1024;
const MAX_TEXT_FILE_BYTES: usize = 5 * 1024 * 1024;
const STARTUP_PROFILE_MODES: &[&str] = &["auto", "dev", "local", "packaged"];
const NATIVE_COMMAND_IDS: &[&str] = &[
    "newDraft",
    "importMarkdownToEditor",
    "importTxtToEditor",
    "exportEditorMarkdown",
    "exportEditorTxt",
    "save",
    "diff",
    "prepare",
    "review",
    "write",
    "split",
    "preview",
    "focus",
    "inspector",
    "diagnostics",
    "desktopServiceStatus",
    "desktopStartupProfile",
    "exportDebugBundle",
];

struct LocalServiceState {
    child: Mutex<Option<Child>>,
    service_status: Mutex<ServiceRuntimeStatus>,
    saved_window_state: Mutex<Option<WindowState>>,
    layout_prefs: Mutex<Option<serde_json::Value>>,
    startup_profile_prefs: Mutex<StartupProfilePreferences>,
    preferences_path: Mutex<Option<PathBuf>>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopAppInfo {
    product_name: String,
    version: String,
    backend_kind: String,
    native_backend: String,
    workbench_url: String,
}

#[derive(Clone, Debug)]
struct ServiceRuntimeStatus {
    startup_mode: String,
    profile_mode: String,
    service_source: String,
    node_source: String,
    host_alias_configured: bool,
    publish_policy: String,
    owned_by_desktop: bool,
    child_pid: Option<u32>,
    child_exited: bool,
    exit_code: Option<i32>,
    unexpected_exit: bool,
    recent_crash_summary: Option<String>,
    last_error: Option<String>,
}

impl Default for ServiceRuntimeStatus {
    fn default() -> Self {
        Self {
            startup_mode: "unknown".to_string(),
            profile_mode: "unknown".to_string(),
            service_source: "unknown".to_string(),
            node_source: "unknown".to_string(),
            host_alias_configured: false,
            publish_policy: publish_policy_label(),
            owned_by_desktop: false,
            child_pid: None,
            child_exited: false,
            exit_code: None,
            unexpected_exit: false,
            recent_crash_summary: None,
            last_error: None,
        }
    }
}

#[derive(Clone, Debug)]
struct StartupProfileSummary {
    profile_mode: String,
    service_source: String,
    node_source: String,
    host_alias_configured: bool,
    publish_policy: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopServiceStatus {
    mode: String,
    backend_kind: String,
    native_backend: String,
    port: u16,
    workbench_url: String,
    listening: bool,
    profile_mode: String,
    preferred_profile_mode: String,
    configured_profile_mode: String,
    effective_profile_mode: String,
    current_profile_mode: String,
    service_source: String,
    node_source: String,
    host_alias_configured: bool,
    publish_policy: String,
    owned_by_desktop: bool,
    startup_mode: String,
    child_pid: Option<u32>,
    child_exited: bool,
    exit_code: Option<i32>,
    unexpected_exit: bool,
    recent_crash_summary: Option<String>,
    log_location_label: String,
    log_label: String,
    last_error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct StartupProfilePreferences {
    profile_mode: String,
}

impl Default for StartupProfilePreferences {
    fn default() -> Self {
        Self {
            profile_mode: "auto".to_string(),
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct SaveStartupProfileRequest {
    profile_mode: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopStartupProfile {
    profile_mode: String,
    preferred_profile_mode: String,
    configured_profile_mode: String,
    effective_profile_mode: String,
    current_profile_mode: String,
    service_source: String,
    node_source: String,
    allowed_profile_modes: Vec<String>,
    restart_required: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct WindowState {
    width: Option<f64>,
    height: Option<f64>,
    x: Option<f64>,
    y: Option<f64>,
    maximized: Option<bool>,
    fullscreen: Option<bool>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandAck {
    accepted: bool,
    command_id: String,
    note: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveExportFileRequest {
    suggested_file_name: String,
    kind: String,
    contents: String,
    title: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveExportFileResult {
    cancelled: bool,
    path: Option<String>,
    file_name: Option<String>,
    bytes_written: Option<u64>,
    overwritten: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ImportEditorTextRequest {
    kind: String,
    title: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportEditorTextResult {
    cancelled: bool,
    file_name: Option<String>,
    extension: Option<String>,
    bytes_read: Option<u64>,
    text: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveEditorTextRequest {
    kind: String,
    suggested_file_name: String,
    text: String,
    title: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveEditorTextResult {
    cancelled: bool,
    file_name: Option<String>,
    extension: Option<String>,
    bytes_written: Option<u64>,
    overwritten: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopFileError {
    code: String,
    message: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
struct DesktopPreferences {
    schema_version: u8,
    updated_at: Option<String>,
    window_state: Option<WindowState>,
    layout_prefs: Option<serde_json::Value>,
    startup_profile: StartupProfilePreferences,
}

impl Default for DesktopPreferences {
    fn default() -> Self {
        Self {
            schema_version: 1,
            updated_at: None,
            window_state: None,
            layout_prefs: None,
            startup_profile: StartupProfilePreferences::default(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeCommandPayload {
    command_id: String,
}

fn main() {
    let state = LocalServiceState {
        child: Mutex::new(None),
        service_status: Mutex::new(ServiceRuntimeStatus::default()),
        saved_window_state: Mutex::new(None),
        layout_prefs: Mutex::new(None),
        startup_profile_prefs: Mutex::new(StartupProfilePreferences::default()),
        preferences_path: Mutex::new(None),
    };

    let app = tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .menu(build_native_menu)
        .on_menu_event(dispatch_native_menu_event)
        .invoke_handler(tauri::generate_handler![
            desktop_get_app_info,
            desktop_get_window_state,
            desktop_save_window_state,
            desktop_get_layout_prefs,
            desktop_save_layout_prefs,
            desktop_emit_command,
            desktop_get_service_status,
            desktop_get_startup_profile,
            desktop_save_startup_profile,
            desktop_import_editor_text,
            desktop_save_editor_text,
            desktop_save_export_file
        ])
        .setup(|app| {
            log_line("desktop setup started");
            let app_handle = app.handle().clone();
            let state = app_handle.state::<LocalServiceState>();
            setup_desktop_preferences(&app_handle, &state);
            if let Err(error) = ensure_local_service(&state) {
                log_line(&format!("desktop setup failed: {error}"));
                return Err(error);
            }
            log_line("desktop setup completed");
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                save_current_window_state(window);
                let state = window.state::<LocalServiceState>();
                stop_local_service(&state);
            }
        })
        .build(tauri::generate_context!())
        .expect("failed to build Typecho MCP Workbench desktop app");

    app.run(|app_handle, event| {
        if matches!(event, tauri::RunEvent::Exit { .. }) {
            let state = app_handle.state::<LocalServiceState>();
            stop_local_service(&state);
        }
    });
}

#[tauri::command]
fn desktop_get_app_info() -> DesktopAppInfo {
    DesktopAppInfo {
        product_name: "Typecho MCP Workbench".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        backend_kind: "http-fallback".to_string(),
        native_backend: "stub".to_string(),
        workbench_url: format!("http://127.0.0.1:{}", WORKBENCH_PORT),
    }
}

#[tauri::command]
fn desktop_get_window_state(
    window: Window,
    state: State<LocalServiceState>,
) -> Result<WindowState, String> {
    let saved = state
        .saved_window_state
        .lock()
        .map_err(|_| "window state lock poisoned".to_string())?
        .clone();
    if let Some(saved) = saved {
        return Ok(saved);
    }

    Ok(current_window_state(&window))
}

#[tauri::command]
fn desktop_save_window_state(
    state: State<LocalServiceState>,
    window_state: WindowState,
) -> Result<WindowState, String> {
    set_saved_window_state(&state, window_state.clone())?;
    save_desktop_preferences(&state)?;
    Ok(window_state)
}

#[tauri::command]
fn desktop_get_layout_prefs(
    state: State<LocalServiceState>,
) -> Result<Option<serde_json::Value>, String> {
    state
        .layout_prefs
        .lock()
        .map_err(|_| "layout prefs lock poisoned".to_string())
        .map(|prefs| prefs.clone())
}

#[tauri::command]
fn desktop_save_layout_prefs(
    state: State<LocalServiceState>,
    prefs: serde_json::Value,
) -> Result<serde_json::Value, String> {
    set_layout_prefs(&state, prefs.clone())?;
    save_desktop_preferences(&state)?;
    Ok(prefs)
}

#[tauri::command]
fn desktop_emit_command(command_id: String) -> CommandAck {
    CommandAck {
        accepted: true,
        command_id,
        note: "Renderer must dispatch this through the existing command palette bridge; this stub does not execute publish or rollback confirmations.".to_string(),
    }
}

#[tauri::command]
fn desktop_get_service_status(
    state: State<LocalServiceState>,
) -> Result<DesktopServiceStatus, String> {
    refresh_child_exit_status(&state)?;
    let runtime = state
        .service_status
        .lock()
        .map_err(|_| "service status lock poisoned".to_string())?
        .clone();

    let preferred_profile_mode = preferred_profile_mode(&state)?;
    Ok(DesktopServiceStatus {
        mode: "desktop".to_string(),
        backend_kind: "http-fallback".to_string(),
        native_backend: "stub".to_string(),
        port: WORKBENCH_PORT,
        workbench_url: format!("http://127.0.0.1:{}", WORKBENCH_PORT),
        listening: is_port_open(WORKBENCH_PORT),
        profile_mode: runtime.profile_mode.clone(),
        preferred_profile_mode: preferred_profile_mode.clone(),
        configured_profile_mode: preferred_profile_mode,
        effective_profile_mode: runtime.profile_mode.clone(),
        current_profile_mode: runtime.profile_mode.clone(),
        service_source: runtime.service_source,
        node_source: runtime.node_source,
        host_alias_configured: runtime.host_alias_configured,
        publish_policy: runtime.publish_policy,
        owned_by_desktop: runtime.owned_by_desktop,
        startup_mode: runtime.startup_mode,
        child_pid: runtime.child_pid,
        child_exited: runtime.child_exited,
        exit_code: runtime.exit_code,
        unexpected_exit: runtime.unexpected_exit,
        recent_crash_summary: runtime.recent_crash_summary,
        log_location_label: log_location_label(),
        log_label: service_log_label(),
        last_error: runtime.last_error,
    })
}

#[tauri::command]
fn desktop_get_startup_profile(
    state: State<LocalServiceState>,
) -> Result<DesktopStartupProfile, String> {
    startup_profile_status(&state)
}

#[tauri::command]
fn desktop_save_startup_profile(
    state: State<LocalServiceState>,
    request: SaveStartupProfileRequest,
) -> Result<DesktopStartupProfile, String> {
    let profile_mode = normalized_profile_mode(&request.profile_mode).ok_or_else(|| {
        "STARTUP_PROFILE_INVALID_MODE: profileMode must be auto, dev, local, or packaged"
            .to_string()
    })?;
    set_startup_profile_prefs(
        &state,
        StartupProfilePreferences {
            profile_mode: profile_mode.to_string(),
        },
    )?;
    save_desktop_preferences(&state)?;
    startup_profile_status(&state)
}

#[tauri::command]
fn desktop_save_export_file<R: Runtime>(
    app: AppHandle<R>,
    request: SaveExportFileRequest,
) -> Result<SaveExportFileResult, String> {
    let suggested_file_name =
        sanitized_export_file_name(&request.suggested_file_name, &request.kind);
    let contents = prepare_export_contents(&request.kind, &request.contents)?;
    if contents.len() > MAX_EXPORT_BYTES {
        return Err(format!(
            "export content is too large: {} bytes exceeds {} bytes",
            contents.len(),
            MAX_EXPORT_BYTES
        ));
    }

    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(suggested_file_name.clone())
        .add_filter("JSON", &["json"]);
    if let Some(title) = clean_dialog_title(request.title.as_deref()) {
        dialog = dialog.set_title(title);
    }

    let Some(file_path) = dialog.blocking_save_file() else {
        log_line("desktop export cancelled");
        return Ok(SaveExportFileResult {
            cancelled: true,
            path: None,
            file_name: None,
            bytes_written: None,
            overwritten: false,
        });
    };
    let mut path = file_path
        .into_path()
        .map_err(|_| "selected export path is not a local filesystem path".to_string())?;
    path = normalized_export_path(path, &request.kind)?;

    let overwritten = path.exists();
    let bytes_written = write_export_file_atomic(&path, contents.as_bytes())?;
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string());
    log_line(&format!(
        "desktop export saved kind={} file={} bytes={} overwritten={}",
        safe_log_token(&request.kind),
        file_name.as_deref().unwrap_or("unknown"),
        bytes_written,
        overwritten
    ));

    Ok(SaveExportFileResult {
        cancelled: false,
        path: None,
        file_name,
        bytes_written: Some(bytes_written),
        overwritten,
    })
}

#[tauri::command]
fn desktop_import_editor_text<R: Runtime>(
    app: AppHandle<R>,
    request: ImportEditorTextRequest,
) -> Result<ImportEditorTextResult, DesktopFileError> {
    validate_text_kind(&request.kind)?;
    let mut dialog = app
        .dialog()
        .file()
        .add_filter("Text", &["md", "markdown", "txt"]);
    if let Some(title) = clean_dialog_title(request.title.as_deref()) {
        dialog = dialog.set_title(title);
    }

    let Some(file_path) = dialog.blocking_pick_file() else {
        log_line("desktop text import cancelled");
        return Ok(ImportEditorTextResult {
            cancelled: true,
            file_name: None,
            extension: None,
            bytes_read: None,
            text: None,
        });
    };
    let path = file_path.into_path().map_err(|_| {
        desktop_file_error(
            "DESKTOP_FILE_DIALOG_PATH_UNAVAILABLE",
            "Selected item is not a local file.",
        )
    })?;
    let (file_name, extension) = text_file_identity(&path)?;
    validate_text_extension(&extension)?;

    let metadata = fs::metadata(&path).map_err(|_| {
        desktop_file_error(
            "DESKTOP_FILE_READ_FAILED",
            "Could not read the selected text file.",
        )
    })?;
    let byte_len = metadata.len();
    if byte_len > MAX_TEXT_FILE_BYTES as u64 {
        return Err(desktop_file_error(
            "DESKTOP_FILE_TOO_LARGE",
            "Selected text file is too large.",
        ));
    }

    let bytes = fs::read(&path).map_err(|_| {
        desktop_file_error(
            "DESKTOP_FILE_READ_FAILED",
            "Could not read the selected text file.",
        )
    })?;
    if bytes.len() > MAX_TEXT_FILE_BYTES {
        return Err(desktop_file_error(
            "DESKTOP_FILE_TOO_LARGE",
            "Selected text file is too large.",
        ));
    }
    let bytes_read = bytes.len() as u64;
    let text = String::from_utf8(bytes).map_err(|_| {
        desktop_file_error(
            "DESKTOP_FILE_NOT_UTF8",
            "Selected file is not valid UTF-8 text.",
        )
    })?;

    log_line(&format!(
        "desktop text import loaded kind={} bytes={}",
        safe_log_token(&request.kind),
        bytes_read
    ));
    Ok(ImportEditorTextResult {
        cancelled: false,
        file_name: Some(file_name),
        extension: Some(extension),
        bytes_read: Some(bytes_read),
        text: Some(text),
    })
}

#[tauri::command]
fn desktop_save_editor_text<R: Runtime>(
    app: AppHandle<R>,
    request: SaveEditorTextRequest,
) -> Result<SaveEditorTextResult, DesktopFileError> {
    validate_text_kind(&request.kind)?;
    let contents = prepare_text_file_contents(&request.text)?;
    let suggested_file_name = sanitized_text_file_name(&request.suggested_file_name, &request.kind);
    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(suggested_file_name)
        .add_filter("Text", &["md", "markdown", "txt"]);
    if let Some(title) = clean_dialog_title(request.title.as_deref()) {
        dialog = dialog.set_title(title);
    }

    let Some(file_path) = dialog.blocking_save_file() else {
        log_line("desktop text export cancelled");
        return Ok(SaveEditorTextResult {
            cancelled: true,
            file_name: None,
            extension: None,
            bytes_written: None,
            overwritten: false,
        });
    };
    let mut path = file_path.into_path().map_err(|_| {
        desktop_file_error(
            "DESKTOP_FILE_DIALOG_PATH_UNAVAILABLE",
            "Selected item is not a local file.",
        )
    })?;
    path = normalized_text_file_path(path, &request.kind)?;
    let (file_name, extension) = text_file_identity(&path)?;
    validate_text_extension(&extension)?;

    let overwritten = path.exists();
    let bytes_written = write_export_file_atomic(&path, contents.as_bytes()).map_err(|_| {
        desktop_file_error(
            "DESKTOP_FILE_WRITE_FAILED",
            "Could not write the selected text file.",
        )
    })?;
    log_line(&format!(
        "desktop text export saved kind={} bytes={} overwritten={}",
        safe_log_token(&request.kind),
        bytes_written,
        overwritten
    ));

    Ok(SaveEditorTextResult {
        cancelled: false,
        file_name: Some(file_name),
        extension: Some(extension),
        bytes_written: Some(bytes_written),
        overwritten,
    })
}

fn build_native_menu<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let new_draft = native_menu_item(app, "newDraft", "New Draft / 新建草稿", None)?;
    let import_markdown = native_menu_item(
        app,
        "importMarkdownToEditor",
        "Import Markdown / 导入 Markdown",
        None,
    )?;
    let import_txt = native_menu_item(app, "importTxtToEditor", "Import TXT / 导入 TXT", None)?;
    let export_markdown = native_menu_item(
        app,
        "exportEditorMarkdown",
        "Export Markdown / 导出 Markdown",
        None,
    )?;
    let export_txt = native_menu_item(app, "exportEditorTxt", "Export TXT / 导出 TXT", None)?;
    let save = native_menu_item(app, "save", "Save / 保存", Some("CmdOrCtrl+S"))?;
    let export_debug = native_menu_item(
        app,
        "exportDebugBundle",
        "Export Debug Bundle / 导出调试包",
        None,
    )?;
    let file = Submenu::with_items(
        app,
        "File / 文件",
        true,
        &[
            &new_draft,
            &import_markdown,
            &import_txt,
            &export_markdown,
            &export_txt,
            &save,
            &export_debug,
        ],
    )?;

    let diff = native_menu_item(app, "diff", "Diff / 差异预览", None)?;
    let prepare = native_menu_item(app, "prepare", "Prepare Publish / 发布前检查", None)?;
    let review = native_menu_item(app, "review", "Open Publish Review / 打开发布审阅", None)?;
    let review_menu = Submenu::with_items(app, "Review / 审阅", true, &[&diff, &prepare, &review])?;

    let write = native_menu_item(app, "write", "Write / 写作", None)?;
    let split = native_menu_item(app, "split", "Split / 分屏", None)?;
    let preview = native_menu_item(app, "preview", "Preview / 预览", None)?;
    let focus = native_menu_item(app, "focus", "Toggle Focus / 切换专注模式", None)?;
    let inspector = native_menu_item(app, "inspector", "Toggle Inspector / 切换检查器", None)?;
    let view = Submenu::with_items(
        app,
        "View / 视图",
        true,
        &[&write, &split, &preview, &focus, &inspector],
    )?;

    let diagnostics = native_menu_item(app, "diagnostics", "Run Diagnostics / 运行诊断", None)?;
    let service_status = native_menu_item(
        app,
        "desktopServiceStatus",
        "Service Status / 服务状态",
        None,
    )?;
    let startup_profile = native_menu_item(
        app,
        "desktopStartupProfile",
        "Startup Profile / 启动配置",
        None,
    )?;
    let operations = Submenu::with_items(
        app,
        "Operations / 操作",
        true,
        &[&diagnostics, &service_status, &startup_profile],
    )?;

    Menu::with_items(app, &[&file, &review_menu, &view, &operations])
}

fn native_menu_item<R: Runtime>(
    app: &AppHandle<R>,
    id: &str,
    label: &str,
    accelerator: Option<&str>,
) -> tauri::Result<MenuItem<R>> {
    MenuItem::with_id(app, id, label, true, accelerator)
}

fn dispatch_native_menu_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let command_id = event.id().as_ref();
    if !NATIVE_COMMAND_IDS.contains(&command_id) {
        return;
    }

    let payload = NativeCommandPayload {
        command_id: command_id.to_string(),
    };
    if let Err(error) = app.emit("typecho-mcp:native-command", payload) {
        log_line(&format!(
            "native menu dispatch failed for {command_id}: {error}"
        ));
    }
}

fn sanitized_export_file_name(input: &str, kind: &str) -> String {
    let mut name = input
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            ch if ch.is_control() => '-',
            ch => ch,
        })
        .collect::<String>();
    name = name.replace("..", ".");
    name = Path::new(&name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("typecho-export.json")
        .trim()
        .trim_matches('.')
        .to_string();
    if name.is_empty() {
        name = "typecho-export.json".to_string();
    }
    if requires_json_extension(kind) && !name.to_lowercase().ends_with(".json") {
        name.push_str(".json");
    }
    name
}

fn clean_dialog_title(title: Option<&str>) -> Option<String> {
    let title = title?.trim();
    if title.is_empty() {
        return None;
    }
    Some(
        title
            .chars()
            .filter(|ch| !ch.is_control())
            .take(80)
            .collect(),
    )
}

fn prepare_export_contents(kind: &str, contents: &str) -> Result<String, String> {
    if !is_supported_export_kind(kind) {
        return Err(format!("unsupported export kind: {}", safe_log_token(kind)));
    }
    if contents.len() > MAX_EXPORT_BYTES {
        return Err(format!(
            "export content is too large: {} bytes exceeds {} bytes",
            contents.len(),
            MAX_EXPORT_BYTES
        ));
    }
    if requires_json_extension(kind) {
        let value: serde_json::Value = serde_json::from_str(contents)
            .map_err(|error| format!("invalid JSON export: {error}"))?;
        let mut text = serde_json::to_string_pretty(&value).map_err(|error| error.to_string())?;
        text.push('\n');
        return Ok(text);
    }
    Ok(contents.to_string())
}

fn normalized_export_path(mut path: PathBuf, kind: &str) -> Result<PathBuf, String> {
    if path.file_name().is_none() {
        return Err("selected export path has no file name".to_string());
    }
    if requires_json_extension(kind)
        && path.extension().and_then(|value| value.to_str()) != Some("json")
    {
        path.set_extension("json");
    }
    Ok(path)
}

fn requires_json_extension(kind: &str) -> bool {
    matches!(kind, "json" | "debugBundle")
}

fn is_supported_export_kind(kind: &str) -> bool {
    requires_json_extension(kind)
}

fn sanitized_text_file_name(input: &str, kind: &str) -> String {
    let mut name = input
        .chars()
        .map(|ch| match ch {
            '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '-',
            ch if ch.is_control() => '-',
            ch => ch,
        })
        .collect::<String>();
    name = name.replace("..", ".");
    name = Path::new(&name)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_else(|| default_text_file_name(kind))
        .trim()
        .trim_matches('.')
        .chars()
        .take(96)
        .collect::<String>();
    if name.is_empty() {
        name = default_text_file_name(kind).to_string();
    }
    let lower = name.to_lowercase();
    if !allowed_text_extensions()
        .iter()
        .any(|ext| lower.ends_with(ext))
    {
        name.push_str(default_text_extension(kind));
    }
    name
}

fn normalized_text_file_path(mut path: PathBuf, kind: &str) -> Result<PathBuf, DesktopFileError> {
    if path.file_name().is_none() {
        return Err(desktop_file_error(
            "DESKTOP_FILE_DIALOG_PATH_UNAVAILABLE",
            "Selected item has no usable file name.",
        ));
    }
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_lowercase()))
    {
        Some(extension) => validate_text_extension(&extension)?,
        None => {
            path.set_extension(default_text_extension(kind).trim_start_matches('.'));
        }
    }
    Ok(path)
}

fn text_file_identity(path: &Path) -> Result<(String, String), DesktopFileError> {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .map(|value| value.to_string())
        .ok_or_else(|| {
            desktop_file_error(
                "DESKTOP_FILE_DIALOG_PATH_UNAVAILABLE",
                "Selected item has no usable file name.",
            )
        })?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{}", value.to_lowercase()))
        .ok_or_else(|| {
            desktop_file_error(
                "DESKTOP_FILE_UNSUPPORTED_EXTENSION",
                "This file type is not supported for editor text.",
            )
        })?;
    Ok((file_name, extension))
}

fn validate_text_kind(kind: &str) -> Result<(), DesktopFileError> {
    if matches!(kind, "markdown" | "plainText" | "draftText") {
        return Ok(());
    }
    Err(desktop_file_error(
        "DESKTOP_FILE_UNSUPPORTED_EXTENSION",
        "This file workflow is not supported for editor text.",
    ))
}

fn validate_text_extension(extension: &str) -> Result<(), DesktopFileError> {
    let normalized = extension.to_lowercase();
    if allowed_text_extensions().contains(&normalized.as_str()) {
        return Ok(());
    }
    Err(desktop_file_error(
        "DESKTOP_FILE_UNSUPPORTED_EXTENSION",
        "This file type is not supported for editor text.",
    ))
}

fn prepare_text_file_contents(text: &str) -> Result<String, DesktopFileError> {
    if text.len() > MAX_TEXT_FILE_BYTES {
        return Err(desktop_file_error(
            "DESKTOP_FILE_TOO_LARGE",
            "Editor text is too large to export.",
        ));
    }
    Ok(text.to_string())
}

fn allowed_text_extensions() -> [&'static str; 3] {
    [".md", ".markdown", ".txt"]
}

fn default_text_extension(kind: &str) -> &'static str {
    if kind == "plainText" {
        ".txt"
    } else {
        ".md"
    }
}

fn default_text_file_name(kind: &str) -> &'static str {
    if kind == "plainText" {
        "typecho-editor.txt"
    } else {
        "typecho-editor.md"
    }
}

fn desktop_file_error(code: &str, message: &str) -> DesktopFileError {
    DesktopFileError {
        code: code.to_string(),
        message: message.to_string(),
    }
}

fn write_export_file_atomic(path: &Path, contents: &[u8]) -> Result<u64, String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("typecho-export.json");
    let nanos = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_nanos();
    let tmp_path = path.with_file_name(format!(".{file_name}.{nanos}.tmp"));
    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&tmp_path)
        .map_err(|error| error.to_string())?;
    file.write_all(contents)
        .map_err(|error| error.to_string())?;
    file.flush().map_err(|error| error.to_string())?;
    fs::rename(&tmp_path, path).map_err(|error| error.to_string())?;
    Ok(contents.len() as u64)
}

fn safe_log_token(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_'))
        .take(32)
        .collect::<String>()
}

fn setup_desktop_preferences<R: Runtime>(
    app_handle: &AppHandle<R>,
    state: &State<LocalServiceState>,
) {
    let path = desktop_preferences_path(app_handle);
    if let Ok(mut guard) = state.preferences_path.lock() {
        *guard = Some(path.clone());
    }

    let preferences = match read_desktop_preferences_file(&path) {
        Ok(preferences) => preferences,
        Err(error) => {
            log_line(&format!(
                "desktop preferences unavailable at {}: {error}",
                path.display()
            ));
            DesktopPreferences::default()
        }
    };

    if let Some(window_state) = preferences.window_state.clone() {
        if let Err(error) = set_saved_window_state(state, window_state.clone()) {
            log_line(&format!("could not store loaded window state: {error}"));
        }
        if let Some(window) = app_handle.get_webview_window("main") {
            apply_window_state(&window, &window_state);
        }
    }
    if let Some(layout_prefs) = preferences.layout_prefs.clone() {
        if let Err(error) = set_layout_prefs(state, layout_prefs) {
            log_line(&format!("could not store loaded layout prefs: {error}"));
        }
    }
    let startup_profile = sanitize_startup_profile_preferences(preferences.startup_profile)
        .unwrap_or_else(|error| {
            log_line(&error);
            StartupProfilePreferences::default()
        });
    if let Err(error) = set_startup_profile_prefs(state, startup_profile) {
        log_line(&format!("could not store loaded startup profile: {error}"));
    }
}

fn set_saved_window_state(
    state: &State<LocalServiceState>,
    window_state: WindowState,
) -> Result<(), String> {
    *state
        .saved_window_state
        .lock()
        .map_err(|_| "window state lock poisoned".to_string())? = Some(window_state);
    Ok(())
}

fn set_layout_prefs(
    state: &State<LocalServiceState>,
    prefs: serde_json::Value,
) -> Result<(), String> {
    *state
        .layout_prefs
        .lock()
        .map_err(|_| "layout prefs lock poisoned".to_string())? = Some(prefs);
    Ok(())
}

fn set_startup_profile_prefs(
    state: &State<LocalServiceState>,
    prefs: StartupProfilePreferences,
) -> Result<(), String> {
    let sanitized = sanitize_startup_profile_preferences(prefs)?;
    *state
        .startup_profile_prefs
        .lock()
        .map_err(|_| "startup profile prefs lock poisoned".to_string())? = sanitized;
    Ok(())
}

fn preferred_profile_mode(state: &State<LocalServiceState>) -> Result<String, String> {
    state
        .startup_profile_prefs
        .lock()
        .map_err(|_| "startup profile prefs lock poisoned".to_string())
        .map(|prefs| prefs.profile_mode.clone())
}

fn startup_profile_status(
    state: &State<LocalServiceState>,
) -> Result<DesktopStartupProfile, String> {
    let preferred = preferred_profile_mode(state)?;
    let runtime = state
        .service_status
        .lock()
        .map_err(|_| "service status lock poisoned".to_string())?
        .clone();
    Ok(DesktopStartupProfile {
        profile_mode: preferred.clone(),
        preferred_profile_mode: preferred.clone(),
        configured_profile_mode: preferred,
        effective_profile_mode: runtime.profile_mode.clone(),
        current_profile_mode: runtime.profile_mode,
        service_source: runtime.service_source,
        node_source: runtime.node_source,
        allowed_profile_modes: STARTUP_PROFILE_MODES
            .iter()
            .map(|mode| mode.to_string())
            .collect(),
        restart_required: false,
    })
}

fn sanitize_startup_profile_preferences(
    prefs: StartupProfilePreferences,
) -> Result<StartupProfilePreferences, String> {
    normalized_profile_mode(&prefs.profile_mode)
        .map(|profile_mode| StartupProfilePreferences {
            profile_mode: profile_mode.to_string(),
        })
        .ok_or_else(|| {
            "STARTUP_PROFILE_INVALID_MODE: ignored invalid startup profile mode".to_string()
        })
}

fn normalized_profile_mode(value: &str) -> Option<&'static str> {
    match value.trim() {
        "auto" => Some("auto"),
        "dev" => Some("dev"),
        "local" => Some("local"),
        "packaged" => Some("packaged"),
        _ => None,
    }
}

fn save_current_window_state(window: &Window) {
    let state = window.state::<LocalServiceState>();
    let window_state = current_window_state(window);
    if let Err(error) = set_saved_window_state(&state, window_state) {
        log_line(&format!("could not capture window state: {error}"));
        return;
    }
    if let Err(error) = save_desktop_preferences(&state) {
        log_line(&format!("could not persist window state: {error}"));
    }
}

fn current_window_state(window: &Window) -> WindowState {
    let size = window.outer_size().map_err(|error| error.to_string()).ok();
    let position = window
        .outer_position()
        .map_err(|error| error.to_string())
        .ok();
    let maximized = window
        .is_maximized()
        .map_err(|error| error.to_string())
        .ok();
    let fullscreen = window
        .is_fullscreen()
        .map_err(|error| error.to_string())
        .ok();

    WindowState {
        width: size.map(|value| value.width as f64),
        height: size.map(|value| value.height as f64),
        x: position.map(|value| value.x as f64),
        y: position.map(|value| value.y as f64),
        maximized,
        fullscreen,
    }
}

fn apply_window_state<R: Runtime>(window: &WebviewWindow<R>, state: &WindowState) {
    if let (Some(width), Some(height)) = (state.width, state.height) {
        if width >= 900.0 && height >= 600.0 {
            let _ = window.set_size(PhysicalSize::new(width as u32, height as u32));
        }
    }
    if let (Some(x), Some(y)) = (state.x, state.y) {
        let _ = window.set_position(PhysicalPosition::new(x as i32, y as i32));
    }
    if state.maximized == Some(true) {
        let _ = window.maximize();
    }
    if let Some(fullscreen) = state.fullscreen {
        let _ = window.set_fullscreen(fullscreen);
    }
}

fn save_desktop_preferences(state: &State<LocalServiceState>) -> Result<(), String> {
    let path = state
        .preferences_path
        .lock()
        .map_err(|_| "preferences path lock poisoned".to_string())?
        .clone()
        .unwrap_or_else(desktop_preferences_path_fallback);
    let preferences = DesktopPreferences {
        schema_version: 1,
        updated_at: Some(format!("{:?}", SystemTime::now())),
        window_state: state
            .saved_window_state
            .lock()
            .map_err(|_| "window state lock poisoned".to_string())?
            .clone(),
        layout_prefs: state
            .layout_prefs
            .lock()
            .map_err(|_| "layout prefs lock poisoned".to_string())?
            .clone(),
        startup_profile: state
            .startup_profile_prefs
            .lock()
            .map_err(|_| "startup profile prefs lock poisoned".to_string())?
            .clone(),
    };
    write_desktop_preferences_file(&path, &preferences)
}

fn read_desktop_preferences_file(path: &Path) -> Result<DesktopPreferences, String> {
    if !path.exists() {
        return Ok(DesktopPreferences::default());
    }
    let bytes = fs::read(path).map_err(|error| error.to_string())?;
    serde_json::from_slice(&bytes).map_err(|error| error.to_string())
}

fn write_desktop_preferences_file(
    path: &Path,
    preferences: &DesktopPreferences,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let tmp_path = path.with_extension("json.tmp");
    let mut file = OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(true)
        .open(&tmp_path)
        .map_err(|error| error.to_string())?;
    serde_json::to_writer_pretty(&mut file, preferences).map_err(|error| error.to_string())?;
    file.write_all(b"\n").map_err(|error| error.to_string())?;
    file.flush().map_err(|error| error.to_string())?;
    fs::rename(&tmp_path, path).map_err(|error| error.to_string())
}

fn desktop_preferences_path<R: Runtime>(app_handle: &AppHandle<R>) -> PathBuf {
    app_handle
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| desktop_preferences_path_fallback())
        .join(DESKTOP_PREFERENCES_FILE)
}

fn desktop_preferences_path_fallback() -> PathBuf {
    if let Ok(home) = env::var("HOME") {
        return PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("Typecho MCP Workbench")
            .join(DESKTOP_PREFERENCES_FILE);
    }
    PathBuf::from(".")
        .join(".typecho-mcp-workbench")
        .join(DESKTOP_PREFERENCES_FILE)
}

fn ensure_local_service(
    state: &State<LocalServiceState>,
) -> Result<(), Box<dyn std::error::Error>> {
    if is_port_open(WORKBENCH_PORT) {
        if !is_typecho_local_service(WORKBENCH_PORT) {
            set_startup_failure_status(
                state,
                "external-listener",
                "not-started",
                "STARTUP_PORT_IN_USE_FOREIGN_SERVICE: localhost port is not Typecho MCP",
            );
            return Err("localhost workbench port is used by another service".into());
        }
        log_line("local service already listening; reusing it");
        let profile = startup_profile_summary("external-listener", "not-started");
        set_service_status(
            state,
            ServiceRuntimeStatus {
                startup_mode: "reused".to_string(),
                profile_mode: profile.profile_mode,
                service_source: profile.service_source,
                node_source: profile.node_source,
                host_alias_configured: profile.host_alias_configured,
                publish_policy: profile.publish_policy,
                owned_by_desktop: false,
                child_pid: None,
                child_exited: false,
                exit_code: None,
                unexpected_exit: false,
                recent_crash_summary: None,
                last_error: None,
            },
        );
        return Ok(());
    }

    let project_root = match find_project_root() {
        Ok(root) => root,
        Err(error) => {
            set_startup_failure_status(
                state,
                "source-tree",
                "not-started",
                "STARTUP_PROJECT_ROOT_NOT_FOUND: could not locate local-service",
            );
            return Err(error);
        }
    };
    let node = find_node_binary();
    let profile = startup_profile_summary("source-tree", &node_source_kind(&node));
    let server_script = project_root.join("apps/local-service/src/server.js");
    let service_log = open_log_file("service.log")?;
    let service_err = service_log.try_clone()?;

    log_line(&format!(
        "starting local service from {}",
        project_root_label(&project_root)
    ));
    log_line(&format!("node binary source: {}", node_source_label(&node)));

    let child = Command::new(node)
        .arg(server_script)
        .current_dir(project_root)
        .env("TYPECHO_MCP_PORT", WORKBENCH_PORT.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(service_log))
        .stderr(Stdio::from(service_err))
        .spawn()
        .map_err(|error| {
            set_startup_failure_status(
                state,
                &profile.service_source,
                &profile.node_source,
                "STARTUP_NODE_UNAVAILABLE: could not start local-service child",
            );
            error
        })?;

    let child_pid = child.id();
    *state.child.lock().expect("local service lock poisoned") = Some(child);
    set_service_status(
        state,
        ServiceRuntimeStatus {
            startup_mode: "spawned".to_string(),
            profile_mode: profile.profile_mode,
            service_source: profile.service_source,
            node_source: profile.node_source,
            host_alias_configured: profile.host_alias_configured,
            publish_policy: profile.publish_policy,
            owned_by_desktop: true,
            child_pid: Some(child_pid),
            child_exited: false,
            exit_code: None,
            unexpected_exit: false,
            recent_crash_summary: None,
            last_error: None,
        },
    );
    if let Err(error) = wait_for_service(WORKBENCH_PORT, Duration::from_secs(12)) {
        let error_message = format!("STARTUP_LOCAL_SERVICE_UNHEALTHY: {error}");
        kill_owned_child_after_startup_failure(state, &error_message);
        return Err(error);
    }
    log_line("local service started");
    Ok(())
}

fn stop_local_service(state: &State<LocalServiceState>) {
    let mut guard = state.child.lock().expect("local service lock poisoned");
    if let Some(mut child) = guard.take() {
        log_line("stopping child local service");
        let _ = child.kill();
        let exit_status = child.wait().ok();
        update_service_exit_status(state, exit_status.and_then(|status| status.code()));
    }
}

fn kill_owned_child_after_startup_failure(state: &State<LocalServiceState>, error_message: &str) {
    let mut guard = state.child.lock().expect("local service lock poisoned");
    if let Some(mut child) = guard.take() {
        let profile = current_profile_summary(state, "source-tree", "unknown");
        let _ = child.kill();
        let exit_status = child.wait().ok();
        let exit_code = exit_status.and_then(|status| status.code());
        set_service_status(
            state,
            ServiceRuntimeStatus {
                startup_mode: "failed".to_string(),
                profile_mode: profile.profile_mode,
                service_source: profile.service_source,
                node_source: profile.node_source,
                host_alias_configured: profile.host_alias_configured,
                publish_policy: profile.publish_policy,
                owned_by_desktop: false,
                child_pid: Some(child.id()),
                child_exited: true,
                exit_code,
                unexpected_exit: false,
                recent_crash_summary: Some(startup_failure_summary(exit_code)),
                last_error: Some(error_message.to_string()),
            },
        );
        log_line("local service startup failed; owned child was stopped");
    }
}

fn refresh_child_exit_status(state: &State<LocalServiceState>) -> Result<(), String> {
    let mut guard = state
        .child
        .lock()
        .map_err(|_| "local service lock poisoned".to_string())?;
    if let Some(child) = guard.as_mut() {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            let pid = child.id();
            let exit_code = status.code();
            *guard = None;
            set_service_status(
                state,
                exited_service_status(
                    state,
                    "failed",
                    Some(pid),
                    exit_code,
                    true,
                    Some("owned local service child exited unexpectedly".to_string()),
                ),
            );
        }
    }
    Ok(())
}

fn set_service_status(state: &State<LocalServiceState>, status: ServiceRuntimeStatus) {
    if let Ok(mut guard) = state.service_status.lock() {
        *guard = status;
    }
}

fn update_service_exit_status(state: &State<LocalServiceState>, exit_code: Option<i32>) {
    if let Ok(mut guard) = state.service_status.lock() {
        guard.startup_mode = "stopped".to_string();
        guard.child_exited = true;
        guard.exit_code = exit_code;
        guard.owned_by_desktop = false;
        guard.unexpected_exit = false;
        guard.recent_crash_summary = None;
        guard.last_error = None;
    }
}

fn set_startup_failure_status(
    state: &State<LocalServiceState>,
    service_source: &str,
    node_source: &str,
    last_error: &str,
) {
    let profile = startup_profile_summary(service_source, node_source);
    set_service_status(
        state,
        ServiceRuntimeStatus {
            startup_mode: "failed".to_string(),
            profile_mode: profile.profile_mode,
            service_source: profile.service_source,
            node_source: profile.node_source,
            host_alias_configured: profile.host_alias_configured,
            publish_policy: profile.publish_policy,
            owned_by_desktop: false,
            child_pid: None,
            child_exited: false,
            exit_code: None,
            unexpected_exit: false,
            recent_crash_summary: None,
            last_error: Some(last_error.to_string()),
        },
    );
}

fn exited_service_status(
    state: &State<LocalServiceState>,
    startup_mode: &str,
    child_pid: Option<u32>,
    exit_code: Option<i32>,
    unexpected_exit: bool,
    last_error: Option<String>,
) -> ServiceRuntimeStatus {
    let profile = current_profile_summary(state, "source-tree", "unknown");
    ServiceRuntimeStatus {
        startup_mode: startup_mode.to_string(),
        profile_mode: profile.profile_mode,
        service_source: profile.service_source,
        node_source: profile.node_source,
        host_alias_configured: profile.host_alias_configured,
        publish_policy: profile.publish_policy,
        owned_by_desktop: false,
        child_pid,
        child_exited: true,
        exit_code,
        unexpected_exit,
        recent_crash_summary: unexpected_exit.then(|| unexpected_exit_summary(exit_code)),
        last_error,
    }
}

fn current_profile_summary(
    state: &State<LocalServiceState>,
    default_service_source: &str,
    default_node_source: &str,
) -> StartupProfileSummary {
    state
        .service_status
        .lock()
        .ok()
        .map(|status| StartupProfileSummary {
            profile_mode: status.profile_mode.clone(),
            service_source: status.service_source.clone(),
            node_source: status.node_source.clone(),
            host_alias_configured: status.host_alias_configured,
            publish_policy: status.publish_policy.clone(),
        })
        .unwrap_or_else(|| startup_profile_summary(default_service_source, default_node_source))
}

fn startup_profile_summary(service_source: &str, node_source: &str) -> StartupProfileSummary {
    StartupProfileSummary {
        profile_mode: profile_mode_label(service_source),
        service_source: service_source.to_string(),
        node_source: node_source.to_string(),
        host_alias_configured: env::var("TYPECHO_MCP_HOST").is_ok(),
        publish_policy: publish_policy_label(),
    }
}

fn profile_mode_label(service_source: &str) -> String {
    if service_source == "external-listener" {
        return "local".to_string();
    }
    if running_from_macos_app_bundle() {
        return "packaged".to_string();
    }
    if env::var("TYPECHO_MCP_PROJECT_ROOT").is_ok() {
        return "dev".to_string();
    }
    "auto".to_string()
}

fn running_from_macos_app_bundle() -> bool {
    env::current_exe()
        .ok()
        .and_then(|path| {
            path.to_str()
                .map(|value| value.contains(".app/Contents/MacOS"))
        })
        .unwrap_or(false)
}

fn publish_policy_label() -> String {
    env::var("TYPECHO_MCP_PUBLISH_POLICY").unwrap_or_else(|_| "manual_approval".to_string())
}

fn service_log_label() -> String {
    "service.log".to_string()
}

fn startup_failure_summary(exit_code: Option<i32>) -> String {
    format!(
        "Local service startup failed; owned child was stopped; exit code {}; see {} in {}.",
        exit_code_label(exit_code),
        service_log_label(),
        log_location_label()
    )
}

fn unexpected_exit_summary(exit_code: Option<i32>) -> String {
    format!(
        "Local service exited unexpectedly; exit code {}; see {} in {}.",
        exit_code_label(exit_code),
        service_log_label(),
        log_location_label()
    )
}

fn exit_code_label(exit_code: Option<i32>) -> String {
    exit_code
        .map(|code| code.to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

fn wait_for_service(port: u16, timeout: Duration) -> Result<(), Box<dyn std::error::Error>> {
    let started = std::time::Instant::now();
    while started.elapsed() < timeout {
        if is_typecho_local_service(port) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    Err(format!("local workbench service did not start on port {}", port).into())
}

fn is_port_open(port: u16) -> bool {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(250)).is_ok()
}

fn is_typecho_local_service(port: u16) -> bool {
    fetch_loopback_path(port, "/api/desktop/identity")
        .map(|response| {
            response.contains(" 200 ")
                && response.contains("\"product\"")
                && response.contains("\"typecho-mcp\"")
                && response.contains("\"component\"")
                && response.contains("\"local-service\"")
        })
        .unwrap_or(false)
}

fn fetch_loopback_path(port: u16, path: &str) -> Result<String, Box<dyn std::error::Error>> {
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(250))?;
    stream.set_read_timeout(Some(Duration::from_millis(750)))?;
    stream.set_write_timeout(Some(Duration::from_millis(750)))?;
    let request = format!(
        "GET {} HTTP/1.1\r\nHost: 127.0.0.1:{}\r\nConnection: close\r\n\r\n",
        path, port
    );
    stream.write_all(request.as_bytes())?;
    let mut response = String::new();
    stream.take(32 * 1024).read_to_string(&mut response)?;
    Ok(response)
}

fn find_node_binary() -> PathBuf {
    if let Ok(path) = env::var("TYPECHO_MCP_NODE") {
        let candidate = PathBuf::from(path);
        if candidate.exists() {
            return candidate;
        }
    }

    let bundled = PathBuf::from("/Applications/Codex.app/Contents/Resources/node");
    if bundled.exists() {
        return bundled;
    }
    PathBuf::from("node")
}

fn find_project_root() -> Result<PathBuf, Box<dyn std::error::Error>> {
    if let Ok(path) = env::var("TYPECHO_MCP_PROJECT_ROOT") {
        let candidate = PathBuf::from(path);
        if candidate.join("apps/local-service/src/server.js").exists() {
            return Ok(candidate);
        }
        log_line(&format!(
            "TYPECHO_MCP_PROJECT_ROOT did not contain local-service: {}",
            project_root_label(&candidate)
        ));
    }

    let current_exe = env::current_exe()?;
    for ancestor in current_exe.ancestors() {
        if let Some(root) = ascend_to_repo_from_target(ancestor) {
            return Ok(root);
        }
    }

    let cwd = env::current_dir()?;
    if cwd.join("apps/local-service/src/server.js").exists() {
        return Ok(cwd);
    }

    Err("could not locate Typecho MCP project root".into())
}

fn ascend_to_repo_from_target(path: &Path) -> Option<PathBuf> {
    let mut current = path;
    while let Some(parent) = current.parent() {
        if parent.join("apps/local-service/src/server.js").exists() {
            return Some(parent.to_path_buf());
        }
        current = parent;
    }
    None
}

fn open_log_file(name: &str) -> Result<std::fs::File, Box<dyn std::error::Error>> {
    let dir = log_dir();
    fs::create_dir_all(&dir)?;
    Ok(OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(name))?)
}

fn log_line(message: &str) {
    if let Ok(mut file) = open_log_file("desktop.log") {
        let _ = writeln!(file, "[{:?}] {}", SystemTime::now(), message);
    }
}

fn log_dir() -> PathBuf {
    if let Ok(home) = env::var("HOME") {
        return PathBuf::from(home)
            .join("Library")
            .join("Logs")
            .join("Typecho MCP Workbench");
    }
    PathBuf::from(".").join("typecho-mcp-workbench-logs")
}

fn log_location_label() -> String {
    if cfg!(target_os = "macos") {
        "macOS user Logs directory".to_string()
    } else {
        "user log directory".to_string()
    }
}

fn project_root_label(path: &Path) -> String {
    if path.join("apps/local-service/src/server.js").exists() {
        return "project root containing local-service".to_string();
    }
    "configured project root candidate".to_string()
}

fn node_source_label(path: &Path) -> String {
    match node_source_kind(path).as_str() {
        "override" => "TYPECHO_MCP_NODE override".to_string(),
        "bundled" => "bundled node".to_string(),
        "path" => "PATH node".to_string(),
        _ => "node executable".to_string(),
    }
}

fn node_source_kind(path: &Path) -> String {
    if let Ok(override_path) = env::var("TYPECHO_MCP_NODE") {
        if PathBuf::from(override_path) == path {
            return "override".to_string();
        }
    }
    if path == Path::new("/Applications/Codex.app/Contents/Resources/node") {
        return "bundled".to_string();
    }
    "path".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn export_file_name_is_sanitized_and_json() {
        let name = sanitized_export_file_name("../debug:bundle?.txt", "debugBundle");

        assert!(name.ends_with(".json"));
        assert!(!name.contains('/'));
        assert!(!name.contains('\\'));
        assert!(!name.contains(':'));
        assert!(!name.contains('?'));
    }

    #[test]
    fn export_contents_rejects_unknown_kind() {
        let error = prepare_export_contents("arbitraryText", "hello").unwrap_err();

        assert!(error.contains("unsupported export kind"));
    }

    #[test]
    fn export_contents_pretty_prints_json() {
        let contents = prepare_export_contents("debugBundle", "{\"ok\":true}").unwrap();

        assert_eq!(contents, "{\n  \"ok\": true\n}\n");
    }

    #[test]
    fn export_path_forces_json_extension() {
        let path =
            normalized_export_path(PathBuf::from("/tmp/typecho-debug.txt"), "debugBundle").unwrap();

        assert_eq!(
            path.extension().and_then(|value| value.to_str()),
            Some("json")
        );
    }

    #[test]
    fn export_atomic_write_uses_requested_contents() {
        let path = env::temp_dir().join(format!(
            "typecho-mcp-export-test-{:?}.json",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));

        let bytes = write_export_file_atomic(&path, b"{\"ok\":true}\n").unwrap();
        let contents = fs::read_to_string(&path).unwrap();
        let _ = fs::remove_file(&path);

        assert_eq!(bytes, 12);
        assert_eq!(contents, "{\"ok\":true}\n");
    }

    #[test]
    fn startup_profile_accepts_only_known_modes() {
        assert_eq!(normalized_profile_mode("auto"), Some("auto"));
        assert_eq!(normalized_profile_mode("dev"), Some("dev"));
        assert_eq!(normalized_profile_mode("local"), Some("local"));
        assert_eq!(normalized_profile_mode("packaged"), Some("packaged"));
        assert_eq!(normalized_profile_mode("4783"), None);
        assert_eq!(normalized_profile_mode("/tmp/project"), None);
    }

    #[test]
    fn startup_profile_preferences_reject_invalid_mode() {
        let prefs = StartupProfilePreferences {
            profile_mode: "invalid-mode".to_string(),
        };

        let error = sanitize_startup_profile_preferences(prefs).unwrap_err();

        assert!(error.contains("STARTUP_PROFILE_INVALID_MODE"));
    }
}
