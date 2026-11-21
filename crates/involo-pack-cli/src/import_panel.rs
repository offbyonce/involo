// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

//! `involo-pack import-panel`: a panel drawn in a vector drawing tool, as a panel file for the
//! author to finish (decision 0030). Packs never hold SVG; this only reads one.
//!
//! The drawing names what becomes the panel: a group (or a single shape) named `section:<id>` is a
//! section, one named `<kind>:<LABEL>` (`toggle_switch:FUEL PUMP L`) is a control at the center of
//! what it draws, and one named `outline` is the panel's outline, or its section's inside a
//! section. A name is read from the drawing tool's layer name (`inkscape:label`, `data-name`) or
//! the element's `id`, with the `_xHH_` escapes some tools write decoded. Everything else in the
//! drawing is ignored.
//!
//! The file is read as untrusted: it must be small, not nested too deeply, and self-contained
//! (no links to other files or sites, no external entities), and it must hold no scripts.

use std::collections::{BTreeMap, BTreeSet};
use std::fmt::Write as _;

use std::path::Path;

use anyhow::{Context as _, Result, bail};

use crate::words;
use involo_checklist_core::PanelItemKind;
use roxmltree::{Document, Node, ParsingOptions};

/// The largest drawing read, in bytes.
pub const MAX_BYTES: u64 = 4 * 1024 * 1024;
/// The deepest an element may be nested.
pub const MAX_DEPTH: usize = 64;
/// The most XML nodes read.
const MAX_NODES: u32 = 200_000;
/// How many `<use>` links are followed one inside another, and in all.
const MAX_USE_DEPTH: usize = 8;
const MAX_USES: usize = 10_000;
/// Points a curve or circle is drawn with, to find what it covers.
const CURVE_STEPS: usize = 32;

const SVG_NS: &str = "http://www.w3.org/2000/svg";
const INKSCAPE_NS: &str = "http://www.inkscape.org/namespaces/inkscape";

/// What the panel file is called and how big it is drawn.
pub struct Options {
    /// The panel's id.
    pub id: String,
    /// How many panel units wide the panel is; one drawing unit is one panel unit otherwise.
    pub width: Option<f64>,
    /// The drawing's file name, for the file's first comment.
    pub source: String,
}

/// A panel file, and what was left out of it or guessed.
pub struct Imported {
    pub yaml: String,
    pub warnings: Vec<String>,
    pub sections: usize,
    pub items: usize,
}

/// The panel id: `id` when given, else the drawing's file name as an id.
pub fn panel_id(id: Option<String>, svg: &Path) -> Result<String> {
    let stem = svg
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let id = id.unwrap_or_else(|| slug(&stem));
    if !involo_pack::validate::valid_pack_id(&id) || id.contains('.') {
        bail!(
            "`{id}` can't be a panel id: use lower-case letters, digits and dashes, such as `overhead`, with `--id`"
        );
    }
    Ok(id)
}

/// Reads the drawing at `svg` into the panel file `id`: refused, before it is read, when it is
/// over [`MAX_BYTES`].
pub fn import_file(svg: &Path, id: &str, width: Option<f64>) -> Result<Imported> {
    let refused = |why: String| anyhow::anyhow!("refused {}: {why}", svg.display());
    let size = std::fs::metadata(svg)
        .with_context(|| format!("cannot read {}", svg.display()))?
        .len();
    if size > MAX_BYTES {
        return Err(refused(format!(
            "it is over {} MB; a panel drawing is far smaller",
            MAX_BYTES / 1024 / 1024
        )));
    }
    let text = std::fs::read_to_string(svg)
        .with_context(|| format!("cannot read {} as text", svg.display()))?;
    let opts = Options {
        id: id.to_owned(),
        width,
        source: svg
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
    };
    import(&text, &opts).map_err(|e| refused(e.to_string()))
}

/// Writes a panel file to `out`, never over a file that is there.
pub fn write_new(out: &Path, yaml: &str) -> Result<()> {
    if out.exists() {
        bail!(
            "{} is already there; choose another file or remove it first",
            out.display()
        );
    }
    std::fs::write(out, yaml).with_context(|| format!("cannot write {}", out.display()))
}

/// Reads `text`, an SVG drawing, into a panel file.
pub fn import(text: &str, opts: &Options) -> Result<Imported> {
    if text.len() as u64 > MAX_BYTES {
        bail!(
            "the drawing is over {} MB; a panel drawing is far smaller",
            MAX_BYTES / 1024 / 1024
        );
    }
    let refuse_entity = |_: Option<&str>, uri: &str| -> std::result::Result<Option<&str>, String> {
        Err(format!("it declares an external entity (`{uri}`)"))
    };
    let options = ParsingOptions {
        allow_dtd: true,
        nodes_limit: MAX_NODES,
        entity_resolver: Some(&refuse_entity),
    };
    let doc = Document::parse_with_options(text, options)
        .map_err(|e| anyhow::anyhow!("not a drawing that can be read: {e}"))?;
    let root = doc.root_element();
    if root.tag_name().name() != "svg" {
        bail!(
            "not an SVG drawing: its root element is `{}`",
            root.tag_name().name()
        );
    }
    refuse_unsafe(&doc)?;
    let mut drawing = Drawing::new(&doc);
    drawing.walk(root, Affine::IDENTITY, Context::default());
    drawing.finish(root, opts)
}

/// Refuses a drawing that is nested too deeply, links outside itself or holds a script.
fn refuse_unsafe(doc: &Document) -> Result<()> {
    for node in doc.descendants().filter(Node::is_element) {
        let what = describe(node);
        if node.ancestors().count() > MAX_DEPTH + 1 {
            bail!("it is nested more than {MAX_DEPTH} levels deep (at {what})");
        }
        if node.tag_name().name() == "script" {
            bail!("it holds a script (at {what})");
        }
        for attr in node.attributes() {
            let name = attr.name();
            let value = attr.value().trim();
            if name.len() > 2 && name.starts_with("on") && attr.namespace().is_none() {
                bail!("it holds a script: `{name}` on {what}");
            }
            if name == "href" && !(value.starts_with('#') || value.starts_with("data:")) {
                bail!("it links outside itself: {what} links `{value}`");
            }
            if let Some(link) = outside_link(value) {
                bail!("it links outside itself: {what} uses `{link}`");
            }
        }
        if node.tag_name().name() == "style"
            && let Some(css) = node.text()
            && let Some(link) = outside_link(css)
        {
            bail!("it links outside itself: a style sheet uses `{link}`");
        }
    }
    Ok(())
}

/// The first `url(...)` or `@import` in CSS that names something outside the drawing.
fn outside_link(css: &str) -> Option<String> {
    if css.contains("@import") {
        return Some("@import".into());
    }
    css.match_indices("url(").find_map(|(at, _)| {
        let rest = &css[at + 4..];
        let inner = rest.split(')').next().unwrap_or(rest).trim();
        let inner = inner.trim_matches(['"', '\'']).trim();
        (!(inner.starts_with('#') || inner.starts_with("data:"))).then(|| format!("url({inner})"))
    })
}

/// An element as a message names it: `<image id="photo">`.
fn describe(node: Node) -> String {
    match node.attribute("id") {
        Some(id) => format!("`<{} id=\"{id}\">`", node.tag_name().name()),
        None => format!("`<{}>`", node.tag_name().name()),
    }
}

/// A 2D affine transform `[a b c d e f]`, as SVG writes one.
#[derive(Clone, Copy, Debug, PartialEq)]
struct Affine([f64; 6]);

// The matrix entries go by the single letters SVG names them with.
#[allow(clippy::many_single_char_names)]
impl Affine {
    const IDENTITY: Self = Self([1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);

    fn translate(x: f64, y: f64) -> Self {
        Self([1.0, 0.0, 0.0, 1.0, x, y])
    }

    /// `self` then, inside it, `inner`.
    fn then(self, inner: Self) -> Self {
        let [a, b, c, d, e, f] = self.0;
        let [p, q, r, s, t, u] = inner.0;
        Self([
            a * p + c * q,
            b * p + d * q,
            a * r + c * s,
            b * r + d * s,
            a * t + c * u + e,
            b * t + d * u + f,
        ])
    }

    fn apply(self, [x, y]: [f64; 2]) -> [f64; 2] {
        let [a, b, c, d, e, f] = self.0;
        [a * x + c * y + e, b * x + d * y + f]
    }

    /// A `transform` attribute; what can't be read counts as no transform.
    fn parse(text: &str) -> Self {
        let mut out = Self::IDENTITY;
        for part in text.split_inclusive(')') {
            let Some((name, args)) = part.split_once('(') else {
                continue;
            };
            let name = name.trim().trim_start_matches(',').trim();
            let Some(n) = numbers(args.trim_end_matches(')')) else {
                return Self::IDENTITY;
            };
            let step = match (name, n.as_slice()) {
                ("matrix", &[a, b, c, d, e, f]) => Self([a, b, c, d, e, f]),
                ("translate", &[x]) => Self::translate(x, 0.0),
                ("translate", &[x, y]) => Self::translate(x, y),
                ("scale", &[s]) => Self([s, 0.0, 0.0, s, 0.0, 0.0]),
                ("scale", &[x, y]) => Self([x, 0.0, 0.0, y, 0.0, 0.0]),
                ("rotate", &[deg]) => rotate(deg),
                ("rotate", &[deg, cx, cy]) => Self::translate(cx, cy)
                    .then(rotate(deg))
                    .then(Self::translate(-cx, -cy)),
                ("skewX", &[deg]) => Self([1.0, 0.0, deg.to_radians().tan(), 1.0, 0.0, 0.0]),
                ("skewY", &[deg]) => Self([1.0, deg.to_radians().tan(), 0.0, 1.0, 0.0, 0.0]),
                _ => return Self::IDENTITY,
            };
            out = out.then(step);
        }
        out
    }
}

fn rotate(deg: f64) -> Affine {
    let (sin, cos) = deg.to_radians().sin_cos();
    Affine([cos, sin, -sin, cos, 0.0, 0.0])
}

/// The numbers in an SVG list (`10,20 -3.5e2-4`), or `None` if something else is in it.
fn numbers(text: &str) -> Option<Vec<f64>> {
    let mut lexer = Lexer::new(text);
    let mut out = Vec::new();
    while lexer.more() {
        out.push(lexer.number()?);
    }
    Some(out)
}

/// Reads numbers, path commands and arc flags from SVG text.
struct Lexer<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl<'a> Lexer<'a> {
    fn new(text: &'a str) -> Self {
        Self {
            bytes: text.as_bytes(),
            at: 0,
        }
    }

    fn skip_separators(&mut self) {
        while self
            .bytes
            .get(self.at)
            .is_some_and(|b| b.is_ascii_whitespace() || *b == b',')
        {
            self.at += 1;
        }
    }

    /// Whether anything but separators is left.
    fn more(&mut self) -> bool {
        self.skip_separators();
        self.at < self.bytes.len()
    }

    fn peek(&mut self) -> Option<u8> {
        self.skip_separators();
        self.bytes.get(self.at).copied()
    }

    fn number(&mut self) -> Option<f64> {
        self.skip_separators();
        let start = self.at;
        let digits = |l: &mut Self| {
            let from = l.at;
            while l.bytes.get(l.at).is_some_and(u8::is_ascii_digit) {
                l.at += 1;
            }
            l.at > from
        };
        if matches!(self.bytes.get(self.at), Some(b'+' | b'-')) {
            self.at += 1;
        }
        let mut any = digits(self);
        if self.bytes.get(self.at) == Some(&b'.') {
            self.at += 1;
            any |= digits(self);
        }
        if !any {
            self.at = start;
            return None;
        }
        if matches!(self.bytes.get(self.at), Some(b'e' | b'E')) {
            let mark = self.at;
            self.at += 1;
            if matches!(self.bytes.get(self.at), Some(b'+' | b'-')) {
                self.at += 1;
            }
            if !digits(self) {
                self.at = mark;
            }
        }
        std::str::from_utf8(&self.bytes[start..self.at])
            .ok()?
            .parse()
            .ok()
    }

    /// An arc's flag: a single `0` or `1`, which may be written with no space after it.
    fn flag(&mut self) -> Option<bool> {
        let b = self.peek()?;
        self.at += 1;
        match b {
            b'0' => Some(false),
            b'1' => Some(true),
            _ => None,
        }
    }
}

/// The points a path's outline passes through, curves drawn with [`CURVE_STEPS`] points. What
/// follows a mistake in the path data is left out, as a browser does.
fn path_points(d: &str) -> Vec<[f64; 2]> {
    let mut lexer = Lexer::new(d);
    let mut out = Vec::new();
    let mut cur = [0.0, 0.0];
    let mut start = cur;
    // The last curve's second control point, for `S` and `T`.
    let mut control: Option<(u8, [f64; 2])> = None;
    let mut cmd = 0u8;
    while let Some(b) = lexer.peek() {
        if b.is_ascii_alphabetic() {
            cmd = b;
            lexer.at += 1;
            if cmd.eq_ignore_ascii_case(&b'z') {
                cur = start;
                out.push(cur);
                control = None;
                continue;
            }
        } else if cmd == 0 {
            break;
        }
        let rel = cmd.is_ascii_lowercase();
        let base = if rel { cur } else { [0.0, 0.0] };
        let point = |l: &mut Lexer| -> Option<[f64; 2]> {
            Some([base[0] + l.number()?, base[1] + l.number()?])
        };
        let upper = cmd.to_ascii_uppercase();
        let ok = match upper {
            b'M' | b'L' | b'T' => point(&mut lexer).map(|p| {
                if upper == b'T' {
                    let c = reflect(control, b'Q', cur);
                    quadratic(&mut out, cur, c, p);
                    control = Some((b'Q', c));
                } else {
                    out.push(p);
                    control = None;
                }
                if upper == b'M' {
                    start = p;
                    // Pairs after a move are lines.
                    cmd = if rel { b'l' } else { b'L' };
                }
                cur = p;
            }),
            b'H' => lexer.number().map(|x| {
                cur = [x + if rel { cur[0] } else { 0.0 }, cur[1]];
                out.push(cur);
                control = None;
            }),
            b'V' => lexer.number().map(|y| {
                cur = [cur[0], y + if rel { cur[1] } else { 0.0 }];
                out.push(cur);
                control = None;
            }),
            b'C' => (|| Some((point(&mut lexer)?, point(&mut lexer)?, point(&mut lexer)?)))().map(
                |(c1, c2, p)| {
                    cubic(&mut out, cur, c1, c2, p);
                    control = Some((b'C', c2));
                    cur = p;
                },
            ),
            b'S' => (|| Some((point(&mut lexer)?, point(&mut lexer)?)))().map(|(c2, p)| {
                let c1 = reflect(control, b'C', cur);
                cubic(&mut out, cur, c1, c2, p);
                control = Some((b'C', c2));
                cur = p;
            }),
            b'Q' => (|| Some((point(&mut lexer)?, point(&mut lexer)?)))().map(|(c, p)| {
                quadratic(&mut out, cur, c, p);
                control = Some((b'Q', c));
                cur = p;
            }),
            b'A' => (|| {
                let rx = lexer.number()?;
                let ry = lexer.number()?;
                let phi = lexer.number()?;
                let large = lexer.flag()?;
                let sweep = lexer.flag()?;
                Some((rx, ry, phi, large, sweep, point(&mut lexer)?))
            })()
            .map(|(rx, ry, phi, large, sweep, p)| {
                arc(&mut out, cur, [rx, ry], phi, large, sweep, p);
                control = None;
                cur = p;
            }),
            _ => None,
        };
        if ok.is_none() {
            break;
        }
    }
    out
}

/// The first control point of a smooth curve: the last one's reflected, or the current point.
fn reflect(control: Option<(u8, [f64; 2])>, kind: u8, cur: [f64; 2]) -> [f64; 2] {
    match control {
        Some((k, c)) if k == kind => [2.0 * cur[0] - c[0], 2.0 * cur[1] - c[1]],
        _ => cur,
    }
}

#[allow(clippy::cast_precision_loss)]
fn steps() -> impl Iterator<Item = f64> {
    (1..=CURVE_STEPS).map(|i| i as f64 / CURVE_STEPS as f64)
}

fn cubic(out: &mut Vec<[f64; 2]>, p0: [f64; 2], c1: [f64; 2], c2: [f64; 2], p: [f64; 2]) {
    for t in steps() {
        let u = 1.0 - t;
        let at = |i: usize| {
            u * u * u * p0[i] + 3.0 * u * u * t * c1[i] + 3.0 * u * t * t * c2[i] + t * t * t * p[i]
        };
        out.push([at(0), at(1)]);
    }
}

fn quadratic(out: &mut Vec<[f64; 2]>, p0: [f64; 2], c: [f64; 2], p: [f64; 2]) {
    for t in steps() {
        let u = 1.0 - t;
        let at = |i: usize| u * u * p0[i] + 2.0 * u * t * c[i] + t * t * p[i];
        out.push([at(0), at(1)]);
    }
}

/// An elliptical arc from `p0` to `p`, by the SVG specification's conversion to a center.
fn arc(
    out: &mut Vec<[f64; 2]>,
    p0: [f64; 2],
    radii: [f64; 2],
    phi_deg: f64,
    large: bool,
    sweep: bool,
    p: [f64; 2],
) {
    let (mut rx, mut ry) = (radii[0].abs(), radii[1].abs());
    if rx == 0.0 || ry == 0.0 || (p0[0] - p[0]).hypot(p0[1] - p[1]) < f64::EPSILON {
        out.push(p);
        return;
    }
    let (sin, cos) = phi_deg.to_radians().sin_cos();
    let (dx, dy) = ((p0[0] - p[0]) / 2.0, (p0[1] - p[1]) / 2.0);
    let x1 = cos * dx + sin * dy;
    let y1 = -sin * dx + cos * dy;
    let lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if lambda > 1.0 {
        rx *= lambda.sqrt();
        ry *= lambda.sqrt();
    }
    let num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    let den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    let side = if large == sweep { -1.0 } else { 1.0 };
    let coef = side * (num / den).max(0.0).sqrt();
    let (cxp, cyp) = (coef * rx * y1 / ry, -coef * ry * x1 / rx);
    let cx = cos * cxp - sin * cyp + f64::midpoint(p0[0], p[0]);
    let cy = sin * cxp + cos * cyp + f64::midpoint(p0[1], p[1]);
    let angle = |ux: f64, uy: f64, vx: f64, vy: f64| (ux * vy - uy * vx).atan2(ux * vx + uy * vy);
    let start = angle(1.0, 0.0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let mut delta = angle(
        (x1 - cxp) / rx,
        (y1 - cyp) / ry,
        (-x1 - cxp) / rx,
        (-y1 - cyp) / ry,
    );
    if !sweep && delta > 0.0 {
        delta -= std::f64::consts::TAU;
    } else if sweep && delta < 0.0 {
        delta += std::f64::consts::TAU;
    }
    for t in steps() {
        let (s, c) = (start + delta * t).sin_cos();
        out.push([
            cx + rx * c * cos - ry * s * sin,
            cy + rx * c * sin + ry * s * cos,
        ]);
    }
}

/// An ellipse's outline, as points.
#[allow(clippy::cast_precision_loss)]
fn ellipse(cx: f64, cy: f64, rx: f64, ry: f64) -> Vec<[f64; 2]> {
    (0..CURVE_STEPS * 2)
        .map(|i| {
            let (s, c) = (i as f64 * std::f64::consts::PI / CURVE_STEPS as f64).sin_cos();
            [cx + rx * c, cy + ry * s]
        })
        .collect()
}

/// A length attribute in drawing units (`12`, `12px`); 0 when missing.
fn length(node: Node, name: &str) -> f64 {
    node.attribute(name)
        .map(|v| v.trim().trim_end_matches("px"))
        .and_then(|v| v.parse().ok())
        .unwrap_or(0.0)
}

/// The box `[min x, min y, max x, max y]` around some points.
#[derive(Clone, Copy, Debug)]
struct Bounds([f64; 4]);

impl Bounds {
    fn of(points: &[[f64; 2]]) -> Option<Self> {
        let first = points.first()?;
        let mut b = [first[0], first[1], first[0], first[1]];
        for p in points {
            b = [
                b[0].min(p[0]),
                b[1].min(p[1]),
                b[2].max(p[0]),
                b[3].max(p[1]),
            ];
        }
        Some(Self(b))
    }

    fn center(self) -> [f64; 2] {
        [
            f64::midpoint(self.0[0], self.0[2]),
            f64::midpoint(self.0[1], self.0[3]),
        ]
    }

    fn contains(self, [x, y]: [f64; 2]) -> bool {
        x >= self.0[0] && x <= self.0[2] && y >= self.0[1] && y <= self.0[3]
    }

    fn width(self) -> f64 {
        self.0[2] - self.0[0]
    }

    fn height(self) -> f64 {
        self.0[3] - self.0[1]
    }
}

/// What one element of the drawing draws: its shapes' points and the first shape's outline, in
/// the root's units, and its text with where each sits and its color.
#[derive(Default)]
struct Geometry {
    points: Vec<[f64; 2]>,
    first_shape: Option<Vec<[f64; 2]>>,
    texts: Vec<(f64, String, Option<String>)>,
    fill: Option<String>,
}

/// What a name says an element is.
enum Named {
    Section(String),
    Item(PanelItemKind, String),
    Outline,
    UnknownKind(String),
}

/// What a group is inside, as the walk goes down.
#[derive(Clone, Copy, Default)]
struct Context {
    /// The section it is in, by index.
    section: Option<usize>,
}

struct SectionFound {
    id: String,
    svg_id: String,
    bounds: Option<Bounds>,
    outline: Option<Vec<[f64; 2]>>,
}

struct ItemFound {
    kind: PanelItemKind,
    label: String,
    svg_id: String,
    section: Option<usize>,
    bounds: Bounds,
    texts: Vec<(f64, String, Option<String>)>,
    fill: Option<String>,
}

struct Drawing<'a, 'input> {
    doc: &'a Document<'input>,
    /// Class name to its `fill`, from the drawing's style sheets.
    class_fill: BTreeMap<String, String>,
    sections: Vec<SectionFound>,
    items: Vec<ItemFound>,
    outline: Option<Vec<[f64; 2]>>,
    warnings: Vec<String>,
    /// `<use>` links still to be followed: a drawing whose links multiply stops being read.
    uses_left: std::cell::Cell<usize>,
}

impl<'a, 'input> Drawing<'a, 'input> {
    fn new(doc: &'a Document<'input>) -> Self {
        let mut class_fill = BTreeMap::new();
        for style in doc.descendants().filter(|n| n.tag_name().name() == "style") {
            for rule in style.text().unwrap_or_default().split('}') {
                let Some((selectors, decls)) = rule.split_once('{') else {
                    continue;
                };
                let Some(fill) = declared(decls, "fill") else {
                    continue;
                };
                for sel in selectors.split(',').map(str::trim) {
                    if let Some(class) = sel.strip_prefix('.')
                        && class
                            .chars()
                            .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
                    {
                        class_fill.insert(class.to_owned(), fill.clone());
                    }
                }
            }
        }
        Self {
            doc,
            class_fill,
            sections: Vec::new(),
            items: Vec::new(),
            outline: None,
            warnings: Vec::new(),
            uses_left: std::cell::Cell::new(MAX_USES),
        }
    }

    /// Whether the walk skips `node` and everything in it: not drawn, or not part of SVG.
    fn skipped(node: Node) -> bool {
        let tag = node.tag_name();
        let hidden = node
            .attribute("display")
            .is_some_and(|d| d.trim() == "none")
            || node
                .attribute("style")
                .and_then(|s| declared(s, "display"))
                .is_some_and(|d| d == "none");
        hidden
            || tag.namespace() != Some(SVG_NS) && tag.namespace().is_some()
            || matches!(
                tag.name(),
                "defs"
                    | "symbol"
                    | "clipPath"
                    | "mask"
                    | "pattern"
                    | "marker"
                    | "metadata"
                    | "title"
                    | "desc"
                    | "style"
                    | "linearGradient"
                    | "radialGradient"
                    | "filter"
                    | "foreignObject"
            )
    }

    /// A child's transform inside its parent's.
    fn transform(node: Node, ctm: Affine) -> Affine {
        let mut ctm = ctm;
        if node.tag_name().name() == "svg" && node.parent_element().is_some() {
            ctm = ctm.then(Affine::translate(length(node, "x"), length(node, "y")));
        }
        node.attribute("transform")
            .map_or(ctm, |t| ctm.then(Affine::parse(t)))
    }

    fn walk(&mut self, node: Node, ctm: Affine, ctx: Context) {
        for child in node.children().filter(Node::is_element) {
            if Self::skipped(child) {
                continue;
            }
            let ctm = Self::transform(child, ctm);
            let svg_id = child.attribute("id").unwrap_or("").to_owned();
            match name_of(child).as_deref().map(classify) {
                Some(Some(Named::Section(id))) => {
                    if let Some(outer) = ctx.section {
                        self.warnings.push(format!(
                            "section `{id}` (`{svg_id}`) is inside section `{}`; it is read as a section of its own",
                            self.sections[outer].id
                        ));
                    }
                    let geometry = self.geometry(child, ctm, 0);
                    self.sections.push(SectionFound {
                        id,
                        svg_id,
                        bounds: Bounds::of(&geometry.points),
                        outline: None,
                    });
                    let index = self.sections.len() - 1;
                    self.walk(
                        child,
                        ctm,
                        Context {
                            section: Some(index),
                        },
                    );
                }
                Some(Some(Named::Item(kind, label))) => {
                    let geometry = self.geometry(child, ctm, 0);
                    // Text drawn in a control is its legends or name, not its shape; a control
                    // drawn only as text sits where its text starts.
                    let Some(bounds) =
                        Bounds::of(&geometry.points).or_else(|| Self::text_bounds(child, ctm))
                    else {
                        self.warnings.push(format!(
                            "`{}:{label}` (`{svg_id}`) draws nothing, so it has no place; left out",
                            kind_name(kind)
                        ));
                        continue;
                    };
                    self.items.push(ItemFound {
                        kind,
                        label,
                        svg_id,
                        section: ctx.section,
                        bounds,
                        texts: geometry.texts,
                        fill: geometry.fill,
                    });
                }
                Some(Some(Named::Outline)) => {
                    let outline = self.geometry(child, ctm, 0).first_shape;
                    if outline.is_none() {
                        self.warnings
                            .push(format!("outline `{svg_id}` draws no shape; left out"));
                    }
                    match ctx.section {
                        Some(s) => self.sections[s].outline = outline,
                        None => self.outline = outline,
                    }
                }
                Some(Some(Named::UnknownKind(kind))) => {
                    self.warnings.push(format!(
                        "`{kind}` in `{}` (`{svg_id}`) is not a panel item kind; left out. The kinds are {}",
                        name_of(child).unwrap_or_default(),
                        kind_names().join(", ")
                    ));
                }
                Some(None) | None => {
                    let before = self.items.len() + self.sections.len();
                    self.walk(child, ctm, ctx);
                    let found = self.items.len() + self.sections.len() > before;
                    if let Some(s) = ctx.section
                        && !found
                        && child.tag_name().name() == "g"
                    {
                        self.warnings.push(format!(
                            "group `{}` in section `{}` has no `<kind>:<LABEL>` name; left out",
                            name_of(child).unwrap_or(svg_id),
                            self.sections[s].id
                        ));
                    }
                }
            }
        }
    }

    /// Where a control drawn only as text is: its texts' starting points.
    fn text_bounds(node: Node, ctm: Affine) -> Option<Bounds> {
        let mut points = Vec::new();
        Self::collect_text_points(node, ctm, &mut points);
        Bounds::of(&points)
    }

    fn collect_text_points(node: Node, ctm: Affine, out: &mut Vec<[f64; 2]>) {
        if node.tag_name().name() == "text" {
            out.push(ctm.apply([length(node, "x"), length(node, "y")]));
            return;
        }
        for child in node.children().filter(Node::is_element) {
            if !Self::skipped(child) {
                Self::collect_text_points(child, Self::transform(child, ctm), out);
            }
        }
    }

    /// What `node` draws, in the root's units (`ctm` is its transform, its own included).
    fn geometry(&self, node: Node, ctm: Affine, uses: usize) -> Geometry {
        let mut out = Geometry::default();
        self.add_geometry(node, ctm, uses, &mut out);
        out
    }

    fn add_geometry(&self, node: Node, ctm: Affine, uses: usize, out: &mut Geometry) {
        let local: Option<Vec<[f64; 2]>> = match node.tag_name().name() {
            "rect" | "image" => {
                let (x, y) = (length(node, "x"), length(node, "y"));
                let (w, h) = (length(node, "width"), length(node, "height"));
                Some(vec![[x, y], [x + w, y], [x + w, y + h], [x, y + h]])
            }
            "circle" => {
                let r = length(node, "r");
                Some(ellipse(length(node, "cx"), length(node, "cy"), r, r))
            }
            "ellipse" => Some(ellipse(
                length(node, "cx"),
                length(node, "cy"),
                length(node, "rx"),
                length(node, "ry"),
            )),
            "line" => Some(vec![
                [length(node, "x1"), length(node, "y1")],
                [length(node, "x2"), length(node, "y2")],
            ]),
            "polyline" | "polygon" => node
                .attribute("points")
                .and_then(numbers)
                .map(|n| n.as_chunks::<2>().0.to_vec()),
            "path" => node.attribute("d").map(path_points),
            "text" => {
                let text: String = node
                    .descendants()
                    .filter(Node::is_text)
                    .filter_map(|t| t.text())
                    .collect::<Vec<_>>()
                    .join("");
                let text = text.split_whitespace().collect::<Vec<_>>().join(" ");
                if !text.is_empty() {
                    let at = ctm.apply([length(node, "x"), length(node, "y")]);
                    out.texts.push((at[1], text, self.fill(node)));
                }
                return;
            }
            "use" => {
                if uses < MAX_USE_DEPTH
                    && self.uses_left.get() > 0
                    && let Some(target) = node
                        .attribute("href")
                        .or_else(|| node.attribute(("http://www.w3.org/1999/xlink", "href")))
                        .and_then(|h| h.strip_prefix('#'))
                        .and_then(|id| {
                            self.doc
                                .descendants()
                                .find(|n| n.attribute("id") == Some(id))
                        })
                {
                    self.uses_left.set(self.uses_left.get() - 1);
                    let ctm = ctm.then(Affine::translate(length(node, "x"), length(node, "y")));
                    let inner = target
                        .attribute("transform")
                        .filter(|_| target.tag_name().name() != "symbol")
                        .map_or(ctm, |t| ctm.then(Affine::parse(t)));
                    self.add_geometry(target, inner, uses + 1, out);
                }
                return;
            }
            _ => None,
        };
        if let Some(local) = local.filter(|p| !p.is_empty()) {
            let points: Vec<[f64; 2]> = local.into_iter().map(|p| ctm.apply(p)).collect();
            if out.fill.is_none() {
                out.fill = self.fill(node);
            }
            out.points.extend_from_slice(&points);
            out.first_shape.get_or_insert(points);
            return;
        }
        for child in node.children().filter(Node::is_element) {
            if Self::skipped(child) {
                continue;
            }
            self.add_geometry(child, Self::transform(child, ctm), uses, out);
        }
    }

    /// An element's fill: its `style`, its `fill`, its class, or its parent's.
    fn fill(&self, node: Node) -> Option<String> {
        for n in node.ancestors().filter(Node::is_element) {
            let fill = n
                .attribute("style")
                .and_then(|s| declared(s, "fill"))
                .or_else(|| n.attribute("fill").map(|f| f.trim().to_owned()))
                .or_else(|| {
                    n.attribute("class").and_then(|c| {
                        c.split_whitespace()
                            .find_map(|c| self.class_fill.get(c).cloned())
                    })
                });
            if let Some(fill) = fill.filter(|f| f != "inherit") {
                return Some(fill);
            }
        }
        None
    }

    /// The panel's box: its outline's, the drawing's view box, its size, or its sections'.
    fn frame(&self, root: Node) -> Result<Bounds> {
        let view_box = root
            .attribute("viewBox")
            .and_then(numbers)
            .filter(|n| n.len() == 4 && n[2] > 0.0 && n[3] > 0.0)
            .map(|n| Bounds([n[0], n[1], n[0] + n[2], n[1] + n[3]]));
        let size = Some((length(root, "width"), length(root, "height")))
            .filter(|(w, h)| *w > 0.0 && *h > 0.0)
            .map(|(w, h)| Bounds([0.0, 0.0, w, h]));
        let all: Vec<[f64; 2]> = self
            .sections
            .iter()
            .filter_map(|s| s.bounds)
            .flat_map(|b| [[b.0[0], b.0[1]], [b.0[2], b.0[3]]])
            .collect();
        let frame = self
            .outline
            .as_deref()
            .and_then(Bounds::of)
            .or(view_box)
            .or(size)
            .or_else(|| Bounds::of(&all));
        let Some(frame) = frame.filter(|f| f.width() > 0.0 && f.height() > 0.0) else {
            bail!("the drawing has no size and no sections, so there is no panel to make");
        };
        Ok(frame)
    }

    /// Section ids as the format writes them, each once.
    fn name_sections(&mut self) {
        let mut used = BTreeSet::new();
        for s in &mut self.sections {
            let mut id = slug(&s.id);
            if id.is_empty() {
                id = "section".into();
            }
            if id != s.id {
                self.warnings.push(format!(
                    "section id `{}` (`{}`) is written `{id}`",
                    s.id, s.svg_id
                ));
            }
            let unique = once(&mut used, &id);
            if unique != id {
                self.warnings.push(format!(
                    "section id `{id}` (`{}`) is used twice; this one is `{unique}`",
                    s.svg_id
                ));
            }
            s.id = unique;
        }
    }

    /// Each section's controls: those in its group, and those drawn over it outside any section.
    fn place_items(&mut self) -> Vec<Vec<ItemFound>> {
        let mut by_section: Vec<Vec<ItemFound>> =
            self.sections.iter().map(|_| Vec::new()).collect();
        for item in std::mem::take(&mut self.items) {
            let center = item.bounds.center();
            let section = item.section.or_else(|| {
                self.sections
                    .iter()
                    .position(|s| s.bounds.is_some_and(|b| b.contains(center)))
            });
            match section {
                Some(s) => by_section[s].push(item),
                None => self.warnings.push(format!(
                    "`{}:{}` (`{}`) is not in any section; left out",
                    kind_name(item.kind),
                    item.label,
                    item.svg_id
                )),
            }
        }
        // Row by row, then left to right.
        for items in &mut by_section {
            items.sort_by(|a, b| {
                let (pa, pb) = (a.bounds.center(), b.bounds.center());
                [pa[1].round(), pa[0]]
                    .partial_cmp(&[pb[1].round(), pb[0]])
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        }
        by_section
    }

    /// The panel file.
    fn finish(mut self, root: Node, opts: &Options) -> Result<Imported> {
        let frame = self.frame(root)?;
        let scale = opts.width.map_or(1.0, |w| w / frame.width());
        let to_panel = |p: [f64; 2]| [(p[0] - frame.0[0]) * scale, (p[1] - frame.0[1]) * scale];
        if self.sections.is_empty() {
            bail!(
                "the drawing has no section: name a group `section:<id>` (such as `section:fuel`) for each section, and a group `<kind>:<LABEL>` inside it for each control"
            );
        }
        self.name_sections();
        let by_section = self.place_items();

        let mut yaml = String::new();
        let _ = writeln!(
            yaml,
            "# Imported from {} by `involo-pack import-panel`: each control is where it is drawn.",
            opts.source.replace(['\n', '\r'], " ")
        );
        yaml.push_str(
            "# Give each its `positions` (and `rest`), `controls` and `description`, list this file in\n",
        );
        yaml.push_str("# pack.json's `panels`, then run `involo-pack check`.\n");
        let _ = writeln!(yaml, "id: {}", scalar(&opts.id));
        let _ = writeln!(yaml, "width: {}", num(frame.width() * scale));
        let _ = writeln!(yaml, "height: {}", num(frame.height() * scale));
        if let Some(outline) = self.outline.as_deref().filter(|o| !is_box(o)) {
            let points: Vec<[f64; 2]> = outline.iter().map(|p| to_panel(*p)).collect();
            let _ = writeln!(yaml, "outline: {}", points_yaml(&points));
        }
        yaml.push_str("sections:\n");

        let mut order: Vec<usize> = (0..self.sections.len()).collect();
        let top_left = |i: usize| {
            self.sections[i]
                .bounds
                .map_or([0.0, 0.0], |b| [b.0[1], b.0[0]])
        };
        order.sort_by(|a, b| {
            top_left(*a)
                .partial_cmp(&top_left(*b))
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        let mut item_count = 0;
        for i in order {
            let section = &self.sections[i];
            let Some(bounds) = section.bounds else {
                self.warnings.push(format!(
                    "section `{}` (`{}`) draws nothing, so it has no place; left out",
                    section.id, section.svg_id
                ));
                continue;
            };
            let origin = to_panel([bounds.0[0], bounds.0[1]]);
            let in_section = |p: [f64; 2]| {
                let q = to_panel(p);
                [q[0] - origin[0], q[1] - origin[1]]
            };
            let _ = writeln!(yaml, "  - id: {}", section.id);
            let _ = writeln!(yaml, "    title: {}", scalar(&words(&section.id)));
            let _ = writeln!(yaml, "    x: {}", num(origin[0]));
            let _ = writeln!(yaml, "    y: {}", num(origin[1]));
            let _ = writeln!(yaml, "    width: {}", num(bounds.width() * scale));
            let _ = writeln!(yaml, "    height: {}", num(bounds.height() * scale));
            if let Some(outline) = section.outline.as_deref().filter(|o| !is_box(o)) {
                let points: Vec<[f64; 2]> = outline.iter().map(|p| in_section(*p)).collect();
                let _ = writeln!(yaml, "    outline: {}", points_yaml(&points));
            }
            let items = &by_section[i];
            if items.is_empty() {
                yaml.push_str("    items: []\n");
                self.warnings
                    .push(format!("section `{}` has no controls", section.id));
                continue;
            }
            yaml.push_str("    items:\n");
            let mut ids = BTreeSet::new();
            for item in items {
                item_count += 1;
                let id = slug(&item.label);
                let id = if id.is_empty() {
                    id
                } else {
                    once(&mut ids, &id)
                };
                let center = in_section(item.bounds.center());
                yaml.push_str(&item_yaml(item, &id, center, scale, &mut self.warnings));
            }
        }
        Ok(Imported {
            yaml,
            warnings: self.warnings,
            sections: self.sections.len(),
            items: item_count,
        })
    }
}

/// `id`, or `id-2`, `id-3` and on if it is in `used` already; added to `used`.
fn once(used: &mut BTreeSet<String>, id: &str) -> String {
    let mut out = id.to_owned();
    let mut n = 2;
    while !used.insert(out.clone()) {
        out = format!("{id}-{n}");
        n += 1;
    }
    out
}

/// The comment on a value read from the drawing (a light's color, a legend), for the author to
/// check.
const INFERRED: &str = "  # from the drawing; check it";
/// The comment on a color the drawing doesn't give, written as white for the author to set.
const UNREADABLE: &str = "  # not readable in the drawing; set it";

/// One control in the file, at `center` in its section's units.
fn item_yaml(
    item: &ItemFound,
    id: &str,
    center: [f64; 2],
    scale: f64,
    warnings: &mut Vec<String>,
) -> String {
    let mut yaml = String::new();
    let kind = kind_name(item.kind);
    let what = format!("`{kind}:{}` (`{}`)", item.label, item.svg_id);
    if id.is_empty() {
        let _ = writeln!(yaml, "      - kind: {kind}");
    } else {
        let _ = writeln!(yaml, "      - id: {id}");
        let _ = writeln!(yaml, "        kind: {kind}");
    }
    let _ = writeln!(yaml, "        label: {}", scalar(&item.label));
    if item.kind == PanelItemKind::Light {
        let color = item.fill.as_deref().and_then(role);
        if color.is_none() {
            warnings.push(format!(
                "{what}: its color is not one a light has; `color` is set to white"
            ));
        }
        let _ = writeln!(
            yaml,
            "        color: {}",
            color.map_or(format!("white{UNREADABLE}"), |c| format!("{c}{INFERRED}"))
        );
    }
    let _ = writeln!(yaml, "        x: {}", num(center[0]));
    let _ = writeln!(yaml, "        y: {}", num(center[1]));
    if takes_positions(item.kind) {
        yaml.push_str("        positions: []\n");
    }
    if item.kind == PanelItemKind::LegendPushbutton {
        let mut texts = item.texts.clone();
        texts.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap_or(std::cmp::Ordering::Equal));
        if texts.is_empty() {
            warnings.push(format!(
                "{what}: no legend is drawn as text in it; write its `legends`"
            ));
            yaml.push_str("        legends: []\n");
        } else {
            if texts.len() > 2 {
                warnings.push(format!(
                    "{what}: more than two texts are drawn in it; the top two are its legends"
                ));
            }
            yaml.push_str("        legends:\n");
            for (_, text, fill) in texts.iter().take(2) {
                let light = fill.as_deref().and_then(role).map_or_else(
                    || {
                        warnings.push(format!(
                            "{what}: legend `{text}` has no color a light has; it is white"
                        ));
                        format!("white{UNREADABLE}")
                    },
                    |l| format!("{l}{INFERRED}"),
                );
                let _ = writeln!(yaml, "          - text: {}{INFERRED}", scalar(text));
                let _ = writeln!(yaml, "            light: {light}");
            }
        }
    }
    yaml.push_str("        description: \"\"\n");
    if matches!(
        item.kind,
        PanelItemKind::DisplayUnit | PanelItemKind::Readout
    ) {
        let _ = writeln!(yaml, "        width: {}", num(item.bounds.width() * scale));
        let _ = writeln!(
            yaml,
            "        height: {}",
            num(item.bounds.height() * scale)
        );
    }
    yaml
}

/// An element's name: its layer name in the drawing tool, or its id with escapes decoded.
fn name_of(node: Node) -> Option<String> {
    let name = node
        .attribute((INKSCAPE_NS, "label"))
        .or_else(|| node.attribute("data-name"))
        .map(str::to_owned)
        .or_else(|| node.attribute("id").map(decode_id))?;
    let name = name.trim().to_owned();
    (!name.is_empty()).then_some(name)
}

/// An id as some tools write a layer name in one (`toggle_x5F_switch_x3A_FUEL_PUMP_1_`): each
/// `_xHH_` is the character HH, and then a plain `_` is a space and a trailing `_N_` is a count
/// added to keep ids apart. An id without such escapes is the name as it is.
fn decode_id(id: &str) -> String {
    if !has_escape(id) {
        return id.to_owned();
    }
    let mut id = id;
    // A count added to keep ids apart: `_1_` at the end.
    if let Some(rest) = id.strip_suffix('_')
        && let Some((head, n)) = rest.rsplit_once('_')
        && !n.is_empty()
        && n.chars().all(|c| c.is_ascii_digit())
    {
        id = head;
    }
    let mut out = String::new();
    let mut rest = id;
    while let Some(at) = rest.find('_') {
        out.push_str(&rest[..at]);
        let tail = &rest[at..];
        if let Some(c) = escape_at(tail) {
            out.push(c);
            rest = &tail[5..];
        } else {
            out.push(' ');
            rest = &tail[1..];
        }
    }
    out.push_str(rest);
    out
}

fn has_escape(id: &str) -> bool {
    id.match_indices('_')
        .any(|(at, _)| escape_at(&id[at..]).is_some())
}

/// The character an `_xHH_` at the start of `text` stands for.
fn escape_at(text: &str) -> Option<char> {
    let b = text.as_bytes();
    if b.len() >= 5 && b[0] == b'_' && b[1] == b'x' && b[4] == b'_' {
        u8::from_str_radix(text.get(2..4)?, 16)
            .ok()
            .filter(u8::is_ascii)
            .map(char::from)
    } else {
        None
    }
}

/// What a name says an element is; `None` for a name the rule doesn't cover.
fn classify(name: &str) -> Option<Named> {
    if name == "outline" {
        return Some(Named::Outline);
    }
    let (head, rest) = name.split_once(':')?;
    let head = head.trim();
    let rest = rest.trim();
    if head == "section" {
        return Some(Named::Section(rest.to_owned()));
    }
    if head.is_empty() || !head.chars().all(|c| c.is_ascii_lowercase() || c == '_') {
        return None;
    }
    match serde_json::from_value::<PanelItemKind>(serde_json::Value::String(head.to_owned())) {
        Ok(kind) if !rest.is_empty() => Some(Named::Item(kind, rest.to_owned())),
        Ok(_) => None,
        Err(_) => Some(Named::UnknownKind(head.to_owned())),
    }
}

fn kind_name(kind: PanelItemKind) -> String {
    serde_json::to_value(kind)
        .ok()
        .and_then(|v| v.as_str().map(str::to_owned))
        .unwrap_or_default()
}

/// Every panel item kind, for messages. A new kind fails to build in `takes_positions` until it
/// is added here too.
const KINDS: [PanelItemKind; 13] = [
    PanelItemKind::ToggleSwitch,
    PanelItemKind::Selector,
    PanelItemKind::PushButton,
    PanelItemKind::Light,
    PanelItemKind::Gauge,
    PanelItemKind::Readout,
    PanelItemKind::DisplayUnit,
    PanelItemKind::Lever,
    PanelItemKind::Handle,
    PanelItemKind::PushPullKnob,
    PanelItemKind::LegendPushbutton,
    PanelItemKind::Rocker,
    PanelItemKind::Keypad,
];

fn kind_names() -> Vec<String> {
    KINDS.into_iter().map(kind_name).collect()
}

/// Whether a kind is set to positions, which the author writes.
fn takes_positions(kind: PanelItemKind) -> bool {
    use PanelItemKind as K;
    match kind {
        K::Light | K::Gauge | K::Readout | K::DisplayUnit => false,
        K::ToggleSwitch
        | K::Selector
        | K::PushButton
        | K::Lever
        | K::Handle
        | K::PushPullKnob
        | K::LegendPushbutton
        | K::Rocker
        | K::Keypad => true,
    }
}

/// A CSS declaration's value in `decls` (`fill:#f5a623;stroke:none`).
fn declared(decls: &str, property: &str) -> Option<String> {
    decls.split(';').find_map(|d| {
        let (k, v) = d.split_once(':')?;
        (k.trim() == property).then(|| v.trim().trim_end_matches("!important").trim().to_owned())
    })
}

/// The light role nearest a color (`#f5a623`, `rgb(…)`, `orange`), by its hue; `None` for no
/// color, black or a dark gray.
fn role(color: &str) -> Option<&'static str> {
    let [r, g, b] = rgb(color)?;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let light = f64::midpoint(max, min);
    if max < 0.2 {
        return None;
    }
    let chroma = max - min;
    if chroma < 0.15 {
        return (light > 0.6).then_some("white");
    }
    let hue = if (max - r).abs() < f64::EPSILON {
        60.0 * ((g - b) / chroma).rem_euclid(6.0)
    } else if (max - g).abs() < f64::EPSILON {
        60.0 * ((b - r) / chroma + 2.0)
    } else {
        60.0 * ((r - g) / chroma + 4.0)
    };
    Some(match hue {
        h if !(15.0..330.0).contains(&h) => "red",
        h if h < 70.0 => "amber",
        h if h < 165.0 => "green",
        h if h < 270.0 => "blue",
        _ => "red",
    })
}

/// A color's red, green and blue, each 0 to 1.
fn rgb(color: &str) -> Option<[f64; 3]> {
    let lower = color.trim().to_ascii_lowercase();
    let channel = |hex: &str| {
        u8::from_str_radix(hex, 16)
            .ok()
            .map(|v| f64::from(v) / 255.0)
    };
    if let Some(hex) = lower.strip_prefix('#') {
        let digits: Vec<String> = match hex.len() {
            3 => hex.chars().map(|d| format!("{d}{d}")).collect(),
            6 => (0..3)
                .filter_map(|i| hex.get(i * 2..i * 2 + 2).map(str::to_owned))
                .collect(),
            _ => return None,
        };
        let [red, green, blue] = digits.as_slice() else {
            return None;
        };
        return Some([channel(red)?, channel(green)?, channel(blue)?]);
    }
    if let Some(args) = lower.strip_prefix("rgb(").and_then(|a| a.strip_suffix(')')) {
        let percent = args.contains('%');
        let values = numbers(&args.replace('%', ""))?;
        let [red, green, blue, ..] = values.as_slice() else {
            return None;
        };
        let unit = |v: f64| (if percent { v / 100.0 } else { v / 255.0 }).clamp(0.0, 1.0);
        return Some([unit(*red), unit(*green), unit(*blue)]);
    }
    let named = match lower.as_str() {
        "red" => "#ff0000",
        "orange" => "#ffa500",
        "yellow" => "#ffff00",
        "gold" => "#ffd700",
        "amber" => "#ffbf00",
        "green" | "lime" => "#00ff00",
        "blue" => "#0000ff",
        "cyan" | "aqua" => "#00ffff",
        "white" => "#ffffff",
        "black" => "#000000",
        _ => return None,
    };
    rgb(named)
}

/// Whether an outline is just its own box's four corners, which the format draws anyway.
fn is_box(points: &[[f64; 2]]) -> bool {
    let Some(b) = Bounds::of(points) else {
        return true;
    };
    let mut pts: Vec<[f64; 2]> = points.to_vec();
    if pts.len() > 1 && pts.first() == pts.last() {
        pts.pop();
    }
    let near = |a: f64, b: f64| (a - b).abs() < 1e-9;
    pts.len() == 4
        && pts.iter().all(|p| {
            (near(p[0], b.0[0]) || near(p[0], b.0[2])) && (near(p[1], b.0[1]) || near(p[1], b.0[3]))
        })
}

/// An id from a name: lower-case letters and digits, with single dashes between words.
pub fn slug(text: &str) -> String {
    let mut out = String::new();
    for c in text.chars() {
        if c.is_ascii_alphanumeric() {
            out.push(c.to_ascii_lowercase());
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_owned()
}

/// A number as the file writes it: to a tenth, without a trailing `.0`.
fn num(v: f64) -> String {
    let v = (v * 10.0).round() / 10.0;
    let v = if v == 0.0 { 0.0 } else { v };
    format!("{v}")
}

fn points_yaml(points: &[[f64; 2]]) -> String {
    let mut pts = points.to_vec();
    if pts.len() > 1 && pts.first() == pts.last() {
        pts.pop();
    }
    let inner: Vec<String> = pts
        .iter()
        .map(|p| format!("[{}, {}]", num(p[0]), num(p[1])))
        .collect();
    format!("[{}]", inner.join(", "))
}

/// A YAML scalar: as it is when that reads back as the same text, quoted otherwise.
fn scalar(text: &str) -> String {
    let plain = text.chars().next().is_some_and(|c| c.is_ascii_alphabetic())
        && text.chars().all(|c| {
            c.is_ascii_alphanumeric() || matches!(c, ' ' | '.' | '/' | '(' | ')' | '-' | '+')
        })
        && !text.ends_with(' ')
        && !matches!(
            text.to_ascii_lowercase().as_str(),
            "y" | "n" | "yes" | "no" | "on" | "off" | "true" | "false" | "null"
        );
    if plain {
        text.to_owned()
    } else {
        serde_json::Value::String(text.to_owned()).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn close(a: [f64; 2], b: [f64; 2]) -> bool {
        (a[0] - b[0]).abs() < 1e-6 && (a[1] - b[1]).abs() < 1e-6
    }

    #[test]
    fn reads_numbers_written_without_separators() {
        assert_eq!(
            numbers("10-5.5.5e1,1E-1 +2"),
            Some(vec![10.0, -5.5, 5.0, 0.1, 2.0])
        );
        assert_eq!(numbers("1 x"), None);
    }

    #[test]
    fn applies_transforms_in_the_order_svg_writes_them() {
        let t = Affine::parse("translate(10,20) scale(2)");
        assert!(close(t.apply([1.0, 1.0]), [12.0, 22.0]));
        let r = Affine::parse("rotate(90 5 5)");
        assert!(close(r.apply([10.0, 5.0]), [5.0, 10.0]));
        assert_eq!(Affine::parse("bogus(1)"), Affine::IDENTITY);
    }

    #[test]
    fn a_path_covers_its_curves_and_arcs() {
        // A circle of radius 10 around (20, 20) as two arcs, flags written without spaces.
        let b = Bounds::of(&path_points("M10,20a10,10 0 1,0 20,0a10 10 0 10-20 0")).unwrap();
        assert!(close(b.center(), [20.0, 20.0]), "{b:?}");
        assert!((b.height() - 20.0).abs() < 0.1, "{b:?}");
        // A cubic bulging above its end points.
        let b = Bounds::of(&path_points("M0,0 C0,-10 10,-10 10,0")).unwrap();
        assert!((b.0[1] + 7.5).abs() < 0.01, "{b:?}");
        // Relative lines, H, V and a close.
        let b = Bounds::of(&path_points("m5,5 h10 v10 h-10 z")).unwrap();
        assert!(close([b.0[0], b.0[1]], [5.0, 5.0]) && close([b.0[2], b.0[3]], [15.0, 15.0]));
    }

    #[test]
    fn decodes_names_escaped_into_ids() {
        assert_eq!(
            decode_id("toggle_x5F_switch_x3A_FUEL_PUMP_L"),
            "toggle_switch:FUEL PUMP L"
        );
        assert_eq!(decode_id("light_x3A_LOW_PRESS_1_"), "light:LOW PRESS");
        // Without escapes, an id is the name as it is.
        assert_eq!(
            decode_id("toggle_switch:FUEL PUMP L"),
            "toggle_switch:FUEL PUMP L"
        );
        assert_eq!(decode_id("g123"), "g123");
    }

    #[test]
    fn names_follow_the_rule_or_are_left_alone() {
        assert!(matches!(classify("section:fuel"), Some(Named::Section(id)) if id == "fuel"));
        assert!(matches!(
            classify("rocker: WIPER"),
            Some(Named::Item(PanelItemKind::Rocker, l)) if l == "WIPER"
        ));
        assert!(matches!(classify("outline"), Some(Named::Outline)));
        assert!(matches!(classify("slider:TRIM"), Some(Named::UnknownKind(k)) if k == "slider"));
        // A layer name, or a note with a colon in it, is not a control.
        assert!(classify("Layer 1").is_none());
        assert!(classify("Note: check this").is_none());
        assert!(classify("rocker:").is_none());
    }

    #[test]
    fn a_fill_gives_the_nearest_light_role() {
        assert_eq!(role("#f5a623"), Some("amber"));
        assert_eq!(role("#2E9E3F"), Some("green"));
        assert_eq!(role("rgb(220, 30, 30)"), Some("red"));
        assert_eq!(role("#36f"), Some("blue"));
        assert_eq!(role("white"), Some("white"));
        assert_eq!(role("#111"), None);
        assert_eq!(role("none"), None);
    }

    #[test]
    fn writes_scalars_that_read_back_as_the_same_text() {
        assert_eq!(scalar("FUEL PUMP L"), "FUEL PUMP L");
        assert_eq!(scalar("OFF"), "\"OFF\"");
        assert_eq!(scalar("A: B"), "\"A: B\"");
        assert_eq!(scalar("#1"), "\"#1\"");
        assert_eq!(scalar("1 2"), "\"1 2\"");
        assert_eq!(num(12.345), "12.3");
        assert_eq!(num(-0.01), "0");
    }

    #[test]
    fn a_rectangle_outline_is_left_to_the_box() {
        assert!(is_box(&[
            [0.0, 0.0],
            [10.0, 0.0],
            [10.0, 5.0],
            [0.0, 5.0],
            [0.0, 0.0]
        ]));
        assert!(!is_box(&[
            [0.0, 0.0],
            [10.0, 0.0],
            [10.0, 5.0],
            [5.0, 8.0],
            [0.0, 5.0]
        ]));
    }

    #[test]
    fn links_that_multiply_stop_being_followed() {
        // Each group uses the one before a hundred times: 10^10 shapes if every link were
        // followed.
        let mut defs = String::from(r#"<rect id="u0" width="1" height="1"/>"#);
        for i in 1..=5 {
            let _ = write!(defs, r#"<g id="u{i}">"#);
            for _ in 0..100 {
                let _ = write!(defs, r##"<use href="#u{}"/>"##, i - 1);
            }
            defs.push_str("</g>");
        }
        let svg = format!(
            r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs>{defs}</defs><g id="section:a"><rect width="5" height="5"/><use href="#u5"/></g></svg>"##
        );
        let opts = Options {
            id: "p".into(),
            width: None,
            source: "p.svg".into(),
        };
        let started = std::time::Instant::now();
        let imported = import(&svg, &opts).unwrap();
        assert!(started.elapsed().as_secs() < 5);
        assert!(imported.yaml.contains("id: a"), "{}", imported.yaml);
    }

    #[test]
    fn a_width_scales_the_drawing_to_panel_units() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100"><g id="section:a"><rect x="20" y="20" width="100" height="40"/><circle id="light:ON" cx="40" cy="40" r="5" fill="red"/></g></svg>"#;
        let opts = Options {
            id: "p".into(),
            width: Some(400.0),
            source: "p.svg".into(),
        };
        let yaml = import(svg, &opts).unwrap().yaml;
        let panel: involo_checklist_core::Panel = serde_saphyr::from_str(&yaml).unwrap();
        assert_eq!((panel.width, panel.height), (400.0, 200.0));
        let s = &panel.sections[0];
        assert_eq!((s.x, s.y, s.width, s.height), (40.0, 40.0, 200.0, 80.0));
        assert_eq!((s.items[0].x, s.items[0].y), (40.0, 40.0));
    }
}
