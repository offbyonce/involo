// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// Crew roles and list methods (#133, Roles board): shown only when the pack says so. The example
// pack (invented) sets methods and roles; the iFly pack sets none. Each list is the one Rust builds
// for a new flight.

import type { Checklist, FlatPack, Flight, PhaseModel, Settings } from "@involo/bindings";
import { cleanup, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it } from "vitest";
import { default_settings, new_flight, phase_model } from "../../../../apps/web/src/wasm/involo_web_host.js";
import { indexPack } from "../pack-index";
import { examplePack, iflyPack } from "../test-pack";
import FlowView from "./FlowView.svelte";
import ListCard from "./ListCard.svelte";

const ok = <T>(reply: string): T => (JSON.parse(reply) as { ok: T }).ok;

/** A pack's phase as a new flight shows it, with the pack loaded into Rust first. */
function phase(pack: FlatPack, id: string) {
  const flight = ok<Flight>(new_flight(pack.manifest.id));
  const settings = ok<Settings>(default_settings());
  const model = ok<PhaseModel>(
    phase_model(pack.manifest.id, JSON.stringify(flight), JSON.stringify(settings), id),
  );
  return { flight, model, index: indexPack(pack) };
}

const noop = () => {};

function card(pack: FlatPack, phaseId: string, folded = false) {
  const { flight, model, index } = phase(pack, phaseId);
  const list = model.lists[0];
  if (!list) throw new Error(`${phaseId} has no list`);
  const source = pack.lists.find((l) => l.id === list.id) as Checklist;
  render(ListCard, {
    index,
    list,
    source,
    flight,
    detail: "expanded",
    selected: null,
    folded,
    onTick: noop,
    onSkip: noop,
    onUnskip: noop,
    onBlank: noop,
    onSelect: noop,
    onClear: noop,
  });
  return list;
}

/** The row of a step, by its id. */
const row = (id: string) => document.querySelector(`li[data-step="${id}"]`) as HTMLElement;
/** The tags in an element, as their short names and what a screen reader says. */
const tags = (el: Element) =>
  [...el.querySelectorAll("abbr.role")].map((a) => [
    a.querySelector("[aria-hidden]")?.textContent,
    a.getAttribute("title"),
  ]);

afterEach(() => cleanup());

describe("crew roles and list methods (#133)", () => {
  it("a challenge-and-response list: its method under the title, column headings, who calls and who answers", () => {
    card(examplePack(), "before-start");
    expect(screen.getByText("Checklist · Challenge and response")).toBeTruthy();
    const heads = document.querySelector(".heads") as HTMLElement;
    expect([...heads.children].map((c) => c.textContent)).toEqual([
      "",
      "Calls",
      "Challenge",
      "Answers",
      "Response",
    ]);
    const battery = row("example-trainer.before-start.battery");
    expect(battery.classList.contains("pair")).toBe(true);
    expect(tags(battery.querySelector(".calls") as Element)).toEqual([["PM", "Pilot monitoring"]]);
    expect(tags(battery.querySelector(".answers") as Element)).toEqual([["CAPT", "Captain"]]);
    // A screen reader hears the full name and what the role does.
    expect(battery.querySelector(".calls")?.textContent).toBe("PMPilot monitoring, calls");
    expect(battery.querySelector(".answers")?.textContent).toBe("CAPTCaptain, answers");
  });

  it("tablet and phone: the strip names the method and the count", () => {
    const list = card(examplePack(), "before-start");
    const strip = document.querySelector(".strip") as HTMLElement;
    expect(strip.getAttribute("aria-hidden")).toBe("true");
    expect(strip.textContent).toBe(
      `${list.title} · Challenge and response${list.progress.done} of ${list.progress.total} done`,
    );
    expect(document.querySelector(".label")).toBeNull();
  });

  it("another list: the step's role tag after its name, inside the row's button", () => {
    card(examplePack(), "start");
    expect(screen.getByText("Procedure · Read and do")).toBeTruthy();
    expect(document.querySelector(".heads")).toBeNull();
    const nose = row("example-trainer.start.walkaround");
    expect(nose.classList.contains("pair")).toBe(false);
    const name = nose.querySelector(".row .name") as HTMLElement;
    expect(tags(name)).toEqual([["CAPT", "Captain"]]);
    expect(name.querySelector(".nm + abbr.role")).toBeTruthy();
    expect(within(nose).getByRole("button", { name: /Nose area.*Captain/ })).toBeTruthy();
  });

  it("a step with no role has no tag", () => {
    card(examplePack(), "start");
    expect(tags(row("example-trainer.start.radio"))).toEqual([]);
  });

  it("folded until the procedure is done: the method, then when it opens", () => {
    card(examplePack(), "before-start", true);
    expect(screen.getByText("Challenge and response · opens when the procedure is done")).toBeTruthy();
  });

  it("the iFly pack (no methods, no roles): no method line, no headings, no tags", () => {
    const pack = iflyPack();
    const list = pack.lists.find((l) => l.kind === "checklist") as Checklist;
    const phaseId = pack.content.phases?.phases.find((p) => p.lists.includes(list.id))?.id as string;
    card(pack, phaseId);
    expect(document.querySelector(".how, .strip, .heads, abbr.role, .calls, .answers")).toBeNull();
    expect(document.querySelector(".label")).toBeTruthy();
    cleanup();
    card(pack, phaseId, true);
    expect(screen.getByText("Opens when the procedure is done")).toBeTruthy();
  });

  it("Step by step: the caller's tag before the name, the answerer's before the value", () => {
    const pack = examplePack();
    const { model, index } = phase(pack, "before-start");
    render(FlowView, {
      index,
      view: model,
      cursor: null,
      detail: "expanded",
      onConfirm: noop,
      onSkip: noop,
      onMove: noop,
      onBlank: noop,
    });
    const [name, value] = [...document.querySelectorAll(".box .line")] as HTMLElement[];
    expect(tags(name as HTMLElement)).toEqual([["PM", "Pilot monitoring"]]);
    expect(name?.querySelector("abbr.role + .sr-only + h1")).toBeTruthy();
    expect(tags(value as HTMLElement)).toEqual([["CAPT", "Captain"]]);
    expect(value?.querySelector(".value")?.textContent).toBe("ON");
  });

  it("Step by step, another list: the role's tag before the name only", () => {
    const pack = examplePack();
    const { model, index } = phase(pack, "start");
    render(FlowView, {
      index,
      view: model,
      cursor: null,
      detail: "expanded",
      onConfirm: noop,
      onSkip: noop,
      onMove: noop,
      onBlank: noop,
    });
    const lines = [...document.querySelectorAll(".box .line")];
    expect(lines).toHaveLength(1);
    expect(tags(lines[0] as Element)).toEqual([["CAPT", "Captain"]]);
  });

  it("Step by step with the iFly pack: no tags, the name and value as before", () => {
    const pack = iflyPack();
    const list = pack.lists[0] as Checklist;
    const phaseId = pack.content.phases?.phases.find((p) => p.lists.includes(list.id))?.id as string;
    const { model, index } = phase(pack, phaseId);
    render(FlowView, {
      index,
      view: model,
      cursor: null,
      detail: "expanded",
      onConfirm: noop,
      onSkip: noop,
      onMove: noop,
      onBlank: noop,
    });
    expect(document.querySelector(".box .line, abbr.role")).toBeNull();
    expect(document.querySelector(".box > h1")).toBeTruthy();
  });
});

describe("the pack index (#133)", () => {
  it("names each list's method and kind in the pack's words; none without a method", () => {
    const index = indexPack(examplePack());
    expect(index.listMethod("before-start")).toBe("Challenge and response");
    expect(index.listMethod("start-flow")).toBe("Read and do");
    expect(index.listMethod("smoke")).toBe("From memory");
    expect(index.listKind("before-start")).toBe("Checklist");
    const ifly = indexPack(iflyPack());
    expect(iflyPack().lists.every((l) => ifly.listMethod(l.id) === null)).toBe(true);
  });

  it("offers a seat for each seat the labels list when the pack draws more than one seat view", () => {
    expect(indexPack(examplePack()).seats).toEqual([
      { id: "left", label: "Left seat · Captain" },
      { id: "right", label: "Right seat · First officer" },
    ]);
    // One seat view: no choice to make.
    expect(indexPack(iflyPack()).seats).toEqual([]);
  });

  it("offers Essentials only for a pack that marks quick steps", () => {
    expect(indexPack(examplePack()).hasEssentials).toBe(true);
    expect(indexPack(iflyPack()).hasEssentials).toBe(true);
    const none = structuredClone(examplePack());
    for (const list of none.lists) for (const step of list.steps) step.quick = null;
    expect(indexPack(none).hasEssentials).toBe(false);
  });
});
