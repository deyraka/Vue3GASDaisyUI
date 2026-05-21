# Implementation Plan: Simple Single Sign-On (SSO) with Google Sheets & Vue3
## Strict Requirement: Manual Form Authentication (No Google/Gmail Account Integration)

This document outlines the implementation plan for building a centralized Single Sign-On (SSO) ecosystem. Google Sheets acts as the secure database, Google Apps Script (GAS) operates as the backend identity provider, and the frontend client apps utilize the Vue 3 + DaisyUI boilerplate.

---

## 1. Project Stack & Architecture
* [cite_start]**SSO Backend & DB**: Google Apps Script (deployed as a Web App) & Google Sheets[cite: 21].
* **Client Boilerplate**: [Vue3GASDaisyUI](https://github.com/deyraka/Vue3GASDaisyUI) (Vue 3, Vite, Tailwind CSS, DaisyUI).
* [cite_start]**Authentication Method**: **Strictly Manual Login Form** (Username/NIP + Password). [cite_start]**DO NOT** use Google Workspace passive login (`Session.getActiveUser()`).
* [cite_start]**Communication Protocol**: Backend-to-backend verification using `UrlFetchApp` (POST requests)[cite: 45].
* [cite_start]**Security & Cryptography**: One-way hashing for passwords (SHA-256 via GAS `Utilities`) [cite: 53] [cite_start]and reversible two-way encryption for sensitive records like phone numbers and emails (AES-256 via CryptoJS)[cite: 51, 54].

---

## 2. Database Schema (`SSO 6200` Spreadsheet)

### `db_users` (User Registry)
Stores credentials and verified profile metrics.
* [cite_start]`id`: Unique user identifier[cite: 9].
* [cite_start]`nip`: Employee identity number[cite: 9].
* [cite_start]`username`: Distinct login credential handle[cite: 9].
* [cite_start]`phone`: Encrypted phone string (AES-256)[cite: 9, 54]. -> reversible two-way encryption
* [cite_start]`password`: Securely hashed password value (SHA-256)[cite: 13, 53]. -> One-way hashing for passwords
* [cite_start]`email`: user email [cite: 13]. -> reversible two-way encryption
* *Note: Google Email column is omitted as passive Google Sign-In is prohibited.*

### `db_apps` (Application Whitelist)
[cite_start]Enforces a whitelist constraint; non-registered client apps are blocked from authenticating[cite: 3].
* [cite_start]`app_id`: Unique token identifying the client app (e.g., `APP001`)[cite: 15].
* [cite_start]`app_name`: Descriptive title of the sub-application[cite: 16].
* [cite_start]`client_token`: Private backend secret assigned to that app for verification[cite: 16, 46].
* [cite_start]`redirect_url`: The targeted client app Web App deployment URL[cite: 17].
* [cite_start]`status`: Current state of the application (`ACTIVE` or `INACTIVE`)[cite: 18].

### `db_sessions` (Active Authorization Tokens)
Tracks temporary authorization states during the handshake.
* [cite_start]`session_id`: Unique tracking ID[cite: 20].
* [cite_start]`username` / `nip`: Bound credentials of the successfully logged-in user[cite: 20].
* [cite_start]`app_id`: Target application issuing the login redirect[cite: 20].
* [cite_start]`auth_token`: Short-lived randomized token string (Expiring within 5 minutes)[cite: 20, 27].
* [cite_start]`created_at` / `expired_at`: Validity timestamps[cite: 20].

---

## 3. Step-by-Step Implementation Phases

### Phase 1: Identity Provider Configuration (SSO Server)
1. [cite_start]**Database Setup**: Format sheets `db_user`, `db_apps`, and `db_sessions` inside the target spreadsheet[cite: 11].
2. **Crypto Injection**: 
   * [cite_start]Embed the CryptoJS library components inside the server project[cite: 55].
   * [cite_start]Define the private database hash salt inside GAS **Script Properties** (`SECRET_KEY_DATABASE`)[cite: 56, 57].
3. **Core Handlers Implementation**:
   * [cite_start]**`doGet(e)`**: Parses the incoming `app_id`[cite: 24, 44]. If the application matches an `ACTIVE` status entry in `db_apps`, it serves a custom **HTML Login Page (Form)** asking for Username/NIP and Password[cite: 13, 18, 24]. [cite_start]If invalid, it short-circuits with an access error[cite: 25].
   * [cite_start]**Authentication Action**: When the user submits credentials on the login page, verify the password entry against the hashed string stored inside `db_user`[cite: 53]. If successful, generate an `auth_token`, log it into `db_sessions`, and handle an automated browser redirect to the client's registered `redirect_url` appended with `?token=TOKEN_VALUE`[cite: 17, 27, 28, 29].
   * [cite_start]**`doPost(e)`**: Serves as the internal data-exchange endpoint[cite: 44, 47]. [cite_start]Evaluates incoming `client_token` and `auth_token` pairings[cite: 46]. [cite_start]If validated, it returns the decrypted user profile fields (NIP, Username, Phone) and immediately deletes the token record to guarantee single-use restrictions[cite: 33, 46].
4. [cite_start]**Server Deployment**: Deploy the centralized script as a **Web App** configured to *"Execute as: Me"* and *"Who has access: Anyone"*[cite: 21].

### Phase 2: Client App Lifecycle (`https://github.com/deyraka/Vue3GASDaisyUI`)
1. **Scaffold Preparation**: Clone the boilerplate repository to assemble a clean workspace for the client app.
2. **Otentikasi Checking (Frontend)**:
   * During early client app rendering, intercept initialization to see if an internal local storage token persists.
   * [cite_start]If empty, isolate the current execution and throw a browser redirect targeting the Central SSO Web App URL while passing the distinct app identifier: `?app_id=YOUR_APP_ID`[cite: 23].
3. **Token Capture & Backend Verification**:
   * [cite_start]Use Vue routing capabilities to parse incoming query strings and capture the returned `token` parameter[cite: 30, 48].
   * [cite_start]Pass the token parameter to the client application's underlying GAS backend[cite: 48].
   * [cite_start]The client backend triggers `UrlFetchApp.fetch()` via a secure **POST** request toward the Central SSO endpoint containing its unique `client_token` and the ephemeral user `auth_token`[cite: 31, 45, 46].
4. **Otorisasi Resolution (Local App Domain)**:
   * [cite_start]Once the profile payload arrives successfully from the SSO server, save user context inside the local app session[cite: 34].
   * [cite_start]Evaluate internal roles or specialized authorization matrices defined locally within the client codebase to toggle specific application feature flags[cite: 2, 34].

---

## 4. Strict Security Directives
* [cite_start]**Zero Plain-Text Accounts**: Passwords must never exist as plain text[cite: 49]. [cite_start]Use irreversible SHA-256 hashing models exclusively[cite: 50, 53].
* [cite_start]**Strict Parameter Hygene**: Sensitive parameters like passwords, hashes, or phone numbers must never pass directly through browser query strings[cite: 35]. [cite_start]Use `UrlFetchApp` POST payloads over server boundaries instead[cite: 36, 45, 46].
* [cite_start]**Token Invalidation**: Every generated `auth_token` must be single-use and destroyed immediately upon backend lookup[cite: 33].
* [cite_start]**Environment Isolation**: Always maintain encryption variables inside **Script Properties** rather than leaving plain hardcoded keys within the code editor environment[cite: 56, 57].