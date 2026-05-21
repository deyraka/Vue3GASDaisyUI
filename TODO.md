# TODO - SSO 6200

- [x] Remove TailwindCSS + DaisyUI (vanilla CSS + css.gg)
  - [x] Update `src/assets/main.css`
  - [x] Update `vite.config.js`
  - [x] Update `package.json`
  - [x] Update components using Tailwind/DaisyUI classes (e.g. `TheWelcome.vue`)
  - [x] Remove `tailwind.config.js` if unused

- [x] Implement full SSO server in `gas/Code.js`
  - [x] AES helpers (encrypt/decrypt) + Script Properties usage
  - [x] SHA-256 password hashing verify
  - [x] Sheets data access for `db_users`, `db_apps`, `db_sessions`
  - [x] `doGet(e)` app_id validation + render manual login page
  - [x] `doPost(e)` token verification (client_token + auth_token) + single-use invalidation + return profile

- [x] Add/adjust Vue frontend auth flow (redirect with ?app_id=... and capture token)

- [ ] Testing/build
  - [ ] `npm run dev`
  - [ ] `npm run build`
  - [ ] Deploy via `clasp push`

