<!--
SPDX-FileCopyrightText: 2026 offbyonce
SPDX-License-Identifier: MIT

The app frame, laid out as in 3.0: the top bar with stage tabs, the phase chips, the screen for
the current address, and on wide screens the context panel for the selected step. State comes
from the host (decision 0012): a flight, settings, the rail and the phase on screen, all computed
in Rust. The host saves progress and settings on the device.
-->
<script lang="ts">
  import { useFlightPack } from "./flight/sections";
  import { referenceTabs } from "./lib/reference-tabs";
  import {
    type Action,
    type AppInfo,
    type Backup,
    type BackupFlight,
    type CatalogEntry,
    type Checklist,
    type PackChanges,
    type FieldId,
    type FlatPack,
    type Flight,
    isAppError,
    type StepLayout,
    type Log,
    type LoggedFlight,
    type PhaseModel,
    type PlanSource,
    type Progress,
    type Rail,
    type OpenStep,
    type OtherAircraft,
    type SavedPlan,
    type Suggestion,
    type Settings,
    type ViewFrame,
  } from "@involo/bindings";
  import { getHost, type InstalledPack, type Kept, type PackInstall, type SavedItem } from "./host";
  import PacksPage, { type PackRow, type PacksNotice } from "./pages/PacksPage.svelte";
  import UpdateNote from "./lib/UpdateNote.svelte";
  import RestoreDialog, { type Chosen, type Refused, type Review } from "./lib/RestoreDialog.svelte";
  import { backupFileName, logLine, refusalLine, rowFor, savedByLine, TOO_LARGE } from "./lib/backup";
  import { MAX_BACKUP_FILE_BYTES } from "./lib/file-limits";
  import OtherAircraftDialog from "./lib/OtherAircraft.svelte";
  import { morePacks, savedLine, updateFor } from "./lib/packs";
  import type { SwitchPack } from "./lib/Drawer.svelte";
  import { fetchProblem, fileProblem } from "./lib/problems";
  import { safely } from "./lib/safely";
  import type { Opening } from "./lib/opening";
  import Slideout from "./lib/Slideout.svelte";
  import Toast from "./lib/Toast.svelte";
  import { answered } from "./lib/answers.svelte";
  import { changedText, dependsOn, labelOf, lowerFirst, shortLabel, type DecisionSource, type Decisions } from "./lib/decision";
  import { stepTitle } from "./lib/names";
  import StepPane from "./lib/StepPane.svelte";
  import Drawer from "./lib/Drawer.svelte";
  import SaveFailedNotice from "./lib/SaveFailedNotice.svelte";
  import Find from "./lib/Find.svelte";
  import { buildFind, type FindControl, type FindIndex } from "./lib/find-index";
  import ProgressRow from "./lib/ProgressRow.svelte";
  import StagePicker from "./lib/StagePicker.svelte";
  import { openSteps } from "./lib/open-steps.svelte";
  import FlightStrip from "./lib/FlightStrip.svelte";
  import FlowView from "./lib/FlowView.svelte";
  import PhaseChips from "./lib/PhaseChips.svelte";
  import TopBar from "./lib/TopBar.svelte";
  import { indexPack, type PackIndex } from "./pack-index";
  import KeptNotice from "./lib/KeptNotice.svelte";
  import OpenStepsPage from "./pages/OpenStepsPage.svelte";
  import PhasePage from "./pages/PhasePage.svelte";
  import ReferencePage from "./pages/ReferencePage.svelte";
  import SettingsPage from "./pages/SettingsPage.svelte";
  import FlightPage from "./flight/FlightPage.svelte";
  import { buildGlossary, glossaryHref } from "./lib/glossary";
  import { messageHref } from "./lib/messages";
  import GlossaryPage from "./pages/GlossaryPage.svelte";
  import FlightDeckPage from "./pages/FlightDeckPage.svelte";
  import HowPage from "./pages/HowPage.svelte";
  import PracticePage from "./pages/PracticePage.svelte";
  import LogPage from "./pages/LogPage.svelte";
  import ReferencesPage from "./pages/ReferencesPage.svelte";
  import { buildReferences } from "./lib/references";
  import { download, fileDate, htmlCopy, logOf, logPacks } from "./lib/flight-log";
  import Tour from "./lib/Tour.svelte";
  import { tour } from "./lib/tour-state.svelte";
  import { setSeatView } from "./lib/seat-view";
  import { flowAreas, howCountsOf } from "./lib/how-content";
  import { currentRoute, flightHref, phaseHref } from "./route.svelte";
  import { applyPalette, applyScale } from "./theme/tokens";

  let {
    pack: wanted = null,
    onRestart = () => {},
  }: {
    /** The pack a switch chose, opened if installed, before the one the settings name. */
    pack?: string | null;
    /** Starts the app again on `pack` (the root remounts it), after the current pack changes. */
    onRestart?: (pack: string | null) => void;
  } = $props();
  const host = getHost();
  const route = currentRoute();

  /**
   * The list (the page) and the side pane scroll on their own with no scrollbar, as on the boards;
   * edge fades show where there is more. Wheel, trackpad, touch and keys
   * scroll them as usual.
   */
  let pageMore = $state({ up: false, down: false });
  let paneMore = $state({ up: false, down: false });
  const edges = (top: number, view: number, whole: number) => ({ up: top > 1, down: top + view < whole - 1 });
  $effect(() => {
    const read = () => {
      const d = document.documentElement;
      pageMore = edges(d.scrollTop, d.clientHeight, d.scrollHeight);
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(document.body);
    window.addEventListener("scroll", read, { passive: true });
    window.addEventListener("resize", read);
    return () => {
      watch.disconnect();
      window.removeEventListener("scroll", read);
      window.removeEventListener("resize", read);
    };
  });
  function fades(el: HTMLElement) {
    const read = () => (paneMore = edges(el.scrollTop, el.clientHeight, el.scrollHeight));
    const watch = new ResizeObserver(read);
    watch.observe(el);
    for (const child of el.children) watch.observe(child);
    const added = new MutationObserver(() => {
      for (const child of el.children) watch.observe(child);
      read();
    });
    added.observe(el, { childList: true });
    el.addEventListener("scroll", read, { passive: true });
    read();
    return {
      destroy: () => {
        watch.disconnect();
        added.disconnect();
        el.removeEventListener("scroll", read);
      },
    };
  }
  let info = $state<AppInfo | null>(null);
  let packId = $state("");
  let index = $state<PackIndex | null>(null);
  let lists = $state(new Map<string, Checklist>());
  let intros = $state(new Map<string, { heading?: string | null; text: string }[]>());
  let settings = $state<Settings | null>(null);
  /** Whether a flight was saved on this device before this visit (the tour's welcome is for a first
   * visit). */
  let hadFlight = false;
  let flight = $state<Flight | null>(null);
  let rail = $state<Rail | null>(null);
  let open = $state<OpenStep[]>([]);
  /** Open steps from the phases before the one on screen. */
  /** When progress or settings were last saved on this device. */
  let savedAt = $state<number | null>(null);
  /** The last save was refused (storage blocked or full): progress isn't being saved. */
  let saveFailed = $state(false);
  /** Saved data the app could not use, kept until the pilot decides (decision 0012). */
  /** The SimBrief plan kept on this device (decision 0019), and the values it fills. */
  let plan = $state<SavedPlan | null>(null);
  let planFills = $state<Partial<Record<FieldId, string>>>({});
  /** The flight log (decision 0026), and why it can't be changed when the saved one is kept as is. */
  let log = $state<Log | null>(null);
  let logBlocked = $state<string | null>(null);
  /** Saved data the app could not use, kept until the pilot decides (decisions 0012 and 0019);
   * `stuck` when starting fresh couldn't set it aside, so nothing was moved. */
  let kept = $state<{ what: Kept; state: "newer" | "unreadable"; text: string; stuck?: boolean }[]>([]);
  let view = $state<PhaseModel | null>(null);
  /** In Essentials, the same phase in Full, for "Show N more steps from Full". */
  let fullView = $state<PhaseModel | null>(null);
  let error = $state<string | null>(null);
  let menuOpen = $state(false);
  /** The step shown in the context panel; null means the current step. */
  let selected = $state<string | null>(null);
  /** The step Step by step view shows; null follows the current step. */
  let cursor = $state<string | null>(null);
  /** Find: its index, built once per pack, and whether it is open. */
  let findIndex = $state<FindIndex | null>(null);
  /** The loaded pack, for Practice's question generator. */
  let flatPack = $state.raw<FlatPack | null>(null);
  /** The Glossary: every term A to Z, with the steps that use it. */
  let glossary = $derived(index && findIndex ? buildGlossary(index, findIndex.terms, findIndex.steps) : []);
  let findOpen = $state(false);
  /** Find opened on a set of steps (References' simulator model notes), or on everything. */
  let findScope = $state<{ label: string; steps: string[] } | null>(null);
  /** References (References boards), counted from the pack. */
  let references = $derived(flatPack ? buildReferences(flatPack, rail) : null);
  let findOpener: HTMLElement | null = null;
  const findKey = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘K" : "Ctrl K";
  function openFind(scope: { label: string; steps: string[] } | null = null): void {
    // Not over a modal drawing (Where is this?, the schematic): it would open out of reach.
    if (findOpen || !findIndex || document.querySelector("dialog[open]")) return;
    findScope = scope;
    const from = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Focus goes back to the opener, unless it sits in a layer Find closes.
    findOpener = from && !from.closest('#drawer, .picker, .slide-box, [role="dialog"]') ? from : null;
    menuOpen = false;
    pickerOpen = false;
    openSteps.shown = false;
    slide = null;
    findOpen = true;
    // An entry of its own, so the system back closes Find as it closes any full-screen sheet.
    history.pushState({ ...(history.state ?? {}), find: true }, "");
  }
  /** `back`: closed in place (Esc, the back arrow, the scrim), focus going back to the opener;
   * otherwise a step or control was chosen and the page moves on. `popped`: the system back. */
  function closeFind(back = true, popped = false): void {
    if (!findOpen) return;
    findOpen = false;
    if (!popped && history.state?.find) {
      if (back) history.back();
      else history.replaceState({ ...history.state, find: false }, "");
    }
    if (back) (findOpener?.isConnected ? findOpener : document.querySelector<HTMLElement>("header.top .find"))?.focus();
    findOpener = null;
  }
  /** A slide-out to open once its step is on screen (a control chosen in Find); dropped if the
   * step's phase shows without it (Essentials, say). */
  let pendingSlide = $state<{ step: string; phase: string; opening: Opening } | null>(null);
  function findControl(c: FindControl): void {
    closeFind(false);
    if (!c.step) return;
    const opening: Opening = c.at ? { entry: "control", control: c.at, where: true } : { entry: "where" };
    if (pane?.step.id === c.step) {
      openSlide(opening);
      return;
    }
    pendingSlide = { step: c.step, phase: index?.phaseOf(c.step) ?? "", opening };
    goToStep(c.step);
  }

  function fail(e: unknown): void {
    error = isAppError(e) ? `${e.kind}: ${e.message}` : String(e);
  }

  /** The pack to open: the one the settings name if it is installed; else, for settings from
   * before packs were chosen, the one with a saved flight; else the first installed. */
  async function choosePack(installed: InstalledPack[], s: Settings): Promise<string> {
    const ids = installed.map((p) => p.summary.id);
    if (wanted && ids.includes(wanted)) return wanted;
    if (s.currentPack && ids.includes(s.currentPack)) return s.currentPack;
    if (ids.length < 2) return ids[0] ?? "";
    for (const id of ids) if ((await host.readSaved(id)).flight) return id;
    return ids[0] ?? "";
  }

  /** Settles once start() has opened the pack and its flight (or failed): a change to the open
   * pack's saved flight waits for it, so the flight being loaded can't be saved over the change. */
  let started: () => void = () => {};
  const booted = new Promise<void>((done) => (started = done));

  async function start(): Promise<void> {
    try {
      info = await host.appInfo();
      const usable = <T,>(what: Kept, item: SavedItem<T>): T | null => {
        if (!item) return null;
        if (item.loaded.state === "ready") return item.loaded.value;
        kept = [...kept, { what, state: item.loaded.state, text: item.text }];
        return null;
      };
      // Settings belong to no pack: read first, so the first launch has the pilot's theme too.
      const savedSettings = await host.readSettings();
      settings = usable("settings", savedSettings) ?? (await host.defaultSettings());
      installed = await host.installedPacks();
      if (installed.length === 0) {
        // The app ships with no aircraft (decision 0028): the first launch is the Packs page.
        firstLaunch = true;
        await loadPacks();
        return;
      }
      const id = await choosePack(installed, settings);
      packId = id;
      const pack = await host.loadPack(id);
      index = indexPack(pack);
      findIndex = buildFind(pack, index);
      useFlightPack(pack);
      flatPack = pack;
      lists = new Map(pack.lists.map((l) => [l.id, l]));
      intros = new Map((pack.content.phases?.phases ?? []).map((p) => [p.id, p.intro ?? []]));
      // What is saved on this device, if anything; what cannot be used is kept, never dropped.
      const saved = await host.readSaved(id);
      // A flight saved with no settings: settings are saved only once changed, so this pilot has been
      // here before. Saved settings say for themselves.
      hadFlight = !!saved.flight && !savedSettings;
      const savedFlight = usable("flight", saved.flight);
      // A flight saved with another version of the pack is brought in line with this one, its
      // ticks kept through the pack's aliases (decision 0028), and saved so.
      const opened = savedFlight && savedFlight.pack === id ? await host.reconcile(id, savedFlight) : null;
      const reconciled = !!opened && !!savedFlight && opened.packVersion !== savedFlight.packVersion;
      flight = opened ?? (await host.newFlight(id));
      plan = usable("plan", await host.readPlan(id));
      // Noted, not saved: settings are saved once the pilot changes something (installing or
      // switching a pack saves it), so the next save carries it.
      if (settings.currentPack !== id) settings = { ...settings, currentPack: id };
      await openLog();
      await refresh();
      if (reconciled) void persist("flight");
      void loadPacks();
    } catch (e) {
      fail(e);
    } finally {
      started();
    }
  }

  // Packs (decision 0028): what the Packs page and the menu's pack switcher show.
  let installed = $state<InstalledPack[]>([]);
  /** No pack on this device: the Packs page is the whole app until one is installed. */
  let firstLaunch = $state(false);
  let catalog = $state<CatalogEntry[]>([]);
  let catalogProblem = $state<string | null>(null);
  /** Each installed pack's saved flight, by id (the open pack's comes from its rail). */
  let savedLines = $state<Record<string, ReturnType<typeof savedLine>>>({});
  let packsNotice = $state<PacksNotice | null>(null);
  let packsBusy = $state<string | null>(null);

  /** Reads the installed packs, their saved flights and the catalog. */
  async function loadPacks(): Promise<void> {
    installed = await host.installedPacks();
    const lines: Record<string, ReturnType<typeof savedLine>> = {};
    for (const p of installed) {
      const id = p.summary.id;
      if (id === packId) continue;
      try {
        const saved = (await host.readSaved(id)).flight;
        if (saved?.loaded.state !== "ready" || !settings) continue;
        await host.loadPack(id);
        lines[id] = savedLine(await host.rail(id, saved.loaded.value, settings));
      } catch {
        // A pack this version can't open, or a flight it can't read: no line, nothing lost.
      }
    }
    savedLines = lines;
    try {
      catalog = await host.catalog();
      catalogProblem = null;
    } catch {
      catalog = [];
      catalogProblem = firstLaunch
        ? "Involo needs a connection once, to download a pack. Connect, then try again."
        : "The Involo catalog can’t be reached right now, so more packs and updates aren’t shown.";
    }
  }

  /** The open pack's saved flight, from the live rail. */
  let openLine = $derived(rail ? savedLine(rail) : null);
  let packRows = $derived<PackRow[]>(
    [...installed]
      .sort((a, b) => Number(b.summary.id === packId) - Number(a.summary.id === packId))
      .map((pack) => ({
        pack,
        saved: pack.summary.id === packId ? openLine : (savedLines[pack.summary.id] ?? null),
        update: updateFor(pack, catalog),
      })),
  );
  let switchPacks = $derived<SwitchPack[]>(
    packRows.map((r) => ({
      id: r.pack.summary.id,
      name: r.pack.summary.name,
      line: r.saved ? `${r.saved.where}, ${r.saved.done} of ${r.saved.total}` : r.pack.source === "file" ? "" : "No saved flight",
      fromFile: r.pack.source === "file",
    })),
  );

  /** Opens another pack: it becomes the current pack, and the app starts again on it. The open
   * pack's flight is saved first; each pack keeps its own (decision 0028). */
  async function switchPack(id: string | null): Promise<void> {
    if (flight && packId) await persist("flight");
    if (settings) {
      settings = { ...settings, currentPack: id };
      if (packId) await persist("settings");
      else await host.save("", "settings", settings);
    }
    onRestart(id);
  }

  /** What an install said, as the Packs page shows it; true when the pack is installed. */
  function accepted(name: string, result: PackInstall): boolean {
    if (result.state === "installed") return true;
    packsNotice =
      result.state === "refused"
        ? { title: `${name} wasn’t added.`, lines: result.reasons }
        : { title: `${name} passed its checks, but this device didn’t keep it.`, lines: ["Storage is blocked or full here, so the pack can’t be installed."] };
    return false;
  }

  async function installing(key: string, name: string, run: () => Promise<PackInstall>, open: (id: string) => boolean): Promise<void> {
    packsBusy = key;
    packsNotice = null;
    try {
      const result = await run();
      if (accepted(name, result) && result.state === "installed") {
        // Another version of an installed pack (a pack file, say): what changed becomes its
        // flight's update note, as after Update.
        if (result.changes) await noteUpdate(result.pack.summary.id, result.changes);
        if (open(result.pack.summary.id)) {
          await switchPack(result.pack.summary.id);
          return;
        }
        await loadPacks();
      }
    } catch (e) {
      packsNotice = { title: `${name} couldn’t be downloaded.`, lines: [e instanceof Error ? e.message : String(e)] };
    } finally {
      packsBusy = null;
    }
  }

  /** What's new in an update (decision 0028): its changes, while the Packs page shows them. */
  let whatsNew = $state<{ entry: CatalogEntry; changes: PackChanges } | null>(null);

  async function showWhatsNew(entry: CatalogEntry): Promise<void> {
    packsBusy = entry.id;
    packsNotice = null;
    try {
      whatsNew = { entry, changes: await host.packChanges(entry) };
    } catch (e) {
      packsNotice = { title: `What’s new in ${entry.name} couldn’t be shown.`, lines: [e instanceof Error ? e.message : String(e)] };
    } finally {
      packsBusy = null;
    }
  }

  /** Keeps what changed as the note in the pack's saved flight, for after the update. */
  async function noteUpdate(id: string, changes: PackChanges): Promise<void> {
    const action: Action = { type: "noteUpdate", changes };
    await booted;
    if (id === packId && flight) {
      flight = await host.apply(packId, flight, action);
      await persist("flight");
      return;
    }
    const saved = (await host.readSaved(id)).flight;
    if (saved?.loaded.state !== "ready") return;
    await host.loadPack(id);
    await host.save(id, "flight", await host.apply(id, saved.loaded.value, action));
  }

  /** Updates a pack from the catalog. What changed is worked out first, while both versions are
   * here, and kept with its saved flight; the open pack then opens again on the new version. */
  async function updatePack(entry: CatalogEntry): Promise<void> {
    packsBusy = entry.id;
    packsNotice = null;
    try {
      const changes =
        whatsNew?.entry.id === entry.id && whatsNew.entry.version === entry.version
          ? whatsNew.changes
          : await host.packChanges(entry).catch(() => null);
      const result = await host.installCatalogPack(entry);
      if (!accepted(entry.name, result) || result.state !== "installed") return;
      whatsNew = null;
      const kept = result.changes ?? changes;
      if (kept) await noteUpdate(entry.id, kept);
      if (entry.id === packId) {
        await switchPack(entry.id);
        return;
      }
      await loadPacks();
    } catch (e) {
      packsNotice = { title: `${entry.name} couldn’t be updated.`, lines: [e instanceof Error ? e.message : String(e)] };
    } finally {
      packsBusy = null;
    }
  }

  const packsHandlers = {
    onUse: (id: string) => void switchPack(id),
    // Installing a pack opens it (decision 0028).
    onDownload: (entry: CatalogEntry) =>
      void installing(entry.id, entry.name, () => host.installCatalogPack(entry), () => true),
    onUpdate: (entry: CatalogEntry) => void updatePack(entry),
    onWhatsNew: (entry: CatalogEntry) => void showWhatsNew(entry),
    onCloseWhatsNew: () => (whatsNew = null),
    onFile: (file: File) => void installing("file", "That file", () => host.installPackFile(file), () => true),
    onRemove: (id: string, alsoFlight: boolean) => void removePack(id, alsoFlight),
    onRetry: () => void loadPacks(),
  };

  async function removePack(id: string, alsoFlight: boolean): Promise<void> {
    const name = installed.find((p) => p.summary.id === id)?.summary.name ?? id;
    packsBusy = id;
    packsNotice = null;
    try {
      if (!(await host.removePack(id))) {
        packsNotice = { title: `${name} couldn’t be removed.`, lines: ["This device refused the change. Nothing was removed."] };
        return;
      }
      if (alsoFlight && !(await host.removeSaved(id)))
        packsNotice = { title: `${name} was removed, but its saved flight stays.`, lines: ["This device refused the change."] };
      if (id === packId) {
        // The open pack went: open another, or start again with none.
        const next = installed.find((p) => p.summary.id !== id)?.summary.id ?? null;
        await switchPack(next);
        return;
      }
      await loadPacks();
    } finally {
      packsBusy = null;
    }
  }

  start();

  $effect(() => {
    if (!settings) return;
    const { theme, dimming } = settings;
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && (query?.matches ?? true));
      applyPalette(document.documentElement, dark, dimming);
    };
    apply();
    host.themeChanged?.(theme);
    query?.addEventListener("change", apply);
    return () => query?.removeEventListener("change", apply);
  });

  // The desktop scale and the Text and controls size (decision 0021).
  $effect(() => applyScale(document.documentElement, Number(settings?.textSize ?? "100")));

  let screen = $derived(route.value.screen);
  /** The phase on screen: a rail phase, or the open reference tab. */
  let phaseId = $derived.by(() => {
    const r = route.value;
    if (r.screen === "phase") return r.id;
    // The reference area opens on its first tab, by group (decision 0029).
    if (r.screen === "reference") return r.id ?? (index && rail ? referenceTabs(index.labels, rail.reference)[0]?.id : null) ?? null;
    if (r.screen === "start") return rail?.stages[0]?.phases[0]?.id ?? null;
    return null;
  });

  // A new screen starts on its current step.
  $effect(() => {
    void phaseId;
    selected = null;
    cursor = null;
  });

  $effect(() => {
    const f = flight;
    const id = phaseId;
    if (!f || !id || !packId) {
      view = null;
      return;
    }
    let stale = false;
    const s = settings;
    if (!s) return;
    if (s.essentials && index?.hasEssentials) {
      safely(
        host.phaseModel(packId, f, { ...s, essentials: false }, id),
        (v) => {
          if (!stale) fullView = v;
        },
        (e) => {
          if (!stale && !(isAppError(e) && e.kind === "InvalidAction")) fail(e);
        },
      );
    } else {
      fullView = null;
    }
    safely(
      host.phaseModel(packId, f, s, id),
      (v) => {
        if (!stale) view = v;
      },
      (e) => {
        if (stale) return;
        view = null;
        if (!(isAppError(e) && e.kind === "InvalidAction")) fail(e);
      },
    );
    return () => {
      stale = true;
    };
  });

  let listView = $derived<StepLayout>(settings?.listView ?? "checklist");
  let detail = $derived(settings?.detail ?? "expanded");
  let flow = $derived(screen !== "reference" && listView === "flow");
  let total = $derived<Progress>(
    (rail?.stages ?? [])
      .flatMap((s) => s.phases)
      .map((p) => p.progress)
      .reduce((a, b) => ({ done: a.done + b.done, skipped: a.skipped + b.skipped, toDo: a.toDo + b.toDo, total: a.total + b.total }), {
        done: 0,
        skipped: 0,
        toDo: 0,
        total: 0,
      }),
  );
  let stage = $derived(view?.stage ?? null);
  let stagePhases = $derived(
    screen === "phase" || screen === "start"
      ? (rail?.stages.find((s) => s.title === stage)?.phases ?? [])
      : [],
  );
  /** The phase on screen in the rail (the stage button, the picker and phone's progress row). */
  let railPhase = $derived(stagePhases.find((p) => p.id === phaseId) ?? null);
  let pickerOpen = $state(false);
  /** Below 900 px there is no side pane: the step opens in place (tablet portrait and phone). */
  let narrow = $state(false);
  $effect(() => {
    const query = window.matchMedia?.("(max-width: 899px)");
    if (!query) return;
    narrow = query.matches;
    const change = () => (narrow = query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  });
  let current = $derived(view?.lists.find((l) => l.current)?.current ?? null);
  /** Essentials only: chosen, and the pack marks quick steps; a pack with none shows in Full and
   * offers no Essentials (Rust reads the setting the same way). */
  let essentials = $derived(!!settings?.essentials && !!index?.hasEssentials);
  /** The step the context panel shows, its row, and the steps after it. */
  let pane = $derived.by(() => {
    if (!index || !view || screen === "settings" || screen === "flight" || screen === "open" || screen === "glossary" || screen === "deck" || screen === "messages" || screen === "practice" || screen === "how" || screen === "log" || screen === "references") return null;
    const id = flow ? (cursor ?? current) : (selected ?? (screen === "reference" ? null : current));
    const rows = view.lists.flatMap((l) => l.steps);
    const at = rows.findIndex((r) => r.id === id);
    const row = rows[at];
    const step = id ? index.step(id) : undefined;
    if (!row || !step) return null;
    const upcoming = rows
      .slice(at + 1, at + 9)
      .map((r) => ({ step: index?.step(r.id), state: r.state }))
      .filter((u): u is { step: NonNullable<typeof u.step>; state: typeof u.state } => !!u.step);
    const list = view.lists.find((l) => l.steps.some((r) => r.id === row.id));
    const previous = at > 0 ? index.step(rows[at - 1]?.id ?? "") : undefined;
    return { step, row, upcoming, total: list?.steps.length ?? rows.length, previous };
  });

  /**
   * "Where is this?" from the right seat (decision 0029): Rust picks the frame for the step on
   * screen from its role and the pilot's seat, asked again when either changes. An answer for a
   * step no longer on screen is dropped.
   */
  let seatFrame = $state<ViewFrame | null>(null);
  setSeatView({
    get frame() {
      return seatFrame;
    },
  });
  $effect(() => {
    const id = packId;
    const role = pane?.step.role ?? null;
    const chosen = settings?.seat ?? null;
    if (!id) return;
    let live = true;
    safely(
      host.seatFrame(id, role, chosen),
      (frame) => {
        if (live) seatFrame = frame;
      },
      () => {
        if (live) seatFrame = null;
      },
    );
    return () => {
      live = false;
    };
  });

  /**
   * The slide-out (round 6): open beside the side pane, over the step list, below the flight
   * strip. It closes on the scrim, its X or Esc; P toggles the panel and W opens Where it is.
   * Focus moves into it when it opens and back to what opened it when it closes.
   */
  /** Open steps as the boards count them: skipped ones, and ones left on a phase other than this
   * one; the current phase's own to-do steps are not "open". */
  let openShown = $derived(open.filter((o) => o.skipped || o.phase !== phaseId));
  let slide = $state<Opening | null>(null);
  let opener: HTMLElement | null = null;
  function openSlide(how: Opening): void {
    opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    slide = how;
  }
  function closeSlide(): void {
    slide = null;
    opener?.focus();
    opener = null;
  }
  function slideKeys(e: KeyboardEvent): void {
    const t = e.target instanceof Element ? e.target : null;
    // Ctrl K (⌘K) opens Find from any page (Find boards).
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      openFind();
      return;
    }
    if (findOpen) return;
    if (t?.closest("input, textarea, select, [contenteditable]") || e.ctrlKey || e.metaKey || e.altKey) return;
    // Not under the menu, the stage picker or the open-steps list.
    if (menuOpen || pickerOpen || openSteps.shown) return;
    if (e.key === "Escape" && slide) {
      e.preventDefault();
      closeSlide();
    } else if ((e.key === "p" || e.key === "P") && pane) {
      e.preventDefault();
      if (slide) closeSlide();
      else openSlide({ entry: "panel" });
    } else if ((e.key === "w" || e.key === "W") && pane) {
      e.preventDefault();
      openSlide({ entry: "where" });
    }
  }
  /** Goes to a step from the control card's Used in: its phase, that step chosen. */
  function goToStep(id: string): void {
    const phase = index?.phaseOf(id);
    slide = null;
    if (!phase) return;
    location.hash = phaseHref(phase);
    selected = id;
  }
  // A different step closes the slide-out.
  let slideStep: string | undefined;
  $effect(() => {
    const id = pane?.step.id;
    if (id !== slideStep) {
      slideStep = id;
      slide = null;
    }
  });
  $effect(() => {
    const id = pane?.step.id;
    const p = pendingSlide;
    if (!p || !view) return;
    if (id === p.step) {
      slide = p.opening;
      pendingSlide = null;
    } else if (view.id === p.phase) pendingSlide = null;
  });

  /** The rail and open steps for the flight and settings. */
  async function refresh(): Promise<void> {
    if (!flight || !settings) return;
    rail = await host.rail(packId, flight, settings);
    open = await host.openSteps(packId, flight, settings);
  }

  /**
   * Saves on this device, unless saved data the app cannot use is waiting for the pilot. A save is
   * never written over another window's: when one saved since, what it saved is loaded, and
   * `redo` (the change just made) is applied to it and saved.
   */
  async function persist<W extends "flight" | "settings">(
    what: W,
    redo?: (saved: W extends "flight" ? Flight : Settings) => Promise<W extends "flight" ? Flight : Settings>,
  ): Promise<void> {
    const value = what === "flight" ? flight : settings;
    if (!value || kept.some((k) => k.what === what)) return;
    const result = await host.save(packId, what, value);
    if (result === "changed") {
      await reloadSaved();
      const now = what === "flight" ? flight : settings;
      if (!redo || !now || kept.some((k) => k.what === what)) return;
      try {
        const next = await redo($state.snapshot(now) as W extends "flight" ? Flight : Settings);
        if (what === "flight") flight = next as Flight;
        else settings = next as Settings;
        await refresh();
      } catch {
        // The change no longer applies to what the other window saved: theirs stands.
        return;
      }
      return persist(what);
    }
    saveFailed = result === null;
    if (result !== null) savedAt = result;
  }

  /**
   * Loads progress and settings as saved now, after another window saved them (its ticks are
   * kept, and nothing is saved over them). Saved data this version can't use is kept and reported.
   */
  async function reloadSaved(): Promise<void> {
    if (!packId) return;
    const saved = await host.readSaved(packId);
    let changed = false;
    const adopt = <T,>(what: "flight" | "settings", item: SavedItem<T>, current: T | null): T | null => {
      if (!item) return null;
      if (item.loaded.state !== "ready") {
        kept = [...kept.filter((k) => k.what !== what), { what, state: item.loaded.state, text: item.text }];
        return null;
      }
      kept = kept.filter((k) => k.what !== what);
      const value = item.loaded.value;
      if (JSON.stringify(value) === JSON.stringify($state.snapshot(current))) return null;
      changed = true;
      return value;
    };
    const s = adopt("settings", saved.settings, settings);
    if (s) settings = s;
    const f = adopt("flight", saved.flight, flight);
    if (f && f.pack === packId) {
      flight = f;
      // An Undo from before the other window's change would take its ticks back.
      undo = null;
    }
    if (changed) await refresh();
  }

  // Another window (the installed app beside a tab) saved: show what it saved.
  $effect(() => {
    const onStorage = () => void reloadSaved().catch(fail);
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  });

  async function act(action: Action): Promise<void> {
    if (!flight) return;
    try {
      flight = await host.apply(packId, flight, action);
      await refresh();
      await persist("flight", (saved) => host.apply(packId, saved, action));
    } catch (e) {
      fail(e);
    }
  }

  /** A change the pilot can take back for a short while: the flight before it, and what it did. */
  let undo = $state<{ text: string; before: Flight; restore?: (() => void) | undefined } | null>(null);
  function offerUndo(text: string, before: Flight, restore?: () => void): void {
    undo = { text, before, restore };
  }
  async function takeBack(): Promise<void> {
    if (!undo) return;
    flight = undo.before;
    undo.restore?.();
    undo = null;
    try {
      await refresh();
      await persist("flight");
    } catch (e) {
      fail(e);
    }
  }
  async function clearFlight(): Promise<void> {
    if (!flight) return;
    const before = flight;
    await act({ type: "clear" });
    offerUndo("Flight plan reset.", before);
  }
  /**
   * The flight log (decision 0026), on this device only. A saved log this version can't use (newer
   * or unreadable, or a read that failed) is kept as it is: the page says so, Export JSON saves its
   * text as it was, and nothing saves over it.
   */
  async function openLog(): Promise<void> {
    const saved = await host.readLog();
    if (saved?.loaded.state === "ready") {
      log = saved.loaded.value;
      return;
    }
    if (saved?.loaded.state === "newer") logBlocked = "The log saved on this device is from a newer version of Involo. It’s kept as it is; update the app to see it and add to it. Export JSON saves a copy of it.";
    else if (saved) logBlocked = "The log saved on this device couldn’t be read. It’s kept as it is, and nothing is saved over it. Export JSON saves a copy of it.";
    logKept = saved?.text || null;
    log = await host.newLog();
  }
  /** The saved text of a log this version can't use, for Export JSON. */
  let logKept = $state<string | null>(null);
  /** Why the last change to the log wasn't saved, for the page. */
  let logProblem = $state<string | null>(null);
  const NOT_SAVED = "The log couldn’t be saved on this device, so nothing changed. Check that this browser allows saving site data, then try again.";
  /**
   * Changes the log and saves it; with `keep`, a flight was just logged. The change starts from the
   * log as saved now, so another tab's entries are kept (each change is saved at once, so the saved
   * log holds this tab's too). Resolves with the change, or null when it wasn't saved: then the log
   * stays as it was and the page says why.
   */
  async function changeLog(edit: Parameters<typeof host.editLog>[1], keep = false) {
    if (!log || logBlocked) return null;
    const saved = await host.readLog();
    if (saved && saved.loaded.state !== "ready") {
      await openLog();
      return null;
    }
    const base = saved?.loaded.state === "ready" ? saved.loaded.value : log;
    const change = await host.editLog(base, edit);
    if (!(await host.saveLog(change.log, keep))) {
      logProblem = NOT_SAVED;
      return null;
    }
    logProblem = null;
    log = change.log;
    return change;
  }
  /** Where the flight's plan came from: SimBrief when the kept plan filled any of its values. */
  let planSource = $derived.by((): PlanSource => {
    const values = (flight?.values ?? {}) as Partial<Record<FieldId, string>>;
    return plan && Object.entries(planFills).some(([f, v]) => v && values[f as FieldId] === v) ? "simbrief" : "manual";
  });
  /** This flight as it would be logged now, for the log page; null before anything is ticked. */
  let currentEntry = $state<LoggedFlight | null>(null);
  $effect(() => {
    const f = flight;
    const s = settings;
    const p = planSource;
    if (screen !== "log" || !f || !s || !packId) return;
    let stale = false;
    safely(
      host.logEntry(packId, f, s, p, Date.now()),
      (e) => {
        if (!stale) currentEntry = e.ticks.length || e.skipped.length ? e : null;
      },
      fail,
    );
    return () => {
      stale = true;
    };
  });
  /** Log flight and start new: the flight goes in the log, then a new flight starts as Reset flight
   * plan starts one (without its Undo: the flight is in the log). If the log couldn't be saved, the
   * flight stays as it is. */
  async function logFlight(): Promise<void> {
    if (!flight || !settings || logBlocked) return;
    try {
      const entry = await host.logEntry(packId, flight, settings, planSource, Date.now());
      if (!(await changeLog({ type: "addFlight", flight: entry }, true))) return;
      offer = false;
      undo = null;
      await act({ type: "clear" });
      currentEntry = null;
    } catch (e) {
      fail(e);
    }
  }
  /** Whether this flight's last phase is done (the last Post-flight phase). */
  let finished = $derived(!![...(rail?.stages ?? [])].reverse().find((s) => s.phases.length)?.phases.at(-1)?.complete);
  /**
   * "Flight complete. Log it and start new?": offered in place when a tick finishes the flight, once
   * per flight this visit. Loading a finished flight, Undo or a change of steps shown never offers it.
   */
  let offer = $state(false);
  let offered = false;
  async function tickAndOffer(action: Action): Promise<void> {
    const before = finished;
    await act(action);
    if (action.type === "tick" && !before && finished && !offered && !logBlocked) {
      offered = true;
      offer = true;
    }
  }
  $effect(() => {
    // A new flight (nothing ticked) can be offered again when it finishes.
    if (flight && Object.keys(flight.session.done).length === 0) offered = false;
    if (!finished) offer = false;
  });
  /** A logged step's name as the app shows it: as the pack names it now, or, for a step no
   * longer in the pack, the name saved when it was logged. */
  const logName = (name: string, id: string) => {
    const st = index?.step(id);
    return index && st ? stepTitle(index, st) : name;
  };
  const stamp = () => fileDate(Date.now());
  /** The Flight log's pack filter (decision 0028): a pack's id, or null for every pack. It lasts
   * for this visit, so opening a flight and coming back keeps it. */
  let logPack = $state<string | null>(null);
  /** Installed packs' names, by id, for log entries that didn't record theirs. */
  let installedNames = $derived(Object.fromEntries(installed.map((p) => [p.summary.id, p.summary.name])));
  /** The packs the log holds, for its chips; a chosen pack no longer in it shows every pack. */
  let loggedPacks = $derived(log ? logPacks(log, installedNames) : []);
  let shownPack = $derived(loggedPacks.some((p) => p.id === logPack) ? logPack : null);
  /** What the exports hold: the log, or only the chosen pack's flights and practice results. */
  let exported = $derived(log ? logOf(log, shownPack) : null);
  function saveLogCopy(): void {
    const only = loggedPacks.find((p) => p.id === shownPack)?.name ?? null;
    if (exported) download(`involo-log-${stamp()}.html`, htmlCopy(exported, Date.now(), logName, installedNames, only), "text/html");
  }
  async function exportCsv(): Promise<void> {
    if (exported) download(`involo-log-${stamp()}.csv`, await host.logCsv(exported), "text/csv");
  }
  function exportJson(): void {
    if (logBlocked && logKept !== null) download(`involo-log-kept-${stamp()}.json`, logKept, "application/json");
    else if (exported && !logBlocked) download(`involo-log-${stamp()}.json`, `${JSON.stringify(exported, null, 2)}\n`, "application/json");
  }
  async function importLog(text: string): Promise<string> {
    try {
      const c = await changeLog({ type: "merge", text });
      if (!c) return logProblem ?? logBlocked ?? "";
      const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
      const added = [c.addedFlights ? n(c.addedFlights, "flight", "flights") : "", c.addedPractice ? n(c.addedPractice, "practice result", "practice results") : ""].filter(Boolean);
      const parts = [added.length ? `Added ${added.join(" and ")}.` : "Nothing new to add."];
      if (c.already) parts.push(`${n(c.already, "entry was", "entries were")} already in the log.`);
      if (c.refused) parts.push(`${n(c.refused, "entry was", "entries were")} left out because ${c.refused === 1 ? "it" : "they"} couldn’t be real.`);
      if (c.droppedFlights + c.droppedPractice) parts.push(`The oldest ${n(c.droppedFlights + c.droppedPractice, "entry", "entries")} made way, to keep the newest 500.`);
      return parts.join(" ");
    } catch (e) {
      return isAppError(e) ? e.message : String(e);
    }
  }
  // Back up and restore (#47). A backup holds every pack's saved flight and plan, the settings
  // and the flight log; a restore says what it will change before it changes anything.

  /** The saved plan a backup takes for a pack: ready only; a plan this version can't read stays
   * on the device as it is. */
  const readyPlan = (item: SavedItem<SavedPlan>) => (item?.loaded.state === "ready" ? item.loaded.value : null);

  /** Save a backup file: written at once, then Last backup is this moment. */
  async function saveBackup(): Promise<void> {
    if (!settings) return;
    try {
      const now = Date.now();
      // Every pack with a flight saved here: the installed packs', and any kept for a pack not
      // added (a restore keeps those, and so does removing a pack).
      const ids = [...new Set([...installed.map((p) => p.summary.id), ...(await host.savedPacks())])];
      const flights: BackupFlight[] = [];
      for (const id of ids) {
        const saved = (await host.readSaved(id)).flight;
        if (saved?.loaded.state !== "ready") continue;
        const f = id === packId && flight ? flight : saved.loaded.value;
        if (f.pack !== id) continue;
        const pack = installed.find((p) => p.summary.id === id);
        const line = id === packId ? openLine : (savedLines[id] ?? null);
        flights.push({
          pack: id,
          name: pack?.summary.name ?? id,
          version: pack?.summary.version ?? f.packVersion,
          source: pack?.source ?? (catalog.some((c) => c.id === id) ? "catalog" : "file"),
          place: line ? { place: line.where, done: line.done, total: line.total } : null,
          flight: f,
          plan: id === packId ? plan : readyPlan(await host.readPlan(id)),
        });
      }
      const saved = await host.readLog();
      const kept = saved?.loaded.state === "ready" ? saved.loaded.value : logBlocked ? await host.newLog() : (log ?? (await host.newLog()));
      const text = await host.backupText({ savedAt: now, flights, settings: { ...settings, lastBackup: now }, log: kept });
      download(backupFileName(now), text, "application/json");
      await changeSettings({ ...settings, lastBackup: now });
    } catch (e) {
      fail(e);
    }
  }

  /** The restore's dialog: the review of a backup, or why a file can't be restored. */
  let restoring = $state<{ backup: Backup | null; shown: Review | Refused } | null>(null);
  /** The pack the review is downloading, by id. */
  let restoreDownload = $state<string | null>(null);

  /** What restoring each part of the backup would do on this device, for the review. */
  async function review(backup: Backup): Promise<Review> {
    const flights = [];
    for (const entry of backup.flights) {
      const pack = installed.find((p) => p.summary.id === entry.pack);
      const saved = pack ? (await host.readSaved(entry.pack)).flight : null;
      const line = entry.pack === packId ? openLine : (savedLines[entry.pack] ?? null);
      const here = !saved ? null : line ? { place: line.where, done: line.done, total: line.total } : true;
      flights.push(rowFor(entry, pack, here, catalog));
    }
    let logText: string | null = null;
    if (log && !logBlocked) {
      const saved = await host.readLog();
      const base = saved?.loaded.state === "ready" ? saved.loaded.value : log;
      try {
        const c = await host.editLog(base, { type: "merge", text: JSON.stringify(backup.log) });
        logText = logLine(c.addedFlights, c.addedPractice);
      } catch {
        logText = null;
      }
    }
    return { kind: "review", saved: savedByLine(backup.savedAt, backup.appVersion), flights, log: logText };
  }

  /** Restore from a file: the review, or the refusal. Nothing changes here. */
  async function startRestore(file: File): Promise<void> {
    try {
      const refuse = (line: string) => {
        restoring = { backup: null, shown: { kind: "refused", line } };
      };
      if (file.size > MAX_BACKUP_FILE_BYTES) return refuse(TOO_LARGE);
      const read = await host.readBackup(await file.text());
      if (read.state === "refused") return refuse(refusalLine(read.refusal));
      restoring = { backup: read.backup, shown: await review(read.backup) };
    } catch (e) {
      fail(e);
    }
  }

  /** Download in the review: installs the pack from the catalog as the Packs page does, and its
   * row then reads as installed. */
  async function restoreDownloadPack(entry: CatalogEntry): Promise<void> {
    if (!restoring?.backup) return;
    restoreDownload = entry.id;
    try {
      const result = await host.installCatalogPack(entry);
      if (result.state === "installed") await loadPacks();
      const backup = restoring?.backup;
      if (backup) restoring = { backup, shown: await review(backup) };
    } catch (e) {
      fail(e);
    } finally {
      restoreDownload = null;
    }
  }

  /** Restores the ticked parts. Each flight goes through the same reconcile as loading, so one
   * from another version of its pack is brought up to the installed version with a note; a
   * flight for a pack that isn't installed is kept as it is. Settings replace this device's,
   * keeping its Last backup and the pack it has open; the log merges as Load log file does. The
   * app then starts again on the open pack, from what is saved. */
  async function restore(chosen: Chosen): Promise<void> {
    const backup = restoring?.backup;
    restoring = null;
    if (!backup || !settings) return;
    try {
      for (const entry of backup.flights) {
        if (!chosen.flights.includes(entry.pack)) continue;
        const id = entry.pack;
        let f = entry.flight;
        if (installed.some((p) => p.summary.id === id)) {
          await host.loadPack(id);
          f = await host.restoreFlight(id, f);
        }
        // Saved text this version can't read is set aside, never written over.
        const saved = (await host.readSaved(id)).flight;
        if (saved && saved.loaded.state !== "ready" && !(await host.setAside(id, "flight"))) throw new Error(NOT_RESTORED);
        if (typeof (await host.save(id, "flight", f)) !== "number") throw new Error(NOT_RESTORED);
        if (entry.plan) await host.savePlan(id, entry.plan);
      }
      if (chosen.settings) {
        await host.readSettings();
        const next = { ...backup.settings, lastBackup: settings.lastBackup, currentPack: settings.currentPack };
        if (typeof (await host.save(packId, "settings", next)) !== "number") throw new Error(NOT_RESTORED);
      }
      if (chosen.log && !(await changeLog({ type: "merge", text: JSON.stringify(backup.log) }))) throw new Error(NOT_RESTORED);
      onRestart(packId || null);
    } catch (e) {
      fail(e);
    }
  }
  const NOT_RESTORED = "The backup couldn’t be fully restored on this device. Check that this browser allows saving site data, then try again.";

  /** Deletes a flight, or brings a deleted one back (Undo). */
  async function deleteLogged(id: string): Promise<boolean> {
    try {
      return !!(await changeLog({ type: "deleteFlight", id }));
    } catch (e) {
      fail(e);
      return false;
    }
  }
  async function restoreLogged(f: LoggedFlight): Promise<void> {
    try {
      const c = await changeLog({ type: "addFlight", flight: f });
      if (c?.droppedFlights) logProblem = "That flight was the oldest in a full log, so it couldn’t come back.";
    } catch (e) {
      fail(e);
    }
  }
  /** A finished practice test goes in the log (Practice results). */
  async function savePractice(r: { title: string; score: number; total: number; at: number }): Promise<void> {
    try {
      await changeLog({ type: "addPractice", result: await host.practiceResult(packId, r) });
    } catch (e) {
      fail(e);
    }
  }
  /** Adds a step to Essentials or takes it out (the row menu), as the pilot's own change. */
  function toggleEssentials(id: string, add: boolean): void {
    if (!settings) return;
    const mine = settings.essentialsChanges[packId] ?? { added: [], removed: [] };
    const added = new Set(mine.added);
    const removed = new Set(mine.removed);
    if (add) {
      if (removed.has(id)) removed.delete(id);
      else added.add(id);
    } else if (added.has(id)) added.delete(id);
    else removed.add(id);
    void changeSettings({ ...settings, essentialsChanges: { ...settings.essentialsChanges, [packId]: { added: [...added], removed: [...removed] } } });
  }
  /**
   * Decision steps (decision 0022): the answer sets the option for the flight and ticks the step;
   * Change reopens the choices on the row, in place, and a changed answer offers Undo. How each
   * answer was given is saved with the flight (decision 0027); an answered option with no record
   * reads as answered by the pilot.
   */
  let changing = $state<string | null>(null);
  /**
   * What each asked option's rule suggests (decision 0027), only from a SimBrief plan's own
   * figures: with no plan, or once the block fuel or its unit is no longer the plan's (typed over,
   * switched, or cleared by Reset flight plan), there is no suggestion and the pilot answers.
   */
  let suggestions = $state<Record<string, Suggestion | null>>({});
  /** The plan figures the current suggestions were worked out from. */
  let suggestedFrom = "";
  $effect(() => {
    const f = flight;
    const ix = index;
    const fills = planFills;
    const fuel = f?.values?.fuel;
    const unit = f?.values?.weight_unit ?? "LB";
    const fromPlan = !!plan && !!fuel && fuel === fills.fuel && unit === (fills.weight_unit ?? "LB");
    const key = fromPlan ? `${fuel} ${unit}` : "";
    if (key !== suggestedFrom) {
      suggestedFrom = key;
      // Never an old suggestion for new figures, even for a moment.
      suggestions = {};
    }
    if (!f || !ix || !fromPlan) return;
    const asked = ix.options.filter((o) => ix.decider(o.id));
    let live = true;
    safely(
      Promise.all(asked.map(async (o) => [o.id, await host.suggestion(packId, f, o.id)] as const)),
      (list) => {
        if (live && suggestedFrom === key) suggestions = Object.fromEntries(list);
      },
      // No suggestion: the pilot answers as with no plan.
      () => {},
    );
    return () => {
      live = false;
    };
  });
  /** "263 kg", and near the line, "263 kg. Close to the line: check the gauge". */
  const amountWords = (s: Suggestion) =>
    `${s.amount.toLocaleString("en-US")} ${s.unit}${s.near ? ". Close to the line: check the gauge" : ""}`;
  // Every view shows a step's value for the flight's answers (lib/answers.svelte.ts).
  $effect(() => {
    answered.options = { ...(flight?.options ?? {}) };
  });
  let decisions = $derived.by((): Decisions | undefined => {
    const ix = index;
    const f = flight;
    if (!ix || !f) return undefined;
    return {
      state(step) {
        const option = step.decide ? ix.options.find((o) => o.id === step.decide) : undefined;
        if (!option) return null;
        const answer = f.options[option.id] ?? null;
        const source: DecisionSource | null = answer === null ? null : (f.answers?.[option.id] ?? "you");
        const s = suggestions[option.id];
        const suggestion = s ? { value: s.value, amount: amountWords(s) } : null;
        return { option, answer, source, suggestion, changing: answer !== null && changing === step.id };
      },
      dependent(step) {
        const id = dependsOn(step);
        const option = id ? ix.options.find((o) => o.id === id) : undefined;
        const asker = id ? ix.decider(id) : undefined;
        if (!id || !option || !asker) return null;
        const answer = f.options[id] ?? null;
        // The step's value for the answer (decision 0027), once answered.
        const value = answer === null ? null : ((step.expectWhen ?? []).find((e) => e.option === id && e.equals === answer)?.expect ?? null);
        return { option, decisionStep: asker.id, answer, value };
      },
      answer: (id, value) => void answerDecision(id, value),
      change(id) {
        const step = ix.step(id);
        if (step?.decide && f.options[step.decide] !== undefined) {
          slide = null;
          changing = id;
        } else goToStep(id);
      },
      keep: () => (changing = null),
    };
  });
  async function answerDecision(id: string, value: string): Promise<void> {
    const step = index?.step(id);
    const option = index?.options.find((o) => o.id === step?.decide);
    if (!index || !flight || !step?.decide || !option) return;
    const ix = index;
    const before = flight;
    const wasChanging = changing === id;
    changing = null;
    const changed = wasChanging && before.options[option.id] !== undefined && before.options[option.id] !== value;
    // The same answer again (Change, then the same choice) records nothing new, but still ticks a
    // step whose tick was cleared.
    // Confirming the plan's suggestion (its value, while first asked) is answered from the plan.
    const fromPlan = !wasChanging && suggestions[option.id]?.value === value;
    if (!wasChanging || changed) await act({ type: "answer", option: option.id, value, by: changed ? "changed" : fromPlan ? "plan" : "you" });
    if (flight && flight.session.done[id] === undefined) await act({ type: "tick", step: id, at: Date.now() });
    if (changed) {
      const updated = [...new Set(ix.dependents(option.id).map((s) => stepTitle(ix, s)))];
      offerUndo(changedText(option, value, updated), before);
    }
  }
  /**
   * A SimBrief plan into the flight (decision 0019): the values it covers are replaced, the plan
   * is kept on this device, and the notice offers Undo. Resolves with a problem to show, or null.
   */
  async function usePlan(next: SavedPlan): Promise<string | null> {
    if (!flight) return null;
    // A plan for another aircraft type: the pilot chooses (decision 0028: warn, never refuse).
    // Cancel leaves the flight and the kept plan as they were.
    const other = await host.otherAircraft(packId, next);
    if (other && !(await askOtherAircraft(other))) return null;
    const before = flight;
    const keptPlan = plan;
    const filled = await host.planValues(packId, next);
    await act({ type: "setValues", values: filled.values });
    plan = next;
    if (!kept.some((k) => k.what === "plan")) await host.savePlan(packId, next);
    const check = filled.checkClearance ? " Check the runway and departure against your clearance." : "";
    // An answer already given that the new plan's figures would not suggest: say so (the pilot
    // decides; the answer stays).
    let differs = "";
    const now = flight;
    const ix = index;
    if (now && ix)
      for (const o of ix.options.filter((x) => ix.decider(x.id) && now.options[x.id] !== undefined)) {
        const s = await host.suggestion(packId, now, o.id);
        if (s && s.value !== now.options[o.id]) differs += ` ${o.title}: the new plan suggests ${lowerFirst(shortLabel(labelOf(o, s.value)))}; check your answer.`;
      }
    offerUndo(`Imported ${filled.origin} → ${filled.destination}: ${filled.filled} values.${check}${differs}`, before, () => {
      plan = keptPlan;
      if (!kept.some((k) => k.what === "plan")) void host.savePlan(packId, keptPlan);
    });
    return null;
  }
  /** The plan-for-another-aircraft warning while it is open, and how it answers. */
  let otherPlan = $state<{ other: OtherAircraft; answer: (use: boolean) => void } | null>(null);
  function askOtherAircraft(other: OtherAircraft): Promise<boolean> {
    const back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return new Promise((done) => {
      otherPlan = {
        other,
        answer: (use) => {
          otherPlan = null;
          done(use);
          // Focus goes back where it was once the import has finished (its button waits until then).
          setTimeout(() => back?.focus());
        },
      };
    });
  }
  async function importFor(user: string): Promise<string | null> {
    try {
      if (settings && settings.simbriefUser !== user) await changeSettings({ ...settings, simbriefUser: user });
      return await usePlan(await host.fetchPlan(user));
    } catch (e) {
      return fetchProblem(e);
    }
  }
  async function importFile(text: string): Promise<string | null> {
    try {
      return await usePlan(await host.readPlanFile(text));
    } catch (e) {
      return fileProblem(e);
    }
  }
  /** The strip's Import latest from SimBrief: with no username yet, SimBrief and OFP file asks for one. */
  async function importLatest(): Promise<void> {
    const user = settings?.simbriefUser;
    if (!user || (await importFor(user))) window.location.hash = flightHref("simbrief");
  }
  /** A panel state (decision 0012): its marks, with Undo. */
  async function choosePanelState(state: string | null): Promise<void> {
    if (!flight) return;
    const before = flight;
    await act({ type: "setPanelState", state, at: Date.now() });
    const title = state ? (index?.panelStates.find((s) => s.id === state)?.title ?? state) : null;
    const marked = (flight.stateTicks?.length ?? 0) + (flight.stateSkips?.length ?? 0);
    offerUndo(title ? `Panel state: ${title}. ${marked} steps marked.` : "Panel state cleared.", before);
  }
  $effect(() => {
    const p = plan;
    if (!p) {
      planFills = {};
      return;
    }
    safely(
      host.planValues(packId, p),
      (v) => (planFills = v.values),
      // A plan whose values can't be read fills nothing, rather than keeping another plan's.
      () => (planFills = {}),
    );
  });
  /** Where the strip's clearance came from: "Runway and SID from SimBrief, 10:02 · the rest typed". */
  let provenance = $derived.by(() => {
    if (!flight) return "";
    const labels: [FieldId, string][] = [
      ["runway", "Runway"],
      ["sid", "SID"],
      ["transition", "Transition"],
      ["initial_altitude", "Initial altitude"],
      ["squawk", "Squawk"],
    ];
    const values = (flight.values ?? {}) as Partial<Record<FieldId, string>>;
    const set = labels.filter(([f]) => values[f]);
    const fromPlan = set.filter(([f]) => plan && planFills[f] === values[f]).map(([, l]) => l);
    const typed = set.length - fromPlan.length;
    if (!fromPlan.length) return typed ? "Typed by you" : "";
    const list = fromPlan.length > 1 ? `${fromPlan.slice(0, -1).join(", ")} and ${fromPlan.at(-1)}` : (fromPlan[0] ?? "");
    const at = plan ? new Date(plan.loadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
    return `${list} from SimBrief, ${at}${typed ? " · the rest typed" : ""}`;
  });
  /** The phase the Flight pages' Checklist button goes back to. */
  let lastPhase = $state<string | null>(null);
  $effect(() => {
    const r = route.value;
    if (r.screen === "phase") lastPhase = r.id;
  });

  /** The menu's Clear ticks (tablet and phone): the ticked list holding the current step, else the
   * last ticked list on screen. */
  let clearList = $derived.by(() => {
    if (!view || (screen !== "phase" && screen !== "start")) return null;
    const ticked = view.lists.filter((l) => l.progress.done + l.progress.skipped > 0);
    return ticked.find((l) => l.current !== null) ?? ticked.at(-1) ?? null;
  });
  /** Clear ticks on one list (its card header), with Undo instead of asking first. */
  async function clearTicks(list: string): Promise<void> {
    if (!flight) return;
    const before = flight;
    await act({ type: "clearList", list });
    offerUndo("Ticks cleared.", before);
  }

  async function changeSettings(next: Settings): Promise<void> {
    const before = settings;
    settings = next;
    // What this change sets, to apply over settings another window saved meanwhile.
    const delta = Object.fromEntries(
      Object.entries(next).filter(([k, v]) => !before || JSON.stringify(v) !== JSON.stringify(before[k as keyof Settings])),
    ) as Partial<Settings>;
    try {
      await refresh();
      await persist("settings", async (saved) => ({ ...saved, ...delta }));
    } catch (e) {
      fail(e);
    }
  }

  /** Sets the kept data aside and saves anew; if it can't be set aside, it stays as it is. */
  async function startFresh(what: Kept): Promise<void> {
    if (!(await host.setAside(packId, what))) {
      kept = kept.map((k) => (k.what === what ? { ...k, stuck: true } : k));
      return;
    }
    kept = kept.filter((k) => k.what !== what);
    if (what === "plan") {
      if (plan) await host.savePlan(packId, plan);
    } else await persist(what);
  }

  const tick = (id: string, done: boolean) => tickAndOffer(done ? { type: "untick", step: id } : { type: "tick", step: id, at: Date.now() });
  const skip = (id: string) => {
    cursor = null;
    return act({ type: "skip", step: id, at: Date.now() });
  };
  const confirm = (id: string) => {
    cursor = null;
    return tickAndOffer({ type: "tick", step: id, at: Date.now() });
  };
  const changeView = (v: StepLayout) => {
    if (settings) void changeSettings({ ...settings, listView: v });
  };

  // The tour (Tour README). The welcome opens on the first visit, once the checklist has
  // loaded; answering it is remembered in Settings, the only thing the tour stores.
  let welcomeAsked = false;
  $effect(() => {
    if (welcomeAsked || !settings || !rail || !view || (screen !== "phase" && screen !== "start")) return;
    welcomeAsked = true;
    // Not a first visit: a flight saved before settings were (settings are only saved once changed),
    // or saved settings set aside, which can't take the answer until they are resolved.
    if (!settings.tourSeen && !hadFlight && !kept.some((k) => k.what === "settings")) {
      tour.dir = 1;
      tour.step = 1;
    }
  });
  /** Where focus goes back to when the tour ends: the menu button, after Take the tour. */
  let tourFrom: HTMLElement | null = null;
  function takeTour(): void {
    tourFrom = document.querySelector<HTMLElement>("header.top .menu");
    // From another page: the checklist where the pilot left it, as the pages' Checklist button (the
    // phase last open this visit), else the first phase with steps still to do. Nothing is reset.
    if (screen !== "phase" && screen !== "start") {
      const open = rail?.stages.flatMap((s) => s.phases).find((p) => p.progress.toDo > 0)?.id;
      const to = lastPhase ?? open;
      location.hash = to ? phaseHref(to) : "#/";
    }
    tour.dir = 1;
    tour.step = 2;
  }
  function tourSeen(): void {
    if (settings && !settings.tourSeen) void changeSettings({ ...settings, tourSeen: true });
  }
  function tourEnded(start: boolean): void {
    const from = tourFrom;
    tourFrom = null;
    // Back to the menu button after Take the tour; otherwise to the page, on the current step.
    // Once the tour has gone and the page is no longer inert.
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>("li.it.current .row");
      if (!start && from?.isConnected) from.focus();
      else (row ?? document.querySelector<HTMLElement>("main"))?.focus();
    });
  }
  // How procedures work (How README). Its "In Involo" links go to the pilot's current phase,
  // found as Take the tour finds it, and that phase's current step.
  let howPhase = $derived.by(() => {
    const phases = rail?.stages.flatMap((s) => s.phases) ?? [];
    const p = phases.find((x) => x.id === lastPhase) ?? phases.find((x) => x.progress.toDo > 0) ?? phases[0];
    return p ? { id: p.id, title: p.title } : null;
  });
  let howStep = $state<{ id: string; title: string } | null>(null);
  $effect(() => {
    const id = howPhase?.id;
    const f = flight;
    const s = settings;
    howStep = null;
    if (screen !== "how" || !id || !f || !s) return;
    let stale = false;
    safely(
      host.phaseModel(packId, f, s, id),
      (v) => {
        const c = v.lists.find((l) => l.current)?.current ?? null;
        const st = c ? index?.step(c) : undefined;
        const title = st && index ? stepTitle(index, st) : undefined;
        if (!stale) howStep = c && title ? { id: c, title } : null;
      },
      () => {
        if (!stale) howStep = null;
      },
    );
    return () => {
      stale = true;
    };
  });
  /** The values the How page names: the stages and their titles, the lists in each reference group
   * (read by group, never by order; decision 0029) and the reference area's title. */
  let howCounts = $derived(howCountsOf(flatPack, (rail?.stages ?? []).map((st) => st.title)));
  let tourStages = $derived<[string, string]>([rail?.stages[0]?.title ?? "", rail?.stages.at(-1)?.title ?? ""]);
</script>

<svelte:window onkeydown={slideKeys} onpopstate={() => findOpen && !history.state?.find && closeFind(true, true)} />
{#if tour.step !== null && rail}
  <Tour stages={tourStages} {findKey} onSeen={tourSeen} onEnd={tourEnded} />
{/if}
{#if findOpen && findIndex}
  <Find
    find={findIndex}
    {rail}
    done={flight?.session.done ?? {}}
    {current}
    phase={phaseId}
    {findKey}
    only={findScope}
    onStep={(id) => {
      closeFind(false);
      goToStep(id);
    }}
    onControl={findControl}
    onTerm={(term) => {
      closeFind(false);
      location.hash = glossaryHref(term);
    }}
    examples={index?.labels.findExamples ?? []}
    messages={index?.messages ?? []}
    onMessage={(id) => {
      closeFind(false);
      location.hash = messageHref(id);
    }}
    onClose={() => closeFind()}
  />
{/if}
{#if firstLaunch}
  <PacksPage rows={[]} more={catalog} current={null} {catalogProblem} notice={packsNotice} busy={packsBusy} backHref="#/" {...packsHandlers} />
{:else if route.value.screen === "packs" && packId}
  <div class="flightwrap">
    <PacksPage
      rows={packRows}
      more={morePacks(installed, catalog)}
      current={packId}
      {catalogProblem}
      notice={packsNotice}
      busy={packsBusy}
      {whatsNew}
      backHref={lastPhase ? phaseHref(lastPhase) : "#/"}
      {...packsHandlers}
    />
  </div>
{:else if route.value.screen === "glossary" && index}
  <div class="flightwrap">
    <GlossaryPage terms={glossary} term={route.value.term} {rail} referenceTitle={index?.labels.reference.title ?? ""} backHref={lastPhase ? phaseHref(lastPhase) : "#/"} onStep={goToStep} />
  </div>
{:else if route.value.screen === "practice" && index && flatPack}
  <div class="flightwrap">
    <PracticePage
      pack={flatPack}
      {index}
      options={flight?.options ?? {}}
      backHref={lastPhase ? phaseHref(lastPhase) : "#/"}
      onStep={goToStep}
      latest={log?.practice.find((r) => r.pack === packId) ?? null}
      onResult={(r) => void savePractice(r)}
    />
  </div>
{:else if route.value.screen === "log" && log}
  <div class="flightwrap">
    <LogPage
      {log}
      packs={loggedPacks}
      pack={shownPack}
      openPack={packId}
      onPack={(id) => (logPack = id)}
      current={currentEntry}
      entry={route.value.entry}
      name={logName}
      canGo={(id) => !!index?.step(id)}
      backHref={lastPhase ? phaseHref(lastPhase) : "#/"}
      blocked={logBlocked}
      onLog={logFlight}
      problem={logProblem}
      onDelete={deleteLogged}
      onRestore={restoreLogged}
      onImport={importLog}
      onSaveCopy={saveLogCopy}
      onCsv={() => void exportCsv()}
      onJson={exportJson}
      onStep={goToStep}
    />
  </div>
{:else if route.value.screen === "references" && references && flatPack}
  <div class="flightwrap">
    <ReferencesPage
      refs={references}
      pack={flatPack.manifest}
      version={info?.version ?? null}
      backHref={lastPhase ? phaseHref(lastPhase) : "#/"}
      licensesHref="third-party-licenses.txt"
      onList={goToStep}
      onSimulatorModel={() => references && openFind({ label: "Simulator model notes", steps: references.simulatorModel })}
    />
  </div>
{:else if route.value.screen === "how" && rail}
  <div class="flightwrap">
    <HowPage
      part={route.value.part}
      counts={howCounts}
      areas={flowAreas(flatPack)}
      phase={howPhase}
      step={howStep}
      backHref={lastPhase ? phaseHref(lastPhase) : "#/"}
      onStep={goToStep}
    />
  </div>
{:else if (route.value.screen === "deck" || route.value.screen === "messages") && index}
  {@const r = route.value}
  <div class="flightwrap">
    <FlightDeckPage
      {index}
      area={r.screen === "deck" ? r.area : null}
      zone={r.screen === "deck" ? r.zone : null}
      messages={r.screen === "messages"}
      message={r.screen === "messages" ? r.id : null}
      backHref={lastPhase ? phaseHref(lastPhase) : "#/"}
      onStep={goToStep}
    />
  </div>
{:else if route.value.screen === "flight" && settings && flight && index && rail}
  {@const r = route.value}
  {@const s = settings}
  <div class="flightwrap" data-app-ready="">
    <FlightPage
      section={r.section}
      focus={r.focus}
      {flight}
      settings={s}
      {plan}
      suggested={Object.fromEntries(Object.entries(suggestions).map(([id, s]) => [id, s ? `${s.amount.toLocaleString("en-US")} ${s.unit}` : null]))}
      options={index.options}
      states={index.panelStates}
      panelStateLabels={index.labels.panelStates}
      startPage={index.startPage}
      backHref={lastPhase ? phaseHref(lastPhase) : "#/"}
      onSet={(field, value) => act({ type: "setValue", field, value })}
      onNotes={(notes) => act({ type: "setNotes", notes })}
      onOption={(option, value) => act({ type: "setOption", option, value })}
      onPanelState={(state) => void choosePanelState(state)}
      onImport={importFor}
      onFile={importFile}
      onClear={clearFlight}
      onDescriptions={(on) => void changeSettings({ ...s, descriptions: on })}
    />
    {#if undo}
      {#key undo}
        <Toast text={undo.text} onUndo={() => void takeBack()} onExpire={() => (undo = null)} />
      {/key}
    {/if}
  </div>
{:else}
{#snippet updateNote()}
  {#if flight?.update}
    <UpdateNote
      note={flight.update}
      onStep={goToStep}
      stepHref={(id) => {
        const phase = index?.phaseOf(id);
        return phase ? phaseHref(phase) : null;
      }}
      onSeen={() => void act({ type: "seeUpdateNote" })}
      onDismiss={() => void act({ type: "dismissUpdateNote" })}
    />
  {/if}
{/snippet}
{#snippet inlinePane()}
  {#if pane && index}
    {#key pane.step.id}
      <StepPane
        {index}
        step={pane.step}
        targets={pane.row.targets}
        number={pane.row.number}
        total={pane.total}
        preview={settings?.panelPreview ?? true}
        onOpen={openSlide}
        inline
      />
    {/key}
  {/if}
{/snippet}
<div class="shell" data-app-ready={rail && (view || screen === "settings" || screen === "flight" || screen === "open") ? "" : undefined}>
  <TopBar
    aircraft={index?.name ?? ""}
    reference={index?.labels.reference.title ?? ""}
    {rail}
    {stage}
    view={settings && view && (screen === "phase" || screen === "start") ? listView : null}
    {menuOpen}
    open={openShown.map((o) => o.phase)}
    phase={railPhase?.title ?? null}
    {pickerOpen}
    onMenu={() => (menuOpen = !menuOpen)}
    onView={changeView}
    onPicker={() => (pickerOpen = !pickerOpen)}
    onFind={findIndex ? () => openFind() : undefined}
    {findKey}
  />
  {#if error}
    <p class="msg" role="alert">{error}</p>
  {:else if !rail || !settings || !flight || !index}
    <p class="msg">Loading…</p>
  {:else}
    <PhaseChips phases={stagePhases} current={phaseId} {detail} {essentials} {total} {savedAt} {saveFailed} open={openShown.map((o) => o.phase)} />
    <Drawer
      open={menuOpen}
      aircraft={index.name}
      packs={switchPacks}
      currentPack={packId}
      onSwitchPack={(id) => void switchPack(id)}
      {savedAt}
      {saveFailed}
      {total}
      view={view && (screen === "phase" || screen === "start") ? listView : null}
      {detail}
      {essentials}
      hasEssentials={index.hasEssentials}
      onView={changeView}
      onDetail={(d) => void changeSettings({ ...settings!, detail: d })}
      onEssentials={(on) => void changeSettings({ ...settings!, essentials: on })}
      onReset={() => void clearFlight()}
      clear={clearList ? { title: clearList.title, ticks: clearList.progress.done } : null}
      onClearTicks={() => clearList && void clearTicks(clearList.id)}
      onTour={takeTour}
      onClose={() => (menuOpen = false)}
    />
    {#if pickerOpen && rail}
      <StagePicker {rail} current={phaseId} open={openShown.map((o) => o.phase)} onClose={() => (pickerOpen = false)} />
    {/if}
    {#if view && screen !== "settings" && screen !== "open" && screen !== "reference"}
      <FlightStrip
        values={flight.values ?? {}}
        notes={flight.notes ?? ""}
        {provenance}
        onSet={(field, value) => act({ type: "setValue", field, value })}
        onNotes={(notes) => act({ type: "setNotes", notes })}
        onClear={clearFlight}
        onImport={() => void importLatest()}
      />
    {/if}
    {#if screen === "phase" || screen === "start"}
      <ProgressRow progress={railPhase?.progress ?? null} open={openShown.length} />
    {/if}
    <div class="app" class:strip={!!view && screen !== "settings" && screen !== "open" && screen !== "reference"} class:nopane={!pane} class:flow={flow && screen !== "settings"}>
      <main>
        <div class="inner">
          {#if kept.length || saveFailed}
            <div class="notices">
              {#each kept as k (k.what)}
                <KeptNotice what={k.what} state={k.state} text={k.text} stuck={k.stuck ?? false} onFresh={() => startFresh(k.what)} />
              {/each}
              {#if saveFailed}
                <SaveFailedNotice />
              {/if}
            </div>
          {/if}
          {#if screen === "settings"}
            <SettingsPage
              {settings}
              version={info?.version ?? null}
              seats={index?.seats ?? []}
              hasEssentials={index?.hasEssentials ?? true}
              onChange={(s) => void changeSettings(s)}
              onBackup={() => void saveBackup()}
              onRestore={(file) => void startRestore(file)}
            />
          {:else if screen === "open"}
            <OpenStepsPage
              {index}
              {open}
              onTick={(id) => act({ type: "tick", step: id, at: Date.now() })}
              onUnskip={(id) => act({ type: "unskip", step: id })}
            />
          {:else if screen === "reference"}
            <ReferencePage
              {index}
              phases={rail.reference}
              {view}
              intro={view ? (intros.get(view.id) ?? []) : []}
              {lists}
              {flight}
              {detail}
              {selected}
              onTick={tick}
              onSkip={skip}
              onUnskip={(id) => act({ type: "unskip", step: id })}
              onBlank={(step, index, value) => act({ type: "setBlank", step, index, value })}
              onSelect={(id) => (selected = id)}
              onClear={(list) => void clearTicks(list)}
              inline={narrow && pane ? inlinePane : undefined}
              inlineStep={narrow ? (pane?.step.id ?? null) : null}
            />
          {:else if view}
            {#if flow}
              <FlowView {index} {view} {cursor} {detail} onConfirm={confirm} onSkip={skip} onMove={(id) => (cursor = id)} onBlank={(step, index, value) => act({ type: "setBlank", step, index, value })} />
            {:else}
              <PhasePage
                {index}
                {view}
                {lists}
                {flight}
                {detail}
                {selected}
                onTick={tick}
                onSkip={skip}
                onUnskip={(id) => act({ type: "unskip", step: id })}
                onBlank={(step, index, value) => act({ type: "setBlank", step, index, value })}
                onSelect={(id) => (selected = id)}
                onClear={(list) => void clearTicks(list)}
                open={openShown}
                onGo={goToStep}
                onEssentials={index.hasEssentials ? toggleEssentials : undefined}
                full={!essentials}
                {fullView}
                onOption={(option, value) => act({ type: "setOption", option, value })}
                onValue={(field, value) => act({ type: "setValue", field, value })}
                {decisions}
                inline={narrow && pane ? inlinePane : undefined}
                inlineStep={narrow ? (pane?.step.id ?? null) : null}
                notice={flight.update ? updateNote : undefined}
              />
            {/if}
          {:else}
            <p class="msg">That phase is not in this flight.</p>
          {/if}
          {#if offer && (screen === "phase" || screen === "start")}
            <div class="offer" role="status">
              <span>{logProblem ?? "Flight complete. Log it and start new?"}</span>
              <div class="offer-btns">
                <button class="offer-go" type="button" onclick={() => void logFlight()}>Log flight and start new</button>
                <button class="offer-no" type="button" onclick={() => (offer = false)}>Not now</button>
              </div>
            </div>
          {/if}
          {#if undo}
            {#key undo}
              <Toast text={undo.text} onUndo={() => void takeBack()} onExpire={() => (undo = null)} />
            {/key}
          {/if}
          <p class="legal">
            Simulator training only. Not for real-world use. A study aid for flight simulation, not
            an approved checklist; follow your operator's or training provider's procedures.
          </p>
        </div>
      </main>
      <div class="page-fade up" class:on={pageMore.up} aria-hidden="true"></div>
      <div class="page-fade down" class:on={pageMore.down} aria-hidden="true"></div>
      {#if pane}
        {#if !narrow}
        <aside class="pane" class:more-up={paneMore.up} class:more-down={paneMore.down} aria-label="About the step" use:fades>
          {#key pane.step.id}
            <StepPane
              {index}
              step={pane.step}
              targets={pane.row.targets}
              number={pane.row.number}
              total={pane.total}
              upcoming={pane.upcoming}
              preview={settings?.panelPreview ?? true}
              onOpen={openSlide}
              {flow}
            />
          {/key}
        </aside>
        {/if}
        {#if slide}
          <button class="slide-scrim" type="button" aria-label="Close the panel" tabindex="-1" onclick={closeSlide}></button>
          <div class="slide-box">
            {#key pane.step.id}
              <Slideout {index} step={pane.step} number={pane.row.number} targets={pane.row.targets} opening={slide} onClose={closeSlide} onGo={goToStep} {decisions} />
            {/key}
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
{/if}

{#if otherPlan}
  {@const o = otherPlan}
  <OtherAircraftDialog
    other={o.other}
    fromFile={installed.find((p) => p.summary.id === packId)?.source === "file"}
    onUse={() => o.answer(true)}
    onCancel={() => o.answer(false)}
  />
{/if}

{#if restoring}
  {#key restoring.backup}
    <RestoreDialog
      shown={restoring.shown}
      downloading={restoreDownload}
      onClose={() => (restoring = null)}
      onRestore={(chosen) => void restore(chosen)}
      onDownload={(entry) => void restoreDownloadPack(entry)}
    />
  {/key}
{/if}

<style>
  /* The bars at the top that stay in place: header, phase track and, on a phase, the strip. */
  .app {
    --bars: calc(var(--bar-header) + var(--bar-phase));
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--side-pane);
    align-items: start;
  }
  .app.strip {
    --bars: calc(var(--bar-header) + var(--bar-phase) + var(--bar-strip));
  }
  .app.nopane {
    grid-template-columns: minmax(0, 1fr);
  }
  main {
    min-width: 0;
    padding: var(--space-6) var(--gutter) var(--space-10);
  }
  /* The content stops at 1040 before scaling; extra width becomes margin (decision 0021). */
  .inner {
    max-width: var(--size-content-max);
    margin: 0 auto;
  }
  /* The slide-out (round6/boards/Locator.dc.html): beside the side pane, over the step list, from
     below the bars at the top to the foot of the window; the scrim dims only the step list. */
  .slide-scrim {
    position: fixed;
    top: var(--bars);
    bottom: 0;
    left: 0;
    width: calc(100% - var(--side-pane));
    padding: 0;
    border: 0;
    background: var(--color-slideout-scrim);
    z-index: 15;
  }
  .slide-box {
    position: fixed;
    top: var(--bars);
    bottom: 0;
    right: var(--side-pane);
    width: var(--slideout);
    z-index: 16;
  }
  /* The Checklist board's side pane. */
  .pane {
    position: sticky;
    top: var(--bars);
    height: calc(100vh - var(--bars));
    padding: var(--space-4) var(--space-6);
    /* It scrolls, but draws no scrollbar, as the Checklist board's pane. */
    overflow-y: auto;
    scrollbar-width: none;
    border-left: var(--border-thin) solid var(--color-line);
    background: var(--color-surface-2);
  }
  .pane::-webkit-scrollbar {
    display: none;
  }
  .pane.more-up {
    mask-image: linear-gradient(180deg, transparent, black var(--space-10));
  }
  .pane.more-down {
    mask-image: linear-gradient(180deg, black calc(100% - var(--space-10)), transparent);
  }
  .pane.more-up.more-down {
    mask-image: linear-gradient(180deg, transparent, black var(--space-10), black calc(100% - var(--space-10)), transparent);
  }
  /* The page draws no scrollbar either (the boards draw none). */
  :global(html) {
    scrollbar-width: none;
  }
  :global(html::-webkit-scrollbar) {
    display: none;
  }
  /* Edge fades over the list where it scrolls on, above and below. */
  .page-fade {
    position: fixed;
    left: 0;
    width: calc(100% - var(--side-pane));
    height: var(--space-10);
    pointer-events: none;
    opacity: 0;
  }
  .app.nopane .page-fade {
    width: 100%;
  }
  .page-fade.on {
    opacity: 1;
  }
  .page-fade.up {
    top: var(--bars);
    background: linear-gradient(180deg, var(--color-bg), transparent);
  }
  .page-fade.down {
    bottom: 0;
    background: linear-gradient(0deg, var(--color-bg), transparent);
  }
  /* 3.0's toast: dark on light (light on dark), centered at the bottom. */
  /* The offer to log a finished flight, in place under the steps (Log README). */
  .offer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-top: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border: var(--border-thin) solid var(--color-border);
    border-radius: var(--radius-panel);
    background: var(--color-surface);
    color: var(--color-text-strong);
    font-size: var(--font-size-body);
    font-weight: var(--weight-semibold);
  }
  .offer-btns {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
  .offer-go,
  .offer-no {
    height: var(--size-touch-min);
    padding: 0 calc(var(--space-3) + var(--border-thick));
    border-radius: var(--radius-control);
    font: inherit;
    font-size: var(--font-size-secondary);
    cursor: pointer;
  }
  .offer-go {
    border: 0;
    background: var(--color-accent);
    color: var(--color-on-accent);
    font-weight: var(--weight-bold);
  }
  .offer-no {
    border: var(--border-thin) solid var(--color-border);
    background: var(--color-button-bg);
    box-shadow: var(--color-button-shadow);
    color: var(--color-text);
    font-weight: var(--weight-regular);
  }
  .msg {
    padding: var(--space-6);
  }
  /* Muted, not red: it is a standing notice, not an error. */
  .legal {
    margin: var(--space-8) 0 0;
    color: var(--color-text-muted);
    font-size: var(--font-size-caption);
  }
  /* Narrow screens show the context inside the step instead, the slide-out as a bottom sheet over
     a scrim on the whole page (Locator.dc.html: tablet portrait 36 px below the bars, phone 16 px
     below the header, a phone held sideways 12 px from the top), and keep room for the bottom bar. */
  @media (max-width: 899px) {
    main {
      padding-bottom: calc(var(--size-touch-min) + var(--space-2) + var(--space-3) + var(--space-4) + var(--space-1) + var(--space-6));
    }
    .slide-scrim {
      top: 0;
      width: 100%;
      z-index: 40;
      background: var(--color-scrim);
    }
    .slide-box {
      top: calc(var(--bars) + var(--space-8) + var(--space-1));
      right: 0;
      left: 0;
      width: auto;
      z-index: 41;
    }
    .app,
    .app.flow {
      grid-template-columns: minmax(0, 1fr);
    }
    .pane {
      display: none;
    }
    .page-fade {
      width: 100%;
    }
  }
  @media (max-width: 599px) {
    .slide-box {
      top: calc(var(--bar-header) + var(--space-4));
    }
    /* No phase track on phone: only phase screens have the progress row. */
    .app:not(.strip) {
      --bars: var(--bar-header);
    }
    /* The phase's list starts under the progress row (Mobile board). */
    .app.strip main {
      padding-top: 0;
    }
    /* A notice above it keeps the notices' gap from the progress row. */
    .app.strip .notices {
      padding-top: var(--space-4);
    }
  }
  @media (max-width: 899px) and (max-height: 499px) {
    .slide-box {
      top: var(--space-3);
    }
  }
</style>
