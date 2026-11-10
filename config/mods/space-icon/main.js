// Icon picker for a space (right-click > Icon…). Opened as a dialog with props
// { space: <space id>, overlay }. Writes shared "space.icons"[id]: an emoji/short
// text, or a picture path in the app home. Dropped or typed image files are copied
// to ~/.config/herdr-app/space-icons/ so the icon survives the original moving.

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { props, closeOverlay, theme, spaces, shared, setShared, appHome, exec } from "herdr";
import * as fs from "fs/promises";
import os from "os";

const EMOJI = [
  "🏠", "🏢", "💼", "📁", "📦", "🧪", "🔧", "⚡",
  "🚀", "🔥", "⭐", "💡", "🎓", "📚", "📝", "🧠",
  "🤖", "🐙", "🐛", "🎨", "🎮", "🎵", "📈", "💰",
  "🛒", "🔒", "🌐", "📱", "🧰", "🔬", "🌱", "🍎",
  "☕", "🧩", "🎯", "📡", "🔑", "🧭", "🦊", "🐳",
  "🐍", "🦀", "🌙", "💎", "🏆", "📊", "🧱", "🎧",
];
const IMAGE_EXT = /\.(png|jpe?g|webp|svg)$/i;

// Asks the OS for an image file. Windows: PowerShell's OpenFileDialog; macOS: osascript;
// elsewhere: zenity. A cancelled dialog gives empty output.
async function pickImage() {
  const opts = { timeout: 600000 };
  let r;
  if (/^win/i.test(os.platform())) {
    const script = "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.OpenFileDialog; "
      + "$d.Title = 'Choose an icon'; $d.Filter = 'Images|*.png;*.jpg;*.jpeg;*.webp;*.svg'; "
      + "if ($d.ShowDialog() -eq 'OK') { $d.FileName }";
    r = await exec("powershell", ["-NoProfile", "-STA", "-Command", script], opts);
  } else if (/^darwin|mac/i.test(os.platform())) {
    r = await exec("osascript", ["-e", 'POSIX path of (choose file of type {"public.image"} with prompt "Choose an icon")'], opts);
  } else {
    r = await exec("zenity", ["--file-selection", "--title=Choose an icon", "--file-filter=Images | *.png *.jpg *.jpeg *.webp *.svg"], opts);
  }
  return r.stdout.trim() || null;
}

export default class SpaceIcon extends View {
  init(_props, cx) {
    this.mode = "emoji";
    this.error = "";
    this.emoji = "";
    this.path = "";
    this.emojiInput = InputState.new({ placeholder: "Type or paste an emoji" });
    this.emojiInput.on("change", (_e, cx) => { this.emoji = this.emojiInput.value(); cx.notify(); });
    this.emojiInput.on("submit", (_e, cx) => this.useEmoji(cx));
    this.pathInput = InputState.new({ placeholder: "Path to a .png, .jpg, .webp or .svg" });
    this.pathInput.on("change", (_e, cx) => { this.path = this.pathInput.value(); cx.notify(); });
    this.pathInput.on("submit", (_e, cx) => this.useImage(this.path, cx));
    this.focused = null;
    for (const [name, input] of [["emoji", this.emojiInput], ["path", this.pathInput]]) {
      input.on("focus", (_e, cx) => { this.focused = name; cx.notify(); });
      input.on("blur", (_e, cx) => { if (this.focused === name) this.focused = null; cx.notify(); });
    }
    this.emojiInput.focus();
    cx.timer.after(400, () => (this.mode === "emoji" ? this.emojiInput : this.pathInput).focus());
    this.handle = cx.focus_handle();
  }

  space() {
    return spaces().find((s) => s.id === props()?.space);
  }

  current() {
    return (shared("space.icons") ?? {})[props()?.space] ?? null;
  }

  // Stores the icon and closes. A replaced or cleared picture copy is deleted.
  set(value) {
    const id = props().space;
    const icons = { ...(shared("space.icons") ?? {}) };
    const old = icons[id];
    if (value) icons[id] = value;
    else delete icons[id];
    setShared("space.icons", icons);
    if (old && old !== value && old.startsWith("space-icons/")) fs.unlink(`${appHome()}/${old}`).catch(() => {});
    closeOverlay(props().overlay);
  }

  useEmoji(cx) {
    const text = [...this.emoji.trim()].slice(0, 4).join("");
    if (!text) { this.error = "Type or paste an emoji first."; cx.notify(); return; }
    this.set(text);
  }

  useImage(source, cx) {
    const src = source.trim().replace(/^"(.*)"$/, "$1");
    const ext = src.match(IMAGE_EXT)?.[1]?.toLowerCase();
    if (!ext) { this.error = "Pick a .png, .jpg, .webp or .svg file."; cx.notify(); return; }
    cx.spawn(async (cx) => {
      try {
        const bytes = await fs.readFile(src);
        await fs.mkdir(`${appHome()}/space-icons`, { recursive: true });
        const rel = `space-icons/${props().space}-${Date.now()}.${ext}`;
        await fs.writeFile(`${appHome()}/${rel}`, bytes);
        this.set(rel);
      } catch (e) {
        this.error = `Couldn't read that file: ${e?.message ?? e}`;
        cx.notify();
      }
    });
  }

  // The system's open-file dialog; resolves with the chosen path or null.
  choose(cx) {
    if (this.picking) return;
    this.picking = true;
    this.error = "";
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const path = await pickImage();
        if (path) this.useImage(path, cx);
      } catch (e) {
        this.error = `Couldn't open the file dialog: ${e?.message ?? e}`;
      }
      this.picking = false;
      cx.notify();
    });
  }

  key(e, cx) {
    if (e.key === "escape") { closeOverlay(props().overlay); cx.stop_propagation(); }
  }

  switchTo(mode, cx) {
    this.mode = mode;
    this.error = "";
    (mode === "emoji" ? this.emojiInput : this.pathInput).focus();
    cx.notify();
  }

  render() {
    const t = theme();
    const space = this.space();
    const current = this.current();
    const button = (id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover(s => s.opacity(0.88)).on_click(action).child(text);
    const tab = (id, label) => div().id(`tab-${id}`).px(12).h(30).flex().items_center().cursor_pointer().text_size(12.5)
      .border_b_2().border_color(this.mode === id ? t.accent : "#00000000")
      .text_color(this.mode === id ? t.foreground : t.muted)
      .on_click((_e, cx) => this.switchTo(id, cx)).child(label);
    const field = (input, name) => Input.new(input).h(36).px(10).rounded(9).border_1()
      .border_color(this.focused === name ? t.accent : t.input).bg(t.background).text_size(12.8).text_color(t.foreground);
    const rows = [];
    for (let i = 0; i < EMOJI.length; i += 8) rows.push(EMOJI.slice(i, i + 8));

    return v_flex().id("space-icon").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .w_full().min_h(0).p(18).gap(12).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(div().flex_1().truncate().text_size(15).font_semibold().child(`Icon for ${space?.name ?? "space"}`))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(h_flex().gap(4).border_b_1().border_color(t.border).child(tab("emoji", "Emoji")).child(tab("image", "Image")))
      .when(this.mode === "emoji", el => el
        .child(h_flex().gap(8).items_center()
          .child(div().flex_1().child(field(this.emojiInput, "emoji")))
          .child(button("use-emoji", "Use", true, (_e, cx) => this.useEmoji(cx))))
        .child(v_flex().gap(4).children(rows.map((row, r) => h_flex().gap(4).children(row.map((e) =>
          div().id(`em-${r}-${e}`).size(40).flex().items_center().justify_center().rounded(8).text_size(22).cursor_pointer()
            .bg(current === e ? t.selected : "#00000000").hover(s => s.bg(t.hover))
            .on_click(() => this.set(e)).child(e)))))))
      .when(this.mode === "image", el => el
        .child(v_flex().id("drop").h(120).gap(10).items_center().justify_center().rounded(10).border_1().border_color(t.input)
          .bg(t.background).text_size(12.5).text_color(t.muted)
          .on_drop((event, cx) => { const p = event.paths?.[0]; if (p) this.useImage(p, cx); })
          .child("Drop an image file here, or")
          .child(button("choose-file", this.picking ? "Choosing…" : "Choose file…", false, (_e, cx) => this.choose(cx))))
        .child(div().text_size(11.5).text_color(t.dim).child("or paste its path (Explorer: Shift+right-click > Copy as path)"))
        .child(h_flex().gap(8).items_center()
          .child(div().flex_1().child(field(this.pathInput, "path")))
          .child(button("use-image", "Use", true, (_e, cx) => this.useImage(this.path, cx)))))
      .when(Boolean(this.error), el => el.child(div().text_size(12).text_color(t.blocked).child(this.error)))
      .child(div().flex_1())
      .child(h_flex().gap(8).justify_end()
        .when(Boolean(current), el => el.child(button("reset", "Remove icon", false, () => this.set(null))))
        .child(button("close", "Close", false, () => closeOverlay(props().overlay))));
  }
}
