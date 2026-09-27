# Zoho Cliq bot

The app posts to Zoho Cliq whenever something is waiting on someone. Cliq and the web app's notification bell follow the same list, `functions/src/shared/notifications.mjs`, so they cover the same things with the same wording and links:

| Notification | Web app bell | Cliq |
| --- | --- | --- |
| Access request (someone signed in who isn't set up yet) | Admins | The admins' channel, as each arrives |
| A menu or daily report is waiting for approval | Admins | The admins' channel, with Approve / Send back |
| Your request was approved or sent back | The teacher who asked (approvals for 3 days; send-backs until re-sent) | A DM to that teacher, and a note in the channel |
| New in-app feedback | Admins | The admins' channel |
| Tamil birthdays today | Anyone who can see the student or staff directory | One post in the channel at 7:30 am |
| Unread WhatsApp live-chat messages | WhatsApp users | Not sent: the count changes with every message and would flood the channel |

To add a notification, add it to `notifications.mjs` first, then show it in `frontend/src/utils/bellEntries.js` and send it from `functions/src/cliq/triggers.js`. `frontend/src/utils/notifications.test.js` checks that the two say the same thing.

Each message has a button that opens the right screen in the app. Once the two Cliq functions below are set up, requests also get **Approve** and **Send back** buttons, so admins can decide without leaving Cliq. Send back asks for a note. Every decision, in the app or in Cliq, is noted in the channel and DMed to the teacher.

## Setup (once, in Cliq)

1. **Create the bot:** Cliq > Bots & Tools > Bots > Create Bot. Name it (e.g. "Abhishri"), and note its **unique name** (e.g. `abhishribot`).
2. **Create the admins' channel** (e.g. `#approvals`), add the admins, and add the bot to it. Note the channel's **unique name** from Channel info.
3. **Generate a webhook token:** Cliq > Bots & Tools > Webhook Tokens > Generate. Use an account that is a member of that channel. The token acts as that account, so keep it secret.
4. **Teachers subscribe to the bot:** each teacher searches for the bot in Cliq and clicks Subscribe. The bot can only DM people who have subscribed. Cliq matches them by the email they sign in to the app with.

## Setup (in the app)

Settings > **Cliq Bot**: choose the data centre (`cliq.zoho.in` for India), then paste the bot unique name, channel unique name and webhook token. Click **Save and send a test**. It posts to the channel and DMs you, and shows any error from Cliq. When both arrive, tick **Send notifications to Cliq** and save.

The settings are stored in `configs/cliq`, which only admins can read or write.

## Approve and Send back in Cliq (optional)

1. In Settings > Cliq Bot, fill in **Cliq function owner** (your Cliq email), keep the button function name `abhishriapproval`, click **Generate** for the action secret, and save. The page then shows the code for both functions, with the endpoint and secret filled in.
2. In Cliq, go to Bots & Tools > Functions and create a **Button** function named `abhishriapproval`. Paste the "Button function" code and save.
3. Create a **Form** function named `abhishrisendback`. Paste the "Form function" code into its **Submit Handler** and save.
4. If an admin signs in to Cliq with a different email from the app, add them under **Different Cliq emails** (`cliq email = app email`).

Clicking a button runs the Cliq function, which POSTs to the app's `cliqAction` endpoint with the secret and the clicking user's Cliq email. The app then checks each decision:
- the clicker is an admin in the app;
- the request is still pending;
- it is the same submission the message was about, so an old message's button can't approve a newer version;
- a Send back includes a note.

The decision is saved exactly like one made in the app, including the audit log (marked `via: cliq`).

The first time each admin clicks Approve or Send back, Cliq asks them to allow Abhishri Bot to read their profile (for the email) and to call the app's endpoint. The permission lasts 60 days, after which Cliq asks again.

## This school's setup

- **Cliq org:** India data centre (`cliq.zoho.in`).
- **Bot:** Abhishri Bot (`abhishribot`), available to the whole organisation.
- **Channel:** `#approvals`, invite-only. Members are Vineetha, Sibhimanyu, Venkatesh and the bot.
- **Cliq functions:** `abhishriapproval` (Button) and `abhishrisendback` (Form), both owned by `vineetha@abhishriacademy.in`.
- **Different Cliq emails:** the admins sign in to Cliq with `@abhishriacademy.in` addresses but to the app with Gmail, so each is listed there. `staff@abhishriacademy.in` is the same in both and needs no entry.

## How it works

- `functions/src/cliq/triggers.js`: Firestore triggers on `weekly_menus`, `daily_reports` and `feedback`, plus `sendCliqTest`, the admin-only callable behind the test button.
- `functions/src/shared/cliqMessages.mjs`: which writes are worth a message, and the wording. Tested in `frontend/src/utils/cliqMessages.test.js`.
- `functions/src/cliq/actions.js`: the `cliqAction` endpoint behind the Approve / Send back buttons.
- `frontend/src/utils/cliqDeluge.js`: the Deluge source for the two Cliq functions.
- `functions/src/cliq/client.js`: the Cliq API calls. Channel posts use `channelsbyname/{channel}/message?bot_unique_name=…`, and DMs use `bots/{bot}/message` with `userids` set to emails.

Sending is best-effort. A Cliq error is logged (search the function logs for "Cliq:") and never blocks or repeats the save. No message is sent for an admin's own save, which counts as approved straight away.
