# Echo — Personal Branding Agent for X & LinkedIn

One agent that helps you ghostwrite for yourself on X and LinkedIn. Learns your voice from real samples, drafts posts and replies in it, tracks what works, never publishes without you.

**Renamable.** Echo is just the default — the agent will ask what you want to call it during bootstrap.

## What's Different About This One

- **Bootstrap flow:** first time you message the agent, it runs a guided 15-minute setup over chat. You don't edit markdown files by hand — the agent asks questions, you answer, it writes the files.
- **Voice training:** you paste 5+ of your real writings (posts, emails, texts). The agent extracts your patterns into `VOICE.md` and references it on every draft.
- **Platform-aware:** knows the X vs. LinkedIn playbooks are different and adapts format without losing your voice.
- **Draft-only by design:** zero auto-publishing, zero auto-engagement. You post. The agent drafts, you post.
- **Channel-flexible:** bootstrap walks you through connecting Telegram (default) or other options.

## Files

```
~/.openclaw/workspaces/echo-personal-brand/
├── SOUL.md          # Agent's identity (it's a ghostwriter, not a personality)
├── AGENTS.md        # Operating rules and workflows
├── BOOTSTRAP.md     # The first-run onboarding script ← agent runs this automatically
├── PROFILE.md       # YOUR info (filled by bootstrap)
├── VOICE.md         # How you sound (built by bootstrap)
├── PLATFORMS.md     # X vs. LinkedIn playbooks
├── HEARTBEAT.md     # Scheduled tasks
├── MEMORY.md        # Long-term memory (starts empty)
├── calendar/        # Weekly content plans (auto-created)
├── drafts/          # Engagement drafts (auto-created)
├── listening/       # Daily niche listening notes (auto-created)
└── memory/          # Daily notes + performance logs (auto-created)

~/.openclaw/openclaw.json    # Main config
```

## Setup — Just Three Steps

### 1. Drop the files in place
Copy the workspace folder to `~/.openclaw/workspaces/echo-personal-brand/` and `openclaw.json` to `~/.openclaw/`.

### 2. Connect credentials in Nora
Open the installed agent in Nora and use the **Integrations** tab for every provider credential. Connect an LLM provider such as Anthropic before first use. During bootstrap, Echo can also walk you through connecting Telegram there.

### 3. Start OpenClaw and say hi
Run OpenClaw. Send your first message ("hey" works). The agent detects `PROFILE.md` is empty and launches the bootstrap flow. Follow the prompts. In 15–20 minutes, you're set up.

## What the Bootstrap Covers

1. Name the agent (keep default or rename)
2. Your name and what you want to be called
3. What you do and want to be known for
4. Your X handle and LinkedIn URL (one or both)
5. Your goals (audience, clients, job, launch, learning, other)
6. **Voice samples** — paste 5+ real writings so the agent learns how you actually sound
7. Posting cadence preferences
8. Hard nos — topics you'll never post about
9. Connect a communication channel (walks you through creating a Telegram bot)
10. Test draft — try a post to calibrate voice, give feedback
11. Wrap up — you're live

You can bail halfway through and resume later. You can also re-run bootstrap anytime with the command "rebootstrap."

## What You Do Day-to-Day

**Morning:** Agent sends a brief. 4–5 bullets. Anything notable from overnight, today's schedule, one content idea.

**When you want to post:** Tell the agent what you're thinking. It drafts 2–3 variants with different angles. You pick, edit, post.

**When you want to reply to something:** Forward or describe it. Agent drafts a reply. You send.

**When you want to know what's working:** "Weekly review." Agent tells you what performed and why.

**When you feel the voice drifting:** "Retrain voice." Paste 5+ new samples. Agent updates VOICE.md.

## The Guardrails That Matter

The `openclaw.json` blocks all publishing and engagement APIs by default:
- `x-post`, `x-reply`, `x-dm-send`, `x-follow`, `x-like`, `x-repost` — denied
- `linkedin-post`, `linkedin-comment`, `linkedin-dm-send`, `linkedin-connect` — denied

These aren't hidden behind a "careful!" warning. They're structurally off. To enable any of them, you'd have to edit the `deniedSkills` list, which means you'd see what you were doing.

**This is the point.** Automated engagement is how accounts get suspended. Automated posting is how voices drift into AI-generic. Draft-only keeps you in the loop, which is what personal branding actually requires.

## Honest Limits

- **X API:** the free tier gives you very limited read access. Analytics pulls work with Premium API ($100/mo) or by scraping your own analytics dashboard.
- **LinkedIn API:** restrictive. Most people fall back to semi-manual analytics (operator pastes screenshots, agent parses).
- **If neither API is available:** the agent still works for drafting — it just won't auto-pull analytics. You paste your numbers during the weekly review.
- **Credential setup:** connect X, LinkedIn, Telegram, and LLM provider credentials from Nora's Integrations tab. Do not put secrets in the template files.

## First Week Expectations

- **Day 1:** Bootstrap. Do one test draft. It'll be 70% right.
- **Day 2–3:** Ask for drafts on real topics. Correct them. Tell the agent what felt off. It learns fast.
- **Day 4–5:** Voice should feel much closer. Start using drafts for real posts.
- **Day 7:** First weekly review. See if the agent's reads match your gut.
- **Week 2–3:** This is when it gets good. Enough memory, enough calibration.

If week 1 feels too generic, the usual fix is: more voice samples, more specific hard nos, more feedback when a draft is off.

## Customization

- **Rename the agent:** during bootstrap, or anytime edit `PROFILE.md` → `agent_name`.
- **Change cadence:** "update my cadence — X daily, LinkedIn 2x week"
- **Add platforms later:** currently X and LinkedIn only. For IG or others, spin up a separate agent (see the Iris IG agent example).
- **Tighten or loosen voice:** retrain anytime.
- **Adjust HEARTBEAT:** edit HEARTBEAT.md directly or ask the agent to draft changes.
