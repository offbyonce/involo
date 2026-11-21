// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The main screens against every pack (decision 0030, #108): the iFly pack and the three invented
// example packs, each opened in the app through the web host's real WebAssembly calls. Each screen
// shows the open pack's own content, and with an example pack open, nothing of the iFly pack's: no
// 737 or iFly wording, none of its phase, stage, option or list titles, and no link to a phase or
// reference list the pack doesn't have. So a screen that quietly depends on one aircraft again
// fails here.

import type { FlatPack, Settings } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { defaultSettings, editLog, parsePack } from "../../../apps/web/src/core";
import { webHost } from "../../../apps/web/src/web-host";
import { type Host, hostContext } from "./host";
import Root from "./Root.svelte";
import { EXAMPLE_PACKS, examplePackById, iflyPack, testPackText } from "./test-pack";

const PACKS = ["ifly-737-max8", ...EXAMPLE_PACKS] as const;
type PackId = (typeof PACKS)[number];
const packOf = (id: PackId): FlatPack => (id === "ifly-737-max8" ? iflyPack() : examplePackById(id));

/** The web host with this one pack installed, its packs and log held in memory. */
function hostWith(id: PackId): Host {
  const pack = packOf(id);
  const text = testPackText(id);
  const summary = {
    id,
    name: pack.manifest.name,
    version: pack.manifest.version,
    kind: pack.manifest.kind,
    aircraft: pack.manifest.aircraft ?? null,
  };
  return {
    ...webHost,
    installedPacks: async () => [{ summary, source: "catalog", installedAt: 1 }],
    loadPack: async (wanted) => {
      if (wanted !== id) throw new Error(`The pack ${wanted} is not installed on this device.`);
      return parsePack(text);
    },
    catalog: async () => [],
    readLog: async () => null,
    saveLog: async () => true,
    editLog: (log, edit) => editLog(log, edit),
  } as Host;
}

/** Settings as a pilot leaves them: the tour answered, this pack open, in `view`. */
async function saveSettings(id: PackId, view: Settings["listView"]): Promise<void> {
  const settings = { ...(await defaultSettings()), tourSeen: true, currentPack: id, listView: view };
  localStorage.setItem("involo.settings", JSON.stringify(settings));
}

async function open(id: PackId, hash: string, view: Settings["listView"] = "checklist") {
  await saveSettings(id, view);
  window.location.hash = hash;
  render(Root, { context: hostContext(hostWith(id)) });
  await waitFor(() => expect(document.querySelector("[data-app-ready]")).toBeTruthy(), { timeout: 10_000 });
}

/** The iFly pack's own words and ids, less any the example pack shares: what an example's screens
 * must never show. */
function iflyOnly(pack: FlatPack) {
  const ifly = iflyPack();
  const phases = ifly.content.phases;
  const theirs = new Set(
    [
      ...(phases?.phases ?? []).flatMap((p) => [p.id, p.title]),
      ...(phases?.stages ?? []).flatMap((s) => [s.id, s.title]),
      ...(phases?.options ?? []).flatMap((o) => [o.title, ...(o.choices ?? []).map((c) => c.label)]),
      ...ifly.lists.map((l) => l.title),
    ].filter((w): w is string => !!w),
  );
  const ours = new Set(
    [
      ...(pack.content.phases?.phases ?? []).flatMap((p) => [p.id, p.title]),
      ...(pack.content.phases?.stages ?? []).flatMap((s) => [s.id, s.title]),
      ...(pack.content.phases?.options ?? []).flatMap((o) => [
        o.title,
        ...(o.choices ?? []).map((c) => c.label),
      ]),
      ...pack.lists.map((l) => l.title),
    ].filter((w): w is string => !!w),
  );
  const ids = new Set((phases?.phases ?? []).map((p) => p.id));
  // A title the example pack also writes somewhere ("Takeoff" in its "Takeoff speeds") is its own.
  const corpus = JSON.stringify(pack).toLowerCase();
  return {
    titles: [...theirs].filter(
      (w) => !ours.has(w) && !ids.has(w) && w.length > 3 && !corpus.includes(w.toLowerCase()),
    ),
    words: ["737", "iFly", "MAX 8", "B38M"],
  };
}

/** Checks the screen shows nothing of another aircraft's: words, titles and links. */
function nothingOfIfly(id: PackId, where: string) {
  if (id === "ifly-737-max8") return;
  const pack = packOf(id);
  const { titles, words } = iflyOnly(pack);
  const text = document.body.textContent ?? "";
  for (const w of words) expect(text, `${id} ${where}: "${w}"`).not.toContain(w);
  for (const t of titles) expect(text, `${id} ${where}: the iFly pack's "${t}"`).not.toContain(t);
  const phases = new Set((pack.content.phases?.phases ?? []).map((p) => p.id));
  const lists = new Set(pack.lists.map((l) => l.id));
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href^='#/']")) {
    const [, screenName, target] = (a.getAttribute("href") ?? "").split("/");
    if (screenName === "phase" && target)
      expect(phases, `${id} ${where}: link to phase ${target}`).toContain(target);
    if (screenName === "reference" && target) {
      expect(phases.has(target) || lists.has(target), `${id} ${where}: link to ${target}`).toBe(true);
    }
  }
  for (const row of document.querySelectorAll<HTMLElement>("[data-step]")) {
    const step = row.dataset.step ?? "";
    expect(
      pack.lists.some((l) => l.steps.some((s) => s.id === step)),
      `${id} ${where}: step ${step}`,
    ).toBe(true);
  }
}

/** The pack's first phase in the flight (not a reference phase), with its first list's first step. */
function firstPhase(pack: FlatPack) {
  const phases = pack.content.phases;
  const id = phases?.stages.flatMap((s) => s.phases.map((p) => p.phase))[0] ?? "";
  const phase = phases?.phases.find((p) => p.id === id);
  const list = pack.lists.find((l) => l.id === phase?.lists[0]);
  const step = list?.steps[0];
  return { id, title: phase?.title ?? "", step: step?.text ?? "", stepId: step?.id ?? "" };
}

const text = () => document.body.textContent ?? "";

// The WebAssembly module, loaded from disk (as reading a test pack loads it) before the web host's
// first call, which would otherwise fetch it.
beforeAll(() => {
  iflyPack();
});
beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  window.location.hash = "";
});

describe.each(PACKS)("the main screens with %s open", (id) => {
  const pack = () => packOf(id);

  it("Start", async () => {
    await open(id, "#/flight/start");
    const options = pack().content.phases?.options ?? [];
    for (const asked of pack().content.phases?.startPage ?? []) {
      const option = options.find((o) => o.id === asked);
      if (option)
        expect(text(), `${id}: the Start page asks ${option.title}`).toContain(
          option.start?.title ?? option.title,
        );
    }
    nothingOfIfly(id, "Start");
  });

  it("a phase, in List and in Step by step", async () => {
    const first = firstPhase(pack());
    await open(id, `#/phase/${first.id}`);
    await screen.findByRole("heading", { level: 1, name: first.title });
    expect(
      document.querySelector(`[data-step="${first.stepId}"]`),
      `${id}: the first step's row`,
    ).toBeTruthy();
    nothingOfIfly(id, "phase in List");
    cleanup();
    await open(id, `#/phase/${first.id}`, "flow");
    await waitFor(() =>
      expect(document.querySelector(".box h1")?.textContent?.toLowerCase()).toContain(
        first.step.toLowerCase(),
      ),
    );
    nothingOfIfly(id, "phase in Step by step");
  });

  it("Flight", async () => {
    await open(id, "#/setup");
    // A pack with Flight pages shows its first; the Example Twin has fields but no pages.
    const page = pack().content.flight?.pages?.[0]?.title;
    if (page) await waitFor(() => expect(text()).toContain(page));
    await screen.findByRole("heading", { level: 1 });
    nothingOfIfly(id, "Flight");
  });

  it("Emergency", async () => {
    await open(id, "#/reference");
    const labels = pack().content.labels;
    await waitFor(() => expect(text()).toContain(labels.reference.title));
    const reference = (pack().content.phases?.phases ?? []).find((p) => p.reference);
    const list = pack().lists.find((l) => l.id === reference?.lists[0]);
    if (list) expect(text()).toContain(list.title);
    nothingOfIfly(id, "Emergency");
  });

  it("References", async () => {
    await open(id, "#/references");
    await screen.findByRole("heading", { level: 1 });
    nothingOfIfly(id, "References");
  });

  it("How", async () => {
    await open(id, "#/how");
    await screen.findByRole("heading", { level: 1 });
    nothingOfIfly(id, "How");
  });

  it("Practice", async () => {
    await open(id, "#/practice");
    await screen.findByRole("heading", { level: 1 });
    nothingOfIfly(id, "Practice");
  });

  it("Flight deck", async () => {
    await open(id, "#/deck");
    // The page opens on the pack's first area, naming its first zone.
    const box = pack().content.controls?.overview?.areas[0];
    const zone = pack().content.controls?.zones.find((z) => z.id === box?.zone);
    if (zone) await waitFor(() => expect(text()).toContain(zone.title));
    nothingOfIfly(id, "Flight deck");
  });

  it("Find", async () => {
    const first = firstPhase(pack());
    await open(id, `#/phase/${first.id}`);
    await fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    const box = await screen.findByRole("combobox");
    await fireEvent.input(box, { target: { value: first.step } });
    await waitFor(() =>
      expect(document.getElementById("find-steps")?.textContent?.toLowerCase()).toContain(
        first.step.toLowerCase(),
      ),
    );
    nothingOfIfly(id, "Find");
  });

  it("shows no error on any screen", async () => {
    for (const hash of [
      "#/",
      "#/flight/start",
      "#/setup",
      "#/reference",
      "#/references",
      "#/how",
      "#/practice",
      "#/deck",
    ]) {
      await open(id, hash);
      expect(screen.queryByRole("alert"), `${id} ${hash}`).toBeNull();
      cleanup();
    }
  });
});
