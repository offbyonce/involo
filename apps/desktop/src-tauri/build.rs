// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! Lists every app command so Tauri generates a permission for each one.
//! A command not granted in `capabilities/` cannot be called from the interface.
//!
//! On Windows it also embeds the app manifest (`windows-app-manifest.xml`, Common Controls v6) in
//! everything the crate links. Tauri would embed its own in the app binary only, so the library's
//! test binary couldn't load Common Controls v6 and stopped before its tests were listed.

include!("src/command_names.rs");

fn main() {
    let windows = tauri_build::WindowsAttributes::new_without_app_manifest();
    let attributes = tauri_build::Attributes::new()
        .windows_attributes(windows)
        .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS));
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let target_env = std::env::var("CARGO_CFG_TARGET_ENV").unwrap_or_default();
    if target_os == "windows" && target_env == "msvc" {
        let manifest =
            std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("windows-app-manifest.xml");
        println!("cargo:rerun-if-changed=windows-app-manifest.xml");
        println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
        println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    }
    if let Err(e) = tauri_build::try_build(attributes) {
        // Build scripts report failures by panicking; this is the conventional exit.
        #[allow(clippy::panic)]
        {
            panic!("tauri build failed: {e:#}");
        }
    }
}
