/* Render mathematical notation in prose and tables, including restored edits. */
(() => {
  const symbols = {
    '∧': '\\land', '∨': '\\lor', '¬': '\\neg', '→': '\\to',
    '≠': '\\ne', '≤': '\\le', '≥': '\\ge', '∈': '\\in',
    '∞': '\\infty', '·': '\\cdot', '×': '\\times', '−': '-',
    'α': '\\alpha', '∑': '\\sum', '√': '\\sqrt', '…': '\\ldots'
  };
  function tex(source) {
    return source
      .replace(/t_clkQ,max\/min/g, 't_{\\mathrm{clk\\to Q,max/min}}')
      .replace(/t_skew/g, 't_{\\mathrm{skew}}')
      .replace(/T_hilfe/g, 'T_{\\mathrm{hilfe}}')
      .replace(/[₀₁₂₃₄₅₆₇₈₉ᵢ]+/g, s => '_{' + [...s].map(c => c === 'ᵢ' ? 'i' : '₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).join('') + '}')
      .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹ᵉ]+/g, s => '^{' + [...s].map(c => c === 'ᵉ' ? 'e' : '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join('') + '}')
      .replace(/\bO\(/g, '\\mathcal{O}(')
      .replace(/\blog\b/g, '\\log ')
      .replace(/\bmin(?=\s*\()/g, '\\min ')
      .replace(/\bmod\b/g, '\\bmod ')
      .replace(/\b(NAND|NOR)\b/g, '\\operatorname{$1}')
      .replace(/\bAND\b/g, '\\land').replace(/\bOR\b/g, '\\lor').replace(/\bNOT\b/g, '\\neg')
      .replace(/\b([a-zA-Z]|\d+)\/([a-zA-Z]|\d+)\b/g, '\\frac{$1}{$2}')
      .replace(/[∧∨¬→≠≤≥∈∞·×−α∑√…]/g, c => symbols[c] + ' ');
  }
  const atom = String.raw`(?:(?:[¬−-]\s*)?(?:(?:pred|rank|min|[A-Z]{2,3}|[A-Za-zα])(?:[₀-₉ᵢ⁰¹²³ᵉ]|_[A-Za-z]+)*(?:\((?:[^()]|\([^()]*\))*\))?(?:\[[^\]]+\])?|\d+(?:[A-Za-z])?(?:[²³]|\.\.\.)?|\((?:[^()]|\([^()]*\))*\)))`;
  const expression = new RegExp(String.raw`(?<![A-Za-z0-9_\\])` + atom + String.raw`(?:\s*(?:[=+∧∨≠≤≥∈·×−→…]|\bmod\b|\bAND\b|\bOR\b|\bNAND\b|\bNOR\b)\s*` + atom + ')+(?![A-Za-z0-9äöüß])', 'g');
  const notation = /\bO\((?:[^()]|\([^()]*\))*\)|\b(?:[a-zA-Z][₀-₉ᵢ⁰¹²³ᵉ]+|t_clkQ,max\/min|t_skew|T_hilfe\([^()]*\)|NOT\s+[a-zA-Z])|[∞α]/g;
  function pieces(text) {
    const matches = [];
    // Existing LaTeX must retain its delimiters and source unchanged.
    const protectedRanges = [...text.matchAll(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g)].map(m => [m.index, m.index + m[0].length]);
    for (const re of [expression, notation]) {
      re.lastIndex = 0;
      for (const m of text.matchAll(re)) {
        const start = m.index, end = start + m[0].length;
        if (protectedRanges.some(([a,b]) => start < b && end > a) || matches.some(m => start < m.end && end > m.start)) continue;
        // Equals signs used to explain words are prose, not equations.
        if (/[a-zA-Zäöüß]/.test(text[end] || '')) continue;
        if (start > 0 && /[\w\\]/.test(text[start - 1])) continue;
        matches.push({start, end, source: m[0]});
      }
    }
    return matches.sort((a,b) => a.start - b.start);
  }
  function format(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let changed = false;
    for (const node of nodes) {
      if (node.parentElement?.closest('.formula,.math-inline,.inline-math-wrap,mjx-container,svg,code,pre,script,style,textarea,button,[contenteditable="true"]')) continue;
      const text = node.nodeValue;
      const matches = pieces(text);
      if (!matches.length) continue;
      const fragment = document.createDocumentFragment();
      let last = 0;
      for (const m of matches) {
        fragment.append(document.createTextNode(text.slice(last, m.start)));
        const span = document.createElement('span');
        span.className = 'math-inline';
        span.textContent = '\\(' + tex(m.source) + '\\)';
        fragment.append(span);
        last = m.end;
      }
      fragment.append(document.createTextNode(text.slice(last)));
      node.replaceWith(fragment);
      changed = true;
    }
    return changed;
  }
  let pending = new Set(), scheduled = false;
  async function flush() {
    scheduled = false;
    const roots = [...pending]; pending.clear();
    for (const root of roots) {
      if (!root.isConnected || root.closest('details.is-editing')) continue;
      if (!format(root)) continue;
      window.studyHydrateInlineMath?.(root);
      if (window.MathJax?.startup?.promise) await window.MathJax.startup.promise;
      if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise([root]);
    }
  }
  const observer = new MutationObserver(records => {
    for (const record of records) {
      const parent = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
      if (parent?.closest('.formula,.math-inline,.inline-math-wrap,mjx-container,svg,code,pre,script,style,button')) continue;
      const content = parent?.closest('.content');
      if (content) pending.add(content);
    }
    if (pending.size && !scheduled) {
      scheduled = true;
      setTimeout(() => flush().catch(console.warn), 0);
    }
  });
  document.querySelectorAll('.content').forEach(root => pending.add(root));
  flush().catch(console.warn);
  observer.observe(document.querySelector('.wrap'), {childList: true, subtree: true, characterData: true});
})();
