# VSCodePDF

Print-ready stylesheets for turning Markdown into clean A4 PDFs in VS Code, with
[Markdown Converter](https://marketplace.visualstudio.com/items?itemName=manuth.markdown-converter).

## Installation

1. Install the VS Code extension **Markdown Converter** (`manuth.markdown-converter`).
2. Clone this repo:

   ```bash
   git clone https://github.com/gyeozai/VSCodePDF.git
   ```

Optional: for math, install the [KaTeX fonts](https://github.com/KaTeX/KaTeX/tree/main/fonts) (TTF) on
   your system. Without them, formulas still render but with fallback fonts.

## Configure

1. Pick a theme, add this to your VS Code `settings.json`, using absolute paths to your clone:

```jsonc
{
    "markdownConverter.Assets.StyleSheets": {
        "/path/to/VSCodePDF/style.css": "Include"
    },
    "markdownConverter.Assets.Scripts": {
        "/path/to/VSCodePDF/script.js": "Include"
    },
    // The themes set their own 1-inch page margins.
    "markdownConverter.Document.Paper.Margin": { "Top": "0cm", "Right": "0cm", "Bottom": "0cm", "Left": "0cm" },
    "markdownConverter.Document.HeaderFooterEnabled": false
}
```

## Usage

1. Open a Markdown file in VS Code.
2. Press `Ctrl + Shift + P` and run **Markdown: Convert Document**.
3. The PDF is written next to your Markdown file.

Try it on `tutorial/style-showcase.md` to preview a theme.

## Project Structure

```text
VSCodePDF/
├── README.md
├── latex/style.css         # Theme Option 1
├── claude/style.css        # Theme Option 2
├── script.js
└── tutorial
    └── style-showcase.md   # A sample document that shows every supported element
```