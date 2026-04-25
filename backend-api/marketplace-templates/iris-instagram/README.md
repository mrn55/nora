# Iris — Instagram Manager Agent

One OpenClaw agent that runs your Instagram: content calendar, caption drafts, DM and comment reply drafts, trend watching, weekly performance reviews. Controlled from Telegram.

**Iris drafts. You post.** That's the contract. Instagram doesn't like bots, and neither does your audience — so Iris never publishes, never replies, never follows anyone on her own.

## Files

```
~/.openclaw/workspaces/iris-instagram/
├── SOUL.md          # Iris's identity, values, hard limits
├── AGENTS.md        # Operating rules and workflows
├── BRAND.md         # YOUR brand voice, audience, visual rules ← fill this in
├── HEARTBEAT.md     # Scheduled tasks (daily/weekly/monthly)
├── MEMORY.md        # Long-term memory, starts empty
├── calendar/        # Weekly content plans (auto-created)
├── drafts/          # DM and comment reply drafts (auto-created)
├── trends/          # Daily trend scan notes (auto-created)
└── memory/          # Daily notes + performance logs (auto-created)

~/.openclaw/openclaw.json    # Main config (routing, skills, security)
```

## Setup

1. **Copy this bundle to `~/.openclaw/workspaces/iris-instagram/`** and `openclaw.json` to `~/.openclaw/`.

2. **Fill in `BRAND.md`.** This is the single most important step. Without it, Iris writes generic captions that could be any account's. Spend 20 minutes, not 2.

3. **Connect credentials in Nora.** Open the installed agent, go to **Integrations**, and connect the LLM provider, Instagram Graph, and any messaging provider you want Iris to use. Credentials stay in Nora's integration store, not in template files.

4. **Connect the Instagram Graph API.** This requires a Creator or Business account (not Personal) connected to a Facebook Page. Without this, Iris can't pull analytics.

5. **Start OpenClaw.** Message your Telegram bot: "Hey Iris, what's on the plan this week?"

## The Honest Constraints

A few things worth knowing before you run this:

**Instagram's API is restrictive by design.** The Graph API gives you insights, comment reads, and scheduled publishing via the Content Publishing API — but Stories, Reels publishing, DMs, and most engagement actions are either limited or heavily rate-limited. Some workflows will require you to do the final step in the Instagram app.

**Meta Business Suite is your friend.** The easiest working pattern: Iris drafts the caption, hashtags, and visual brief; you upload the asset to Meta Business Suite and schedule it there. The Graph API path is available but brittle for a solo operator.

**DM automation is mostly off-limits.** Meta's rules and the Graph API restrict automated DM replies to specific use cases (e.g. Messenger for business). For a creator or small-brand account, Iris drafting DMs for you to send manually is the safe and compliant path.

**Don't enable any "growth" skills.** Auto-follow, auto-like, auto-comment, engagement pods — these get accounts action-blocked or shadowbanned. The `deniedSkills` list in `openclaw.json` blocks them on purpose. Keep it that way.

## First Week

- **Day 1:** Fill in `BRAND.md`. Message Iris "read my brand file and tell me back what you understood." Correct any drift in her read.
- **Day 2–3:** Ask her to draft 3 captions for posts you've already published. Compare to the real ones. Tune BRAND.md where she's off.
- **Day 4:** Ask for a week plan. Approve or edit.
- **Day 5:** Let her draft the actual posts from the approved plan. You finalize and post.
- **Day 7:** Read her first weekly review. See if her reads match your gut.

Iris gets meaningfully better in week 2–3 as she starts building real memory from what works on your account. The first week will feel generic. That's expected.

## Tuning

- If her captions feel off-voice → BRAND.md needs more "do sound like / do not sound like" examples.
- If her trend picks don't fit → add banned topics or styles to BRAND.md's "Hard Nos."
- If she interrupts you too often → trim HEARTBEAT.md conditional triggers or raise the thresholds.
- If her hook suggestions are boring → raise temperature in `openclaw.json` from 0.6 → 0.75.
