# MLAFMT - One-Click MLA Essay Formatter

Convert plain text or Word drafts into properly formatted MLA (9th Edition) documents with a single click.

## What It Does

MLAFMT takes a `.txt` or `.docx` draft and reformats it with common MLA 9th edition layout conventions:

- **Page setup**: 8.5 x 11 inch, 1-inch margins
- **Typography**: Times New Roman 12 pt throughout
- **Spacing**: Double-spaced, 0 pt before/after
- **Alignment**: Left-aligned (not justified)
- **Heading block**: Student Name / Instructor / Course / Date (top-left)
- **Title**: Centered, same font, no bold or extra styling
- **Body paragraphs**: 0.5-inch first-line indent, double-spaced
- **Page header**: LastName + auto page number (top-right)
- **Works Cited**: New page, centered heading, entries sorted alphabetically, hanging indent
- **PAGE field**: Auto-updates on open in Microsoft Word

## Quick Start

### Option A: Use the EXE (Windows, no Python required)

1. Download `MLAFMT.exe`
2. Double-click to launch the GUI
3. Fill in your paper information
4. Drag and drop a `.docx` or `.txt` draft — or click **Browse**
5. Click **Convert & Save** to generate the MLA-formatted `.docx`

### Option B: Run from Source (requires Python 3.10+)

```bash
pip install python-docx
# Optional: pip install tkinterdnd2 (enables drag-and-drop support)
python mla_gui.py
```

Or use the engine directly in your own code:

```python
from mla_formatter import convert_draft_to_mla, create_blank_template

# Convert a draft
convert_draft_to_mla(
    "my_draft.txt", "my_essay.docx",
    name="Alice Johnson", instructor="Prof. Smith",
    course="ENG 101", date_str="11 August 2026",
    title="The Role of Visual Rhetoric"
)

# Create a blank MLA template
create_blank_template("blank_essay.docx")
```

## Features

| Feature | Description |
|---------|-------------|
| Drag & Drop | Supports `.docx` and `.txt` files |
| Header override | Manual last-name field for edge cases (e.g. "Mary Jane Smith Jr.") |
| TXT paragraph modes | Blank-line splitting or line-by-line |
| Opt-in heading detection | Auto-detect section headings (disabled by default) |
| Opt-in block quotes | Treat `>`-prefixed lines as MLA block quotes (0.5 in indent) |
| Format preview | Real-time display of formatting specs |
| Auto filename | Generates `LastName_MLA_Essay.docx` |
| Input validation | Required fields checked before conversion |

## MLA 9th Layout Support Checklist

- [x] 8.5 x 11 inch paper, 1-inch margins
- [x] Times New Roman 12 pt (including CJK)
- [x] Double spacing, 0 pt before/after
- [x] Left-aligned (not justified)
- [x] Paragraph first-line indent 0.5 inch
- [x] LastName + PAGE header (auto-update)
- [x] First-page heading block
- [x] Centered title (no bold, no underline)
- [x] Block quote indent 0.5 inch
- [x] Works Cited: new page, centered, alphabetical, hanging indent

## Limitations

This tool reformats **plain essay text** into MLA format. The following are **not preserved** from source documents:
- Images, tables, charts
- Footnotes and endnotes
- Complex character formatting (bold, italic within paragraphs)
- Track changes and comments
- Lists and bullet points

## Building from Source

```bash
pip install pyinstaller
pyinstaller --onefile --windowed --name "MLAFMT" mla_gui.py
```

The output EXE will be in `dist/MLAFMT.exe`.

## License

MIT License — see [LICENSE](LICENSE) file.
