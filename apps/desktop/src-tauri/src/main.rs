use std::{
    env,
    fs::{self, OpenOptions},
    io::Write,
    net::{SocketAddr, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
    time::{Duration, SystemTime},
};

use tauri::{Manager, State};

const WORKBENCH_PORT: u16 = 4783;

struct LocalServiceState {
    child: Mutex<Option<Child>>,
}

fn main() {
    let state = LocalServiceState {
        child: Mutex::new(None),
    };

    tauri::Builder::default()
        .manage(state)
        .setup(|app| {
            log_line("desktop setup started");
            let app_handle = app.handle().clone();
            let state = app_handle.state::<LocalServiceState>();
            if let Err(error) = ensure_local_service(&state) {
                log_line(&format!("desktop setup failed: {error}"));
                return Err(error);
            }
            log_line("desktop setup completed");
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. }) {
                let state = window.state::<LocalServiceState>();
                stop_local_service(&state);
            }
        })
        .run(tauri::generate_context!())
        .expect("failed to run Typecho MCP Workbench desktop app");
}

fn ensure_local_service(
    state: &State<LocalServiceState>,
) -> Result<(), Box<dyn std::error::Error>> {
    if is_port_open(WORKBENCH_PORT) {
        log_line("local service already listening; reusing it");
        return Ok(());
    }

    let project_root = find_project_root()?;
    let node = find_node_binary();
    let server_script = project_root.join("apps/local-service/src/server.js");
    let service_log = open_log_file("service.log")?;
    let service_err = service_log.try_clone()?;

    log_line(&format!(
        "starting local service from {}",
        project_root.display()
    ));
    log_line(&format!("node binary: {}", node.display()));

    let child = Command::new(node)
        .arg(server_script)
        .current_dir(project_root)
        .env("TYPECHO_MCP_PORT", WORKBENCH_PORT.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(service_log))
        .stderr(Stdio::from(service_err))
        .spawn()?;

    *state.child.lock().expect("local service lock poisoned") = Some(child);
    wait_for_service(WORKBENCH_PORT, Duration::from_secs(12))?;
    log_line("local service started");
    Ok(())
}

fn stop_local_service(state: &State<LocalServiceState>) {
    let mut guard = state.child.lock().expect("local service lock poisoned");
    if let Some(mut child) = guard.take() {
        log_line("stopping child local service");
        let _ = child.kill();
        let _ = child.wait();
    }
}

fn wait_for_service(port: u16, timeout: Duration) -> Result<(), Box<dyn std::error::Error>> {
    let started = std::time::Instant::now();
    while started.elapsed() < timeout {
        if is_port_open(port) {
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
            candidate.display()
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
