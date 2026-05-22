use tracing::debug;

/// Sidecar helper function to invoke our custom BotGuard PO Token generator
pub async fn generate_po_token(video_id: &str) -> Option<String> {
    let paths = [
        "C:\\Users\\Anton\\.cargo\\bin\\rustypipe-botguard.exe",
        "binaries\\rustypipe-botguard-x86_64-pc-windows-msvc.exe",
        "src-tauri\\binaries\\rustypipe-botguard-x86_64-pc-windows-msvc.exe",
        "rustypipe-botguard",
    ];

    for path in &paths {
        if let Ok(output) = tokio::process::Command::new(path)
            .args(&["--generate", video_id])
            .output()
            .await
        {
            if output.status.success() {
                let token_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !token_str.is_empty() {
                    debug!(sidecar = %path, "Generated PO token using BotGuard sidecar");
                    return Some(token_str);
                }
            }
        }
    }
    None
}
