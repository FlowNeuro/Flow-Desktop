// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMABUF renderer fails to initialize on many Linux setups
    // (NVIDIA proprietary drivers, some Wayland sessions) and silently renders
    // a blank/white window or crashes outright. Disable it before any
    // GTK/WebKit code runs; the slower compositing path is fully functional.
    // Users can still override by exporting the variable themselves.
    #[cfg(target_os = "linux")]
    {
        if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
            // SAFETY: top of main(), before any other threads exist.
            unsafe { std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1") };
        }
    }

    flow_desktop_lib::run()
}
