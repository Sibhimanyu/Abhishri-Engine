// table-sort.js — universal in-place column sorting for all .console-table instances
// Uses event delegation: works on dynamically rendered tables automatically.
// Add data-no-sort to any <th> to opt out (e.g. action columns).

(function () {
    const state = new WeakMap(); // table element → { col, dir }

    function cellValue(cell) {
        // If the cell contains a <select>, sort by the selected option's text, not all option texts
        const select = cell?.querySelector('select');
        if (select) {
            const raw = (select.options[select.selectedIndex]?.text || '').trim();
            return { raw, num: null };
        }

        const raw = (cell?.innerText || cell?.textContent || '').trim();
        const cleaned = raw.replace(/[₹%,\s]/g, '');
        const num = parseFloat(cleaned);
        return { raw, num: isNaN(num) ? null : num };
    }

    function updateIndicators(table, activeCol, dir) {
        table.querySelectorAll('thead th').forEach((th, i) => {
            if (th.hasAttribute('data-no-sort')) return;
            th.setAttribute('data-sort', i === activeCol ? dir : '');
        });
    }

    function sort(table, colIdx) {
        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        let s = state.get(table) || { col: -1, dir: 'asc' };
        s = colIdx === s.col
            ? { col: colIdx, dir: s.dir === 'asc' ? 'desc' : 'asc' }
            : { col: colIdx, dir: 'asc' };
        state.set(table, s);

        updateIndicators(table, s.col, s.dir);

        // Separate visible and hidden rows (respect active filters)
        const allRows = [...tbody.querySelectorAll('tr')];
        const visible = allRows.filter(r => r.style.display !== 'none');
        const hidden  = allRows.filter(r => r.style.display === 'none');

        visible.sort((a, b) => {
            const av = cellValue(a.cells[colIdx]);
            const bv = cellValue(b.cells[colIdx]);
            let cmp = (av.num !== null && bv.num !== null)
                ? av.num - bv.num
                : av.raw.localeCompare(bv.raw, 'en', { sensitivity: 'base', numeric: true });
            return s.dir === 'asc' ? cmp : -cmp;
        });

        // Re-attach: sorted visible rows first, then hidden (filters intact)
        [...visible, ...hidden].forEach(r => tbody.appendChild(r));
    }

    // Single delegated listener — catches all tables, including ones rendered after page load
    document.addEventListener('click', e => {
        const th = e.target.closest('th');
        if (!th) return;
        if (th.hasAttribute('data-no-sort')) return;
        if (th.getAttribute('onclick')) return; // has its own handler — don't double-sort
        const table = th.closest('table.console-table');
        if (!table) return;

        const ths = [...th.closest('tr').querySelectorAll('th')];
        const idx = ths.indexOf(th);
        if (idx < 0) return;

        sort(table, idx);
    });

    // Reset sort state when a table is re-rendered (innerHTML replaced)
    // so indicators don't desync after filter / tab switches
    const observer = new MutationObserver(mutations => {
        mutations.forEach(m => {
            m.removedNodes.forEach(node => {
                if (node?.nodeName === 'TABLE' && node.classList?.contains('console-table')) {
                    state.delete(node);
                }
            });
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
})();
