// SPDX-FileCopyrightText: 2026 offbyonce
// SPDX-License-Identifier: MIT

// The desktop host against the interface it implements and the commands the app has, with
// Tauri's IPC mocked: no window is needed.

import type { CatalogEntry, Flight, Settings } from "@involo/bindings";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import interfaceSource from "../../../packages/ui/src/host.ts?raw";
import commandsSource from "../src-tauri/src/command_names.rs?raw";
import filesSource from "./files.ts?raw";
import { desktopHost } from "./host";
import hostSource from "./host.ts?raw";
import { openLinksWith } from "./links";

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
    const has = Object.keys(desktopHost)
      .filter((k) => k !== "desktop")
      .sort();
    const wanted = methods
      .filter((m) => !LEFT_OUT.includes(m.name))
      .map((m) => m.name)
      .sort();
    expect(has).toEqual(wanted);
    for (const name of LEFT_OUT) expect(methods.find((m) => m.name === name)?.optional).toBe(true);
    // It says it's the desktop app, for the desktop wording.
    expect(desktopHost.desktop).toBe(true);
  });

  it("calls only the app's commands, and every one of them", () => {
    const text = hostSource + filesSource;
    const called = new Set([...text.matchAll(/(?:call|invoke)<[^(]*>\("(\w+)"/g)].map((m) => m[1]));
    expect([...called].sort()).toEqual(commands().sort());
  });
});

/**
 * A data folder in memory behind the files commands, as src-tauri/src/files.rs keeps it on disk:
 * `fail` makes the next writes fail (the old file stays), `unreadable` names files that are there
 * but can't be read.
 */
function fakeFolder() {
  const folder = new Map<string, string>();
  const state = { fail: false, unreadable: new Set<string>(), calls: [] as { cmd: string; args: unknown }[] };
  const handle = (cmd: string, args: unknown): unknown => {
    state.calls.push({ cmd, args });
    const a = (args ?? {}) as { name: string; text: string; folder: string; json: string };
    switch (cmd) {
      case "files_read":
        if (state.unreadable.has(a.name)) throw "Permission denied (os error 13)";
        return folder.get(a.name) ?? null;
      case "files_write":
        if (state.fail) throw "No space left on device (os error 28)";
        folder.set(a.name, a.text);
        return null;
      case "files_remove":
        folder.delete(a.name);
        return null;
      case "files_set_aside": {
        const text = folder.get(a.name);
        if (text !== undefined) {
          folder.set(`${a.name}.kept-123`, text);
          folder.delete(a.name);
        }
        return null;
      }
      case "files_list": {
        const prefix = a.folder ? `${a.folder}/` : "";
        return [...folder.keys()]
          .filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
          .map((k) => k.slice(prefix.length))
          .sort();
      }
      case "parse_flight":
      case "parse_settings":
      case "parse_log":
        return { state: "ready", value: JSON.parse(a.json), migratedFrom: null };
      case "log_packs":
        return [];
      case "pack_file_limit":
        return 1000;
      case "check_pack":
        return {
          state: "ok",
          summary: { id: "demo", name: "Demo", version: "0.1.0", kind: "aircraft", aircraft: null },
        };
      case "parse_catalog":
        return JSON.parse(a.json);
      default:
        return null;
    }
  };
  mockIPC(handle);
  return { folder, state };
}

describe("calls into the app", () => {
  const calls: { cmd: string; args: unknown }[] = [];
  beforeEach(() => {
    calls.length = 0;
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
});

describe("saved items, as files in the data folder (#114)", () => {
  afterEach(() => clearMocks());

  it("reads back what was saved, one file each in the web app's formats, after a new start", async () => {
    const { folder } = fakeFolder();
    const flight = { pack: "demo" } as unknown as Flight;
    const settings = { theme: "dark" } as unknown as Settings;
    expect(typeof (await desktopHost.save("demo", "flight", flight))).toBe("number");
    await desktopHost.save("demo", "settings", settings);
    await desktopHost.savePlan("demo", { format: 1, plan: {}, loadedAt: 1 } as never);
    expect(await desktopHost.saveLog({ format: 3, flights: [], practice: [] } as never)).toBe(true);
    expect([...folder.keys()].sort()).toEqual([
      "flight.demo.json",
      "log.json",
      "plan.demo.json",
      "settings.json",
    ]);
    expect(folder.get("settings.json")).toBe(JSON.stringify(settings));
    // Read again, as the next start does.
    const saved = await desktopHost.readSaved("demo");
    expect(saved.flight?.loaded).toMatchObject({ state: "ready", value: flight });
    expect(saved.settings?.text).toBe(JSON.stringify(settings));
    expect((await desktopHost.readLog())?.loaded.state).toBe("ready");
    expect(await desktopHost.savedPacks()).toEqual(["demo"]);
    // Remove, with its saved flight: the flight and plan go, the settings and log stay.
    expect(await desktopHost.removeSaved("demo")).toBe(true);
    expect([...folder.keys()].sort()).toEqual(["log.json", "settings.json"]);
  });

  it("reports a write the disk refused, and leaves what was saved before", async () => {
    const { folder, state } = fakeFolder();
    await desktopHost.save("demo", "flight", { pack: "demo", n: 1 } as unknown as Flight);
    state.fail = true;
    expect(await desktopHost.save("demo", "flight", { pack: "demo", n: 2 } as unknown as Flight)).toBeNull();
    expect(await desktopHost.saveLog({ format: 3, flights: [], practice: [] } as never)).toBe(false);
    expect(folder.get("flight.demo.json")).toBe(JSON.stringify({ pack: "demo", n: 1 }));
  });

  it("sets a file aside instead of deleting it, and counts no set-aside copy as a saved flight", async () => {
    const { folder } = fakeFolder();
    folder.set("flight.demo.json", "not json");
    expect(await desktopHost.setAside("demo", "flight")).toBe(true);
    expect((await desktopHost.readSaved("demo")).flight).toBeNull();
    expect(await desktopHost.savedPacks()).toEqual([]);
    expect([...folder.entries()]).toEqual([["flight.demo.json.kept-123", "not json"]]);
  });

  it("treats a file that is there but can't be read as unreadable, never as nothing", async () => {
    const { state } = fakeFolder();
    state.unreadable.add("flight.demo.json");
    state.unreadable.add("log.json");
    const saved = await desktopHost.readSaved("demo");
    expect(saved.flight?.loaded.state).toBe("unreadable");
    // An unreadable log is reported, so the app never saves an empty one over it.
    const log = await desktopHost.readLog();
    expect(log?.loaded).toMatchObject({ state: "unreadable", reason: "Permission denied (os error 13)" });
  });
});

describe("packs, as files in the data folder (#114)", () => {
  const entry = {
    id: "demo",
    name: "Demo",
    version: "0.1.0",
    size: 10,
    sha256: "ab",
  } as unknown as CatalogEntry;
  afterEach(() => {
    clearMocks();
    vi.unstubAllGlobals();
  });

  it("keeps an installed pack's file and where it came from, and Remove deletes both", async () => {
    const { folder } = fakeFolder();
    const got = await desktopHost.installPackFile(new Blob(['{"pack":1}']));
    expect(got).toMatchObject({ state: "installed", pack: { summary: { id: "demo" }, source: "file" } });
    expect(folder.get("packs/demo.involo-pack")).toBe('{"pack":1}');
    expect(JSON.parse(folder.get("packs/installed.json") ?? "[]")).toMatchObject([
      { summary: { id: "demo" }, source: "file" },
    ]);
    // Read again, as the next start does.
    expect((await desktopHost.installedPacks()).map((p) => p.summary.id)).toEqual(["demo"]);
    expect(await desktopHost.removePack("demo")).toBe(true);
    expect(await desktopHost.installedPacks()).toEqual([]);
    expect(folder.has("packs/demo.involo-pack")).toBe(false);
  });

  it("sends a pack file's bytes as they are to be checked, and refuses one over the limit unread", async () => {
    const { state } = fakeFolder();
    await desktopHost.installPackFile(new Blob(['{"pack":1}']));
    const check = state.calls.find((c) => c.cmd === "check_pack");
    expect(check?.args).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(check?.args as Uint8Array)).toBe('{"pack":1}');
    const large = await desktopHost.installPackFile(new Blob(["x".repeat(1001)]));
    expect(large.state).toBe("refused");
    expect(state.calls.filter((c) => c.cmd === "check_pack")).toHaveLength(1);
  });

  it("lists no pack whose file is missing, and none when the list can't be read", async () => {
    const { folder } = fakeFolder();
    folder.set(
      "packs/installed.json",
      JSON.stringify([{ summary: { id: "gone" }, source: "file", installedAt: 1 }]),
    );
    expect(await desktopHost.installedPacks()).toEqual([]);
    folder.set("packs/installed.json", "not json");
    expect(await desktopHost.installedPacks()).toEqual([]);
  });

  it("reads the catalog and its packs from the app's site, asking nothing about the pilot", async () => {
    fakeFolder();
    const asked: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal("fetch", async (url: URL | string, init?: RequestInit) => {
      asked.push({ url: String(url), init });
      return String(url).endsWith("index.json")
        ? new Response(JSON.stringify([entry]))
        : new Response('{"pack":1}', { headers: { "content-length": "10" } });
    });
    expect(await desktopHost.catalog()).toEqual([entry]);
    await desktopHost.installCatalogPack(entry);
    expect(asked.map((a) => a.url)).toEqual([
      "https://offbyonce.github.io/involo/packs/index.json",
      "https://offbyonce.github.io/involo/packs/demo-0.1.0.involo-pack",
    ]);
    for (const a of asked)
      expect(a.init).toMatchObject({ credentials: "omit", referrerPolicy: "no-referrer" });
  });

  it("offline, the catalog can't be read, and installed packs still open", async () => {
    const { folder } = fakeFolder();
    folder.set("packs/demo.involo-pack", '{"pack":1}');
    folder.set(
      "packs/installed.json",
      JSON.stringify([{ summary: { id: "demo" }, source: "catalog", installedAt: 1 }]),
    );
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(desktopHost.catalog()).rejects.toThrow("Failed to fetch");
    expect((await desktopHost.installedPacks()).map((p) => p.summary.id)).toEqual(["demo"]);
    await desktopHost.loadPack("demo");
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
