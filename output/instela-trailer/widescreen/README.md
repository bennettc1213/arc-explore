# Instela — Why Instela / widescreen revision

Main file: `instela-widescreen-1920x1080-60fps.mp4`.

72 seconds, 1920 × 1080, 16:9 widescreen, 60 fps. The layout was redesigned for the full frame; the portrait video was not stretched or pillarboxed. The original 60-second portrait export remains in the parent directory.

The new “why Instela” section follows the student statistic. It connects source checks, visible freshness information, targeted discovery and daily Pro alerts with evidence about application timing and smaller scholarship pools. The five preparation tools, tracker, autofill beta, Free/Pro comparison, and $10 eligible-student offer remain.

## Exact claims and primary sources

Research checked November 15, 2026. All study outcomes are distinguished from Instela product outcomes. There was no reliable basis for a universal “X% more likely to get an internship with Instela” or “X% better scholarship odds below N applicants” claim, so neither appears in the video.

### Student scholarship use: 39%, replacing the family figure

[Sallie Mae / Ipsos, *How America Pays for College 2025*, Table 5, printed page 26 / PDF page 33](https://www.salliemae.com/content/dam/slm/writtencontent/Research/HAP_2025.pdf).

The student row reports 61% scholarship use among 1,000 respondents. Its complement is **39% who did not use scholarships**, using the report's rounded figure. This supports the requested student wording; the original 40% was a family figure. The video identifies the 2024–25 academic year, source table and calculation. Scholarship use differs from application activity.

### Timing: approximately 5% more employer contact, +1.16 percentage points

[Sai Zhang, University of Southern California, *Time Is of the Essence: Experimental Evidence on the Effects of Job Application Timing*, October 21, 2026 working paper](https://saichriszhang.github.io/files/JMP_SaiZhang.pdf).

[Author's research page](https://saichriszhang.github.io/research/).

Earlier-half experimental submissions received 1.16 percentage points more employer contact. The paper expresses this as roughly 5% relative to its average contact rate of about 24% (Section 3.2 / Table 1). The outcome is contact within 30 days, not offers or hires. “Earlier” concerns the experimental sequence, not a universal 24-hour rule. The connection to Instela's freshness tools is our inference, not measured product uplift. Verification copies: `../assets/timing-paper.pdf`, `timing-slides.pdf`, and their extracted text.

### Scholarship competition: 7 selected from 80 = 8.75%

[Idaho Association of Counties, “IAC Announces 2025 Scholarship Award Recipients,” July 21, 2025](https://idcounties.org/iac-announces-2025-scholarship-award-recipients/).

The sponsor reports seven recipients from 80 applicants, each receiving $1,000. The historical calculation is **7 ÷ 80 × 100 = 8.75%**. Eligibility covers children of county employees and children/grandchildren of county elected officials, enrolled full time. The video identifies these restrictions. This is a single-program historical result, not a personal probability, universal threshold, or measured Instela result. Instela has no applicant counts; current availability or listing in Instela is not asserted.

[Federal Student Aid](https://studentaid.gov/articles/scholarship-tips/) separately explains that local sources can have smaller applicant pools. That supports the video's recommendation to explore field/community awards. It provides no universal percentage boost.

## Other product claims

The parent `../README.md` documents the existing product captures and checks for the $20 regular Pro plan, $10 eligible-student offer, actual feature entitlements, preparation-tool usage limits, source-checked listings, the Instela-reported 50,463 all-time opportunities (including closed listings), and the explicitly labeled autofill beta. School-email access and current student enrollment must both be verified for the student discount. An eligible-user checkout was not performed during video production.

## Scenes

| Time | Content |
| --- | --- |
| 00:00–00:03 | Your next move / browser overload |
| 00:03–00:08 | 39% student-specific statistic |
| 00:08–00:11 | Why Instela: freshness, relevance, follow-through |
| 00:11–00:18 | Application timing study and source-check / alert connection |
| 00:18–00:25 | Real smaller-pool scholarship example |
| 00:25–00:28 | Orange “use instela.” / pixel character |
| 00:28–00:34 | Source-checked discovery and real product capture |
| 00:34–00:39 | Scout and detailed fit guidance |
| 00:39–00:46 | Five preparation tools |
| 00:46–00:51 | Application tracker and alerts |
| 00:51–00:55 | Autofill beta |
| 00:55–01:01 | Why Pro |
| 01:01–01:08 | 50% student offer / $10 per month |
| 01:08–01:12 | Start exploring free |

## Editable source

From the parent `instela-trailer` directory:

```powershell
node render-widescreen.mjs --preview
node render-widescreen.mjs
node verify-widescreen.mjs
```

`render-widescreen.mjs` contains the new compositions. `score.mjs` composes an original 72-second stereo instrumental using oscillators and generated percussion, with cues matched to scene changes. It contains no third-party music recordings. Existing brand fonts and product captures are reused from `../assets/`.

Matching cover: `instela-cover-1920x1080.png`. Visual overview: `storyboard.png`. Encoded-video inspection: `encoded-contact-sheet.jpg`. Verification logs document the final dimensions, duration, frame count, complete decode and measured audio levels. No website source files or production deployment were changed.
