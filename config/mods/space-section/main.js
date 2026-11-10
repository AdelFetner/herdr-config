// Section picker for a space (right-click > Section…). Opened as a dialog with props
// { space: <space id>, overlay }. Sections are the sidebar's named groups, kept in shared
// "space.sections" as [{ name, spaces: [space name] }] (by name, so a closed space that a
// preset brings back lands in the same one). A space is in at most one; Pinned wins over it.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, theme, spaces, shared, setShared } from "herdr";

const sections = () => shared("space.sections") ?? [];

export default class SpaceSection extends View {
  init(_props, cx) {
    this.text = "";
    this.focused = true;
    this.error = "";
    this.input = InputState.new({ placeholder: "New section name" });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.error = ""; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.create(cx));
    this.input.on("focus", (_e, cx) => { this.focused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.focused = false; cx.notify(); });
    this.input.focus();
    cx.timer.after(400, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  name() {
    return spaces().find((s) => s.id === props()?.space)?.name;
  }

  close() {
    closeOverlay(props()?.overlay);
  }

  // Puts the space in `section` (null: in none) and closes.
  assign(section) {
    const name = this.name();
    if (name === undefined) return this.close();
    const next = sections().map((s) => ({ ...s, spaces: s.spaces.filter((n) => n !== name) }));
    if (section !== null) next.find((s) => s.name === section)?.spaces.push(name);
    setShared("space.sections", next);
    this.close();
  }

  create(cx) {
    const text = this.text.trim();
    if (!text) { this.error = "Type a name first."; cx.notify(); return; }
    if (!sections().some((s) => s.name === text)) setShared("space.sections", [...sections(), { name: text, spaces: [] }]);
    this.assign(text);
  }

  remove(section, cx) {
    setShared("space.sections", sections().filter((s) => s.name !== section));
    cx.notify();
  }

  render() {
    const t = theme();
    const name = this.name();
    const list = sections();
    const current = list.find((s) => s.spaces.includes(name))?.name ?? null;
    const pinned = (shared("space.pins") ?? []).includes(name);
    const row = (id, label, on, onClick, right) => h_flex().id(id).h(36).px(10).gap(8).rounded(8).items_center().cursor_pointer()
      .when(on, el => el.bg(t.selected)).hover(s => s.bg(t.hover))
      .on_click((_e, cx) => onClick(cx))
      .child(div().w(14).flex_none().child(on ? svg("mods/workspace-chrome/check.svg").size(13) : ""))
      .child(div().flex_1().truncate().text_size(13).text_color(t.foreground).child(label))
      .when(Boolean(right), el => el.child(right));
    const button = (id, text, action) => h_flex().id(id).h(36).px(14).items_center().rounded(8)
      .border_1().border_color(t.solid).bg(t.solid).text_color(t.solid_foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover(s => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("space-section").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } })
      .size_full().min_h(0).p(16).gap(10).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(div().flex_1().truncate().text_size(15).font_semibold().child(`Section for ${name ?? "space"}`))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .when(pinned, el => el.child(div().text_size(11.5).text_color(t.dim).child("Pinned spaces show under Pinned, above the sections.")))
      .child(v_flex().flex_1().min_h(0).gap(2).overflow_y_scrollbar()
        .child(row("sec-none", "No section", current === null, () => this.assign(null)))
        .children(list.map((s, i) => row(`sec-${i}`, s.name, s.name === current, () => this.assign(s.name),
          div().id(`sec-del-${i}`).size(22).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.dim)
            .hover(h => h.bg(t.raised).text_color(t.foreground))
            .on_click((_e, cx) => { cx.stop_propagation(); this.remove(s.name, cx); })
            .child(svg("mods/workspace-chrome/x.svg").size(12)))))
        .when(list.length === 0, el => el.child(div().px(10).py(6).text_size(12).text_color(t.dim).child("No sections yet. Name one below."))))
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().child(Input.new(this.input).h(36).px(10).rounded(9).border_1()
          .border_color(this.focused ? t.accent : t.input).bg(t.background).text_size(12.8).text_color(t.foreground)))
        .child(button("sec-create", "Create", (_e, cx) => this.create(cx))))
      .when(Boolean(this.error), el => el.child(div().text_size(12).text_color(t.blocked).child(this.error)));
  }
}
