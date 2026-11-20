# Earmark reminder agent (ElevenLabs Agents, browser + Twilio)

One ElevenLabs agent, **Earmark reminder**, does both calls:

- **Browser call** (works now): "Call me now" on `/gift/:id` opens a voice call in the page with `@elevenlabs/client`.
  The server mints a short-lived conversation token (`GET /api/calls/session?giftId=…` → ElevenLabs
  `GET /v1/convai/conversation/token`), so the API key never reaches the browser.
- **Phone call** (written, untested until a Twilio number exists): the 7-day and 4-day reminder job and
  `POST /api/calls/now` call `POST /v1/convai/twilio/outbound-call` when `ELEVENLABS_PHONE_NUMBER_ID` is set.

Without `ELEVENLABS_API_KEY` / `ELEVENLABS_AGENT_ID`, "Call me now" plays the recorded sample in the page and says the call
is in demo mode.

## Create or update the agent

```sh
cd earmark-app
npm run elevenlabs:agent      # idempotent: creates the agent + tools, or updates them if ELEVENLABS_AGENT_ID is set
```

`server/elevenlabs/create-agent.ts` writes `ELEVENLABS_AGENT_ID` into `earmark-app/.env` and the repo root `.env`.
It never prints the key. Re-run it after changing the prompt, or after setting `PUBLIC_API_URL`.

### Config (as created by the script)

- Name: `Earmark reminder`
- Voice: `EXAVITQu4vr4xnSDxMaL` (the same voice as the recorded sample on the landing page)
- First message:

  ```
  Hey {{receiver_name}}, your {{amount}} {{item}} gift expires in {{days_left}} days. Want me to buy it for you?
  ```

  With Alex's gift: "Hey Alex, your $45 snow shovel gift expires in 4 days. Want me to buy it for you?"
- Dynamic variables: `receiver_name`, `amount`, `item`, `days_left`, `gift_id`, `channel` (`"phone"` | `"browser"`).
  The server fills them from the chain for every call (`server/calls.ts → callVariables`).
- Overrides enabled: `agent.first_message`, `agent.language`, `agent.prompt.prompt`, `tts.voice_id`.
- System prompt:

  ```
  You are Earmark, calling {{receiver_name}} about a locked gift: {{amount}} that can only buy a {{item}}, gift number {{gift_id}}. It expires in {{days_left}} days; unused, it goes back to the sender.
  Ask if they want you to buy the {{item}} now.
  If they say yes: request the purchase with gift_id "{{gift_id}}". This call's channel is "{{channel}}": if it is "phone", use request_purchase; if it is "browser", use request_purchase_in_app. Use exactly one tool, once.
  After the tool returns, tell them to approve it in the Earmark app with their passkey. Never say the purchase is done or paid; it only happens after they approve.
  If they say no or later, say it's still there until it expires, and say goodbye.
  You cannot change the item, store, amount or person. Never ask for card numbers, passwords or codes. Keep every reply to one or two short sentences.
  ```

### Tools

| Tool | Type | Used when | What it does |
|---|---|---|---|
| `request_purchase` | webhook, `POST {PUBLIC_API_URL}/api/agent/purchase-request`, body `{ gift_id }`, optional header `x-earmark-tool-secret` | `channel == "phone"` | creates a pending purchase request |
| `request_purchase_in_app` | client tool, params `{ gift_id }`, expects a response | `channel == "browser"` | the gift page POSTs the same request (`source: "browser"`) and refreshes |

Neither tool moves money. The gift page shows "Buy the snow shovel now?", the receiver approves with their passkey,
the browser gets the order signed by the store's `POST /earmark/sign`, and the receiver's wallet calls `redeem` on Arc.

## Adding a Twilio number later (phone calls)

1. In `/Users/jorgeacosta/earmark/.env` and `earmark-app/.env`, fill `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
   `TWILIO_PHONE_NUMBER` (E.164) and `DEMO_RECEIVER_PHONE` (the receiver's phone, E.164).
2. Expose the server (e.g. `cloudflared tunnel --url http://localhost:8787`) and set `PUBLIC_API_URL` to that URL.
3. Run:

   ```sh
   npm run elevenlabs:import-twilio   # POST /v1/convai/phone-numbers → writes ELEVENLABS_PHONE_NUMBER_ID to both .env files
   npm run elevenlabs:agent           # points request_purchase at PUBLIC_API_URL
   ```

4. Restart the server. `/api/config` now reports `features.calls = "phone"`; the reminder job calls at 7 and 4 days
   before expiry (once each), and "Call me now" places a phone call (with a link to talk in the browser instead).

Outbound call body sent by the server:

```json
{
  "agent_id": "<ELEVENLABS_AGENT_ID>",
  "agent_phone_number_id": "<ELEVENLABS_PHONE_NUMBER_ID>",
  "to_number": "<contact phone or DEMO_RECEIVER_PHONE>",
  "conversation_initiation_client_data": {
    "dynamic_variables": { "receiver_name": "Alex", "amount": "$45", "item": "snow shovel", "days_left": "4", "gift_id": "1", "channel": "phone" }
  }
}
```

Until then the reminder job logs `phone not configured` and skips the call.
