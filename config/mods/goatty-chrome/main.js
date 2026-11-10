// Goatty-style chrome: sessions sidebar (spaces as folders, tabs as sessions), title bar,
// sidebar footer and the status line under the card. One mod, four roles: props.role =
// "side" | "sessions" | "foot" | "title" | "status".

import { View, div, svg, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { spaces, agents, panes, props, run, openOverlay, theme, window, shared, setShared, layout, keys, home } from "herdr";

const W = "mods/workspace-chrome/";
const GLASS = "#ffffff0a";
const HAIR = "#ffffff14";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

// First agent, else first focused terminal, else first terminal of each tab.
function leads(all) {
  const out = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const cur = out.get(p.tab);
    if (!cur || (!cur.program?.agent && (p.program?.agent || (!cur.focused && p.focused)))) out.set(p.tab, p);
  }
  return out;
}

function sessionTitle(tab, lead) {
  const prog = lead?.program?.name;
  const live = clean(lead?.title);
  const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== lead?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}

const kind = (lead) => (!lead?.program || lead.program.shell ? "Terminal" : lead.program.name);

function tile(t, p, size) {
  const inner = Math.round(size * 0.56);
  return div().size(size).flex_none().rounded(Math.round(size * 0.28)).flex().items_center().justify_center()
    .bg(p?.tile ?? "#ffffff17")
    .when(Boolean(p?.icon), (el) => el.child(p.tint ? svg(p.icon).size(inner).text_color(p.color ?? t.foreground) : image(p.icon).w(inner).h(inner)))
    .when(!p?.icon, (el) => el.child(svg(`${W}terminal.svg`).size(inner).text_color(t.muted)));
}

const stop = (_e, cx) => cx.stop_propagation();

function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  if (m < 1) return `${s}s`;
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

function tilde(cwd) {
  if (!cwd) return "";
  const h = home();
  return cwd === h ? "~" : cwd.startsWith(h + "/") || cwd.startsWith(h + "\\") ? "~" + cwd.slice(h.length) : cwd;
}

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };

export default class GoattyChrome extends View {
  init(_props, cx) {
    this.folded = new Set(JSON.parse(localStorage.getItem("folded") ?? "[]"));
    if (props()?.role === "status" || props()?.role === "sessions") cx.timer.every(1000, (cx) => cx.notify());
  }

  button(t, id, icon, action, tip, on) {
    return div().id(id).size(28).flex_none().flex().items_center().justify_center().rounded(8)
      .text_color(on ? t.foreground : t.muted)
      .when(on, (el) => el.bg(t.selected))
      .hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop).on_click(action)
      .when(Boolean(tip), (el) => el.tooltip(tip))
      .child(typeof icon === "string" ? svg(icon).size(15) : icon);
  }

  toggleSidebar() {
    run(find(layout(), "sidebar")?.hidden ? "layout.show" : "layout.hide", { id: "sidebar" });
  }

  // ---- top of the sidebar ----
  side(t) {
    return h_flex().size_full().pl(window()?.platform === "macos" ? 84 : 10).pr(10).gap(2).items_center().justify_end()
      .child(this.button(t, "gs-search", `${W}search.svg`, () => run("mod.open", { name: "picker" }), "Search"))
      .child(this.button(t, "gs-new-space", `${W}plus.svg`, () => run("space.new"), "New space"))
      .child(this.button(t, "gs-toggle", `${W}sidebar.svg`, () => this.toggleSidebar(), "Hide sidebar"));
  }

  // ---- sessions list ----
  statusMark(t, status) {
    if (status === "working") return svg(`${W}spinner.svg`).size(14).flex_none().text_color(t.working).spin(900);
    if (status === "blocked") return svg("mods/goatty-chrome/alert.svg").size(14).flex_none().text_color(t.blocked);
    if (status === "done") return div().size(7).flex_none().rounded_full().bg(t.done);
    return null;
  }

  sessionRow(t, s, tab, lead, withSpace) {
    const on = s.active && tab.active;
    const mark = this.statusMark(t, tab.status);
    const sub = withSpace ? `${s.name} · ${kind(lead)}` : kind(lead);
    return h_flex().id(`gs-${tab.id}`).h(46).flex_none().px(8).gap(10).items_center().rounded(10)
      .when(on, (el) => el.bg(t.selected))
      .when(!on, (el) => el.hover((x) => x.bg(t.hover)))
      .on_click(() => { run("space.select", { id: s.id }); run("tab.select", { id: tab.id }); })
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({ mod: "menu", kind: "popup", width: 200, props: { tab: "tab", target: { id: tab.id, space: s.id } } });
      })
      .child(tile(t, lead?.program, 30))
      .child(v_flex().flex_1().min_w(0).gap(1)
        .child(div().truncate().text_size(13).text_color(t.foreground).child(sessionTitle(tab, lead)))
        .child(div().truncate().text_size(11).text_color(t.dim).child(sub)))
      .when(Boolean(mark), (el) => el.child(mark));
  }

  groupHeader(t, s) {
    const folded = this.folded.has(s.id);
    return h_flex().id(`gs-group-${s.id}`).h(32).flex_none().mt(8).px(8).gap(8).items_center().rounded(8)
      .text_color(s.active ? t.foreground : t.muted)
      .hover((x) => x.bg(t.hover))
      .on_click((_e, cx) => {
        folded ? this.folded.delete(s.id) : this.folded.add(s.id);
        localStorage.setItem("folded", JSON.stringify([...this.folded]));
        cx.notify();
      })
      .on_mouse_down("right", (_e, cx) => { cx.stop_propagation(); openOverlay({ mod: "menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: s.id } } }); })
      .child(svg(`${W}${folded ? "chevron-right" : "folder"}.svg`).size(15).flex_none())
      .child(div().flex_1().min_w(0).truncate().text_size(13).child(s.name))
      .when(Boolean(s.machine), (el) => el.child(div().text_size(10.5).text_color(t.dim).child(s.machine)))
      .child(div().id(`gs-add-${s.id}`).size(22).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim)
        .hover((x) => x.bg(t.hover).text_color(t.foreground))
        .tooltip("New session")
        .on_mouse_down("left", stop)
        .on_click((_e, cx) => { cx.stop_propagation(); run("space.select", { id: s.id }); run("tab.new", { space: s.id }); })
        .child(svg(`${W}plus.svg`).size(13)));
  }

  segment(t, id, label, icon, on) {
    return h_flex().id(id).flex_1().h(26).gap(6).items_center().justify_center().rounded(7).text_size(12.5)
      .text_color(on ? t.foreground : t.muted)
      .when(on, (el) => el.bg("#ffffff14"))
      .when(!on, (el) => el.hover((x) => x.bg(t.hover)))
      .on_click(() => setShared("goatty.view", id === "gs-seg-agents" ? "priority" : "spaces"))
      .child(svg(`${W}${icon}.svg`).size(13))
      .child(label);
  }

  sessions(t) {
    const view = shared("goatty.view") === "priority" ? "priority" : "spaces";
    const sp = spaces();
    const lead = leads(panes());
    let body;
    if (!sp.length) {
      body = [h_flex().id("gs-empty").h(46).px(8).gap(8).items_center().rounded(10).text_color(t.muted).hover((x) => x.bg(t.hover))
        .on_click(() => run("space.new")).child(svg(`${W}plus.svg`).size(14)).child("New space")];
    } else if (view === "priority") {
      const rows = sp.flatMap((s) => s.tabs.map((tab) => ({ s, tab })));
      rows.sort((a, b) => (RANK[b.tab.status] ?? 0) - (RANK[a.tab.status] ?? 0) || (b.tab.changed_at ?? 0) - (a.tab.changed_at ?? 0));
      body = rows.map(({ s, tab }) => this.sessionRow(t, s, tab, lead.get(tab.id), true));
    } else {
      body = sp.flatMap((s) => [this.groupHeader(t, s), ...(this.folded.has(s.id) ? [] : s.tabs.map((tab) => this.sessionRow(t, s, tab, lead.get(tab.id), false)))]);
    }
    return v_flex().size_full().min_h(0).text_size(13)
      .child(h_flex().h(34).mx(10).mt(2).mb(6).p(3).gap(2).flex_none().rounded(10).bg(GLASS).border_1().border_color(HAIR)
        .child(this.segment(t, "gs-seg-spaces", "Spaces", "layers", view === "spaces"))
        .child(this.segment(t, "gs-seg-agents", "Priority", "clock", view === "priority")))
      .child(v_flex().flex_1().min_h(0).px(10).pb(12).gap(2).overflow_y_scrollbar().mode("always").children(body));
  }

  // ---- footer ----
  foot(t) {
    const list = agents();
    const n = (s) => list.filter((a) => a.status === s).length;
    const chip = (mark, text) => h_flex().gap(5).items_center().child(mark).child(text);
    const parts = [];
    if (n("working")) parts.push(chip(svg(`${W}spinner.svg`).size(12).text_color(t.working).spin(900), `${n("working")}`));
    if (n("blocked")) parts.push(chip(svg("mods/goatty-chrome/alert.svg").size(12).text_color(t.blocked), `${n("blocked")}`));
    if (n("done")) parts.push(chip(div().size(7).rounded_full().bg(t.done), `${n("done")}`));
    return h_flex().size_full().px(12).gap(8).items_center().text_size(12).text_color(t.muted)
      .child(h_flex().h(30).px(11).gap(11).items_center().rounded(15).bg(GLASS).border_1().border_color(HAIR)
        .when(parts.length === 0, (el) => el.child(`${list.length} agents`))
        .when(parts.length > 0, (el) => el.children(parts)))
      .child(div().flex_1())
      .child(this.button(t, "gs-machine", `${W}server.svg`, () => run("mod.open", { name: "machine-add" }), "Add machine"))
      .child(this.button(t, "gs-settings", `${W}settings.svg`, () => run("app.settings"), "Settings"));
  }

  // ---- title bar ----
  panelButton(t, id, label, icon) {
    const root = layout();
    const panel = find(root, "panel");
    const body = find(root, "panel-body");
    const on = panel && !panel.hidden && body?.active === id;
    return h_flex().id(`gs-panel-${id}`).h(28).px(8).gap(6).items_center().rounded(8).flex_none().text_size(12.5)
      .text_color(on ? t.foreground : t.muted)
      .when(on, (el) => el.bg(t.selected))
      .hover((x) => x.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", stop)
      .on_click(() => {
        if (on) run("layout.hide", { id: "panel" });
        else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
      })
      .child(svg(icon).size(14)).child(label);
  }

  title(t) {
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((c) => c.active);
    const lead = tab ? leads(panes()).get(tab.id) : null;
    const w = window();
    const hidden = find(layout(), "sidebar")?.hidden;
    const win = w?.platform === "windows";
    return h_flex().size_full().pl(hidden && window()?.platform === "macos" ? 84 : 18).pr(10).gap(8).items_center()
      .when(hidden, (el) => el.child(this.button(t, "gs-toggle-t", `${W}sidebar.svg`, () => this.toggleSidebar(), "Show sidebar")))
      .when(Boolean(tab), (el) => el.child(tile(t, lead?.program, 24)))
      .child(div().min_w(0).truncate().text_size(13).text_color(t.foreground).child(tab ? sessionTitle(tab, lead) : "Herdr"))
      .when(Boolean(space), (el) => el.child(div().flex_none().text_size(12).text_color(t.dim).child(space.name)))
      .when(tab?.status === "working", (el) => el.child(svg(`${W}spinner.svg`).size(14).flex_none().text_color(t.working).spin(900)))
      .child(div().flex_1())
      .child(this.button(t, "gs-split-r", "mods/pane/split-right.svg", () => run("pane.split", { direction: "right" }), "Split right"))
      .child(this.button(t, "gs-split-d", "mods/pane/split-down.svg", () => run("pane.split", { direction: "down" }), "Split down"))
      .child(this.panelButton(t, "files", "Files", "mods/files/file.svg"))
      .child(this.panelButton(t, "changes", "Changes", "mods/changes/changes.svg"))
      .when(w?.buttons, (el) => el
        .child(this.button(t, "gs-min", win ? "mods/tabs/win-min.svg" : `${W}minus.svg`, () => run("window.minimize")))
        .child(this.button(t, "gs-max", win ? `mods/tabs/${w.maximized ? "win-restore" : "win-max"}.svg` : `${W}square.svg`, () => run("window.maximize")))
        .child(this.button(t, "gs-close", win ? "mods/tabs/win-close.svg" : `${W}x.svg`, () => run("window.close"))));
  }

  // ---- status line under the card ----
  status(t) {
    const space = spaces().find((s) => s.active);
    const tab = space?.tabs.find((c) => c.active);
    const all = panes();
    const pane = all.find((p) => p.focused && p.terminal) ?? (tab ? leads(all).get(tab.id) : null);
    const st = pane?.status ?? tab?.status ?? null;
    const label = { working: "Working", blocked: "Needs you", done: "Done", idle: "Idle" }[st];
    const color = { working: t.working, blocked: t.blocked, done: t.done }[st] ?? t.dim;
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const hint = b ? b.keys.split("-").map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("") : null;
    const pill = (el) => el.h(24).px(10).gap(6).items_center().rounded(12).bg(GLASS).border_1().border_color(HAIR);
    return h_flex().size_full().pl(18).pr(18).gap(10).items_center().text_size(11.5).text_color(t.muted)
      .when(Boolean(st), (el) => el.child(pill(h_flex()).text_color(color)
        .when(st === "working", (x) => x.child(svg(`${W}spinner.svg`).size(12).text_color(color).spin(900)))
        .when(st !== "working", (x) => x.child(div().size(6).rounded_full().bg(color)))
        .child(label)
        .when(st === "working" && tab?.working_since, (x) => x.child(div().text_color(t.dim).child(ago(Date.now() - tab.working_since))))))
      .when(Boolean(pane?.branch), (el) => el.child(h_flex().gap(5).items_center().child(svg(`${W}branch.svg`).size(12)).child(pane.branch)))
      .when(Boolean(pane?.cwd), (el) => el.child(div().min_w(0).truncate().text_color(t.dim).child(tilde(pane.cwd))))
      .child(div().flex_1())
      .when(Boolean(pane?.program?.name), (el) => el.child(pill(h_flex()).child(pane.program.name)))
      .when(Boolean(space?.machine), (el) => el.child(space.machine))
      .when(Boolean(hint), (el) => el.child(div().id("gs-palette").text_color(t.dim).hover((x) => x.text_color(t.foreground)).on_click(() => run("app.palette")).child(`${hint}  commands`)));
  }

  render() {
    const t = theme();
    const role = props()?.role;
    if (role === "side") return this.side(t);
    if (role === "foot") return this.foot(t);
    if (role === "title") return this.title(t);
    if (role === "status") return this.status(t);
    return this.sessions(t);
  }
}
