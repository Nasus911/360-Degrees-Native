# Local offline development (Windows)

This guide runs the app, Express API, identity processor, and Supabase on one
Windows PC. It does not link the project to a hosted Supabase account. The local
database, Auth users, and Storage files are separate from hosted data; they are
not copied or synchronized. The local env templates do not change production
configuration; keep hosted environments pointed at their hosted Supabase project.
These commands explicitly target the local stack and neither create nor remove
any saved hosted-project link. Do not add `--linked` or `--remote` unless you
intend to operate on hosted Supabase.

## Prerequisites

- Docker Desktop for Windows, using Linux containers, started and healthy.
- The Supabase CLI is a project-local development dependency in `server`. Node.js 20 or later and npm are required; confirm with `node --version` and `npm --version`.
- For Android builds: Android Studio, Android SDK/platform tools, and the required Android build tools.
- For identity verification: Python, Tesseract OCR with English language data, plus the YuNet and SFace model files. See [verification_service/README.md](./verification_service/README.md).
- A phone and PC on the same trusted private Wi-Fi/LAN. Avoid guest Wi-Fi or networks with client isolation.

## Prepare before going offline

The first setup requires internet access to obtain dependencies and images:

1. Run `npx.cmd --prefix server supabase start` once while online. Docker downloads the images for the services enabled in `supabase/config.toml`. Wait for the stack to report healthy; `docker image ls` can show the cached images. Do not clean Docker images or volumes if you need to use the stack offline.
2. Install JavaScript dependencies while online:

   ```powershell
   Set-Location server
   npm.cmd ci
   npx.cmd supabase --version
   Set-Location ..\client
   npm.cmd ci
   ```

3. Prepare Python packages, Tesseract, and face models while online:

   ```powershell
   Set-Location verification_service
   py -m venv .venv
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe download_models.py
   ```

   Install the native Tesseract application and English language data separately;
   the Python package does not include the OCR executable.
4. Configure the local addresses below, then build/install the Android app before
   disconnecting if the phone will need a standalone app. The JavaScript bundle
   embeds Expo `EXPO_PUBLIC_*` values at build time. Rebuild after changing these
   values. `npx.cmd expo run:android` requires the Android SDK and Gradle
   dependencies to be available; let the first build finish while online. Keep
   `client\android\app\build\outputs\apk\debug\app-debug.apk` if you may need to
   reinstall that build while offline.

To confirm readiness before disconnecting, start Supabase, apply pending
migrations, start the services, and launch the app once on the target phone.
Expo development mode also needs the Metro/Expo server running on the PC; a
standalone build does not.

## Configure local addresses and environment files

1. On Windows, run `ipconfig` and note the IPv4 address for the active private
   Wi-Fi or Ethernet adapter. Use that address in place of
   `YOUR_COMPUTER_LAN_IP` below for local Supabase settings. If the router
   changes the address, update those settings.
2. Create env files only when they do not already exist. These guarded commands
   preserve existing local `.env` files:

   ```powershell
   if (-not (Test-Path client\.env)) { Copy-Item client\.env.example client\.env }
   if (-not (Test-Path server\.env)) { Copy-Item server\.env.example server\.env }
   ```

3. In `client/.env`, set:
   - `EXPO_PUBLIC_SUPABASE_URL` to `http://YOUR_COMPUTER_LAN_IP:54321`
   - `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the local publishable/anon key
     shown by `npx.cmd --prefix server supabase status`
   - The Express API URL for EAS Android preview builds is configured only in
     `client/eas.json` under `build.preview.env.EXPO_PUBLIC_API_URL`.
4. In `server/.env`, set `SUPABASE_URL` to the same local Supabase URL,
   `SUPABASE_KEY` to the same local publishable/anon key, and
   `SUPABASE_SERVICE_ROLE_KEY` to the local secret/service-role key shown by
   `npx.cmd --prefix server supabase status`.
5. Keep `IDENTITY_VERIFICATION_URL=http://127.0.0.1:8001` in `server/.env`.
   Express and the processor run on the PC, so the processor should remain bound
   to loopback and must not be exposed to the phone. Set
   `IDENTITY_VERIFICATION_TOKEN` to a new random value; use the same value for
   `VERIFICATION_SERVICE_TOKEN` in the processor terminal. Never place either
   server-only secret in the Expo env file or source control.

The local CLI status command prints local keys. Copy them only into the ignored
local env files; do not publish them in logs, screenshots, or this repository.
Local publishable keys are intended for the app, while secret/service-role keys
must remain server-side.

## Start the local stack

Open separate PowerShell terminals, starting from the repository root.

**Supabase**

```powershell
npx.cmd --prefix server supabase start
npx.cmd --prefix server supabase status
npx.cmd --prefix server supabase migration up
npx.cmd --prefix server supabase migration list
```

The project already has ordered migrations under `supabase/migrations`. The
baseline migration inserts conflict-safe demo branch, product, and inventory
rows. There is no separate seed file or pre-created test account. The local
config intentionally disables the missing seed-file entry; test accounts are
created through Auth instead. Optional analytics/log collection is disabled for
this Windows local stack; it is not required by the app.

Use `npx.cmd --prefix server supabase migration up` after adding migrations to
apply only pending migrations without dropping existing local data. Do not use
`npx.cmd --prefix server supabase db reset` as a routine startup or migration
command: it drops and recreates the local database and can erase local Auth
users and database data. Likewise, do not use
`npx.cmd --prefix server supabase stop --no-backup`; it removes local data
volumes. This guide does not reset or delete any database.

**Express API**

```powershell
Set-Location server
npm.cmd start
```

Express listens on all interfaces at port 3000 so a phone on the LAN can reach
it. Its Supabase URL still points to this PC's local Supabase API.

**Identity processor (optional)**

From another terminal:

```powershell
Set-Location verification_service
$env:VERIFICATION_SERVICE_TOKEN = 'same-random-value-as-server-env'
.\.venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001
```

The identity feature also requires Tesseract, the Python dependencies, and both
downloaded face-model files. Set `TESSERACT_CMD` in this terminal only if
Tesseract is not found through `PATH` or its standard Windows installation
location. The processor is optional for general app testing.

**Expo development server**

```powershell
Set-Location client
$env:EXPO_PUBLIC_API_URL = 'http://YOUR_COMPUTER_LAN_IP:3000'
npm.cmd start
```

Open the app on the phone using the LAN connection. A physical phone must use
the PC's LAN IP for both Supabase (`54321`) and Express (`3000`); `localhost`
on the phone refers to the phone itself. The API URL above is for a development
session only; the EAS preview APK reads it from `client/eas.json`.

For a local USB-connected Android build, set the API URL in that same terminal:

```powershell
Set-Location client
$env:EXPO_PUBLIC_API_URL = 'http://YOUR_COMPUTER_LAN_IP:3000'
npx.cmd expo run:android
```

For an installable APK using the configured static ngrok domain, replace
`YOUR-DOMAIN` in `client/eas.json`, then run:

```powershell
Set-Location client
npx.cmd eas-cli build --platform android --profile preview
```

Download and install the APK from the completed EAS build page. Expo embeds
`EXPO_PUBLIC_*` values when it builds the JavaScript bundle, so rebuild and
reinstall after changing the URL. Do not rely on an old APK: it may contain a
different address.

## Local test accounts and data

- Register a disposable customer account in the app, providing the required
  name, email, password, and contact number. Local email confirmation is off in
  `supabase/config.toml`, so no hosted email account is needed.
- To test admin-only screens, sign up first, then use the local Supabase Studio
  SQL editor at `http://127.0.0.1:54323` to promote only that local profile:

  ```sql
  update public.profiles
  set role = 'admin'
  where email = 'your-local-test-email@example.test';
  ```

  Confirm the matching test email before running the update. Do not run this
  against a hosted project. Create additional test users through the app and
  assign only the local roles required for testing.
- The local database starts empty except for migration-provided reference data.
  Hosted users, passwords, orders, uploaded images, and other hosted records are
  not available locally. Local changes do not update hosted Supabase.
- Product-image and identity-verification buckets/policies are created by the
  migrations. Uploaded files are local test data, not copies of hosted files.

## Ports and Windows Firewall

| Port | Service | Needed from phone? |
| --- | --- | --- |
| TCP 54321 | Supabase API (Auth, REST, Storage) | Yes |
| TCP 3000 | Express API | Yes |
| TCP 8081 | Expo/Metro, development builds only | Yes for development mode |
| TCP 54323 | Supabase Studio | No; use on the PC |
| TCP 54324 | Local email capture (Inbucket) | No; use on the PC |
| TCP 54322 | PostgreSQL | No; local tooling only |
| TCP 8001 | Identity processor | No; loopback only |

If Windows Firewall blocks phone access, create a narrow inbound TCP rule for
ports `3000,54321,8081` on the **Private** profile only, with the remote
addresses limited to `LocalSubnet`. Do not enable it for Public networks or
forward these ports on the router. Do not expose PostgreSQL, Studio, or the
identity processor to the LAN. From an elevated PowerShell terminal, the rule
for app traffic can be created with:

```powershell
New-NetFirewallRule -DisplayName '360 local dev (trusted LAN)' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000,54321,8081 -Profile Private -RemoteAddress LocalSubnet
```

Remove it when no longer needed:

```powershell
Remove-NetFirewallRule -DisplayName '360 local dev (trusted LAN)'
```

Docker publishes PostgreSQL on the PC's interfaces by default. Keep inbound
connections to port `54322` blocked on the Private profile; do not add it to the
allow rule. If another rule already allows it, add a more specific block from
an elevated PowerShell terminal:

```powershell
New-NetFirewallRule -DisplayName '360 local dev block PostgreSQL' -Direction Inbound -Action Block -Protocol TCP -LocalPort 54322 -Profile Private -RemoteAddress LocalSubnet
```

Remove that block only if it was created by this guide and is no longer needed:

```powershell
Remove-NetFirewallRule -DisplayName '360 local dev block PostgreSQL'
```

## Stop services

Stop the Expo, Express, and optional processor terminals with `Ctrl+C`. Then
from the repository root run:

```powershell
npx.cmd --prefix server supabase stop
```

This stops the local services without resetting the database. Keep Docker's
Supabase data volumes if you want to resume with the same local accounts and
test data later.
