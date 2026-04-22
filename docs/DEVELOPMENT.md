# Orbit — developer notes

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Launch Electron + Vite dev server (HMR for renderer). |
| `npm run build` | Typecheck, then build main / preload / renderer into `out/`. |
| `npm run start` | Preview a production build locally. |
| `npm run typecheck` | `tsc --noEmit` across both tsconfig projects. |
| `npm run lint` | ESLint across `src/`, `tests/`, `e2e/`. |
| `npm run test` | Vitest unit suite (node env; no e2e). |
| `npm run test:all` | `test` + `e2e` (requires `ORBIT_E2E=1` + display). |
| `npm run e2e` | Builds the app and drives it via Playwright Electron. Gated by `ORBIT_E2E=1`. |
| `npm run e2e:install` | Install Playwright browsers (optional). |
| `npm run package:dir` | Electron Builder `--dir` smoke (unsigned `.app`). |
| `npm run package` | Full `.dmg` + `.zip` for arm64 + x64 (unsigned). |

## Layout

```
orbit/
├── build/                 # packaging assets (icon.png)
├── docs/                  # architecture, user guide, dev notes
├── e2e/                   # Playwright Electron smoke tests (gated)
├── electron-builder.yml   # packaging config
├── electron.vite.config.ts
├── playwright.config.ts
├── src/
│   ├── main/              # Electron main process (IPC, vault, agents, crash)
│   ├── preload/           # contextBridge → window.orbit
│   ├── renderer/          # React + Zustand UI
│   └── shared/            # types + schemas + IPC contract
└── tests/                 # Vitest unit tests
```

## Testing

- Unit tests live in `tests/` and run under Node (no DOM). Where UI behaviour
  needs coverage, we test the class logic directly (e.g. `ErrorBoundary`'s
  `getDerivedStateFromError`) rather than pulling in jsdom.
- `ORBIT_USER_DATA=<tmp>` override at the top of `src/main/index.ts` lets e2e
  and local experiments redirect `app.getPath('userData')` without polluting
  the real userData.
- Crash log format: NDJSON at `<vault>/.orbit/crash/YYYY-MM-DD.log`, falling
  back to `userData/crash/` when no vault is open.

## Packaging

`electron-builder.yml` ships unsigned `.dmg` + `.zip` for macOS. Signing and
notarization are intentionally disabled (`mac.identity: null`, no `afterSign`).
To enable real distribution:

1. Set `mac.identity` to your Developer ID string.
2. Set `mac.hardenedRuntime: true` and add entitlements.
3. Wire `afterSign` to `electron-notarize` or `@electron/notarize`.

### Replacing the app icon

`build/icon.png` is a procedurally generated 1024×1024 placeholder. Replace
it with a real PNG (same dimensions) or regenerate `icon.icns` via
`iconutil`. Electron Builder will derive the other required sizes at
package time.

## React hook rules

The codebase uses `react-hooks/exhaustive-deps`. When an effect depends on a
property of an unstable object (e.g. `vault?.path`), destructure the primitive
into a local const and put that in the dep array — rather than an
eslint-disable.

## Adding a new IPC channel

1. Declare the channel in `src/shared/ipc.ts` (`IPC` object + `OrbitApi`).
2. Implement the main-process handler (typically in the owning module's
   `ipc.ts`).
3. Expose the method in `src/preload/index.ts`.
4. Use via `window.orbit.<ns>.<method>()` from the renderer.

The `tests/ipc.test.ts` file contains a compile-time shape test — new channels
must be added there (or the test will fail typecheck).
