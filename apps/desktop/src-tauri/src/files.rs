// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! What the desktop app keeps, as files in its data folder (decision 0031, "Files on disk"): one
//! file per saved item, in the web app's saved formats, and the installed packs in `packs/`. This
//! module only reads and writes files by name; what goes in them, and how they are read and
//! migrated, is the same `involo-app-core` code the web app uses.
//!
//! - **A write never leaves a half-written file:** the text goes to a temporary file in the same
//!   folder, is flushed to the disk, and only then renamed over the old one.
//! - **Nothing is deleted that the app can't use:** saved text is set aside under its own name
//!   (`<name>.kept-<time>`), never written over.
//! - **Names stay inside the folder:** a name is a file name, or `packs/` and a file name, of
//!   lowercase letters, digits, dots, hyphens and underscores, starting with a letter or digit.

use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

/// The folder that holds installed packs, inside the data folder.
pub const PACKS: &str = "packs";

/// The data folder's files.
#[derive(Debug)]
pub struct Files {
    dir: PathBuf,
}

/// Whether a file name is one the app writes: no path, no hidden or temporary file.
fn plain(name: &str) -> bool {
    let mut chars = name.chars();
    chars
        .next()
        .is_some_and(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
        && chars
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '.' | '-' | '_'))
}

impl Files {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    /// The file a name stands for, or why the name isn't allowed.
    fn path(&self, name: &str) -> io::Result<PathBuf> {
        let ok = match name.split_once('/') {
            Some((folder, file)) => folder == PACKS && plain(file),
            None => plain(name),
        };
        if ok {
            Ok(self.dir.join(name))
        } else {
            Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                format!("{name} is not a name the app saves under"),
            ))
        }
    }

    /// The text saved under a name, or None when there is none.
    pub fn read(&self, name: &str) -> io::Result<Option<String>> {
        match fs::read_to_string(self.path(name)?) {
            Ok(text) => Ok(Some(text)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    }

    /// Saves text under a name: written to a temporary file beside it, flushed, then renamed into
    /// place, so the old file stays whole until the new one is complete.
    pub fn write(&self, name: &str, text: &str) -> io::Result<()> {
        self.write_with(name, text, |_| Ok(()))
    }

    /// `write`, with a step run just before the rename (the tests fail it on purpose).
    fn write_with(
        &self,
        name: &str,
        text: &str,
        before_rename: impl FnOnce(&Path) -> io::Result<()>,
    ) -> io::Result<()> {
        let path = self.path(name)?;
        let folder = path.parent().unwrap_or(&self.dir);
        fs::create_dir_all(folder)?;
        let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
        let temp = folder.join(format!(".{file_name}.tmp"));
        let written = (|| {
            let mut file = fs::File::create(&temp)?;
            file.write_all(text.as_bytes())?;
            file.sync_all()?;
            drop(file);
            before_rename(&temp)?;
            fs::rename(&temp, &path)
        })();
        if written.is_err() {
            let _ = fs::remove_file(&temp);
        }
        written
    }

    /// Removes what is saved under a name; nothing there is fine.
    pub fn remove(&self, name: &str) -> io::Result<()> {
        match fs::remove_file(self.path(name)?) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }

    /// Moves what is saved under a name aside to `<name>.kept-<stamp>`, so a new save can start.
    /// Nothing there is fine.
    pub fn set_aside(&self, name: &str, stamp: u64) -> io::Result<()> {
        let from = self.path(name)?;
        let to = self.path(&format!("{name}.kept-{stamp}"))?;
        match fs::rename(from, to) {
            Err(e) if e.kind() != io::ErrorKind::NotFound => Err(e),
            _ => Ok(()),
        }
    }

    /// The names saved in the data folder (`""`) or in `packs`, sorted; none when it doesn't exist
    /// yet. Temporary files are left out.
    pub fn names(&self, folder: &str) -> io::Result<Vec<String>> {
        let dir = match folder {
            "" => self.dir.clone(),
            PACKS => self.dir.join(PACKS),
            _ => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    format!("{folder} is not a folder the app saves in"),
                ));
            }
        };
        let entries = match fs::read_dir(dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e),
        };
        let mut names = Vec::new();
        for entry in entries {
            let entry = entry?;
            if !entry.file_type()?.is_file() {
                continue;
            }
            if let Some(name) = entry.file_name().to_str().filter(|n| plain(n)) {
                names.push(name.to_owned());
            }
        }
        names.sort();
        Ok(names)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A data folder of its own for each test, removed afterwards.
    struct Folder(PathBuf);
    impl Folder {
        fn new(test: &str) -> Self {
            let dir =
                std::env::temp_dir().join(format!("involo-files-{test}-{}", std::process::id()));
            let _ = fs::remove_dir_all(&dir);
            Self(dir)
        }
        fn files(&self) -> Files {
            Files::new(self.0.clone())
        }
    }
    impl Drop for Folder {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn what_is_written_reads_back_and_survives_a_new_start() {
        let folder = Folder::new("roundtrip");
        let files = folder.files();
        assert_eq!(files.read("settings.json").unwrap(), None);
        files.write("settings.json", r#"{"format":11}"#).unwrap();
        files.write("flight.example-twin.json", "{}").unwrap();
        files
            .write("packs/example-twin.involo-pack", "pack")
            .unwrap();
        // A new start reads the same folder.
        let again = folder.files();
        assert_eq!(
            again.read("settings.json").unwrap().as_deref(),
            Some(r#"{"format":11}"#)
        );
        assert_eq!(
            again
                .read("packs/example-twin.involo-pack")
                .unwrap()
                .as_deref(),
            Some("pack")
        );
        assert_eq!(
            again.names("").unwrap(),
            ["flight.example-twin.json", "settings.json"]
        );
        assert_eq!(again.names(PACKS).unwrap(), ["example-twin.involo-pack"]);
        again.remove("flight.example-twin.json").unwrap();
        again.remove("flight.example-twin.json").unwrap();
        assert_eq!(again.read("flight.example-twin.json").unwrap(), None);
    }

    #[test]
    fn a_write_that_fails_before_the_rename_leaves_the_old_file_whole() {
        let folder = Folder::new("failed-write");
        let files = folder.files();
        files.write("log.json", "the old log").unwrap();
        let failed = files.write_with("log.json", "the new log", |_| {
            Err(io::Error::other("disk full"))
        });
        assert_eq!(failed.unwrap_err().to_string(), "disk full");
        assert_eq!(
            files.read("log.json").unwrap().as_deref(),
            Some("the old log")
        );
        // No temporary file is left behind, and none is ever listed.
        assert_eq!(fs::read_dir(&folder.0).unwrap().count(), 1);
        files
            .write_with("log.json", "x", |temp| {
                assert!(temp.exists());
                assert_eq!(files.names("").unwrap(), ["log.json"]);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn text_is_set_aside_under_its_own_name_never_deleted() {
        let folder = Folder::new("set-aside");
        let files = folder.files();
        files.write("plan.example-twin.json", "not json").unwrap();
        files
            .set_aside("plan.example-twin.json", 1_700_000_000_000)
            .unwrap();
        assert_eq!(files.read("plan.example-twin.json").unwrap(), None);
        assert_eq!(
            files
                .read("plan.example-twin.json.kept-1700000000000")
                .unwrap()
                .as_deref(),
            Some("not json")
        );
        // Nothing to set aside is fine.
        files.set_aside("plan.example-twin.json", 1).unwrap();
    }

    #[test]
    fn a_name_never_leaves_the_folder() {
        let folder = Folder::new("names");
        let files = folder.files();
        for name in [
            "../outside.json",
            "packs/../../outside",
            "/etc/passwd",
            "C:\\Windows\\win.ini",
            "other/settings.json",
            ".hidden",
            "Settings.json",
            "",
            "packs/",
            "packs/sub/pack",
        ] {
            assert_eq!(
                files.write(name, "x").unwrap_err().kind(),
                io::ErrorKind::InvalidInput,
                "{name}"
            );
            assert!(files.read(name).is_err(), "{name}");
        }
        assert!(files.names("..").is_err());
        assert!(!folder.0.exists() || fs::read_dir(&folder.0).unwrap().count() == 0);
    }

    #[test]
    fn a_file_that_cant_be_read_is_an_error_not_nothing() {
        let folder = Folder::new("unreadable");
        let files = folder.files();
        fs::create_dir_all(folder.0.join("log.json")).unwrap();
        assert!(files.read("log.json").is_err());
    }
}
