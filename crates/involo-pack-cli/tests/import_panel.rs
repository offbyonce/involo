// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `involo-pack import-panel` (decision 0030), run as the real command on drawings saved the way
//! two drawing tools save them (`tests/svg`): controls land where they are drawn, the file passes
//! `check` once positions are filled in, what the rule doesn't cover is a warning naming the
//! group, and an unsafe drawing is refused.

#[cfg(test)]
mod tests {
    use std::path::{Path, PathBuf};
    use std::process::{Command, Output};

    use involo_checklist_core::{LightColor, Panel, PanelItemKind};

    fn run(args: &[&str]) -> Output {
        Command::new(env!("CARGO_BIN_EXE_involo-pack"))
            .args(args)
            .output()
            .unwrap()
    }

    fn stdout(o: &Output) -> String {
        String::from_utf8(o.stdout.clone()).unwrap()
    }

    fn stderr(o: &Output) -> String {
        String::from_utf8(o.stderr.clone()).unwrap()
    }

    fn drawing(name: &str) -> String {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/svg")
            .join(name)
            .to_string_lossy()
            .into_owned()
    }

    /// A new, empty folder for one test.
    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pack-import-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn import(args: &[&str]) -> (Panel, String) {
        let out = run(&[&["import-panel"], args].concat());
        assert!(out.status.success(), "{}", stderr(&out));
        let panel = serde_saphyr::from_str(&stdout(&out)).unwrap();
        (panel, stderr(&out))
    }

    /// Each control's section, label, kind and place, as `(section, label, kind, x, y)`.
    fn places(panel: &Panel) -> Vec<(String, String, PanelItemKind, f64, f64)> {
        panel
            .sections
            .iter()
            .flat_map(|s| {
                s.items
                    .iter()
                    .map(|i| (s.id.clone(), i.label.clone(), i.kind, i.x, i.y))
            })
            .collect()
    }

    /// Each expected control is within one unit of where it is drawn.
    fn assert_places(panel: &Panel, expected: &[(&str, &str, PanelItemKind, f64, f64)]) {
        let found = places(panel);
        assert_eq!(found.len(), expected.len(), "{found:?}");
        for (section, label, kind, x, y) in expected {
            let Some(f) = found.iter().find(|f| f.0 == *section && f.1 == *label) else {
                panic!("no `{label}` in section `{section}`: {found:?}");
            };
            assert_eq!(f.2, *kind, "{label}");
            assert!(
                (f.3 - x).abs() <= 1.0 && (f.4 - y).abs() <= 1.0,
                "{label} is at ({}, {}), drawn at ({x}, {y})",
                f.3,
                f.4
            );
        }
    }

    #[test]
    fn a_drawing_saved_like_inkscape_becomes_sections_and_controls_where_they_are_drawn() {
        use PanelItemKind as K;
        let (panel, warnings) = import(&[&drawing("inkscape.svg"), "--id", "imported"]);
        assert_eq!(
            (panel.id.as_str(), panel.width, panel.height),
            ("imported", 400.0, 200.0)
        );
        // The `outline` path, moved by its layer's transform.
        assert_eq!(
            panel.outline,
            vec![
                [0.0, 0.0],
                [400.0, 0.0],
                [400.0, 150.0],
                [350.0, 200.0],
                [0.0, 200.0]
            ]
        );
        let boxes: Vec<_> = panel
            .sections
            .iter()
            .map(|s| (s.id.as_str(), s.x, s.y, s.width, s.height))
            .collect();
        assert_eq!(
            boxes,
            [
                ("electrical", 10.0, 10.0, 185.0, 90.0),
                ("fuel", 200.0, 10.0, 190.0, 130.0)
            ]
        );
        // In section units: the layer's translate, a control's own translate and matrix, and a
        // rotation inside an unnamed group are all applied.
        assert_places(
            &panel,
            &[
                ("electrical", "BATTERY", K::ToggleSwitch, 30.0, 30.0),
                ("electrical", "BATT LOW", K::Light, 80.0, 30.0),
                ("electrical", "VOLTS", K::DisplayUnit, 145.0, 30.0),
                ("electrical", "FREQ", K::Readout, 160.0, 65.0),
                ("fuel", "FUEL MODE", K::Selector, 30.0, 30.0),
                ("fuel", "TEST", K::PushButton, 70.0, 30.0),
                ("fuel", "CUTOFF", K::Lever, 110.0, 30.0),
                ("fuel", "FIRE", K::Handle, 150.0, 30.0),
                ("fuel", "QTY", K::Gauge, 30.0, 70.0),
                ("fuel", "XFEED", K::PushPullKnob, 70.0, 70.0),
                ("fuel", "PUMP", K::LegendPushbutton, 110.0, 70.0),
                ("fuel", "WIPER", K::Rocker, 150.0, 70.0),
                ("fuel", "ENTRY", K::Keypad, 30.0, 105.0),
            ],
        );
        let items: Vec<_> = panel.sections.iter().flat_map(|s| &s.items).collect();
        let item = |label: &str| *items.iter().find(|i| i.label == label).unwrap();
        // A light's color and a legend's light come from their fill; a display's size from its box.
        assert_eq!(item("BATT LOW").color, Some(LightColor::Amber));
        let legends: Vec<_> = item("PUMP")
            .legends
            .iter()
            .map(|l| (l.text.as_str(), l.light))
            .collect();
        assert_eq!(
            legends,
            [("FAULT", LightColor::Amber), ("OFF", LightColor::White)]
        );
        assert_eq!(
            (item("VOLTS").width, item("VOLTS").height),
            (Some(50.0), Some(20.0))
        );
        assert_eq!(item("BATTERY").id.as_deref(), Some("battery"));
        assert_eq!(item("BATT LOW").id.as_deref(), Some("batt-low"));
        // The hidden layer's section is not read.
        assert!(!warnings.contains("hidden") && panel.sections.len() == 2);
        // What the rule doesn't cover is named by its group, and the rest is still written.
        assert!(
            warnings.contains("`slider` in `slider:TRIM` (`g30`) is not a panel item kind"),
            "{warnings}"
        );
        assert!(
            warnings.contains("group `g16` in section `electrical` has no `<kind>:<LABEL>` name"),
            "{warnings}"
        );
    }

    #[test]
    fn a_drawing_saved_like_illustrator_has_its_escaped_names_style_sheet_and_symbols_read() {
        use PanelItemKind as K;
        let (panel, warnings) = import(&[&drawing("illustrator.svg")]);
        assert_eq!(panel.id, "illustrator");
        assert_eq!((panel.width, panel.height), (300.0, 120.0));
        assert!(panel.outline.is_empty(), "a box needs no outline");
        assert_places(
            &panel,
            &[
                ("hydraulics", "ENG PUMP A", K::ToggleSwitch, 30.0, 30.0),
                // `_1_` keeps ids apart; it is not part of the name.
                ("hydraulics", "LOW PRESS", K::Light, 70.0, 30.0),
                // A rotated ellipse, by a matrix.
                ("hydraulics", "ELEC PUMP", K::Selector, 110.0, 30.0),
                // A `<use>` of a symbol.
                ("hydraulics", "WIPER", K::Rocker, 50.0, 70.0),
                // Drawn over the section, outside its group.
                ("hydraulics", "TEST", K::PushButton, 95.0, 75.0),
                // Named in data-name; drawn as two arcs.
                ("brakes", "PARK BRAKE", K::Handle, 10.0, 10.0),
            ],
        );
        let light = panel.sections[0]
            .items
            .iter()
            .find(|i| i.kind == K::Light)
            .unwrap();
        assert_eq!(
            light.color,
            Some(LightColor::Green),
            "from the `.st1` class"
        );
        assert!(warnings.is_empty(), "{warnings}");
    }

    #[test]
    fn every_value_read_from_the_drawing_is_marked_for_the_author_to_check() {
        let out = run(&["import-panel", &drawing("inkscape.svg")]);
        let yaml = stdout(&out);
        let marked: Vec<&str> = yaml
            .lines()
            .filter(|l| l.ends_with("  # from the drawing; check it"))
            .map(|l| l.split("  #").next().unwrap().trim())
            .collect();
        // The light's color, and each legend's text and light; nothing else.
        assert_eq!(
            marked,
            [
                "color: amber",
                "- text: FAULT",
                "light: amber",
                "- text: \"OFF\"",
                "light: white"
            ],
            "{yaml}"
        );

        // A color the drawing doesn't give: white, marked to set, and still a warning.
        let dir = scratch("unreadable");
        let file = dir.join("panel.svg");
        std::fs::write(
            &file,
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><g id="section:a"><rect width="50" height="50"/><circle id="light:LOW" cx="10" cy="10" r="3"/><g id="legend_pushbutton:PUMP"><rect x="20" y="20" width="10" height="10"/><text x="21" y="25">FAULT</text></g></g></svg>"#,
        )
        .unwrap();
        let out = run(&["import-panel", &file.to_string_lossy()]);
        assert!(out.status.success(), "{}", stderr(&out));
        let yaml = stdout(&out);
        assert!(
            yaml.contains("color: white  # not readable in the drawing; set it"),
            "{yaml}"
        );
        assert!(
            yaml.contains("light: white  # not readable in the drawing; set it"),
            "{yaml}"
        );
        assert!(
            yaml.contains("- text: FAULT  # from the drawing; check it"),
            "{yaml}"
        );
        let warnings = stderr(&out);
        assert!(
            warnings.contains("`light:LOW` (`light:LOW`): its color is not one a light has"),
            "{warnings}"
        );
        assert!(
            warnings.contains("legend `FAULT` has no color a light has"),
            "{warnings}"
        );
        // The comments don't change what the file says.
        let panel: Panel = serde_saphyr::from_str(&yaml).unwrap();
        assert_eq!(panel.sections[0].items[0].color, Some(LightColor::White));
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn an_imported_panel_passes_check_once_positions_are_filled_in() {
        let dir = scratch("check");
        let pack = dir.join("demo");
        assert!(run(&["new", &pack.to_string_lossy()]).status.success());
        let file = pack.join("panels/imported.yaml");
        let out = run(&[
            "import-panel",
            &drawing("inkscape.svg"),
            "--id",
            "imported",
            "--out",
            &file.to_string_lossy(),
        ]);
        assert!(out.status.success(), "{}", stderr(&out));
        assert!(
            stdout(&out).contains("2 sections, 13 controls"),
            "{}",
            stdout(&out)
        );
        // Written once: never over a file that is there.
        let again = run(&[
            "import-panel",
            &drawing("inkscape.svg"),
            "--out",
            &file.to_string_lossy(),
        ]);
        assert!(!again.status.success());
        assert!(
            stderr(&again).contains("is already there"),
            "{}",
            stderr(&again)
        );

        // The author's part: positions, by kind.
        let text = std::fs::read_to_string(&file).unwrap();
        let mut kind = String::new();
        let filled: Vec<String> = text
            .lines()
            .map(|line| {
                if let Some(k) = line
                    .trim_start()
                    .trim_start_matches("- ")
                    .strip_prefix("kind: ")
                {
                    k.clone_into(&mut kind);
                }
                if line.trim() != "positions: []" {
                    return line.to_owned();
                }
                let positions = match kind.as_str() {
                    "rocker" => r#"["ON", "OFF"]"#,
                    "push_pull_knob" => r#"["IN", "OUT"]"#,
                    "keypad" => r#"["1", "2", "3"]"#,
                    _ => r#"["OFF", "ON"]"#,
                };
                line.replace("[]", positions)
            })
            .collect();
        std::fs::write(&file, filled.join("\n")).unwrap();
        let manifest = pack.join("pack.json");
        let mut json: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(&manifest).unwrap()).unwrap();
        json["panels"]
            .as_array_mut()
            .unwrap()
            .push("panels/imported.yaml".into());
        std::fs::write(&manifest, json.to_string()).unwrap();

        let check = run(&["check", &pack.to_string_lossy()]);
        assert!(check.status.success(), "{}", stdout(&check));
        assert!(!stdout(&check).contains("P0"), "{}", stdout(&check));
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Runs the command on `svg` and expects it refused, with `why` in the message.
    fn assert_refused(name: &str, svg: &str, why: &str) {
        let dir = scratch(name);
        let file = dir.join("panel.svg");
        std::fs::write(&file, svg).unwrap();
        let out = run(&["import-panel", &file.to_string_lossy()]);
        assert_eq!(out.status.code(), Some(2), "{name}: {}", stdout(&out));
        assert!(stdout(&out).is_empty(), "{name}: nothing is written");
        let err = stderr(&out);
        assert!(
            err.contains("refused") && err.contains(why),
            "{name}: {err}"
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    fn svg(body: &str) -> String {
        format!(
            r#"<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><g id="section:a"><rect width="10" height="10"/></g>{body}</svg>"#
        )
    }

    #[test]
    fn a_drawing_that_links_outside_itself_or_holds_a_script_is_refused() {
        assert_refused(
            "image",
            &svg(r#"<image href="https://example.com/panel.png" width="10" height="10"/>"#),
            "links `https://example.com/panel.png`",
        );
        assert_refused(
            "use",
            &svg(r#"<use xlink:href="other.svg#knob"/>"#),
            "links `other.svg#knob`",
        );
        assert_refused(
            "css",
            &svg(r#"<rect style="fill:url(https://example.com/a.svg#p)" width="1" height="1"/>"#),
            "url(https://example.com/a.svg#p)",
        );
        assert_refused(
            "import",
            &svg("<style>@import 'https://example.com/a.css';</style>"),
            "@import",
        );
        assert_refused(
            "entity",
            &format!(
                "<!DOCTYPE svg [<!ENTITY ext SYSTEM \"file:///etc/hostname\">]>{}",
                svg("<text>&ext;</text>")
            ),
            "external entity",
        );
        assert_refused("script", &svg("<script>alert(1)</script>"), "script");
        assert_refused(
            "onload",
            &svg(r#"<rect onload="alert(1)" width="1" height="1"/>"#),
            "`onload`",
        );
    }

    #[test]
    fn a_drawing_over_the_size_or_depth_limit_is_refused() {
        // Over 4 MB.
        let padding = format!("<!-- {} -->", "x".repeat(4 * 1024 * 1024));
        assert_refused("size", &svg(&padding), "over 4 MB");
        // 65 levels deep, counting the root.
        let deep = format!("{}{}", "<g>".repeat(64), "</g>".repeat(64));
        assert_refused("depth", &svg(&deep), "nested more than 64 levels");
        // 63 levels is read.
        let dir = scratch("depth-ok");
        let file = dir.join("panel.svg");
        let ok = format!("{}{}", "<g>".repeat(62), "</g>".repeat(62));
        std::fs::write(&file, svg(&ok)).unwrap();
        assert!(
            run(&["import-panel", &file.to_string_lossy()])
                .status
                .success()
        );
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn a_drawing_without_sections_says_how_to_name_them() {
        let dir = scratch("no-sections");
        let file = dir.join("panel.svg");
        std::fs::write(
            &file,
            r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>"#,
        )
        .unwrap();
        let out = run(&["import-panel", &file.to_string_lossy()]);
        assert_eq!(out.status.code(), Some(2));
        assert!(
            stderr(&out).contains("name a group `section:<id>`"),
            "{}",
            stderr(&out)
        );
        let _ = std::fs::remove_dir_all(dir);
    }
}
