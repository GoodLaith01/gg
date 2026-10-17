# Daybook · دفتر اليوم

My personal home page: clock, local weather, calendar, sticky notes and an ideas journal,
in **English** and **Arabic**.

Live at **https://goodlaith01.github.io/gg/**

- Weather comes from [Open-Meteo](https://open-meteo.com/) (free, no key).
- Everything you write is saved in your own browser on each device. Use **Move data** to copy it
  between your phone and laptop.
- On a phone, open the site and choose **Add to Home Screen** to use it like an app.
- Works in Brave, Chrome, Safari and Edge.

## How the project is built

The website is one fast HTML page. Python builds it and checks it before anything goes live.

```
src/
  page.html        page structure; every text has a translation key (data-i18n="...")
  styles.css       design, light/dark themes, right-to-left layout for Arabic
  app.js           the app (clock, weather, calendar, notes, ideas, settings, move data)
  sw.js            offline support template
  i18n/en.json     English text
  i18n/ar.json     Arabic text (with all six Arabic plural forms)
tools/build.py     checks the translations and builds the site
tests/             Python tests that drive the real page in a browser
index.html, sw.js, manifest.webmanifest   built files that GitHub Pages serves
```

### Change something

```bash
pip install -r requirements-dev.txt
python -m playwright install chromium

python tools/build.py          # check translations, then write the site files
python -m pytest               # run every test
DAYBOOK_PERF=1 python -m pytest -k smooth   # also check it stays at ~60 fps on a slow phone
```

`tools/build.py` refuses to build when:

- a text is missing in one language, or is empty
- a `{placeholder}` differs between English and Arabic
- an Arabic counted phrase is missing one of its plural forms
- the page uses a key that does not exist, or a key is never used
- `app.js` has a syntax error, or the page grows past its size budget

The **Check** workflow runs the same build check and all tests on every push.

### Add a language later

1. Copy `src/i18n/en.json` to `src/i18n/<code>.json` and translate it.
2. Add the code to `LANGS` and its plural forms to `PLURAL_FORMS` in `tools/build.py`.
3. Add a choice for it in the Settings dialog in `src/page.html`.
