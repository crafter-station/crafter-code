use tauri_plugin_opener::OpenerExt;

const CLERK_SIGN_IN_URL: &str = "https://code.crafter.run/sign-in";
const AUTH_CALLBACK_URL: &str = "https://code.crafter.run/auth/desktop/callback";

#[tauri::command]
pub async fn auth_open_login(app: tauri::AppHandle) -> Result<(), String> {
    let login_url = format!(
        "{}?redirect_url={}",
        CLERK_SIGN_IN_URL,
        urlencoding::encode(AUTH_CALLBACK_URL)
    );

    app.opener()
        .open_url(&login_url, None::<&str>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_store_token(token: String) -> Result<(), String> {
    let entry = keyring::Entry::new("crafter-code", "session-token")
        .map_err(|e| e.to_string())?;
    entry.set_password(&token).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_get_stored_token() -> Result<Option<String>, String> {
    let entry = keyring::Entry::new("crafter-code", "session-token")
        .map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(token) => Ok(Some(token)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub async fn auth_clear_token() -> Result<(), String> {
    let entry = keyring::Entry::new("crafter-code", "session-token")
        .map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
