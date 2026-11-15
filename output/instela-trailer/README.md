# Instela — your next move

60-second founder launch trailer for the LinkedIn feed. Designed for sound-off viewing, with an original instrumental soundtrack. No synthetic voiceover, stock footage, templates, or third-party music recordings.

## Deliverables

- `instela-linkedin-1080x1350-60fps.mp4` — main upload file, 4:5 portrait, 1080 × 1350, genuine 60 fps, H.264, Rec.709, AAC stereo.
- `instela-poster.png` — matching cover image.
- `storyboard.png` — scene overview.
- `linkedin-post.txt` — optional founder post draft.
- `render.mjs` — editable animation and original audio source.
- `assets/` — fonts, real product captures, preview stills, and source-page text captured during production.

## The edit

| Time | Story |
| --- | --- |
| 00:00–00:03 | Browser-tab overload; a clearer next move |
| 00:03–00:08 | 40% scholarship statistic, with source on screen |
| 00:08–00:11 | Pixel mark assembly; orange “use instela.” |
| 00:11–00:18 | 50,463 all-time opportunities; moving crop of the real product |
| 00:18–00:24 | Scout, profile alignment, eligibility, skill gaps |
| 00:24–00:32 | Five preparation tools with animated document inspection |
| 00:32–00:38 | Application progression and alerts |
| 00:38–00:42 | Supported-form autofill, explicitly labeled beta |
| 00:42–00:49 | Concrete Free/Pro comparison |
| 00:49–00:56 | 50% student offer; $20 → $10/month |
| 00:56–01:00 | Free exploration call to action and instela.org |

## Claims and sources

Checked November 15, 2026. The source capture date uses the user's America/Denver date.

**40% of families did not use scholarships to pay for college.** Sallie Mae / Ipsos, *How America Pays for College 2025*, covering the 2024–25 academic year. The release reports online interviews with 1,000 undergraduate students and 1,000 parents, conducted April 8–May 8, 2025. The video labels this historical period; it does not present the figure as a new 2026 measurement. This is survey context, not an Instela outcome.

Primary source: https://news.salliemae.com/news-releases/news-releases-details/2025/Families-Report-Spending-More-But-Also-Missing-Out-on-Opportunities-to-Make-College-More-Affordable-According-to-How-America-Pays-for-College-2025/default.aspx

**50,463 opportunities found, all time.** Observed directly on https://instela.org during capture. The repository identifies this as an owner-stated total, not a live analytics query. The video labels it “Instela-reported,” “all time,” and “includes closed listings.” It is not a count of current vacancies, student placements, or scholarships won. See `assets/home-text.txt` and `src/app/page.tsx` in the main project. The 10,000+ students-helped claim was omitted because it could not be independently substantiated from product records.

**Free/Pro limits and features.** Verified against a fresh browser visit to https://instela.org/pricing and the repository's `src/lib/pricing/tiers.ts` and `describe.ts`. Direct browser capture confirmed $20/month, top 20 ranked feed matches per search on Free, 10 active applications on Free, one use of each preparation tool every 30 days on Free, and unlimited preparation/tracking on Pro. Pro daily saved-search alerts and timing-weighted ranking appear on the current page. The comparison concerns the ranked feed; the Scout preview has its own result limit. AI cover-letter generations remain limited to 30 per hour on every plan, disclosed on screen.

The search engine's cached pricing page initially showed older pricing. A fresh direct browser capture confirmed the current $20 page; see `assets/live-pricing-text.txt`. No public pricing mismatch remains in the final research record.

**$10/month / 50% student offer.** Offer requested by the product owner and supported by the repository's student-discount design. Both .edu inbox verification AND verified current enrollment are required by the code. The video states both conditions. A verified inbox alone reserves a claim; it does not activate the discount. Student-specific Stripe coupon configuration and an actual eligible-user checkout were not independently inspected. See `docs/student-verification.md`, `src/lib/student-discount.ts`, and `src/lib/pricing/checkout-quote.ts`. The trailer's offer should correspond to the configured eligible-student checkout.

**Autofill.** Shown as beta and “not yet verified end to end.” The footage is an explicitly labeled motion illustration of supported forms. It is not claimed to work on every application, and the student reviews and submits. Unbuilt features such as Smart Resume/PDF, one-click reapply, and semester recap are excluded.

No application-success rate, selection probability, student award result, financial return, or time-saved percentage was invented. “500 scholarship applications before one win” was not used because a reliable primary source was not established.

## Design and audio

Uses the actual Instela palette (#0a0a0b / #ff4d00), square corners, pixel character, Space Grotesk, and IBM Plex Mono. Fonts are from Google Fonts; their OFL license texts are included with the assets. The soundtrack is synthesized from oscillators and generated percussion in `render.mjs`, with section cues at edit points. It uses no third-party recordings. Final audio is normalized for social listening.

The video is text led so its full message works with LinkedIn muted. Product captures were made from the public site without logging in or exposing student data. Capture scripts only read public pages. The app source and production deployment were not modified.

## Re-render

From this directory, using Node.js:

```powershell
npm install --no-audit --no-fund
node render.mjs --preview
node render.mjs
```

`ffmpeg-static` supplies the encoder. If package install scripts are disabled in your environment, run its `install.js` once from that package directory. Rendering is deterministic at 60 independent frames per second; this is not a 30 fps export duplicated to 60.

Capture scripts contain the Chromium executable path available on the production computer. Adjust that path if refreshing captures on another machine.
