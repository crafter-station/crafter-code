use parking_lot::Mutex;
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
use std::thread;
use tauri::{AppHandle, Emitter};
use uuid::Uuid;

pub struct PtyTerminal {
    pub id: String,
    master: Box<dyn MasterPty + Send>,
    child: Box<dyn Child + Send + Sync>,
    reader_handle: Option<thread::JoinHandle<()>>,
}

impl PtyTerminal {
    pub fn new(
        app_handle: AppHandle,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
    ) -> Result<Self, String> {
        let pty_system = native_pty_system();

        let pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;

        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());

        let mut cmd = CommandBuilder::new(&shell);
        cmd.arg("-l"); // Login shell

        // Set working directory
        if let Some(cwd) = cwd {
            cmd.cwd(cwd);
        } else if let Some(home) = dirs::home_dir() {
            cmd.cwd(home);
        }

        // Set environment variables
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");

        let child = pair.slave.spawn_command(cmd).map_err(|e| e.to_string())?;

        let id = Uuid::new_v4().to_string();
        let master = pair.master;

        // Create reader for streaming output
        let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
        let id_clone = id.clone();

        let reader_handle = thread::spawn(move || {
            let mut buffer = [0u8; 4096];
            loop {
                match reader.read(&mut buffer) {
                    Ok(0) => break, // EOF
                    Ok(n) => {
                        let data = String::from_utf8_lossy(&buffer[..n]).to_string();
                        let _ = app_handle.emit(&format!("pty-output-{}", id_clone), data);
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(Self {
            id,
            master,
            child,
            reader_handle: Some(reader_handle),
        })
    }

    pub fn write(&mut self, data: &str) -> Result<(), String> {
        let mut writer = self.master.take_writer().map_err(|e| e.to_string())?;
        writer.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn resize(&self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }

    pub fn kill(&mut self) -> Result<(), String> {
        self.child.kill().map_err(|e| e.to_string())
    }
}

pub struct TerminalManager {
    terminals: HashMap<String, PtyTerminal>,
}

impl TerminalManager {
    pub fn new() -> Self {
        Self {
            terminals: HashMap::new(),
        }
    }

    pub fn create(
        &mut self,
        app_handle: AppHandle,
        cols: u16,
        rows: u16,
        cwd: Option<String>,
    ) -> Result<String, String> {
        let terminal = PtyTerminal::new(app_handle, cols, rows, cwd)?;
        let id = terminal.id.clone();
        self.terminals.insert(id.clone(), terminal);
        Ok(id)
    }

    pub fn write(&mut self, id: &str, data: &str) -> Result<(), String> {
        let terminal = self
            .terminals
            .get_mut(id)
            .ok_or_else(|| format!("Terminal not found: {}", id))?;
        terminal.write(data)
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let terminal = self
            .terminals
            .get(id)
            .ok_or_else(|| format!("Terminal not found: {}", id))?;
        terminal.resize(cols, rows)
    }

    pub fn kill(&mut self, id: &str) -> Result<(), String> {
        if let Some(mut terminal) = self.terminals.remove(id) {
            terminal.kill()
        } else {
            Err(format!("Terminal not found: {}", id))
        }
    }
}

impl Default for TerminalManager {
    fn default() -> Self {
        Self::new()
    }
}

// Global terminal manager
lazy_static::lazy_static! {
    pub static ref TERMINAL_MANAGER: Arc<Mutex<TerminalManager>> = Arc::new(Mutex::new(TerminalManager::new()));
}
