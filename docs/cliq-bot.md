# Zoho Cliq bot

The app posts to Zoho Cliq whenever something is waiting on someone:

| Event | Where it goes |
| --- | --- |
| A teacher sends a weekly menu or daily report for approval | The admins' channel |
| An admin approves it, or sends it back with a note | A direct message to that teacher |
| Someone sends feedback from the in-app widget | The admins' channel |

Each message has a button that opens the right screen in the app. Decisions are still made in the app, where `firestore.rules` enforces who can approve.

## Setup (once, in Cliq)

1. **Create the bot:** Cliq > Bots & Tools > Bots > Create Bot. Name it (e.g. "Abhishri"), and note its **unique name** (e.g. `abhishribot`).
2. **Create the admins' channel** (e.g. `#approvals`), add the admins, and add the bot to it. Note the channel's **unique name** from Channel info.
3. **Generate a webhook token:** Cliq > Bots & Tools > Webhook Tokens > Generate. Use an account that is a member of that channel. The token acts as that account, so keep it secret.
4. **Teachers subscribe to the bot:** each teacher searches for the bot in Cliq and clicks Subscribe. The bot can only DM people who have subscribed. Cliq matches them by the email they sign in to the app with.

## Setup (in the app)

Settings > **Cliq Bot**: choose the data centre (`cliq.zoho.in` for India), then paste the bot unique name, channel unique name and webhook token. Click **Save and send a test**. It posts to the channel and DMs you, and shows any error from Cliq. When both arrive, tick **Send notifications to Cliq** and save.

The settings are stored in `configs/cliq`, which only admins can read or write.

## How it works

- `functions/src/cliq/triggers.js`: Firestore triggers on `weekly_menus`, `daily_reports` and `feedback`, plus `sendCliqTest`, the admin-only callable behind the test button.
- `functions/src/shared/cliqMessages.mjs`: which writes are worth a message, and the wording. Tested in `frontend/src/utils/cliqMessages.test.js`.
- `functions/src/cliq/client.js`: the Cliq API calls. Channel posts use `channelsbyname/{channel}/message?bot_unique_name=…`, and DMs use `bots/{bot}/message` with `userids` set to emails.

Sending is best-effort. A Cliq error is logged (search the function logs for "Cliq:") and never blocks or repeats the save. No message is sent for an admin's own save, which counts as approved straight away.
