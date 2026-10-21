/*
 * Theme-independent fixes for manuth.markdown-converter PDFs: layout that CSS alone cannot
 * express. Every theme shares this file through VS Code settings:
 *
 *   "markdownConverter.Assets.Scripts": { "<path>/script.js": "Include" }
 *
 * The converter inlines it at the end of <body>, and it runs before the page is printed.
 * Each fix is a function listed in FIXES at the bottom; add new ones there.
 *
 *   1. balanceTableColumns   Keep short table headers on one line without wasting width.
 *   2. keepHeadingsWithNext  Keep each heading on the page where the block below it starts.
 */
(() => {
    'use strict';

    // ---- Shared helpers ------------------------------------------------------------------

    // Paper widths and heights in mm for the named @page sizes.
    const PAPER = { a3: [297, 420], a4: [210, 297], a5: [148, 210], b4: [250, 353], b5: [176, 250], letter: [215.9, 279.4], legal: [215.9, 355.6], ledger: [279.4, 431.8] };

    const sum = (values) => values.reduce((a, b) => a + b, 0);

    function toPx(length) {
        const probe = document.createElement('div');
        probe.style.cssText = `position:absolute;visibility:hidden;width:${length}`;
        document.body.appendChild(probe);
        const px = probe.getBoundingClientRect().width;
        probe.remove();
        return px;
    }

    // Size of the printed text block in px: the theme's @page size less its margins.
    function printTextBox() {
        const page = {};
        for (const sheet of document.styleSheets) {
            let rules;
            try {
                rules = sheet.cssRules;
            } catch (e) {
                continue;
            }
            for (const rule of rules) {
                if (rule.type !== CSSRule.PAGE_RULE || rule.selectorText) continue;
                for (const name of ['size', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left']) {
                    page[name] = rule.style.getPropertyValue(name) || page[name];
                }
            }
        }
        if (!page['margin-left'] || !page['margin-right']) return null;
        let [width, height] = PAPER.a4.map((mm) => `${mm}mm`);
        const parts = (page.size || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
        const named = parts.find((p) => PAPER[p]);
        if (named) {
            [width, height] = PAPER[named].map((mm) => `${mm}mm`);
            if (parts.includes('landscape')) [width, height] = [height, width];
        } else if (parts.length && /^[\d.]/.test(parts[0])) {
            [width, height] = [parts[0], parts[1] || parts[0]];
        }
        return {
            width: toPx(width) - toPx(page['margin-left']) - toPx(page['margin-right']),
            height: toPx(height) - toPx(page['margin-top'] || '0px') - toPx(page['margin-bottom'] || '0px'),
        };
    }

    // Adds or replaces a stylesheet of this script's own.
    function setStyle(id, css) {
        let style = document.getElementById(id);
        if (!style) {
            style = document.createElement('style');
            style.id = id;
            (document.head || document.body).appendChild(style);
        }
        style.textContent = css;
    }

    // ---- 1. Balanced table columns -------------------------------------------------------
    //
    // When a table is too wide for every cell to stay on one line, Chromium narrows all
    // wrappable columns by the same proportion: short headers wrap, while a long header keeps
    // width it no longer fills once it has wrapped. This measures each column's narrowest
    // width (its longest word) and its one-line width, keeps as many columns on one line as
    // fit (cheapest first), gives the rest to columns whose body text still wraps, and fixes
    // the result with <col> widths. Tables that already fit, or that cannot fit even at their
    // narrowest, are left to the browser.

    // Printed tables are laid out at a whole-pixel width with whole-pixel columns, so every
    // column gets this much spare width (px) beyond what its content needs.
    const SLACK = 1.5;

    // Column widths of a hidden copy laid out at min-content or max-content width.
    function columnWidths(table, width, withHead) {
        const probe = table.cloneNode(true);
        probe.querySelectorAll('colgroup.balanced-columns').forEach((c) => c.remove());
        if (!withHead && probe.tHead) probe.deleteTHead();
        Object.assign(probe.style, {
            position: 'absolute', visibility: 'hidden', left: '0', top: '0',
            tableLayout: 'auto', width, minWidth: '0', maxWidth: 'none',
        });
        // Measure whole words even where a theme lets cell text break anywhere.
        probe.querySelectorAll('th, td').forEach((cell) => {
            cell.style.overflowWrap = 'normal';
            cell.style.wordBreak = 'normal';
        });
        table.parentNode.insertBefore(probe, table);
        const row = probe.rows[0];
        const widths = row ? Array.from(row.cells, (c) => c.getBoundingClientRect().width) : [];
        probe.remove();
        return widths;
    }

    function allocateColumns(min, max, bodyMax, available) {
        if (sum(max) + SLACK * max.length <= available) return null;
        const width = min.map((w) => w + SLACK);
        let budget = available - sum(width);
        if (budget < 0) return null;
        const order = [...width.keys()].sort((a, b) => (max[a] - min[a]) - (max[b] - min[b]));
        for (const i of order) {
            const cost = max[i] - min[i];
            if (cost <= budget) {
                width[i] = max[i] + SLACK;
                budget -= cost;
            }
        }
        // Leftover width only helps columns whose body text still wraps; a column where
        // just the header wraps would carry it unused.
        let growable = order.filter((i) => width[i] < max[i] && bodyMax[i] > width[i] + 0.5);
        while (budget > 0.5 && growable.length) {
            const want = sum(growable.map((i) => max[i] + SLACK - width[i]));
            const share = Math.min(1, budget / want);
            for (const i of growable) {
                const add = (max[i] + SLACK - width[i]) * share;
                width[i] += add;
                budget -= add;
            }
            growable = growable.filter((i) => width[i] < max[i] - 0.5);
        }
        // Spread whatever remains over all columns so the table still fills its line.
        const total = sum(width);
        return width.map((w) => w + (budget * w) / total);
    }

    function balanceTable(table, textWidth) {
        table.querySelectorAll(':scope > colgroup.balanced-columns').forEach((c) => c.remove());
        table.style.removeProperty('table-layout');
        table.style.removeProperty('width');
        const rows = Array.from(table.rows);
        if (!rows.length || !table.getClientRects().length) return;
        const n = rows[0].cells.length;
        const simpleGrid = n > 1 && rows.every((r) => r.cells.length === n
            && Array.from(r.cells).every((c) => c.colSpan === 1 && c.rowSpan === 1));
        if (!simpleGrid) return;

        // Indentation from lists or quotes is the same on screen and on paper.
        const body = getComputedStyle(document.body);
        const bodyContent = document.body.clientWidth - parseFloat(body.paddingLeft) - parseFloat(body.paddingRight);
        const parent = table.parentElement;
        const ps = getComputedStyle(parent);
        const parentContent = parent.clientWidth - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
        const available = Math.floor(textWidth - (bodyContent - parentContent));

        const min = columnWidths(table, 'min-content', true);
        const max = columnWidths(table, 'max-content', true);
        const bodyMax = table.tBodies.length && table.tBodies[0].rows.length ? columnWidths(table, 'max-content', false) : min;
        if (min.length !== n || max.length !== n || bodyMax.length !== n) return;

        const widths = allocateColumns(min, max, bodyMax, available);
        if (!widths) return;
        const total = sum(widths);
        const colgroup = document.createElement('colgroup');
        colgroup.className = 'balanced-columns';
        for (const w of widths) {
            const col = document.createElement('col');
            col.style.width = `${((100 * w) / total).toFixed(4)}%`;
            colgroup.appendChild(col);
        }
        table.insertBefore(colgroup, table.caption ? table.caption.nextSibling : table.firstChild);
        table.style.tableLayout = 'fixed';
        table.style.width = '100%';
    }

    function balanceTableColumns() {
        const page = printTextBox();
        if (!page) return;
        document.querySelectorAll('table').forEach((table) => balanceTable(table, page.width));
    }

    // ---- 2. Headings kept with the next block ---------------------------------------------
    //
    // The converter's Chromium ignores break-after: avoid, so a heading can end a page while
    // what it introduces starts the next one. Themes reserve a fixed guess of room below their
    // headings; this measures the room each heading, or run of headings, really needs: all of
    // a block that cannot split (a short table, a figure, an image or a display formula), or
    // else the first lines that must stay together (the block's orphans, or a table's first
    // row). That room becomes a print-only ::after spacer, cancelled by an equal negative
    // margin as in the themes. Headings do not split, so a heading now moves to the next page
    // whenever that room is missing; the visible layout is unchanged.

    const HEADINGS = 'h1, h2, h3, h4, h5, h6';
    const ATOMIC = 'img, svg, picture, video, canvas, iframe, object, embed, .katex-display';

    // The block after el, skipping VS Code's empty source-map divs and hidden elements.
    function nextBlock(el) {
        let next = el.nextElementSibling;
        while (next && (next.matches('div.code-line:empty') || !next.getClientRects().length)) {
            next = next.nextElementSibling;
        }
        return next;
    }

    const inFlow = (el) => el.getClientRects().length && !/^(absolute|fixed)$/.test(getComputedStyle(el).position);

    // A block that moves to the next page whole: one the theme keeps together, or a single
    // line of images or formulas.
    function unbreakable(block) {
        if (block.matches(ATOMIC) || /^avoid(-page)?$/.test(getComputedStyle(block).breakInside)) return true;
        const items = Array.from(block.childNodes)
            .filter((n) => n.nodeType === Node.ELEMENT_NODE || n.textContent.trim());
        if (!items.length || !items.every((n) => n.nodeType === Node.ELEMENT_NODE && n.matches(ATOMIC))) return false;
        const rects = items.map((n) => n.getBoundingClientRect());
        const lastTop = Math.max(...rects.map((r) => r.top));
        return rects.every((r) => r.bottom > lastTop);
    }

    // Boxes of the text, images and formulas inside el, one per line fragment.
    function inlineBoxes(el, boxes) {
        for (const node of el.childNodes) {
            if (node.nodeType === Node.TEXT_NODE) {
                if (!node.textContent.trim()) continue;
                const range = document.createRange();
                range.selectNodeContents(node);
                boxes.push(...range.getClientRects());
            } else if (node.nodeType === Node.ELEMENT_NODE && inFlow(node)) {
                // A formula's .base boxes carry its full height; KaTeX also hides a MathML copy.
                if (node.matches('.katex')) node.querySelectorAll('.base').forEach((b) => boxes.push(...b.getClientRects()));
                else if (node.matches(ATOMIC)) boxes.push(...node.getClientRects());
                else inlineBoxes(node, boxes);
            }
        }
        return boxes;
    }

    // Bottoms of the line boxes of a block that holds text itself, or null for a container.
    function lineBottoms(block) {
        const inline = (n) => (n.nodeType === Node.TEXT_NODE && n.textContent.trim())
            || (n.nodeType === Node.ELEMENT_NODE && /^inline/.test(getComputedStyle(n).display));
        if (!Array.from(block.childNodes).some(inline)) return null;
        const boxes = inlineBoxes(block, []).filter((r) => r.width || r.height).sort((a, b) => a.top - b.top);
        const lines = [];
        for (const box of boxes) {
            const line = lines[lines.length - 1];
            if (line && box.top < line.bottom - 1) {
                line.top = Math.min(line.top, box.top);
                line.bottom = Math.max(line.bottom, box.bottom);
            } else {
                lines.push({ top: box.top, bottom: box.bottom });
            }
        }
        // Text sits in the middle of its line box, which is line-height tall.
        const lineHeight = parseFloat(getComputedStyle(block).lineHeight) || 0;
        return lines.map((l) => Math.max(l.bottom, (l.top + l.bottom + lineHeight) / 2));
    }

    // Bottom of the first part of block that must share a page with the heading above it.
    function firstPieceBottom(block) {
        const bottom = block.getBoundingClientRect().bottom;
        if (unbreakable(block)) return bottom;
        if (block.matches('table')) {
            const row = block.tBodies.length ? block.tBodies[0].rows[0] : null;
            return row ? row.getBoundingClientRect().bottom : bottom;
        }
        const lines = lineBottoms(block);
        if (lines) {
            const orphans = parseInt(getComputedStyle(block).orphans, 10) || 2;
            return lines.length <= orphans ? bottom : lines[orphans - 1];
        }
        const first = Array.from(block.children).find(inFlow);
        return first ? firstPieceBottom(first) : bottom;
    }

    // Runs measure() with the body at the printed text width, and with headings stripped of
    // the ::after spacers themes use, so headings and blocks have their printed sizes.
    function measureAsPrinted(textWidth, measure) {
        const body = document.body;
        const saved = body.getAttribute('style');
        const layout = {
            width: `${textWidth}px`, 'min-width': '0', 'max-width': 'none',
            'padding-left': '0', 'padding-right': '0', 'box-sizing': 'content-box',
        };
        Object.entries(layout).forEach(([name, value]) => body.style.setProperty(name, value, 'important'));
        setStyle('script-measure', ':is(h1, h2, h3, h4, h5, h6)::after { display: none !important; }');
        try {
            return measure();
        } finally {
            document.getElementById('script-measure').remove();
            if (saved === null) body.removeAttribute('style');
            else body.setAttribute('style', saved);
        }
    }

    function keepHeadingsWithNext() {
        document.querySelectorAll('[data-keep-with-next]').forEach((heading) => {
            heading.removeAttribute('data-keep-with-next');
            heading.style.removeProperty('--keep-with-next-room');
        });
        const page = printTextBox();
        if (!page) return;
        const keeps = measureAsPrinted(page.width, () => {
            const found = [];
            for (const heading of document.querySelectorAll(`body > :is(${HEADINGS})`)) {
                let block = nextBlock(heading);
                while (block && block.matches(HEADINGS)) block = nextBlock(block);
                if (!block || /^(page|left|right|recto|verso)$/.test(getComputedStyle(block).breakBefore)) continue;
                const h = heading.getBoundingClientRect();
                const piece = firstPieceBottom(block);
                // A heading and piece that cannot share a page are left to the theme.
                if (piece - h.top > page.height - 2) continue;
                found.push([heading, Math.max(0, piece - h.bottom) + 2]);
            }
            return found;
        });
        for (const [heading, room] of keeps) {
            heading.setAttribute('data-keep-with-next', '');
            heading.style.setProperty('--keep-with-next-room', `${room.toFixed(1)}px`);
        }
        setStyle('script-keep-with-next', `@media print {
    [data-keep-with-next] {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
    }
    [data-keep-with-next]::after {
        content: "" !important;
        display: block !important;
        height: var(--keep-with-next-room) !important;
        margin-bottom: calc(-1 * var(--keep-with-next-room)) !important;
    }
}`);
    }

    // ---- Run -----------------------------------------------------------------------------

    const FIXES = [balanceTableColumns, keepHeadingsWithNext];

    // Run once now, and again once web fonts and images have loaded and sizes are final.
    const runAll = () => FIXES.forEach((fix) => fix());
    runAll();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(runAll);
    window.addEventListener('load', runAll);
})();
