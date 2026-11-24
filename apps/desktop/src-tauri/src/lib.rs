// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The desktop shell (decision 0031). It wires the app crates to the window and nothing more:
//! commands unpack arguments, call a crate, and convert errors. Logic belongs in `crates/`.
//!
//! `run()` lives here (not in `main.rs`) so a mobile entry point can reuse it later.

#[cfg(test)]
mod command_names;
mod commands;
mod files;

use tauri::Manager;

pub use involo_app_core::AppError;

/// The app with its plugins, its state and every command, on any runtime (the tests start from
/// Tauri's mock one).
fn with_commands<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(commands::Packs::default())
        // The data folder: %APPDATA%\\com.offbyonce.involo on Windows, Application Support on macOS.
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(files::Files::new(dir));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::parse_pack,
            commands::check_pack,
            commands::pack_file_limit,
            commands::compare_packs,
            commands::parse_catalog,
            commands::reconcile_flight,
            commands::restore_flight,
            commands::new_flight,
            commands::apply,
            commands::rail,
            commands::open_steps,
            commands::suggestion,
            commands::calculated,
            commands::timers,
            commands::cdu_walkthrough,
            commands::phase_model,
            commands::seat_frame,
            commands::parse_flight,
            commands::parse_settings,
            commands::default_settings,
            commands::plan_url,
            commands::parse_plan,
            commands::plan_values,
            commands::other_aircraft,
            commands::parse_saved_plan,
            commands::plan_format,
            commands::new_log,
            commands::log_packs,
            commands::parse_log,
            commands::log_entry,
            commands::practice_result,
            commands::edit_log,
            commands::log_csv,
            commands::backup_text,
            commands::read_backup,
            commands::decode_metar,
            commands::decode_taf,
            commands::files_read,
            commands::files_write,
            commands::files_remove,
            commands::files_set_aside,
            commands::files_list,
            commands::open_link,
            commands::save_file,
        ])
}

pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    // One window only, so two never write the same files (#40): starting the app again focuses
    // the open one. The plugin goes first, before anything else starts.
    let builder =
        tauri::Builder::default().plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }));
    if let Err(e) = with_commands(builder).run(tauri::generate_context!()) {
        tracing::error!("Involo stopped with an error: {e}");
        std::process::exit(1);
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeSet;

    use tauri::ipc::{CallbackFn, InvokeBody};
    use tauri::test::{INVOKE_KEY, get_ipc_response, mock_builder, mock_context, noop_assets};
    use tauri::webview::InvokeRequest;

    use involo_app_core::{Settings, to_interface_json};
    use serde_json::{Value, json};

    use super::command_names::COMMANDS;

    /// The permissions `capabilities/main.json` grants.
    fn granted() -> BTreeSet<String> {
        let text = include_str!("../capabilities/main.json");
        let json: serde_json::Value = serde_json::from_str(text).unwrap();
        json["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .map(|p| p.as_str().unwrap().to_owned())
            .collect()
    }

    #[test]
    fn the_window_is_granted_every_command_and_nothing_else() {
        let wanted: BTreeSet<String> = COMMANDS
            .iter()
            .map(|c| format!("allow-{}", c.replace('_', "-")))
            .collect();
        assert_eq!(granted(), wanted);
    }

    type Window = tauri::WebviewWindow<tauri::test::MockRuntime>;

    /// Where the window's page comes from, as its calls say: `http://tauri.localhost` on Windows
    /// (and Android), `tauri://localhost` elsewhere. Its capability is granted to that origin only,
    /// so a call from any other is refused.
    const APP_URL: &str = if cfg!(any(windows, target_os = "android")) {
        "http://tauri.localhost"
    } else {
        "tauri://localhost"
    };

    /// The app's main window, on Tauri's mock runtime.
    fn window() -> Window {
        let app = super::with_commands(mock_builder())
            .build(mock_context(noop_assets()))
            .unwrap();
        tauri::WebviewWindowBuilder::new(&app, "main", tauri::WebviewUrl::default())
            .build()
            .unwrap()
    }

    /// Calls a command from the main window, as the interface does: its answer, or what it
    /// rejected with.
    fn call_with(webview: &Window, cmd: &str, args: Value) -> Result<Value, Value> {
        get_ipc_response(
            webview,
            InvokeRequest {
                cmd: cmd.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: APP_URL.parse().unwrap(),
                body: InvokeBody::Json(args),
                headers: tauri::http::HeaderMap::default(),
                invoke_key: INVOKE_KEY.to_string(),
            },
        )
        .map(|body| body.deserialize::<Value>().unwrap())
    }

    /// A command's answer with no arguments, or what it rejected with, as text.
    fn call(webview: &Window, cmd: &str) -> String {
        match call_with(webview, cmd, json!({})) {
            Ok(v) | Err(v) => v.to_string(),
        }
    }

    /// Every named command is registered and allowed: called with no arguments, each either
    /// answers or says what it is missing, never that it doesn't exist or isn't allowed. One that
    /// isn't named is refused.
    #[test]
    fn every_command_is_registered_and_allowed() {
        let webview = window();
        // open_link and save_file read their arguments before they open the browser or a dialog.
        for cmd in COMMANDS {
            let said = call(&webview, cmd);
            assert!(
                !said.contains("not found") && !said.contains("not allowed"),
                "{cmd}: {said}"
            );
        }
        let said = call(&webview, "example_checklist");
        assert!(
            said.contains("not found") || said.contains("not allowed"),
            "{said}"
        );
        // A plain call answers as the web app's module does.
        assert!(call(&webview, "plan_format").parse::<u32>().is_ok());
    }

    /// What the interface receives from `involo-app-core` through the web app's module.
    fn web(value: &impl serde::Serialize) -> Value {
        serde_json::from_str(&to_interface_json(value).unwrap()).unwrap()
    }

    /// A pack and a flight go through the commands as the interface sends them, as JSON with
    /// the field names it received, and each answer is the JSON the web app's module gives.
    #[test]
    fn a_flight_round_trips_as_the_web_app_sends_it() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../packs/examples/example-twin");
        let pack = involo_pack::FlatPack::from(involo_pack::load_pack_dir(&dir).unwrap());
        let text = serde_json::to_string(&pack).unwrap();
        let webview = window();

        let loaded = call_with(&webview, "parse_pack", json!({ "json": text })).unwrap();
        let id = loaded["manifest"]["id"].as_str().unwrap().to_owned();
        assert_eq!(id, "example-twin");
        // Nothing else is called before the pack is loaded; a pack that isn't refuses.
        let refused = call_with(&webview, "new_flight", json!({ "pack": "other" })).unwrap_err();
        assert_eq!(
            refused,
            json!({ "kind": "PackInvalid", "message": "pack other is not loaded" })
        );

        let flight = call_with(&webview, "new_flight", json!({ "pack": id })).unwrap();
        let settings = call_with(&webview, "default_settings", json!({})).unwrap();
        assert_eq!(settings, web(&Settings::default()));
        let rail = call_with(
            &webview,
            "rail",
            json!({ "pack": id, "flight": flight, "settings": settings }),
        )
        .unwrap();
        let native_flight = involo_app_core::new_flight(&pack);
        assert_eq!(
            rail,
            web(&involo_app_core::rail(
                &pack,
                &native_flight,
                &Settings::default()
            ))
        );
        let phase = rail["stages"][0]["phases"][0]["id"]
            .as_str()
            .unwrap()
            .to_owned();
        let model = call_with(
            &webview,
            "phase_model",
            json!({ "pack": id, "flight": flight, "settings": settings, "phase": phase }),
        )
        .unwrap();
        assert_eq!(
            model,
            web(
                &involo_app_core::phase_model(&pack, &native_flight, &Settings::default(), &phase)
                    .unwrap()
            )
        );
        let open = call_with(
            &webview,
            "open_steps",
            json!({ "pack": id, "flight": flight, "settings": settings, "before": null }),
        )
        .unwrap();
        assert_eq!(
            open,
            web(&involo_app_core::open_steps(
                &pack,
                &native_flight,
                &Settings::default(),
                None
            ))
        );
    }

    /// A backup made in the web app restores on desktop, and one made on desktop restores in the
    /// web app: the same file format, read and written by the same `involo-app-core` code.
    #[test]
    fn a_backup_moves_between_the_web_app_and_the_desktop_app() {
        let fixture =
            include_str!("../../../../crates/involo-app-core/tests/fixtures/backup-format-1.json");
        let webview = window();
        // The web app's file, read on desktop as the web module reads it.
        let read = call_with(&webview, "read_backup", json!({ "text": fixture })).unwrap();
        assert_eq!(read["state"], "ready", "{read}");
        assert_eq!(read, web(&involo_app_core::read_backup(fixture, &[])));
        // Saved again on desktop, from the parts the review shows.
        let backup = &read["backup"];
        let parts = json!({
            "savedAt": backup["savedAt"],
            "flights": backup["flights"],
            "settings": backup["settings"],
            "log": backup["log"],
        });
        let text = call_with(&webview, "backup_text", json!({ "parts": parts })).unwrap();
        let text = text.as_str().unwrap();
        // The web app reads it, with every part as it was.
        let again = involo_app_core::read_backup(text, &[]);
        let again = web(&again);
        assert_eq!(again["state"], "ready");
        for part in ["savedAt", "flights", "settings", "log"] {
            assert_eq!(again["backup"][part], backup[part], "{part}");
        }
    }
}
