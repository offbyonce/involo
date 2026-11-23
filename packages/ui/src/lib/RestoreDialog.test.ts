// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

import { cleanup, fireEvent, render, screen, within } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReviewFlight } from "./backup";
import RestoreDialog from "./RestoreDialog.svelte";

// The restore's confirm step (#47, RestoreReview and RestoreRefused boards): nothing changes until
// Restore, and only the ticked parts are restored.

afterEach(cleanup);

const flight = (pack: string, more: Partial<ReviewFlight> = {}): ReviewFlight => ({
  pack,
  name: `Pack ${pack}`,
  version: "0.1.0",
  badge: null,
  inBackup: "In the backup: Preflight, 4 of 10",
  device: { text: "No flight on this device yet, so nothing is replaced.", replaces: false },
  upgrade: null,
  installed: true,
  download: null,
  ...more,
});
const asked = {
  kind: "review" as const,
  saved: "Backup saved Nov 18, 2026 at 10:14 by Involo 0.1.0. Untick anything you want to leave as it is.",
  flights: [
    flight("a"),
    flight("b", { installed: false, download: { id: "b", name: "Pack b", version: "0.1.0" } as never }),
  ],
  log: "Adds 3 flights and 2 practice results that aren’t on this device. Nothing is removed.",
  leftOut: null,
};

function show(shown = asked as never) {
  const calls = { close: vi.fn(), restore: vi.fn(), download: vi.fn() };
  render(RestoreDialog, {
    shown,
    onClose: calls.close,
    onRestore: calls.restore,
    onDownload: calls.download,
  });
  return calls;
}

describe("RestoreDialog", () => {
  it("lists every part ticked, and restores them all on Restore", async () => {
    const calls = show();
    const dialog = screen.getByRole("dialog", { name: "Restore from this backup?" });
    expect(within(dialog).getByText(asked.saved)).toBeTruthy();
    const boxes = within(dialog).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, true, true, true]);
    expect(within(dialog).getByText("Not installed")).toBeTruthy();
    expect(within(dialog).getByText(asked.log)).toBeTruthy();
    // Nothing is restored until Restore.
    expect(calls.restore).not.toHaveBeenCalled();
    await fireEvent.click(within(dialog).getByRole("button", { name: "Restore" }));
    expect(calls.restore).toHaveBeenCalledWith({ flights: ["a", "b"], settings: true, log: true });
  });

  it("leaves an unticked part out, and disables Restore with everything unticked", async () => {
    const calls = show();
    const boxes = screen.getAllByRole("checkbox");
    await fireEvent.click(boxes[0] as HTMLElement);
    await fireEvent.click(boxes[3] as HTMLElement);
    await fireEvent.click(screen.getByRole("button", { name: "Restore" }));
    expect(calls.restore).toHaveBeenLastCalledWith({ flights: ["b"], settings: true, log: false });
    await fireEvent.click(boxes[1] as HTMLElement);
    await fireEvent.click(boxes[2] as HTMLElement);
    expect((screen.getByRole("button", { name: "Restore" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("describes a 3.0 file from the file: its badge, what it marks and what it leaves out (#240)", () => {
    show({
      kind: "review",
      saved: "Saved Nov 20, 2026 at 09:30 by the 3.0 checklist.",
      flights: [
        flight("a", {
          version: null,
          badge: "From the 3.0 checklist",
          inBackup: "In the file: 2 steps ticked, 1 skipped.",
        }),
      ],
      log: null,
      leftOut: "Not brought across: 3.0’s flight log, practice scores and timers.",
    } as never);
    const dialog = screen.getByRole("dialog", { name: "Restore from this backup?" });
    expect(within(dialog).getByText("Saved Nov 20, 2026 at 09:30 by the 3.0 checklist.")).toBeTruthy();
    expect(within(dialog).getByText("From the 3.0 checklist")).toBeTruthy();
    expect(within(dialog).queryByText(/^v/)).toBeNull();
    expect(within(dialog).getByText("In the file: 2 steps ticked, 1 skipped.")).toBeTruthy();
    expect(
      within(dialog).getByText("Not brought across: 3.0’s flight log, practice scores and timers."),
    ).toBeTruthy();
    expect(within(dialog).queryByText("Flight log")).toBeNull();
  });

  it("changes nothing on Cancel or Esc", async () => {
    const calls = show();
    await fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await fireEvent.keyDown(window, { key: "Escape" });
    expect(calls.close).toHaveBeenCalledTimes(2);
    expect(calls.restore).not.toHaveBeenCalled();
  });

  it("offers Download for a catalog pack that isn't installed", async () => {
    const calls = show();
    await fireEvent.click(screen.getByRole("button", { name: "Download" }));
    expect(calls.download).toHaveBeenCalledWith(asked.flights[1]?.download);
  });

  it("says why a Download failed on its row, and keeps the row ticked", () => {
    render(RestoreDialog, {
      shown: asked as never,
      problems: { b: { title: "Pack b couldn’t be downloaded.", lines: ["Failed to fetch"] } },
      onClose: () => {},
      onRestore: () => {},
      onDownload: () => {},
    });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Pack b couldn’t be downloaded.");
    expect(alert.textContent).toContain("Failed to fetch");
    expect((screen.getAllByRole("checkbox")[1] as HTMLInputElement).checked).toBe(true);
  });

  it("leaves the Flight log row out when the backup adds nothing to it", () => {
    show({ ...asked, log: null } as never);
    expect(screen.queryByText("Flight log")).toBeNull();
    expect(screen.getAllByRole("checkbox")).toHaveLength(3);
  });

  it("says why a file can't be restored and that nothing changed, with Close", async () => {
    const calls = show({
      kind: "refused",
      line: "This file isn’t an Involo backup, or it’s damaged.",
    } as never);
    const dialog = screen.getByRole("dialog", { name: "This backup can’t be restored" });
    expect(within(dialog).getByText("This file isn’t an Involo backup, or it’s damaged.")).toBeTruthy();
    expect(within(dialog).getByText("Nothing on this device was changed.")).toBeTruthy();
    await fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    expect(calls.close).toHaveBeenCalled();
  });
});
