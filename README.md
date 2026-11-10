# herdr-config

My Herdr (`herdr-app` 0.1.14) customization, exported from `~/.config/herdr-app`.
`config/` mirrors that folder's layout.

Contents: custom mods (`goatty-chrome`, `my-menu`, `my-spaces`, `space-icon`, `space-new`,
`space-section`), edited shipped mods/layouts (`tabs`, `spaces`, `terminals-bar`, `terminals-pane`,
`workspace-chrome`, `win98`, `main`, `terminals`), custom layouts (`goatty`, `main-quiet`),
themes, `keys.json`, `settings.json`, `programs.json`, `space-icons/`.

Not included (Herdr regenerates it, or it is machine-specific): `shared.json`, `data/`, `view.json`,
`window.json`, `installed.json`, `*.d.ts`, `AGENTS.md`, `telemetry/`, `layouts/.state/`.

## Prompt for the agent on the new machine

> Clone this repo and install my Herdr customization.
>
> 1. Make sure `herdr-app` is installed and run it once so `~/.config/herdr-app` exists
>    (Windows: `C:\Users\<me>\.config\herdr-app`). Check `herdr-app --version`; the export is from 0.1.14.
>    If the version differs, tell me before continuing: my cloned mods never auto-update.
> 2. Quit Herdr completely.
> 3. Back up the existing folder (`herdr-app` → `herdr-app.bak`).
> 4. Copy the *contents* of `config/` from this repo over `~/.config/herdr-app`, overwriting. Do not delete
>    anything else in that folder.
> 5. Fix machine-specific paths: `settings.json` and `programs.json` need no changes, but check
>    `programs.json` runs a program (`omp`) that exists here, and ask me about any other absolute path
>    (e.g. `C:\Users\bruno`) you find with a grep in `config/`.
> 6. Start Herdr. Run `herdr-app status` and look for `*.error` files (`layout.error`, `keys.error`,
>    `settings.error`, `programs.error`) in `~/.config/herdr-app`. For each mod in
>    `mods/{goatty-chrome,my-menu,my-spaces,space-icon,space-new,space-section}` run
>    `herdr-app check <folder>`. Fix or report failures; don't ask me for anything you can read from the files.
> 7. Set the layout to `goatty` (my active one). If anything looks wrong, `ctrl-alt-shift-escape` resets to the
>    default layout.
>
> Read `~/.config/herdr-app/AGENTS.md` for how Herdr's files work.
