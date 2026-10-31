# Security

Chore Quest touches real user data (your files and your bank statement), so it is built to be safe by default.

## Data never leaves the device
- Everything runs in the browser. There is no backend, no analytics and no network calls besides the Google Font.
- Files are read through the File System Access API only after the user picks a folder and grants permission.
- Bank CSVs are read locally with `File.text()` and never uploaded.
- Learned preferences, XP and coins live in `localStorage` on the user's device.

## Nothing destructive
- Files are **moved, never deleted**. Duplicates go to a `Dupes/` folder for the user to review.
- Name clashes get a ` (n)` suffix instead of overwriting.
- Every move is journaled and **Undo all** restores the folder.
- Enemies you skip, dodge or get hit by leave the real item untouched. Bosses act only on the killing blow.

## Hardening
| Risk | Mitigation |
|---|---|
| XSS from file names / CSV text | No `innerHTML` anywhere; UI is built with `src/ui/dom.js` (`textContent` only). Game text is drawn on canvas. |
| CSV formula injection in the exported report | `safeCell()` prefixes cells starting with `= + - @` (tests in `tests/expenses.test.js`). |
| Script injection / clickjacking | Strict Content-Security-Policy (`script-src 'self'`, `object-src 'none'`, `base-uri 'none'`, `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, locked-down `Permissions-Policy` (see `index.html`, `nginx.conf.template`, `vercel.json`). |
| Corrupt or tampered local storage | `Memory` falls back to safe defaults on parse errors; unknown blade ids fall back to the default blade. |
| Oversized folders | At most 500 files per run; files are hashed only when another file shares their size, and only up to 25 MB. |
| Supply chain | Zero runtime dependencies and zero npm packages. CI runs with read-only `contents` permission. |

## Reporting
Please open a private security advisory on the GitHub repository.
