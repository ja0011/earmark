# Earmark screens, in order

Every screen of Earmark and Hartwell Supply, captured from the real site running one live $0.45 gift on Arc testnet (Maya → Alex).
Desktop shots are 3840×2160 (1920×1080 at 2x). Phone shots are in `mobile/` at 1170×2532 (390×844 at 3x). "full" files are whole-page tall images.
Regenerate: `node video/screens/capture.mjs` (spends one $0.45 test gift).

## 1. Landing page

- `01-landing-loader.png`: Loading screen (the receipt tears away)
- `02-landing-hero.png`: Hero: "Money with a purpose" headline and the wrapped present
- `03-landing-hero-hover.png`: Hovering the present: a flashlight reveals the receipt inside
- `04-landing-hero-receipt.png`: "Show the receipt": the present opens to the gift receipt
- `05-landing-problem-chat.png`: The problem: Maya sends $45 for a shovel, Alex spends it on pizza
- `06-landing-problem-title.png`: "You meant a shovel." Money doesn't remember why you sent it
- `07-landing-how-step1.png`: How it works, step 1. Lock: Maya locks $45 for one shovel at one store
- `08-landing-how-step2.png`: How it works, step 2. Shop: Alex buys it at Hartwell Supply with one tap
- `09-landing-how-step3.png`: How it works, step 3. Change: the $5.02 left over goes straight to Alex
- `10-landing-rules.png`: The rules: only this item, only this store, only this person + the fingerprint
- `11-landing-rules-fingerprint.png`: The rules, continued: the fingerprint hash
- `12-landing-call.png`: The call: ElevenLabs reminder ("your shovel gift expires in four days")
- `13-landing-call-playing.png`: The call playing: transcript types in sync, waveform moves
- `14-landing-try.png`: Try it: links into the app
- `15-landing-footer.png`: Footer
- `16-landing-full-page.png`: The whole landing page in one tall image (1x)

## 2. Maya sends a gift

- `17-maya-profile-before.png`: Maya's profile before sending: USDC balance, gifts, activity
- `18-send-signed-out.png`: Send page, signed out: sign in as Maya/Alex (passkey) or connect MetaMask
- `19-send-signed-in.png`: Send page, signed in as Maya (balance chip top right)
- `20-send-typed.png`: Maya types the gift in plain English
- `21-send-reading.png`: The Claude agent reads it (finding the person, store and item)
- `22-send-review-card.png`: Review card: item, store, who, amount, expiry, fingerprint
- `23-send-locking.png`: Locking: approving USDC and creating the gift on Arc
- `24-send-locked.png`: Locked: the USDC is in the Earmark contract, with the transaction link

## 3. Alex gets the gift

- `25-alex-notification.png`: Alex's screen: live notification from the QuickNode Stream ("Maya sent you $0.45…")
- `26-alex-profile-gift-waiting.png`: Alex's profile: the gift is waiting for him
- `27-gift-page.png`: Gift page: what it buys, where, countdown, "Shop at Hartwell" and "Call me now"
- `28-gift-page-full.png`: Gift page, full length

## 4. At the store (Hartwell Supply)

## 4. At the store (Hartwell Supply)

- `29-store-home.png`: Hartwell Supply: a separate store that installed the Earmark plugin
- `30-store-home-full.png`: Hartwell Supply, full catalogue
- `31-store-cart-added.png`: Alex adds a drill and the snow shovel
- `32-store-checkout.png`: Checkout with the "Pay with Earmark gift" button
- `33-popup-pick-gift.png`: Earmark checkout window: pick which gift to use
- `34-popup-refused.png`: Earmark window: refused, this gift only buys the snow shovel
- `35-store-refused.png`: Store checkout: the drill isn't allowed
- `36-store-checkout-shovel.png`: Drill removed: just the $0.40 shovel
- `37-popup-confirm.png`: Earmark window: store signed the real price. Pay $0.40, $0.05 change to Alex
- `38-popup-paying.png`: Paying: redeeming the gift on Arc
- `39-store-receipt.png`: Store receipt: paid with the Earmark gift, change to Alex, transaction link
- `40-store-receipt-full.png`: Store receipt, full length

## 5. After: change, profiles and activity

- `41-gift-page-bought.png`: Gift page after: Bought, $0.05 change went to Alex
- `42-alex-profile-after.png`: Alex's profile: balance up by the change, activity timeline
- `43-alex-profile-after-full.png`: Alex's profile, full length
- `44-maya-profile-after.png`: Maya's profile: "Alex bought the shovel", gift marked Bought
- `45-maya-profile-sent.png`: Maya's "You sent" tab

## 6. USDC transactions on Arc (explorer)

- `46-explorer-create-gift.png`: Arc explorer: createGift, $0.45 USDC moves from Maya into the Earmark contract (0x0c38f1d443f59c9e0c36380929aac27e081f999ea6eca7b714783622f4158f64)
- `47-explorer-create-gift-full.png`: Arc explorer: createGift, $0.45 USDC moves from Maya into the Earmark contract, full page
- `48-explorer-create-gift-transfers.png`: Arc explorer: createGift, $0.45 USDC moves from Maya into the Earmark contract: token transfers tab
- `49-explorer-redeem.png`: Arc explorer: redeem, $0.40 USDC to the store and $0.05 change to Alex (0x0fee73ea9fdb067b594b305ed96994e444237e828375286eb887a727fcbb0544)
- `50-explorer-redeem-full.png`: Arc explorer: redeem, $0.40 USDC to the store and $0.05 change to Alex, full page
- `51-explorer-redeem-transfers.png`: Arc explorer: redeem, $0.40 USDC to the store and $0.05 change to Alex: token transfers tab
- `52-explorer-contract.png`: Arc explorer: the Earmark contract and its transactions

## 7. For stores

- `53-stores-top.png`: For stores: "Add Earmark in under an hour"
- `54-stores-step1.png`: For stores, scrolled (1): connect, button snippet, signer snippet
- `55-stores-step2.png`: For stores, scrolled (2): connect, button snippet, signer snippet
- `56-stores-full.png`: For stores, full page

## 8. Phone size (390x844)

- `mobile/57-m-landing-hero.png`: Phone: landing hero
- `mobile/58-m-landing-chat.png`: Phone: the chat
- `mobile/59-m-landing-how.png`: Phone: how it works
- `mobile/60-m-landing-rules.png`: Phone: the rules
- `mobile/61-m-landing-call.png`: Phone: the call
- `mobile/62-m-send.png`: Phone: send page
- `mobile/63-m-profile.png`: Phone: profile sign-in
- `mobile/64-m-stores.png`: Phone: for stores
- `mobile/65-m-store.png`: Phone: Hartwell Supply
