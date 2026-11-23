// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The desktop host against the interface it implements and the commands the app has, with
// Tauri's IPC mocked: no window is needed.

import type { Flight, Settings } from "@involo/bindings";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import interfaceSource from "../../../packages/ui/src/host.ts?raw";
import commandsSource from "../src-tauri/src/command_names.rs?raw";
import { desktopHost } from "./host";
import hostSource from "./host.ts?raw";
import { openLinksWith } from "./links";
import * as memory from "./memory";

/** The `Host` interface's methods, from its source: name, and whether it is optional. */
function hostMethods(): { name: string; optional: boolean }[] {
  const text = interfaceSource;
  const body = text.slice(
    text.indexOf("export interface Host {"),
    text.indexOf("\n}\n", text.indexOf("export interface Host {")),
  );
  return [...body.matchAll(/^ {2}(\w+)(\?)?\(/gm)].map((m) => ({
    name: m[1] as string,
    optional: m[2] === "?",
  }));
}

/** The commands the app has, from src-tauri/src/command_names.rs. */
function commands(): string[] {
  const text = commandsSource;
  return [...text.matchAll(/^ {4}"(\w+)",$/gm)].map((m) => m[1] as string);
}

/** The optional methods the desktop host leaves out, and why: the window keeps its own data
 * (persistent storage is a browser's), and has no tab whose favicon follows the theme. */
const LEFT_OUT = ["persistStorage", "themeChanged"];

describe("the desktop host", () => {
  it("implements every method of the Host interface, leaving out only the browser's", () => {
    const methods = hostMethods();
    expect(methods.length).toBeGreaterThan(40);
    const has = Object.keys(desktopHost).sort();
    const wanted = methods
      .filter((m) => !LEFT_OUT.includes(m.name))
      .map((m) => m.name)
      .sort();
    expect(has).toEqual(wanted);
    for (const name of LEFT_OUT) expect(methods.find((m) => m.name === name)?.optional).toBe(true);
  });

  it("calls only the app's commands, and every one of them", () => {
    const text = hostSource;
    const called = new Set([...text.matchAll(/(?:call|invoke)<[^(]*>\("(\w+)"/g)].map((m) => m[1]));
    expect([...called].sort()).toEqual(commands().sort());
  });
});

describe("calls into the app", () => {
  const calls: { cmd: string; args: unknown }[] = [];
  beforeEach(() => {
    calls.length = 0;
    memory.saved.clear();
    memory.packs.clear();
  });
  afterEach(() => clearMocks());

  it("opens a link through open_link", async () => {
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
    });
    await desktopHost.openLink("https://github.com/offbyonce/involo/releases/tag/v0.1.0");
    expect(calls).toEqual([
      { cmd: "open_link", args: { url: "https://github.com/offbyonce/involo/releases/tag/v0.1.0" } },
    ]);
  });

  it("saves a file through save_file, and says whether it was saved", async () => {
    let answer = true;
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
      return answer;
    });
    expect(await desktopHost.saveFile("involo-backup.json", "{}", "application/json")).toBe(true);
    answer = false;
    expect(await desktopHost.saveFile("involo-log.csv", "a,b", "text/csv")).toBe(false);
    expect(calls).toEqual([
      { cmd: "save_file", args: { name: "involo-backup.json", text: "{}" } },
      { cmd: "save_file", args: { name: "involo-log.csv", text: "a,b" } },
    ]);
  });

  it("rejects with the app's tagged error", async () => {
    mockIPC(() => {
      throw { kind: "PackInvalid", message: "pack demo is not loaded" };
    });
    await expect(desktopHost.newFlight("demo")).rejects.toEqual({
      kind: "PackInvalid",
      message: "pack demo is not loaded",
    });
  });

  it("sends a pack file's bytes as they are, to be checked before it is kept", async () => {
    const summary = { id: "demo", name: "Demo", version: "0.1.0", kind: "aircraft", aircraft: null };
    mockIPC((cmd, args) => {
      calls.push({ cmd, args });
      if (cmd === "pack_file_limit") return 1000;
      if (cmd === "check_pack") return { state: "ok", summary };
      return null;
    });
    const got = await desktopHost.installPackFile(new Blob(['{"pack":1}']));
    expect(got).toMatchObject({ state: "installed", pack: { summary, source: "file" } });
    const check = calls.find((c) => c.cmd === "check_pack");
    expect(check?.args).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(check?.args as Uint8Array)).toBe('{"pack":1}');
    expect((await desktopHost.installedPacks()).map((p) => p.summary.id)).toEqual(["demo"]);
    // A file over the limit is refused unread.
    const large = await desktopHost.installPackFile(new Blob(["x".repeat(1001)]));
    expect(large.state).toBe("refused");
    expect(calls.filter((c) => c.cmd === "check_pack")).toHaveLength(1);
  });
});

describe("what is kept until files on disk (#114)", () => {
  beforeEach(() => {
    memory.saved.clear();
    mockIPC((cmd, args) => {
      if (cmd === "parse_flight" || cmd === "parse_settings")
        return { state: "ready", value: JSON.parse((args as { json: string }).json), migratedFrom: null };
      return null;
    });
  });
  afterEach(() => clearMocks());

  it("reads back what was saved, under the web app's names", async () => {
    const flight = { pack: "demo" } as unknown as Flight;
    const settings = { theme: "dark" } as unknown as Settings;
    expect(typeof (await desktopHost.save("demo", "flight", flight))).toBe("number");
    await desktopHost.save("demo", "settings", settings);
    const saved = await desktopHost.readSaved("demo");
    expect(saved.flight?.loaded).toMatchObject({ state: "ready", value: flight });
    expect(saved.settings?.text).toBe(JSON.stringify(settings));
    expect(await desktopHost.savedPacks()).toEqual(["demo"]);
    expect([...memory.saved.keys()].sort()).toEqual(["flight.demo", "settings"]);
  });

  it("sets saved text aside instead of deleting it", async () => {
    memory.saved.set("flight.demo", "not json");
    expect(await desktopHost.setAside("demo", "flight")).toBe(true);
    expect((await desktopHost.readSaved("demo")).flight).toBeNull();
    expect(await desktopHost.savedPacks()).toEqual([]);
    const kept = [...memory.saved.entries()];
    expect(kept).toHaveLength(1);
    expect(kept[0]?.[0]).toMatch(/^flight\.demo\.kept-\d+$/);
    expect(kept[0]?.[1]).toBe("not json");
  });
});

describe("links that open a new tab", () => {
  const page = () => {
    document.body.innerHTML = `
      <a id="out" href="https://github.com/offbyonce/involo/releases" target="_blank" rel="noopener">What’s new</a>
      <a id="plain" href="http://example.com" target="_blank">Plain</a>
      <a id="here" href="#/settings">Settings</a>
      <a id="file" href="third-party-licenses.txt" target="_blank">Licenses</a>`;
  };
  const click = (id: string, init: MouseEventInit = {}) => {
    const e = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init });
    document.getElementById(id)?.dispatchEvent(e);
    return e;
  };

  it("open in the default browser, https only", () => {
    const opened = vi.fn();
    openLinksWith(opened);
    page();
    expect(click("out").defaultPrevented).toBe(true);
    expect(opened).toHaveBeenCalledWith("https://github.com/offbyonce/involo/releases");
    for (const id of ["plain", "here", "file"]) expect(click(id).defaultPrevented).toBe(false);
    expect(click("out", { button: 1 }).defaultPrevented).toBe(false);
    expect(opened).toHaveBeenCalledTimes(1);
  });
});
