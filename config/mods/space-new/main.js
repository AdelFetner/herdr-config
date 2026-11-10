// New space picker. Opened by the sidebar's + and ctrl-shift-n. First rows: a new
// space that starts omp and an empty one. Then the presets saved with right-click >
// Save as preset (shared "space.presets": [{ name, folder, icon }]). Up/Down move,
// Enter opens, Esc closes. A preset whose space is already open just selects it.

import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { run, props, closeOverlay, theme, spaces, shared, setShared, exec } from "herdr";

// The rows above the presets. The first is the default (Enter) and starts omp,
// as do the presets; the second is a plain shell. The agent runs in the user's
// interactive shell, which stays open after it exits.
const STARTS = [
  { title: "New space with omp", sub: "Starts omp in the current folder", argv: ["omp"] },
  { title: "Empty space", sub: "A plain terminal", argv: null },
];

function presets() {
  return shared("space.presets") ?? [];
}

// An icon the way the sidebar draws it: emoji/text, .svg tinted, picture as is,
// or (no icon) the first letter on a quiet tile.
function iconView(icon, name, t) {
  const box = h_flex().size(22).flex_none().items_center().justify_center();
  if (!icon) return box.rounded(6).bg(t.raised).text_size(11).font_bold().text_color(t.muted).child([...name][0]?.toUpperCase() ?? "?");
  if (/\.svg$/i.test(icon)) return box.child(svg(icon).size(18).text_color(t.foreground));
  if (/\.(png|jpe?g|webp)$/i.test(icon)) return box.child(image(icon).size(22));
  return box.text_size(17).child(icon);
}

export default class SpaceNew extends View {
  init(_props, cx) {
    this.at = 0;
    this.busy = false;
    this.error = "";
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  blank(argv) {
    this.close();
    run("space.new", argv ? { argv } : {});
  }

  remove(i, cx) {
    setShared("space.presets", presets().filter((_p, j) => j !== i));
    this.at = Math.min(this.at, STARTS.length + presets().length - 1);
    cx.notify();
  }

  // Opens the preset: select its space if one with that name is open, else make
  // it (herdr-app prints the new ids, which run() can't) and give it its icon.
  open(p, cx) {
    const existing = spaces().find((s) => !s.machine && s.name === p.name);
    if (existing) {
      this.close();
      run("space.select", { id: existing.id });
      return;
    }
    if (this.busy) return;
    this.busy = true;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const args = ["do", "space.new", "--name", p.name];
        if (p.folder) args.push("--folder", p.folder);
        args.push("--argv", JSON.stringify(STARTS[0].argv));
        const r = await exec("herdr-app", args);
        const id = JSON.parse(r.stdout).space;
        if (!id) throw new Error(r.stdout.trim() || r.stderr.trim() || "no space id");
        if (p.icon) setShared("space.icons", { ...(shared("space.icons") ?? {}), [id]: p.icon });
        this.close();
      } catch (e) {
        this.error = `Couldn't open it: ${e?.message ?? e}`;
        this.busy = false;
        cx.notify();
      }
    });
  }

  choose(i, cx) {
    if (i < STARTS.length) this.blank(STARTS[i].argv);
    else if (presets()[i - STARTS.length]) this.open(presets()[i - STARTS.length], cx);
  }

  render() {
    const t = theme();
    const list = presets();
    const n = list.length + STARTS.length;
    const row = (i, left, title, sub, onClick, right) => h_flex().id(`sn-${i}`).h(44).px(10).gap(10).rounded(8).items_center()
      .when(i === this.at, el => el.bg(t.selected))
      .hover(s => s.bg(t.hover)).cursor_pointer()
      .on_click((_e, cx) => onClick(cx))
      .child(left)
      .child(v_flex().flex_1().min_w(0)
        .child(div().truncate().text_size(13).text_color(t.foreground).child(title))
        .when(Boolean(sub), el => el.child(div().truncate().text_size(11).text_color(t.dim).child(sub))))
      .when(Boolean(right), el => el.child(right));
    return v_flex().id("space-new").track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % n;
        else if (e.key === "up") this.at = (this.at + n - 1) % n;
        else if (e.key === "enter") this.choose(this.at, cx);
        else if (e.key === "escape") { this.close(); cx.stop_propagation(); }
        else return;
        cx.notify();
      })
      .size_full().min_h(0).p(14).gap(8).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center().px(4)
        .child(div().flex_1().text_size(15).font_semibold().child("New space"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(v_flex().gap(2).children(STARTS.map((s, i) => row(i,
        h_flex().size(22).flex_none().items_center().justify_center().child(svg("mods/workspace-chrome/plus.svg").size(14).text_color(t.muted)),
        s.title, s.sub, () => this.blank(s.argv)))))
      .child(div().px(4).pt(6).text_size(11.5).text_color(t.dim).child("Presets"))
      .child(v_flex().flex_1().min_h(0).gap(2).overflow_y_scrollbar()
        .when(list.length === 0, el => el.child(div().px(4).py(6).text_size(12).text_color(t.dim)
          .child("None yet. Right-click a space and choose Save as preset.")))
        .children(list.map((p, j) => row(j + STARTS.length, iconView(p.icon, p.name, t), p.name, p.folder, (cx) => this.open(p, cx),
          div().id(`sn-del-${j}`).size(22).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.dim)
            .hover(s => s.bg(t.raised).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); this.remove(j, cx); })
            .child(svg("mods/workspace-chrome/x.svg").size(12))))))
      .when(Boolean(this.error), el => el.child(div().text_size(12).text_color(t.blocked).child(this.error)));
  }
}
