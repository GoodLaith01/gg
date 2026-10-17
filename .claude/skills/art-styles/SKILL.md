---
name: art-styles
description: The user's saved art styles for image generation. Use whenever the user asks to make, draw, generate or create an image, picture, illustration or artwork (for example "make a moon"). Before generating anything, ask the user which of these styles to use.
---

# Art styles

## Rule: always ask first

When the user asks for an image, do not generate it yet. First ask which style to use,
showing this numbered menu (and offer "mix two styles" or "describe your own"):

1. Manga cover: 90s manga ink, bold red
2. Rainy street photo: moody, realistic, wet stone
3. Watercolor fantasy: delicate pen and soft watercolor
4. Blue ink sketch: one-color brush sketch fading to blue
5. Gothic night painting: pale figures in dark blue-violet
6. Gothic sepia painting: painted portrait in black, bronze and gold
7. Ink brush chaos: wild black-and-white brush strokes

Only after the user picks, build the image prompt: the subject, then the chosen style's
prompt text below. If the image model accepts reference images, attach the matching file
from `references/`.

## Generating: Gemini through OmniRoute v3.8.51

The session-start hook installs and starts OmniRoute v3.8.51 on `http://localhost:20128`
and connects Gemini when `GEMINI_API_KEY` is set. Check the image models with
`curl -s localhost:20128/v1/models/image`, then generate:

```bash
curl -s -X POST localhost:20128/v1/images/generations -H "Content-Type: application/json" \
  -d '{"model":"gemini/gemini-3.1-flash-image","prompt":"<subject + style prompt>","n":1,"response_format":"b64_json"}' \
  | python3 -c "import sys,json,base64;open('image.png','wb').write(base64.b64decode(json.load(sys.stdin)['data'][0]['b64_json']))"
```

Save the result under `images/` and send it to the user. If `GEMINI_API_KEY` is missing,
show the user the full prompt and say a key is needed.

## Style prompts

### 1. Manga cover (`references/1-manga-cover.jpg`)
1990s manga cover illustration. Crisp, confident black ink linework with fine hatching;
hair drawn as sharp, spiky, feathered strands. Flat, saturated cel coloring dominated by
a vivid red, with warm skin tones, metallic silver highlights and glossy black. Plain
white background with scattered red ink splatters. Dramatic close-up, intense gaze, the
character filling the frame; big spaced-out block title letters in red along the top.

### 2. Rainy street photo (`references/2-rainy-street-photo.jpg`)
Realistic vertical phone photograph of an old European city street on a rainy, overcast
day. Flat white-grey sky, dark sandstone Gothic and Victorian buildings, a clock tower.
Wet black paving stones and cobbles with mirror-like reflections and puddles. Muted,
desaturated grey-brown palette with small accents of red (flags, traffic lights, a red
bus). Low camera angle from the pavement, deep perspective down the street. Natural light,
no filters.

### 3. Watercolor fantasy (`references/3-watercolor-fantasy.jpg`)
Ethereal fantasy illustration in fine ink and transparent watercolor. Delicate, flowing
pen lines; ornate armor and costume with swirling patterns; long flowing capes and
ribbons. Soft pastel washes (pink, lavender, pale blue) alongside bright accents of
cobalt blue, golden yellow and red. Elegant, slender, androgynous figures; small dragons
and creatures; dreamlike clouds. Lots of empty white paper around the subject, edges
fading into the page.

### 4. Blue ink sketch (`references/4-blue-ink-sketch.jpg`)
Loose, expressive ink-brush sketch printed in a single color: a smooth gradient from deep
navy at the bottom left to bright sky blue at the top right, on pure white. High contrast
with no midtones; shapes made of bold solid areas and thin scratchy lines, unfinished
edges that dissolve into white. Half-length portrait, solemn expression, a small hand
signature in the corner.

### 5. Gothic night painting (`references/5-gothic-night-painting.jpg`)
Dark gothic fantasy painting, acrylic and oil look with soft, misty edges. Deep black and
midnight blue-violet background with silhouetted castle spires. Pale, porcelain-skinned,
beautiful androgynous figure with white-silver hair, cold glowing light. White feathers,
fur and spectral dragons drifting in smoke. A long ornate sword. Small specks of crimson
blood as the only warm color. Melancholy, elegant, vampiric mood.

### 6. Gothic sepia painting (`references/6-gothic-sepia-painting.jpg`)
Painterly gothic character portrait in a limited palette of black, warm grey, bronze and
antique gold. Long flowing pale-blond hair streaming in the wind, sharp aristocratic
features, haughty side glance. Baroque high-collared coat with gold trim, a sweeping
black cape, leather gloves, a thin rapier held upright, a hanging cross rosary. Visible
brush texture, glossy highlights on leather and metal, plain background.

### 7. Ink brush chaos (`references/7-ink-brush-chaos.jpg`)
Monochrome sumi-e style ink drawing on off-white paper. Wild, energetic brush strokes and
dry-brush scratches; heavy black masses mixed with diluted grey washes. Forms almost
abstract, a face and gear emerging from the chaos of strokes, hair whipping across the
frame. Gritty military-tech details hinted at with a few precise lines. No color.
