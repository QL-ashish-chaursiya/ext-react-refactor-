export function getElementInfo(element) {
    return {
      id: element.id || '',
      tagName: element.tagName,
      name: element.name || '',
      value: element.value || element.getAttribute('value') || '',
      xpath: generateXPaths(element),
    };
  }
  
  const trim = (s) => (s || '').replace(/^\s+|\s+$/g, '');
  const ALLOWED_ATTRIBUTES = ['name', 'role', 'src', 'alt', 'href', 'aria-label', 'title', 'placeholder', 'aria-labelledby', 'id'];
  const EXCLUDED_CLASSES = ['keeper-ignore', '__recorder-hover-highlight__'];
  const PARENTS_CHECK_LIMIT = 6;
  const TEXT_SNIPPET_LEN = 40;
  
  const isSVGChildElement = (el) => 'ownerSVGElement' in el && !!el.ownerSVGElement;
  const isSVGElement = (el) => el && (el.tagName && el.tagName.toUpperCase() === 'SVG' || isSVGChildElement(el));
  const getXPathTagName = (el) => (isSVGElement(el) ? `*[name()="${el?.tagName.toLowerCase()}"]` : el?.tagName);
  
  function getElementIdx(element) {
    let count = 1;
    let sib = element.previousSibling;
    while (sib) {
      if (sib.nodeType === 1 && sib.tagName === element.tagName) count += 1;
      sib = sib.previousSibling;
    }
    return count;
  }
  
  function getTagIndexedOnSameLevelXPath(element) {
    const idx = getElementIdx(element);
    let tagName = getXPathTagName(element);
    if (idx > 1) tagName += `[${idx}]`;
    return tagName;
  }
  
  function getElementsByXPath(xpath, parent = document) {
    const results = [];
    try {
      const query = document.evaluate(xpath, parent, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      for (let i = 0; i < query.snapshotLength; i++) {
        const node = query.snapshotItem(i);
        if (node) results.push(node);
      }
    } catch (err) {
      // invalid xpath sometimes — ignore
    }
    return results;
  }
  
  function convertToIndexedXpathIfNeeded(el, selector) {
    const elements = getElementsByXPath(selector);
    const idx = elements.indexOf(el);
    if (idx === -1) return undefined;
    return elements.length > 1 ? `(${selector})[${idx + 1}]` : selector;
  }
  
  function normalizeValueForXPath(text) {
    const parts = text.match(/[^'"]+|['"]/g) || [];
    if (parts.length < 2) return `"${text}"`;
    const mapped = parts.map((p) => (p === "'" ? '"\'"' : p === '"' ? "'\"'" : `'${p}'`));
    return `concat(${mapped.join(',')})`;
  }
  
  function getDirectTextNodes(el) {
    const nodes = [];
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === Node.TEXT_NODE && n.nodeValue && trim(n.nodeValue).length > 0) nodes.push(n);
    }
    return nodes;
  }
  
  function getElementXPathByText(el) {
    const textNodes = getDirectTextNodes(el);
    if (!textNodes.length) return undefined;
    
    const combinedText = textNodes
      .map(n => trim(n.nodeValue || ''))
      .filter(text => text.length > 0)
      .join(' ')
      .trim();
      
    if (combinedText.length < 2) return undefined;
    
    const tag = getXPathTagName(el);
    
    if (combinedText.length > TEXT_SNIPPET_LEN) {
      const snippet = combinedText.slice(0, TEXT_SNIPPET_LEN).replace(/"/g, '');
      const norm = `"${snippet}"`;
      const xpath = `//${tag}[contains(normalize-space(.), ${norm})]`;
      const indexed = convertToIndexedXpathIfNeeded(el, xpath);
      if (indexed) return indexed;
    } else {
      const norm = normalizeValueForXPath(combinedText);
      const xpath = `//${tag}[normalize-space(.)=${norm}]`;
      const indexed = convertToIndexedXpathIfNeeded(el, xpath);
      if (indexed) return indexed;
    }
    
    return undefined;
  }
  
  function createXPathByAttribute({ el, attrName, attrValue = '', useContains = false }) {
    const tagName = getXPathTagName(el);
    const v = attrValue.includes('"') ? `'${attrValue}'` : `"${attrValue}"`;
    return useContains ? `//${tagName}[contains(@${attrName},${v})]` : `//${tagName}[@${attrName}=${v}]`;
  }
  
  function getFullXPath(el) {
    let path = '';
    let current = el;
    while (current && current.nodeType === 1) {
      path = `/${getTagIndexedOnSameLevelXPath(current)}${path}`;
      current = current.parentElement;
    }
    return path || undefined;
  }
  
  function getRelativeXPath(ancestor, descendant) {
    let path = '';
    let current = descendant;
    while (current && current !== ancestor) {
      path = `/${getTagIndexedOnSameLevelXPath(current)}${path}`;
      current = current.parentElement;
    }
    return current === ancestor ? path : undefined;
  }
  
  function getAttributeBasedXPaths(el, xpaths) {
    if (el.attributes) {
      const dataAttrs = Array.from(el.attributes).filter((a) => a.name.startsWith('data-'));
      for (const { name, value } of dataAttrs) {
        const sel = createXPathByAttribute({ el, attrName: name, attrValue: value });
        const indexed = convertToIndexedXpathIfNeeded(el, sel);
        if (indexed) xpaths.push(indexed);
      }
    }
    
    if (el.attributes) {
      for (const attrName of ALLOWED_ATTRIBUTES) {
        const attrValue = el.getAttribute(attrName);
        if (attrValue) {
          const sel = createXPathByAttribute({ el, attrName, attrValue });
          const indexed = convertToIndexedXpathIfNeeded(el, sel);
          if (indexed) xpaths.push(indexed);
        }
      }
    }
  }
  
  function getParentIdOrClassXPath(el, xpaths) {
    let current = el;
    let level = 0;
    const addedAttr = [];
  
    function pushXPath(current, el, tagName, condition, key) {
      if (!condition || addedAttr.includes(key)) return;
      const parentSelector = `//${tagName}[${condition}]`;
      const relative = getRelativeXPath(current, el);
      if (!relative) return;
      const selector = `${parentSelector}${relative}`;
      const indexed = convertToIndexedXpathIfNeeded(el, selector);
      if (indexed) {
        xpaths.push(indexed);
        addedAttr.push(key);
      }
    }
  
    while (current && level < PARENTS_CHECK_LIMIT) {
      if (current.getAttribute) {
        const tagName = current.tagName?.toLowerCase();
        if (!tagName) break;
  
        for (const { name, value } of Array.from(current.attributes)) {
          if (name.startsWith('data-') && value) {
            pushXPath(current, el, tagName, `@${name}="${value}"`, name);
          }
        }
        pushXPath(current, el, tagName, `@role="${current.getAttribute('role')}"`, 'role');
        pushXPath(current, el, tagName, `@aria-labelledby="${current.getAttribute('aria-labelledby')}"`, 'aria-labelledby');
        pushXPath(current, el, tagName, `@id="${current.getAttribute('id')}"`, 'id');
        if (level >= 2) {
          const classVal = current.getAttribute('class');
          if (classVal) {
            const cls = trim(classVal).split(/\s+/).find((c) => !EXCLUDED_CLASSES.includes(c));
            if (cls) {
              pushXPath(current, el, tagName, `contains(@class,"${cls}")`, `class`);
            }
          }
        }
      }
      current = current.parentElement;
      level++;
    }
  }
  
  function getOneStepUpClassXPath(el, xpaths) {
    const parent = el.parentElement;
    if (!parent) return;
    const classVal = parent.getAttribute && parent.getAttribute('class');
    if (!classVal) return;
    const cls = trim(classVal).split(/\s+/).find((c) => !EXCLUDED_CLASSES.includes(c));
    if (!cls) return;
    const parentTag = parent.tagName.toUpperCase();
    const parentSelector = `//${parentTag}[contains(@class,"${cls}")]`;
    const selector = `${parentSelector}/${getTagIndexedOnSameLevelXPath(el)}`;
    const indexed = convertToIndexedXpathIfNeeded(el, selector);
    if (indexed) xpaths.push(indexed);
  }
  
  function getClassBasedXPath(el, xpaths) {
    const classVal = el.getAttribute && el.getAttribute('class');
    if (!classVal) return;
    const cls = trim(classVal).split(/\s+/).find((c) => !EXCLUDED_CLASSES.includes(c));
    if (!cls) return;
    const selector = `//${getXPathTagName(el)}[contains(@class,"${cls}")]`;
    const indexed = convertToIndexedXpathIfNeeded(el, selector);
    if (indexed) xpaths.push(indexed);
  }
  
  function handleSVGSpecialCases(el, xpaths) {
    if (!isSVGElement(el)) return;
  
    const tagName = getXPathTagName(el);
    const attrs = Array.from(el.attributes || []).filter((a) => (a.name.startsWith('data-') || ALLOWED_ATTRIBUTES.includes(a.name)) && a.value);
    for (const { name, value } of attrs) {
      const selector = `//${tagName}[@${name}="${value}"]`;
      const indexed = convertToIndexedXpathIfNeeded(el, selector);
      if (indexed) {
        xpaths.push(indexed);
        return;
      }
    }
  
    const parent = el.parentElement;
    if (parent) {
      if (parent.id) {
        const selector = `//*[@id="${parent.id}"]/${tagName}`;
        const indexed = convertToIndexedXpathIfNeeded(el, selector);
        if (indexed) {
          xpaths.push(indexed);
          return;
        }
      }
      const classVal = parent.getAttribute('class');
      if (classVal) {
        const cls = trim(classVal).split(/\s+/).find((c) => !EXCLUDED_CLASSES.includes(c));
        if (cls) {
          const selector = `//*[contains(@class,"${cls}")]/${tagName}`;
          const indexed = convertToIndexedXpathIfNeeded(el, selector);
          if (indexed) {
            xpaths.push(indexed);
            return;
          }
        }
      }
    }
  
    const plainSelector = `//${tagName}`;
    const indexed = convertToIndexedXpathIfNeeded(el, plainSelector);
    if (indexed) xpaths.push(indexed);
  }
  
  export function generateXPaths(originalEl) {
    let el = originalEl;
    if (el && el.closest) {
      const svgAncestor = el.closest && el.closest('svg');
      if (svgAncestor) el = svgAncestor;
    }
  
    const xpaths = [];
    getAttributeBasedXPaths(el, xpaths);
    if (!isSVGElement(el)) {
      const textXPath = getElementXPathByText(el);
      if (textXPath) xpaths.push(textXPath);
    }
    getParentIdOrClassXPath(el, xpaths);
    getOneStepUpClassXPath(el, xpaths);
    getClassBasedXPath(el, xpaths);
    handleSVGSpecialCases(el, xpaths);
    const full = getFullXPath(el);
    if (full) xpaths.push(full);
    return Array.from(new Set(xpaths));
  }