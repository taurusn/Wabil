# Untitled — UI Build Spec (Nocturnal)
**Target:** React Native · Expo (managed) · TypeScript. **Pure React Native** — no hand-written Swift/Objective-C. Native iOS capabilities (Keychain, later push) come from Expo modules, not custom native code.
**Scope:** Pull-first MVP. 4 screens: Welcome · Connect Inbox · Chat · Connections. No proactive notifications (v2).

---

## 0 · CONTEXT PROMPT (paste this first)

> Build the iOS UI for a personal AI assistant app. The app is a single, calm, characterful "face" the user texts; all real work happens on a backend (out of scope here — build UI only, with mocked data). The mood is **nocturnal**: a dark, quiet, watchful presence. The brand mark is a softly glowing, slowly breathing **orb**. The assistant speaks in **lowercase**, warm but terse. Build it in **pure React Native (Expo, TypeScript)** — no custom Swift; rely on Expo modules for any native iOS capability. Use hand-written `StyleSheet` styling — **do NOT use NativeWind, Tailwind, or any utility-CSS framework.** Use the exact design tokens below. Every screen must feel intentional and spacious; no default-looking SaaS chrome.

---

## 1 · DESIGN TOKENS

### Color
```
bg.base        #0B0D13   // app background base
bg.glow        radial-gradient 135% 75% at 72% 6% → #1A2536 0%, #0B0D13 54%
text.bright    #EEF2FA   // headings, hero serif
text.primary   #DDE4F1   // assistant statements
text.secondary #8492AC   // assistant prose, subtitles
text.dim       #6B7488   // de-emphasized clauses
text.muted     #5D6A85   // section labels, captions
accent.glow    #6BA8FF   // glyphs, send, links
accent.hi      #AEE0FF   // orb highlight
accent.coreA   #4F8FE0   // orb mid
accent.coreB   #2A4D8F   // orb edge
btn.gradA      #3F7FDC   // primary button top
btn.gradB      #2C5FB0   // primary button bottom
hairline       rgba(140,170,220,0.16)
surface.soft   rgba(120,150,200,0.05)   // ghost fills, cards
bubble.me      rgba(120,150,200,0.12)   // user bubble fill
bubble.meEdge  rgba(140,170,220,0.18)
success        #5FD29A   // connected status dot
glow.blue      rgba(96,165,250,0.5)     // orb/button shadow color
```

### Typography
- **Display serif: Fraunces** (`@expo-google-fonts/fraunces`), weights 400 & 500. Used for: hero lines, screen titles, wordmark. Optical size large, slightly tight tracking (-0.01em).
- **UI/body: Inter** (`@expo-google-fonts/inter`), weights 300/400/500/600.
  - Assistant prose: **Inter 300**, lowercase.
  - Big assistant statement: Inter 300, 21px, line-height 1.4 (OR Fraunces 400 for hero moments).
  - UI labels/buttons: Inter 500/600.
- Casing: assistant chat is **lowercase**; UI labels are sentence case; section labels are UPPERCASE with 0.16em letter-spacing.

### Geometry
```
radius.bubble 16  (tail corner 5)
radius.card   15
radius.button 16
radius.pill   12
radius.field  22
pad.screen    22–28
gap.chat      19
```

### Elevation / glow
- Primary button: gradient (gradA→gradB) + shadow `glow.blue` radius 24 y8, + inset top highlight rgba(255,255,255,0.18).
- Orb: layered blue glow (see component).
- Status dot: 8px blur glow in its own color.

### Motion
- **Orb breathing:** loop 4.5s ease-in-out, glow radius/intensity oscillates ~±20%, subtle scale 1.0→1.03. Use Reanimated.
- **Assistant message entrance:** fade 0→1 + translateY 8→0, 280ms ease-out.
- **Taps:** `expo-haptics` light impact on send and primary CTAs.
- Keep everything slow and calm. No bouncy springs.

---

## 2 · CORE COMPONENTS

### `<Orb size />` — brand mark & "listening" indicator
- Circle filled with a **radial gradient** (`react-native-svg` `RadialGradient`): center(36%,30%) `accent.hi` → `accent.coreA` 55% → `accent.coreB` 100%.
- Surrounding **glow**: layered shadow / blurred halo in `glow.blue`. On iOS use animated `shadowRadius`+`shadowOpacity`; cross-platform fallback: a blurred absolutely-positioned circle behind it.
- **Breathing** animation always on (Reanimated). 
- Sizes used: **96** (Welcome hero), **38** (Connect header), **13** (Chat header, inline).

### Buttons
- `Button.primary`: gradient fill (`expo-linear-gradient`), text Inter 500 15px #FFF, radius 16, glow shadow, full width, pad 15.
- `Button.ghost`: fill `surface.soft`, 1px `hairline` border, text #CDD6E8, optional 22px leading icon chip.

### Chat atoms
- `AssistantStatement`: large text, `text.primary` with optional `.dim` spans. No bubble.
- `AssistantProse` ("soft line"): Inter 300 14px `text.secondary`, line-height 1.55, with a leading `⌁` glyph in `accent.glow`. No bubble.
- `UserBubble`: fill `bubble.me`, 1px `bubble.meEdge`, radius 16 (bottom-right 5), Inter 14px `#D4DDEE`, max-width 76%, right-aligned.
- `EmailPill`: inline chip, `surface.soft` fill + hairline border, radius 12, 📩 + subject, `text.primary`.
- `InputBar`: pill field, hairline border, `surface.soft` fill, placeholder `text.dim` "say something…", trailing send glyph `◍` in `accent.glow`.

### Settings atoms
- `Card`: hairline border, radius 15, `surface.soft` fill, pad 14, row layout.
- `Toggle`: custom 42×25, ON = gradient + glow, OFF = `rgba(120,150,200,0.14)`; 19px white knob.
- `StatusDot`: 7px, `success` + glow, with "connected" label.

---

## 3 · SCREEN SPECS

### Screen 01 · Welcome
- Layout: vertically centered body + pinned footer.
- Body (center): `<Orb size=96 />` → 46px gap → hero `h2` Fraunces 400 30px `text.bright`, 2 lines: "A quiet presence / on your inbox." → 18px gap → `p` Inter 300 15px `text.secondary`: "It watches what matters and speaks up only when it counts. The rest, it keeps to itself."
- Footer (bottom, pad 28/30): `Button.primary` "Get started" → 18px gap → centered "already here? **sign in**" (sign in in `accent.glow` 500).

### Screen 02 · Connect Inbox
- Header area: `<Orb size=38 />` centered, 26px gap.
- Title: Fraunces 400 25px center "Connect your inbox".
- Sub: Inter 300 14px center `text.secondary`: "I read only what helps surface what matters. Nothing ever leaves your account."
- Options (34px gap, stacked, 12px gap): `Button.ghost` "Continue with Gmail" (white G chip, red glyph) ; `Button.ghost` "Continue with Outlook" (blue O chip).
- Pinned bottom: privacy line, 🔒 + Inter 300 12px `text.muted`: "Maximum Privacy is on by default. You can revoke access anytime in settings."
- Behavior: tapping a provider launches OAuth (expo-auth-session). On success → navigate to Chat.

### Screen 03 · Chat (the face)
- Header: `<Orb size=13 />` + "Untitled" Inter 500 14px `text.secondary` + " · listening" `text.muted` 300.
- Conversation (inverted FlatList, gap 19, pad 24/22): mix of `AssistantStatement`, `UserBubble`, `AssistantProse`, `EmailPill`. Seed/mock content:
  - statement: "tonight's quiet.\n**nothing urgent.**" (2nd line `.dim`)
  - user: "good. thanks"
  - prose: "one email from sara came in. it can wait till morning, so i'm holding it."
  - user: "what did she say?"
  - pill: 📩 Sara · re: friday plans
  - prose: "she's asking if 7pm still works. no rush, she said whenever."
- Footer: `InputBar`.
- Behavior: send appends a `UserBubble`, shows a 3-dot "thinking" indicator (small `accent.glow` dots, gentle pulse), then a mocked assistant reply with entrance animation.

### Screen 04 · Connections
- Header title: Fraunces 500 24px "Connections".
- Section "INBOXES": `Card` with G chip, "hatim@gmail.com" / "Gmail" subtext, `StatusDot` "connected". Below: dashed `add` row "＋ Add another inbox" in `accent.glow`.
- Section "PRIVACY": `Card` "Maximum Privacy" / "No one but you sees your data" + `Toggle` ON.
- Section "POKES · coming in v2" (muted): `Card` at 0.55 opacity, "Proactive nudges" / "Get pinged when it truly matters" + `Toggle` OFF (disabled).

---

## 4 · NAVIGATION & FLOW
- React Navigation **native-stack**.
- First run: Welcome → Connect Inbox → (OAuth) → Chat.
- Returning: straight to Chat. Chat header → Connections (gear or tap name).
- Status bar style: light content; wrap screens in `SafeAreaView`. The mock's fake status bar is NOT built — use the real OS bar.

---

## 5 · REACT NATIVE IMPLEMENTATION NOTES
- **Expo (managed workflow)** — no `prebuild`/custom native needed for v1.
- **Styling:** `StyleSheet.create` only. NO NativeWind/Tailwind. Centralize tokens in `theme.ts`.
- **Fonts:** `expo-font` + `@expo-google-fonts/fraunces` + `@expo-google-fonts/inter`.
- **Animation:** `react-native-reanimated` v3 (orb breathing, message entrance, thinking dots).
- **Gradients:** orb + bg radial via `react-native-svg` (`RadialGradient`); button linear via `expo-linear-gradient`.
- **Haptics:** `expo-haptics`.
- **Chat list:** custom `FlatList` (inverted), bespoke renderers. Do NOT use react-native-gifted-chat (it fights the custom look).
- **Auth:** `expo-auth-session` (Google/Microsoft OAuth) on Connect screen.
- **Blur (optional):** `expo-blur` for the input bar over content.

## 6 · NATIVE iOS (HANDLED BY EXPO — NO SWIFT TO WRITE)
- **Token storage:** OAuth tokens in **iOS Keychain** via `expo-secure-store` (Keychain-backed under the hood, pure JS API). No custom Swift.
- **Native pickers** (date/time) — not needed in pull-first v1; `@react-native-community/datetimepicker` later if scheduling lands.
- **Push (APNs)** — v2 only; `expo-notifications` handles the APNs registration for you, no Swift required.
- Stay in the **managed workflow**; only eject to native if a future feature genuinely needs it.

## 7 · GUARDRAILS (do NOT)
- No utility-CSS frameworks. Hand-written styles only.
- No default system font everywhere — use Fraunces + Inter as specified.
- No generic SaaS look: respect the spacing, the dark calm, the breathing orb.
- Don't build the fake status bar; use the real one.
- Don't invent extra screens or features — pull-first scope only.
- Verify on a real iOS simulator/device before calling it done; the orb glow + serif rendering must be checked visually.
