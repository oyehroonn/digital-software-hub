// DSM Admin — Tauri native shell.
// Exposes commands so the React UI can reach backends without browser CORS and
// keeps secrets in an OS-local config file (never bundled into the JS).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command as ProcCommand;
use std::time::Duration;

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Default)]
struct AppConfig {
    #[serde(default)]
    ecommerce_url: String,
    #[serde(default)]
    ecommerce_secret: String,
    #[serde(default)]
    vps_base: String,
    #[serde(default)]
    codex_base: String,
    #[serde(default)]
    codex_key: String,
    #[serde(default)]
    codex_model: String,
    #[serde(default)]
    simli_base: String,
    #[serde(default)]
    simli_key: String,
    #[serde(default)]
    email_cli: String,
}

fn config_path() -> PathBuf {
    let mut dir = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
    dir.push("dsm-admin");
    let _ = std::fs::create_dir_all(&dir);
    dir.push("config.json");
    dir
}

#[tauri::command]
fn get_config() -> AppConfig {
    match std::fs::read_to_string(config_path()) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_default(),
        Err(_) => AppConfig::default(),
    }
}

#[tauri::command]
fn save_config(config: AppConfig) -> Result<(), String> {
    let s = serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?;
    std::fs::write(config_path(), s).map_err(|e| e.to_string())
}

fn client(timeout_ms: Option<u64>) -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_millis(timeout_ms.unwrap_or(8000)))
        .build()
        .map_err(|e| e.to_string())
}

fn apply_headers(
    mut req: reqwest::RequestBuilder,
    headers: Option<HashMap<String, String>>,
) -> reqwest::RequestBuilder {
    if let Some(h) = headers {
        for (k, v) in h {
            req = req.header(k, v);
        }
    }
    req
}

#[tauri::command]
async fn http_get(
    url: String,
    timeout_ms: Option<u64>,
    headers: Option<HashMap<String, String>>,
) -> Result<String, String> {
    let c = client(timeout_ms)?;
    let req = apply_headers(c.get(&url), headers);
    let resp = req.send().await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn http_post(
    url: String,
    body: String,
    content_type: Option<String>,
    timeout_ms: Option<u64>,
    headers: Option<HashMap<String, String>>,
) -> Result<String, String> {
    let c = client(timeout_ms)?;
    let req = apply_headers(c.post(&url), headers)
        .header(
            "Content-Type",
            content_type.unwrap_or_else(|| "application/json".into()),
        )
        .body(body);
    let resp = req.send().await.map_err(|e| e.to_string())?;
    resp.text().await.map_err(|e| e.to_string())
}

/// Run the Email API CLI (mailcli.py). Actions: sendEmail, whoami, quota,
/// createEvent, findEvents. `payload` is a JSON string for actions that need it.
#[tauri::command]
fn mailcli(
    cli_path: String,
    action: String,
    payload: Option<String>,
    endpoint: Option<String>,
) -> Result<String, String> {
    let mut cmd = ProcCommand::new("python3");
    cmd.arg(&cli_path).arg(&action);
    if let Some(p) = payload {
        cmd.arg(p);
    }
    if let Some(ep) = endpoint {
        cmd.arg("--endpoint").arg(ep);
    }
    let out = cmd.output().map_err(|e| e.to_string())?;
    if out.status.success() {
        Ok(String::from_utf8_lossy(&out.stdout).into_owned())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).into_owned())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            http_get,
            http_post,
            mailcli
        ])
        .run(tauri::generate_context!())
        .expect("error while running DSM Admin");
}
