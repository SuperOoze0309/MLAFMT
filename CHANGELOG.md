# Changelog

## v2.0.0

### New
- **Redesigned, simpler UI** — home screen explains what the tool does and shows only 3 steps; rarely-used settings moved to a secondary **⚙ Advanced** window / menu.
- **Chinese / English interface** (desktop + web), auto-detected, switchable, remembered.
- **Web app** (`mla_web.py`) with the same design, mobile-friendly, dark mode.
- Italic / bold / underline from `.docx` drafts are now **kept** (titles of works stay italic).
- `*asterisk*` italics for `.txt` / `.md` drafts; `.md` input supported.
- Removes a heading block the draft already contains (no duplicate name/title).
- Blank date = today; app remembers your name / instructor / course.
- Command-line interface: `python mla_formatter.py draft.docx --name … --title …`.
- 28 automated tests (`test_mla_formatter.py`); GitHub Actions builds the Windows EXE.

### Fixed
- Hard-wrapped `.txt` lines became line breaks inside paragraphs → now joined.
- Empty line at the top of the Works Cited page → uses "page break before".
- Header showed "Jr." for names like "Mary Smith Jr." → suffixes skipped.
- Works Cited sorting wrong for entries starting with quotes (`"The …"`).
- Word showed an "update fields?" prompt on open → page field now has a cached value.
- Theme fonts could override Times New Roman in some Word versions.
- GBK / UTF-16 encoded `.txt` files failed to open.
- Drag-and-drop broke on paths containing commas or spaces.
- Web: server listened on all network interfaces by default (now local only, `--lan` to opt in); concurrent requests could overwrite each other's files; no upload size limit.
- Android: wrapper imported a non-existent Kivy WebView and lacked the INTERNET permission.

## v1.0.0

Initial public release.
