// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! The desktop app's update check (decision 0031, "Updates"; #116): notify only (0005). The host
//! asks GitHub for the latest release; this decides whether it is newer than the running version.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Where the releases are. The notice links to the release's page, built from its version, never
/// from an address in the reply.
const RELEASES: &str = "https://github.com/offbyonce/involo/releases/tag/v";

/// A release newer than the running app: its version, and its page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, TS)]
#[ts(export)]
pub struct NewerRelease {
    pub version: String,
    pub url: String,
}

/// The fields of GitHub's latest-release reply the check reads.
#[derive(Deserialize)]
struct Latest {
    tag_name: String,
    #[serde(default)]
    draft: bool,
    #[serde(default)]
    prerelease: bool,
}

/// The release in GitHub's latest-release `reply`, when it is newer than `running`, by semantic
/// version (so 0.1.10 is newer than 0.1.9). None when it isn't newer, is a draft or pre-release,
/// or the reply can't be read: then nothing shows.
pub fn newer_release(reply: &str, running: &str) -> Option<NewerRelease> {
    let latest: Latest = serde_json::from_str(reply).ok()?;
    if latest.draft || latest.prerelease {
        return None;
    }
    let tag = latest
        .tag_name
        .strip_prefix('v')
        .unwrap_or(&latest.tag_name);
    let version = semver::Version::parse(tag).ok()?;
    let running = semver::Version::parse(running).ok()?;
    (version.pre.is_empty() && version > running).then(|| NewerRelease {
        url: format!("{RELEASES}{version}"),
        version: version.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn reply(tag: &str) -> String {
        format!(
            r#"{{"tag_name":"{tag}","html_url":"https://example.com/elsewhere","draft":false,"prerelease":false}}"#
        )
    }

    #[test]
    fn a_newer_release_is_found_by_semantic_version() {
        assert_eq!(
            newer_release(&reply("v0.1.10"), "0.1.9"),
            Some(NewerRelease {
                version: "0.1.10".into(),
                url: "https://github.com/offbyonce/involo/releases/tag/v0.1.10".into(),
            })
        );
        assert_eq!(
            newer_release(&reply("v0.1.10"), "0.1.0").map(|r| r.version),
            Some("0.1.10".into())
        );
        assert_eq!(
            newer_release(&reply("0.2.0"), "0.1.10").map(|r| r.version),
            Some("0.2.0".into())
        );
    }

    #[test]
    fn the_same_or_an_older_release_is_not_newer() {
        assert_eq!(newer_release(&reply("v0.1.0"), "0.1.0"), None);
        assert_eq!(newer_release(&reply("v0.1.9"), "0.1.10"), None);
    }

    #[test]
    fn drafts_pre_releases_and_replies_it_cant_read_show_nothing() {
        assert_eq!(newer_release(&reply("v0.2.0-beta.1"), "0.1.0"), None);
        let draft = r#"{"tag_name":"v0.2.0","draft":true}"#;
        assert_eq!(newer_release(draft, "0.1.0"), None);
        let pre = r#"{"tag_name":"v0.2.0","prerelease":true}"#;
        assert_eq!(newer_release(pre, "0.1.0"), None);
        for bad in [
            "",
            "not json",
            r#"{"message":"API rate limit exceeded"}"#,
            r#"{"tag_name":"latest"}"#,
        ] {
            assert_eq!(newer_release(bad, "0.1.0"), None, "{bad}");
        }
    }

    #[test]
    fn the_page_comes_from_the_version_never_from_the_reply() {
        let found = newer_release(&reply("v1.0.0"), "0.1.0").unwrap();
        assert_eq!(
            found.url,
            "https://github.com/offbyonce/involo/releases/tag/v1.0.0"
        );
    }
}
