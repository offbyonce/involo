// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import type { FlatPack } from "@involo/bindings";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReferences } from "../lib/references";
import ReferencesPage from "./ReferencesPage.svelte";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const pack = Object.values(
  import.meta.glob<FlatPack>("../../../../apps/web/public/packs/ifly-737-max8.json", {
    eager: true,
    import: "default",
  }),
)[0] as FlatPack;
const refs = buildReferences(pack);
const base = {
  refs,
  pack: { name: "Test Jet", version: "0.1.0", license: "CC-BY-NC-SA-4.0", attribution: ["A study aid."] },
  version: "0.4.0",
  backHref: "#/phase/before-start",
  licensesHref: "third-party-licenses.txt",
  onList: () => {},
  onSimulatorModel: () => {},
};
const words = (e: Element | null | undefined) => (e?.textContent ?? "").replace(/\s+/g, " ").trim();
/** An element's children's words, a space between each (cells, a label and its value). */
const cells = (e: Element | null | undefined) => [...(e?.children ?? [])].map((c) => words(c)).join(" ");
const phone = () =>
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

describe("References, desktop (RefsDesk)", () => {
  it("shows the notice, the two kinds of source with their counts, and the status line", () => {
    const { container } = render(ReferencesPage, base);
    expect(screen.getByRole("heading", { level: 1, name: "References" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Checklist" }).getAttribute("href")).toBe("#/phase/before-start");
    expect(words(screen.getByRole("note"))).toBe(
      "For flight simulation only. Involo follows the simulator’s model of the aircraft. It isn’t approved for, and must never be used in, a real aircraft.",
    );
    expect([...container.querySelectorAll(".kind")].map((k) => cells(k.querySelector(".kt")))).toEqual([
      "Simulator documentation 36 lists",
      "Regulator guidance 7 lists",
    ]);
    expect(words(container.querySelector(".line"))).toBe(
      "22 lists are marked Source being confirmed: they came from an earlier release and are being checked against the sources above.",
    );
  });

  it("filters by source with the chips, in the order, and shows the first six until Show all", async () => {
    const { container } = render(ReferencesPage, base);
    const chips = within(screen.getByRole("group", { name: "Show lists based on" })).getAllByRole("button");
    expect(chips.map((c) => c.textContent)).toEqual([
      "All",
      "Simulator documentation",
      "Regulator guidance",
      "Source being confirmed",
    ]);
    expect(chips[0]?.getAttribute("aria-pressed")).toBe("true");
    const rows = () => [...container.querySelectorAll("a.row")];
    // Each row is a link to its list's phase, named in full for screen readers.
    expect(rows()[0]?.getAttribute("href")).toBe(`#/phase/${refs.rows[0]?.phase}`);
    expect(rows()[0]?.getAttribute("aria-label")).toBe(
      `${refs.rows[0]?.title}, Preflight, Procedure, based on: Simulator documentation`,
    );
    expect(screen.getByRole("list", { name: "Lists" })).toBeTruthy();
    expect(rows()).toHaveLength(6);
    expect(cells(rows()[0])).toBe(`${refs.rows[0]?.title} Preflight Procedure Simulator documentation`);
    await fireEvent.click(screen.getByRole("button", { name: "Show all 65 lists" }));
    expect(rows()).toHaveLength(65);
    await fireEvent.click(chips[3] as HTMLElement);
    expect(chips[3]?.getAttribute("aria-pressed")).toBe("true");
    // A new filter starts at its first six again.
    expect(rows()).toHaveLength(6);
    await fireEvent.click(screen.getByRole("button", { name: "Show all 22 lists" }));
    expect(rows()).toHaveLength(22);
    expect(container.querySelectorAll(".tag.confirming")).toHaveLength(22);
    await fireEvent.click(chips[2] as HTMLElement);
    expect(rows()).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Show all 7 lists" })).toBeTruthy();
  });

  it("opens a list at its first step, and Find on the simulator model steps", async () => {
    const onList = vi.fn();
    const onSimulatorModel = vi.fn();
    const { container } = render(ReferencesPage, { ...base, onList, onSimulatorModel });
    await fireEvent.click(container.querySelector("a.row") as Element);
    expect(onList).toHaveBeenCalledWith(refs.rows[0]?.first);
    expect(words(screen.getByRole("region", { name: "Simulator model notes" }))).toContain(
      "16 steps follow the simulator’s model where it differs from the real aircraft.",
    );
    await fireEvent.click(screen.getByRole("button", { name: "See the 16 steps ›" }));
    expect(onSimulatorModel).toHaveBeenCalledOnce();
  });

  it("says what the pack and app are, from the pack, with the libraries' licenses", () => {
    render(ReferencesPage, base);
    const about = screen.getByRole("region", { name: "About this pack and app" });
    expect([...about.querySelectorAll("dl > div")].map((d) => cells(d))).toEqual([
      "Procedures pack Test Jet · pack 0.1.0",
      "Pack license CC-BY-NC-SA-4.0 · A study aid.",
      "App Involo 0.4.0 · open source",
      "Open-source software Licenses of the libraries Involo uses",
    ]);
    expect(
      within(about).getByRole("link", { name: "Licenses of the libraries Involo uses" }).getAttribute("href"),
    ).toBe("third-party-licenses.txt");
  });

  it("names kinds of source only: no manual, link or citation anywhere on the page", () => {
    const { container } = render(ReferencesPage, base);
    const links = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(links.filter((h) => /^https?:/.test(h))).toEqual([]);
    // "no manuals are copied or linked" is the only mention of manuals.
    const text = (container.textContent ?? "").replace("no manuals are copied or linked", "");
    expect(text).not.toMatch(/https?:\/\/|manual|FCOM|QRH|page \d|edition|chapter/i);
  });

  it("drops the status, its chip and its tags once no list needs it", () => {
    const retagged = buildReferences({
      ...pack,
      lists: pack.lists.map((l) => ({
        ...l,
        basis: l.basis.map((b) => (b === "prior-release" ? "ifly-docs" : b)),
      })),
    });
    const { container } = render(ReferencesPage, { ...base, refs: retagged });
    expect(container.querySelector(".line")).toBeNull();
    expect(screen.queryByRole("button", { name: "Source being confirmed" })).toBeNull();
    expect(container.querySelector(".tag.confirming")).toBeNull();
  });
});

describe("References, phone (RefsPhone)", () => {
  it("stacks the rows, keeps the chips, and the shorter line under the heading", async () => {
    phone();
    const { container } = render(ReferencesPage, base);
    expect(screen.getByRole("link", { name: "Back to checklist" })).toBeTruthy();
    expect(container.querySelector(".hd span")?.textContent).toBe(
      "Each list names the kind of source it’s based on; no manuals are copied or linked.",
    );
    expect(screen.getByRole("group", { name: "Show lists based on" })).toBeTruthy();
    const rows = container.querySelectorAll("a.prow");
    expect(rows).toHaveLength(6);
    expect(words(rows[0]?.querySelector(".psub"))).toBe("Preflight · Procedure Simulator documentation");
    expect(container.querySelector("a.row")).toBeNull();
    expect(screen.getByRole("region", { name: "About this pack and app" })).toBeTruthy();
  });
});
