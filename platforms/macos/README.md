# MLAFMT for macOS

## One-Click Build

1. Open **Terminal** (Applications → Utilities → Terminal)
2. Drag this folder into the Terminal window, or `cd` into it
3. Run:

```bash
chmod +x build_macos.sh
./build_macos.sh
```

4. Wait ~2 minutes. You'll get `dist/MLAFMT.dmg`

## One-Click Install (for users)

Give users `MLAFMT.dmg`. They:

1. Double-click the `.dmg`
2. Drag `MLAFMT` to the `Applications` folder
3. Double-click `MLAFMT` from Applications to launch

That's it. No Python, no Terminal, no dependencies.

## How It Works

- **GUI**: Native Tkinter desktop app (drag & drop `.docx` / `.txt` / `.md`, 中文 / English, fill in info, click Convert)
- **Engine**: python-docx for Word generation, tkinterdnd2 for drag-and-drop
- **MLA 9th Edition**: Full compliance — 1-inch margins, TNR 12pt, double spacing, 0.5" indent, LastName + PAGE header, Works Cited page with alphabetical sort + hanging indent
