# 🎬 Demo Video Script — Parking Intelligence (Flipkart Gridlock)

**Target runtime:** ~3:00 (most judges stop watching after 3 min — every second earns its place)
**Tagline / north star:** *"From reactive patrols to predictive enforcement."*
**The one idea to land:** hotspots ranked by **traffic impact, not raw violation count.**

**Structure (the sandwich):** Hook → Problem → Solution → **LIVE DEMO (core)** → Results → Close.

> All numbers below are real, from the actual dataset — say them with confidence, they're defensible.
> Nov 2023–Apr 2024 Bengaluru traffic-police data · 248,691 cleaned tickets · 1,323 zones · 232,071 mapped (93.3%).

---

## Scene-by-scene

| # | Time | Screen / Visual | On-screen action | Voiceover (read this) | Overlay text |
|---|------|-----------------|------------------|------------------------|--------------|
| **1. Hook** | 0:00–0:12 | B-roll: Bengaluru traffic jam / a car parked blocking a lane (stock or phone clip) | Slow zoom on the badly-parked car | "One vehicle, parked in the wrong place, can back up an entire junction for blocks. Bengaluru logs *thousands* of these a day — and enforcement still finds them by driving past." | **From reactive patrols → predictive enforcement** |
| **2. Problem** | 0:12–0:35 | PPT slide — the brief's 3 pain points | Build in 3 bullets | "The challenge from the brief: enforcement is patrol-based and reactive. There's no heatmap of parking violations versus their congestion impact. And no way to know which hotspot to send a patrol to *first*." | • Reactive patrols • No impact heatmap • Can't prioritize |
| **3. Solution (1 line)** | 0:35–0:52 | PPT — 3-box pipeline diagram | Animate Raw → Cluster → Score | "So we built it. We turn 248,000 raw parking tickets into 1,323 ranked, patrol-sized hotspots — ranked not by *how many* violations, but by *how much each one actually chokes traffic*." | 248K tickets → 1,323 ranked hotspots |
| **4. DEMO: the map** | 0:52–1:12 | **Live dashboard**, full screen | Page already loaded; slow pan over the heatmap + colored markers | "This is the live dashboard. Every dot is a hotspot, colored by enforcement priority — red is critical. Right now we're looking at all of Bengaluru." | *(none — let it breathe)* |
| **5. DEMO: jurisdiction filter** | 1:12–1:30 | Dashboard — Police Station filter | Type "Shivajinagar" → select it; list + map snap | "An officer filters to their own jurisdiction —" *(pause as it updates)* "— and instantly sees only their zones, ranked." | Filter → jurisdiction |
| **6. DEMO: time filter** | 1:30–1:48 | Dashboard — hour chips | Click evening peak hours (17–20); ranking re-orders live | "Now the hours that matter — the evening rush. Watch the ranking re-order in real time. The scores aren't static; they're recomputed for exactly the window you care about." | Scores recomputed live |
| **7. DEMO: the money shot** | 1:48–2:18 | Dashboard — click #1 zone → detail panel | Click top zone; detail slides over; point cursor at congestion score + hour chart | "Click the number-one zone. Why is it number one? It sits on a main-road junction, and most of its violations land during peak hours — so its congestion-impact score is high. That's the score we rank on." | Congestion impact, not just volume |
| **8. DEMO: the payoff** | 2:18–2:35 | Dashboard — click a higher-volume but lower-ranked zone | Select a big-but-quiet zone | "Here's the whole point. This zone has *more* violations — but it's not choking traffic, so it ranks *lower*. Volume isn't impact. That's the exact distinction the brief asked for." | Volume ≠ Impact |
| **9. Results** | 2:35–2:50 | PPT — numbers slide | 4 stats count up | "On the full real dataset: 1,323 hotspots found, 93% of all violations mapped to a real zone, 85 flagged high-priority right now." | 1,323 zones · 93.3% mapped · 85 high-priority |
| **10. Close** | 2:50–3:00 | PPT — closing slide, tagline | Logo + tagline | "248,000 tickets, one defensible answer to 'where do we send the next patrol.' From reactive patrols to predictive enforcement." | **Thank you · Team [name]** |

---

## Voiceover — clean read-through (for recording in one take)

> One vehicle, parked in the wrong place, can back up an entire junction for blocks. Bengaluru logs thousands of these a day — and enforcement still finds them by driving past.
>
> The challenge from the brief: enforcement is patrol-based and reactive. There's no heatmap of parking violations versus their congestion impact. And no way to know which hotspot to send a patrol to first.
>
> So we built it. We turn 248,000 raw parking tickets into 1,323 ranked, patrol-sized hotspots — ranked not by how many violations, but by how much each one actually chokes traffic.
>
> This is the live dashboard. Every dot is a hotspot, colored by enforcement priority — red is critical.
>
> An officer filters to their own jurisdiction — and instantly sees only their zones, ranked. Now the hours that matter — the evening rush. Watch the ranking re-order in real time; the scores are recomputed for exactly the window you care about.
>
> Click the number-one zone. Why is it number one? It sits on a main-road junction, and most violations land during peak hours — so its congestion-impact score is high. That's the score we rank on.
>
> And here's the whole point. This zone has more violations — but it's not choking traffic, so it ranks lower. Volume isn't impact. That's exactly the distinction the brief asked for.
>
> On the full real dataset: 1,323 hotspots, 93% of violations mapped to a real zone, 85 flagged high-priority right now.
>
> 248,000 tickets, one defensible answer to "where do we send the next patrol." From reactive patrols to predictive enforcement.

*(~340 words ≈ 2:40 at a calm pace, leaving room for visual pauses.)*

---

## Production checklist

**Before recording**
- [ ] **Warm the backend first** — open `https://bengaluru-parking-intelligence.onrender.com/api/health` and wait for `{"status":"ok"}`. Render free-tier sleeps; never record a cold first-load.
- [ ] **Pre-record the demo segment** (don't screen-share live) so you can trim load waits.
- [ ] Browser at **1080p, ~110% zoom**, dashboard already loaded, filters cleared.
- [ ] Pick your two contrast zones in advance (one high-priority junction zone; one high-volume-but-low-impact zone) so the "Volume ≠ Impact" beat is instant on camera.

**While recording**
- [ ] Narrate the *officer's decision*, not the UI ("send the next patrol here," not "this is a dropdown").
- [ ] Move the cursor deliberately; hover the score you're talking about.

**Editing**
- [ ] Cut every map pan/load pause — keep it tight.
- [ ] Overlay the caption column above as on-screen text; keep captions ≤5 words.
- [ ] Add a soft cursor-highlight or zoom when pointing at the priority/congestion score.
- [ ] Background music low (-18 dB under VO); fade out under the closing line.

**If you must go shorter (≤90s):** keep scenes 3 → 4 → 7 → 8 → 9 only. The demo's money-shot (7) and payoff (8) are non-negotiable; everything else is trimmable.
