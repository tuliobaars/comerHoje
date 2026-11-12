# Taiga design system

Two frameworks, extracted from six Taiga codebases, with styleguides, requirements for future projects,
the Shiny · Quarto · HTML delivery model, feature screenshots for every app, and a DirectoR promo video
made with QuantSkill's video utility.

| Framework | Voice | Apps | Styleguide | Requirements | Starter tokens |
|---|---|---|---|---|---|
| **Lumen** | Cinematic, high-contrast, glass-driven | QuantSkill · lumenJourney · DirectoR · RockShiny | [lumen/STYLEGUIDE.md](lumen/STYLEGUIDE.md) | [lumen/REQUIREMENTS.md](lumen/REQUIREMENTS.md) | [lumen/lumen-tokens.css](lumen/lumen-tokens.css) |
| **Neue** | Minimalist, high-density enterprise | teal_neue · BlockR | [neue/STYLEGUIDE.md](neue/STYLEGUIDE.md) | [neue/REQUIREMENTS.md](neue/REQUIREMENTS.md) | [neue/neue-tokens.css](neue/neue-tokens.css) |

- **Delivery model** (every project: Shiny, Quarto and standalone HTML from one front end):
  [DELIVERY_MODEL.md](DELIVERY_MODEL.md)
- **Verification** (what was checked, how each image was made, issues found in the codebases):
  [VERIFICATION.md](VERIFICATION.md)
- **Per project:** `<project>/docs/DESIGN.md` (its dialect, tokens, screenshots, delivery status) and
  a "Feature tour" section in its README.

| | | |
|---|---|---|
| ![](../QuantSkill/docs/features/01-landing.jpg) QuantSkill | ![](../lumenJourney/docs/features/03-journey.jpg) lumenJourney | ![](../DirectoR/docs/features/04-story.jpg) DirectoR |
| ![](../RockShiny/docs/features/01-highway.jpg) RockShiny | ![](../teal_neue/docs/features/01-home.jpg) teal_neue | ![](../BlockR/docs/features/01-canvas-template.jpg) BlockR |

[![DirectoR teaser](../DirectoR/media/DirectoR_teaser_30s_poster.png)](../DirectoR/media/DirectoR_teaser_30s.mp4)
DirectoR teaser: 30 s, 1080p60 ([`DirectoR/media/`](../DirectoR/media/README.md)).

## Layout

```
taiga-design-system/
  README.md  DELIVERY_MODEL.md  VERIFICATION.md
  lumen/  STYLEGUIDE.md  REQUIREMENTS.md  lumen-tokens.css
  neue/   STYLEGUIDE.md  REQUIREMENTS.md  neue-tokens.css
  tokens/ <app>.json (extracted), summary.md, contrast.md, verify.json
  tools/
    extract_tokens.py      design tokens from the canonical stylesheets       -> tokens/<app>.json, summary.md
    contrast_audit.py      WCAG contrast of every text token on its surfaces  -> tokens/contrast.md
    make_neue_tokens.py    neue/neue-tokens.css from teal_neue's token rules
    write_app_docs.py      <project>/docs/DESIGN.md + the README "Feature tour" section (idempotent)
    verify.py              the checks behind VERIFICATION.md                  -> tokens/verify.json
    screens/               feature screenshots: quantskill.py, lumen_journey.py (live builds);
                           director.py, rockshiny.py, teal_neue.py, blockr.py (benches)
    bench/                 test benches for the Shiny apps (webR + markup stand-in), see bench/README.md
    video/directoR/        the DirectoR promo, driving QuantSkill/dev/video
```

## Regenerate

```sh
pip install tinycss2 playwright pillow numpy scipy fonttools brotli cryptography
(cd tools/bench && npm install)
python3 tools/extract_tokens.py && python3 tools/contrast_audit.py && python3 tools/make_neue_tokens.py
python3 tools/screens/quantskill.py && python3 tools/screens/lumen_journey.py
bash tools/bench/build_director.sh && python3 tools/screens/director.py
bash tools/bench/build_rockshiny.sh && python3 tools/screens/rockshiny.py
bash tools/bench/build_neue.sh teal_neue && python3 tools/screens/teal_neue.py
bash tools/bench/build_neue.sh BlockR && python3 tools/screens/blockr.py
python3 tools/video/directoR/make_promo.py
python3 tools/write_app_docs.py && PYTHONDONTWRITEBYTECODE=1 python3 tools/verify.py
```

The tools only read the six projects. They write to `<project>/docs/`, `<project>/README.md` (one
marked section), `DirectoR/media/`, this folder, and temporary folders under `/tmp`.
