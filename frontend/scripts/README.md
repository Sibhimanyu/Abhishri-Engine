# Operational scripts

One-off Node scripts for seeding and inspecting data. They are **not** part of the
app: nothing imports them, Vite never bundles them, and they are not run by CI.

**They talk to PRODUCTION.** There is no staging project. `seed_calendar.js` and
`seed_teacher.js` *write* data. Read the script before running it.

Credentials come from the environment, never from the files:

```bash
cd frontend/scripts
SEED_ADMIN_EMAIL=you@example.com SEED_ADMIN_PASSWORD=... node seed_calendar.js
```

The Firebase web config inlined in each script is the public client config (it
identifies the project to the SDK; access is enforced by Auth + security rules).

| script | what it does | writes? |
|---|---|---|
| `test_db.js` | signs in and reads a few docs — connectivity/permission check | no |
| `list_staff.js` | prints the staff collection | no |
| `seed_calendar.js` | seeds `school_calendar` from a local JSON file | **yes** |
| `seed_teacher.js` | creates a single teacher record in `allowed_users` | **yes** |

Run them with `node` from this directory; they use the `firebase` package from
`../node_modules`, so run `npm install` in `frontend/` first.
