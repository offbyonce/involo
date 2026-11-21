// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The one folder `involo-pack mcp` works in (decision 0030). Every path a client names is
//! relative to it, and is refused when it would leave it: an absolute path, a `..`, or a symlink
//! that points outside. Before a pack is read, every symlink in it is checked the same way.

use std::path::{Component, Path, PathBuf};

use anyhow::{Context, Result, bail};

/// The folder the server reads and writes in, as its real path.
pub struct Workspace {
    root: PathBuf,
}

impl Workspace {
    pub fn open(dir: &Path) -> Result<Self> {
        let root = dir
            .canonicalize()
            .with_context(|| format!("cannot open {}", dir.display()))?;
        if !root.is_dir() {
            bail!("{} is not a folder", dir.display());
        }
        Ok(Self { root })
    }

    pub fn root(&self) -> &Path {
        &self.root
    }

    /// The path a client names, inside the folder. It needn't exist yet, but the part of it that
    /// does must resolve inside the folder.
    pub fn resolve(&self, name: &str) -> Result<PathBuf> {
        let path = Path::new(name.trim());
        let mut parts = Vec::new();
        for part in path.components() {
            match part {
                Component::Normal(p) => parts.push(p),
                Component::CurDir => {}
                Component::ParentDir => {
                    bail!("refused `{name}`: `..` would leave the folder; name paths inside it")
                }
                Component::RootDir | Component::Prefix(_) => {
                    bail!(
                        "refused `{name}`: name a path relative to the folder, not an absolute one"
                    )
                }
            }
        }
        // The deepest part that exists, as its real path, symlinks followed.
        let mut existing = self.root.clone();
        let mut rest = parts.as_slice();
        while let Some((first, tail)) = rest.split_first() {
            let next = existing.join(first);
            if std::fs::symlink_metadata(&next).is_err() {
                break;
            }
            existing = next
                .canonicalize()
                .with_context(|| format!("refused `{name}`: it leads to a missing file"))?;
            if !existing.starts_with(&self.root) {
                bail!("refused `{name}`: it leads outside the folder through a symlink");
            }
            rest = tail;
        }
        Ok(rest.iter().fold(existing, |p, part| p.join(part)))
    }

    /// Refuses `dir` if any symlink in it points outside the folder, or nowhere.
    pub fn check_tree(&self, dir: &Path) -> Result<()> {
        let mut stack = vec![dir.to_path_buf()];
        while let Some(d) = stack.pop() {
            let entries =
                std::fs::read_dir(&d).with_context(|| format!("cannot read {}", self.show(&d)))?;
            for entry in entries {
                let path = entry?.path();
                let meta = std::fs::symlink_metadata(&path)?;
                if meta.file_type().is_symlink() {
                    let inside = path
                        .canonicalize()
                        .is_ok_and(|target| target.starts_with(&self.root));
                    if !inside {
                        bail!(
                            "refused {}: it is a symlink that leads outside the folder",
                            self.show(&path)
                        );
                    }
                } else if meta.is_dir() {
                    stack.push(path);
                }
            }
        }
        Ok(())
    }

    /// Where to look for a pack's parent: beside it and in `parents`, each only inside the folder.
    pub fn places(&self, dir: &Path, parents: &[PathBuf]) -> Vec<PathBuf> {
        crate::check::places(dir, parents)
            .into_iter()
            .filter(|p| p.starts_with(&self.root))
            .collect()
    }

    /// A path in the folder as a client names it: relative, with `/`.
    pub fn show(&self, path: &Path) -> String {
        let rel = path.strip_prefix(&self.root).unwrap_or(path);
        let text = rel.to_string_lossy().replace('\\', "/");
        if text.is_empty() { ".".into() } else { text }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pack-ws-{}-{name}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(dir.join("inside/lists")).unwrap();
        dir
    }

    #[test]
    fn names_inside_the_folder_resolve_and_others_are_refused() {
        let dir = scratch("names");
        let ws = Workspace::open(&dir.join("inside")).unwrap();
        assert_eq!(ws.resolve("lists").unwrap(), ws.root().join("lists"));
        assert_eq!(
            ws.resolve("./new/pack").unwrap(),
            ws.root().join("new/pack")
        );
        assert_eq!(ws.resolve(".").unwrap(), ws.root());
        assert!(ws.resolve("../x").unwrap_err().to_string().contains("`..`"));
        assert!(ws.resolve("lists/../../x").is_err());
        assert!(
            ws.resolve("/etc/hostname")
                .unwrap_err()
                .to_string()
                .contains("absolute")
        );
        assert_eq!(ws.show(&ws.root().join("lists/a.yaml")), "lists/a.yaml");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[cfg(unix)]
    #[test]
    fn a_symlink_out_of_the_folder_is_refused() {
        let dir = scratch("links");
        std::fs::create_dir_all(dir.join("secret")).unwrap();
        let ws = Workspace::open(&dir.join("inside")).unwrap();
        std::os::unix::fs::symlink(dir.join("secret"), dir.join("inside/out")).unwrap();
        std::os::unix::fs::symlink(ws.root().join("lists"), dir.join("inside/in")).unwrap();
        assert!(
            ws.resolve("out/x.yaml")
                .unwrap_err()
                .to_string()
                .contains("symlink")
        );
        assert_eq!(
            ws.resolve("in/x.yaml").unwrap(),
            ws.root().join("lists/x.yaml")
        );
        let refused = ws.check_tree(ws.root()).unwrap_err().to_string();
        assert!(
            refused.contains("refused out: it is a symlink"),
            "{refused}"
        );
        std::fs::remove_file(dir.join("inside/out")).unwrap();
        assert!(ws.check_tree(ws.root()).is_ok());
        let _ = std::fs::remove_dir_all(dir);
    }
}
