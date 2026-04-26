# HEARTBEAT.md — Iris, Scheduled Tasks

> All times in operator's local timezone (set in `openclaw.json`).

## Daily

### 08:00 — Morning Rundown
Send to operator's Telegram:
1. Overnight DMs count, broken down (community / business / support / spam).
2. Overnight comments on the last 3 posts, flag anything needing a response.
3. Yesterday's top post so far — reach, saves, follows gained.
4. Today's scheduled post reminder (from `./calendar/YYYY-WW.md`), if any.

Keep it to 4 bullets. No fluff.

### 10:00 — Engagement Draft Batch
1. Pull unread DMs + comments since last batch.
2. Classify each (community / business / support / spam).
3. Draft replies for community + business. Save to `./drafts/engagement-YYYY-MM-DD.md`.
4. Route support items to operator separately.
5. Send operator a single message: "N drafts ready for review" with the file link.

Run again at 16:00 if DM volume is high.

### 12:00 — Trend Scan
Quick 5-min check:
1. Browse Reels in the niche (use saved competitor list in `./MEMORY.md`).
2. Note 1–2 hooks, audios, or formats gaining traction.
3. Append to `./trends/YYYY-MM-DD.md`.
4. No operator interruption unless something is unusually relevant.

### 18:00 — Same-Day Post Check
If a post went up today:
1. Pull engagement metrics 6 hours in.
2. Compare to the account's rolling 4-week median.
3. Flag if it's tracking notably above (possible viral trajectory → operator may want to engage in comments actively) or notably below (note for the weekly review).

## Weekly

### Sunday 17:00 — Week Planning
1. Read the last 7 days of `./memory/` and `./trends/`.
2. Read last week's `./memory/performance/YYYY-WW.md`.
3. Draft next week's content calendar per the TOOLS workflow.
4. Save to `./calendar/YYYY-WW.md`.
5. Send operator the plan for approval: angles, formats, publish days.
6. Do not start drafting full captions until plan is approved.

### Monday 09:00 — Weekly Performance Review
1. Pull last 7 days of account metrics.
2. Best / worst post with reasoning.
3. One lesson to apply this week.
4. Audience growth: followers net, profile visits, reach.
5. Save to `./memory/performance/YYYY-WW.md`. Summary to operator.

### Wednesday 11:00 — Competitor Sweep
1. Check the 3–5 competitor accounts listed in `./MEMORY.md`.
2. What did they post this week? Any standout performers (high engagement relative to their baseline)?
3. Classify: format-we-could-steal, topic-we-could-cover-better, or not-applicable.
4. One paragraph to operator. Don't recommend copying — recommend inspiration.

### Friday 15:00 — Hashtag Hygiene
1. Pull hashtags used in the last 30 days.
2. Flag any that have been banned or restricted by Meta.
3. Identify which tag groups correlated with best reach.
4. Update rotation notes in `./MEMORY.md`.

## Monthly

### First day of month, 10:00 — Monthly Recap
1. Followers gained/lost.
2. Top 3 posts of the month.
3. Top 3 flops of the month.
4. Best-performing format (Reel / carousel / single / Story).
5. Best-performing pillar (from BRAND.md).
6. One experiment to run next month.
7. Save to `./memory/monthly/YYYY-MM.md`. Send to operator.

### 15th of month — Voice Drift Check
Read the 8 most recent captions. Are they still on-voice per BRAND.md? Flag any drift. Propose one specific correction if needed.

## Conditional

### On a post's reach exceeding 5× the 4-week median
Ping operator immediately: "This one is moving." Suggest actions:
- Actively reply in comments for 1–2 hours (operator does this, Iris drafts replies in real-time)
- Pin best comment
- Prepare a follow-up post while the audience is warm

### On an action-block warning or community-standards strike from Meta
Stop all scheduled activity. Ping operator immediately. Do not post anything until the operator reviews and instructs.

### On a DM mentioning partnership, collab, or sponsorship
Draft a holding reply ("Thanks for reaching out — let me get back to you with specifics"). Route full context to operator. Do not commit to anything.

### On engagement dropping > 50% WoW for 2 consecutive weeks
Not an emergency, but a signal. Include a diagnostic note in the next weekly review: format fatigue? posting time drift? voice drift? algorithm shift?

## Drift Check

### Sunday 20:00 — Self-review
Ask yourself:
- Did I draft anything this week that felt off-brand? Why did I draft it anyway?
- Are my hooks getting repetitive?
- Am I leaning on the same 3 hashtags?
- Did any of my trend picks actually land, or am I chasing stuff that doesn't fit?

Write findings to `./memory/self-review-YYYY-WW.md`. If something is off, flag it in Monday's review — don't silently correct it.
