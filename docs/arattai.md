# Arattai messaging

Arattai sits next to WhatsApp under **Communications** (`/whatsapp/arattai/*`), with the
same four screens: Live Chats, Broadcast, Audience Lists and History. Settings live in
**Settings → Arattai Config**.

Two modes, picked in Settings → Arattai Config:

**Sandbox** (the default) sends nothing. Sends get made-up message IDs, three sample templates
are offered, and delivery receipts are simulated.
- Numbers ending in `0000` always fail.
- Numbers ending in an even digit show as read.
- Admins can simulate a parent's incoming message from the config page.

**Live** uses the [Arattai Business Platform API](https://www.arattaibusiness.in/business-platform/developers/introduction/)
(released October 2026). See "Going live" below.

## How it fits together

- `frontend/src/utils/messagingChannels.js`: one entry per channel (collections, callables,
  labels, pricing). The `WhatsApp*.jsx` screens take a `channel` and read everything from it.
- `functions/src/arattai/provider.js`: the provider contract and the sandbox.
- `functions/src/arattai/live.js`: the only code that knows Arattai's API (OAuth, sends,
  templates, webhook format and signature). Tested in `live.test.js`
  (`cd functions && node --test src/arattai/live.test.js`).
- `functions/src/arattai/store.js`: data paths, applying incoming messages and receipts.
- `functions/src/arattai/send.js`: callables `checkArattaiAccount`, `syncArattaiTemplates`,
  `sendArattaiMessage`, `sendArattaiBroadcast`, `simulateArattaiInbound`.
- `functions/src/arattai/webhook.js`: `arattaiWebhook`, closed until a webhook token is saved
  (`?token=` or `X-Webhook-Token`). With a signing key saved, it also checks Arattai's
  `X-Hub-Signature-256`. It answers Arattai's `?challenge=` check, and also accepts the
  neutral `{ events: [...] }` body (see provider.js) for testing. Also
  `pruneArattaiDebugLog`, which keeps 30 days.

Permissions use the `arattai_sender` module:
- `access`: live chats
- `broadcast`: send broadcasts
- `manage`: lists, history, templates and settings

The server checks the specific action, unlike WhatsApp, where any one of the three passes.
No role gets it by default; grant it per user or per permission group.

## Staff notifications (moving off Cliq)

The internal notifications the Cliq bot sends can go to Arattai too:
- approval requests and outcomes
- access requests
- Tamil birthdays

`functions/src/notify/dispatch.js` sends each one to every channel that's on:
- Cliq: Settings → Cliq Bot
- Arattai: Settings → Arattai Config → Staff notifications, stored in `configs/arattai_notify`

Each send is written to `notification_log`, which is admin-only and kept for 90 days. The settings page lists recent sends with what Cliq and Arattai each did.

- **Admins' posts** (what Cliq puts in `#approvals`) go to the Arattai group in `groupId`, or, with no group, to each admin directly.
- **Direct messages** go to the staff member's phone. The number comes from `phoneMap` (`app email = phone`), then the phone on their staff record, then `allowed_users.phone`. Anyone without a number is skipped and listed in the log.
- **Message text:** `shared/plainMessage.mjs` turns the Cliq message into plain title, text and links (tested in `frontend/src/utils/plainMessage.test.js`), so the wording stays the same.
- **Approve / Send back** buttons still only work in Cliq. On Arattai, requests carry the "Review in app" link. The plain message keeps the buttons as `actions` with Cliq's keys, so if Arattai's API supports buttons, `sendNotification` can render them, and an endpoint like `cliqAction` (reusing `decisionProblem`) can apply them.

**Moving over:**
1. Fill in phone numbers and, optionally, the group. Then use "Check who gets them" and "Send a test".
2. Turn Arattai on while Cliq stays on, and watch the log for a few days.
3. Turn Cliq off in Settings → Cliq Bot.

The Cloud Functions keep their `cliq…` names so deploys don't recreate them.

## How Live differs from WhatsApp

- **Parents are Arattai user IDs, not phone numbers.** A template sent to a phone returns the
  parent's user ID; incoming messages carry only the user ID and name. `store.js` keeps both
  directions (`arattai_users`, `arattai_phone_users`, server-only in RTDB). A parent who
  messages first, before the school has ever sent them a template, has no known number: their
  chat is keyed `u<userId>` and shows "Number not shared".
- **Free text only within 48 hours** of the parent's last message (and it's free). Anything
  else needs an approved template, sent from Broadcast. Text replies are limited to 2,000
  characters.
- **Templates have named placeholders** (`{{student_name}}`). Sync renumbers them to `{{1}}`,
  `{{2}}`, in first-use order, so Broadcast works unchanged, and keeps the names in the
  template's `arattai` field for sending. Only approved, enabled templates are synced.
- **Header images from Broadcast are ignored.** Arattai uses the media saved on the template.
- **Limits:** 1,000 different recipients a day until Arattai raises it on request, 15
  messages a minute to one person, 80 a second overall.
- **Message IDs** are our own `ack_key`s, which Arattai echoes in every receipt.
- **Staff notifications** need a template, since staff rarely message the school first: an
  approved Transactional template with one placeholder (the whole message) or two (title,
  then details), picked under Staff notifications. Live can't post to groups, so leave the
  group ID empty.

## Pricing

From [arattaibusiness.in/pricing](https://www.arattaibusiness.in/pricing.html), November 2026:

- **Educational institutions:** 1 million free Transactional and Authentication messages a month.
- **Every account:** 5,000 free Transactional and Authentication messages a month.
- **After that:** ₹0.06 per Transactional or Authentication message, ₹0.50 per Promotional message.
  Promotional messages are never free.
- **Replies within the 48-hour window:** free.

So school notices should be Transactional templates. `rates` in `messagingChannels.js` holds
the list prices for Broadcast's estimate. The education allowance isn't something the API
sets: ask for it when applying, or write to support@arattaibusiness.in.

## Going live

1. **Get access.** Submit the [early-access form](https://forms.zohopublic.in/arattai1/form/ArattaiBusinessPlatformEarlyAccess/formperma/HvlX4_43L8hcQ0ftHfbflIP7_qCvOga7ooooW4Zw1Jg)
   and mention it's a school (for the education allowance). Verification needs one legitimacy
   document (GST, PAN, MSME, Udyam, Shops & Establishment, incorporation certificate or a
   utility bill) and the representative's ID (front and back) plus an authorization letter.
2. **OAuth client.** At https://api-console.arattai.in create a client (Self Client is the
   simplest, if offered; otherwise Server-based with any redirect URI). Get a grant code for
   these scopes, with `access_type=offline`:
   `ArattaiBusiness.messages.CREATE,ArattaiBusiness.messagetemplates.READ,ArattaiBusiness.phonenumbers.READ,ArattaiBusiness.customerdata.READ,ArattaiBusiness.miniapps.CREATE`
   (the last two are for the [parent mini app](#parent-mini-app))
   (URL: `https://accounts.arattai.in/oauth/v2/auth?response_type=code&client_id=…&scope=…&redirect_uri=…&access_type=offline&prompt=consent&tenant=ArattaiBusiness`).
   The code lasts one minute; exchange it straight away:
   `curl -X POST "https://accounts.arattai.in/oauth/v2/token?grant_type=authorization_code&code=…&client_id=…&client_secret=…&redirect_uri=…"`
   and keep the `refresh_token`.
3. **IDs.** From the Business Platform: Company ID, Business ID and the Business Number ID.
4. **Settings → Arattai Config:** choose Live, fill in the six fields, generate a webhook
   token, Save. The status card should say Connected with the school's name and number.
5. **Webhook.** In the Business Platform, add a webhook for the business number with the URL
   shown on the config page (it includes the token). Subscribe to `chat.message.received`,
   `chat.message.sent`, `chat.message.delivered`, `chat.message.read`, `chat.message.failed`.
   Create and select a secret key, and paste it into "Webhook Signing Key".
6. **Templates.** Create and get Transactional templates approved in the Platform, then
   click Sync Message Templates. Syncing removes the sandbox templates.
7. **Test** with a test recipient before broadcasting to parents.

## Parent mini app

Arattai can open a web page inside a chat. Ours is `https://abhishri-academy.web.app/arattai-app`.
When a parent taps it, Arattai appends `?user_data_key=<key>` (single use, valid one minute).
The `startArattaiMiniApp` function (functions/src/arattai/miniapp.js) exchanges the key for the
parent's name and phone (`GET /api/v1/miniappsessions/{key}`), closes the session (`DELETE`), and
if that number is a parent on a student record, returns a Firebase custom token. The page signs in
with it and shows the normal parent portal, with no SMS code. A number not on any student gets a
"not linked, contact the school" screen and no token.

- The session is uid `arattai_<digits>` with claims `portalPhone` and `via: "arattai"`. It has no
  email and is treated exactly like a phone-code parent (never as staff) by the rules, the
  callables and the app.
- **Scopes:** `ArattaiBusiness.customerdata.READ` and `ArattaiBusiness.miniapps.CREATE` were added.
  The refresh token must be re-issued with them (repeat step 2 of Going live and paste the new
  Refresh Token in Settings → Arattai Config), otherwise the exchange fails.
- **How parents open it:** add a URL button pointing at the page to a template, or register it as
  the mini app on the pinned business number so it appears in the chat.
