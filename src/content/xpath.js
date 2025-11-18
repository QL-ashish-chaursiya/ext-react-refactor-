 // ===== CONSTANTS =====
    const EXCLUDED_CLASSES = ['__recorder-hover-highlight__'];
  const SVG_TAG = 'SVG';
  const PROBLEMATIC_IFRAME_NAME_FRAGMENTS = ['__zoid__paypal_buttons', '__privateStripeFrame'];
  const USED_XPATH_FUNCTIONS = ['concat', 'contains'];
  const PARENTS_CHECK_LIMIT = 5;
  
  const UNWANTED_EMPTY_ATTRIBUTES = [
    'disabled', 'checked', 'selected', 'readonly', 'dragabble', 
    'hidden', 'required', 'autofocus'
  ];
  
  const EXCLUDED_ATTRIBUTES = [
    // Framework attributes
    'data-reactid', 'data-reactroot', 'ng-click', 'ng-submit', 'ng-disabled', 'ng-class', 'wire:',
    // Extension attributes
    'data-form-type', 'data-1p-ignore', 'data-bwignore', 'data-lpignore',
    // BugBug internal
    'data-bugbug-', 'data-bb-input-id',
    // Native attributes
    'xml:', 'xmlns:', 'aria-required', 'aria-multiline', 'aria-multiselectable', 'aria-readonly',
    'aria-selected', 'aria-checked', 'aria-pressed', 'aria-expanded', 'aria-modal', 'aria-hidden',
    'aria-rowindex', 'aria-colindex', 'aria-rowspan', 'aria-colspan', 'aria-rowcount', 'aria-colcount',
    'style', 'tabindex', 'dirname', 'allow', 'allowfullscreen', 'autocomplete', 'sandbox',
    'colspan', 'rowspan', 'loop', 'muted', 'autoplay', 'controls', 'multiple', 'size',
    'min', 'max', 'step', 'height', 'width', 'onclick', 'onchange', 'oninput', 'onsubmit',
    'onreset', 'onselect', 'onblur', 'onfocus', 'oninvalid', 'method', 'lang', 'theme',
    'xlink:href', 'dir', 'accept-charset', 'spellcheck', 'novalidate','aria-controls','value'
  ];
  
  // ===== HELPER FUNCTIONS =====
  
  const trim = (str) => str.trim();
  
  const isProblematicIframeName = (name) =>
    PROBLEMATIC_IFRAME_NAME_FRAGMENTS.some((fragment) => name.includes(fragment));
  
  const isSVGChildElement = (element) =>
    'ownerSVGElement' in element && !!element.ownerSVGElement;
  
  const isSVGElement = (element) =>
    element.tagName.toUpperCase() === SVG_TAG || isSVGChildElement(element);
  
  const getXPathTagName = (element) => {
    if (isSVGElement(element)) {
      return `*[name()="${element.tagName}"]`;
    }
    return element.tagName;
  };
  
  const getElementIdx = (element) => {
    let count = 1;
    let sib;
    for (sib = element.previousSibling; sib; sib = sib.previousSibling) {
      if (sib.nodeType === 1 && sib.tagName === element.tagName) {
        count += 1;
      }
    }
    return count;
  };
  
  const getTagIndexedOnSameLevelXPath = (el) => {
    const idx = getElementIdx(el);
    let tagName = getXPathTagName(el);
    if (idx > 1) {
      tagName += `[${idx}]`;
    }
    return tagName;
  };
  
  const getElementsByXPath = (xpath, parent = document) => {
    const results = [];
    let node;
    
    try {
      const query = document.evaluate(
        xpath,
        parent,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      
      for (let i = 0, length = query.snapshotLength; i < length; i += 1) {
        node = query.snapshotItem(i);
        if (node) {
          results.push(node);
        }
      }
    } catch (e) {
      console.warn('[XPath Error]', xpath, e);
    }
    
    return results;
  };
  
  const convertToIndexedXpathIfNeeded = (element, selector) => {
    const elements = getElementsByXPath(selector);
    const elementIdx = elements.indexOf(element);
    
    if (elementIdx === 0) return selector;
    
    if (elementIdx === -1) {
      return undefined;
    }
    
    const xPathIndex = elementIdx + 1;
    return `(${selector})[${xPathIndex}]`;
  };
  
  const normalizeValueForXPath = (text) => {
    const parts = text.match(/[^'"]+|['"]/g) || [];
    if (parts.length < 2) return `"${text}"`;
    
    const partsWithNormalizedQuotationMarks = parts.map((part) => {
      if (part === "'") return '"\'"';
      if (part === '"') return "'\"'";
      return `'${part}'`;
    });
    
    return `concat(${partsWithNormalizedQuotationMarks.join(',')})`;
  };
  
  const getElementTextNodes = (element) => {
    const textValues = [];
    
    for (let i = 0; i < element.childNodes.length; i += 1) {
      const childNode = element.childNodes[i];
      if (childNode.nodeType === Node.TEXT_NODE && childNode.nodeValue) {
        textValues.push(childNode);
      }
    }
    
    return textValues;
  };
  
  const createXPathByAttribute = ({
    element,
    attrName,
    attrValue = '',
    parentSelector = '',
    ignoreElementTag = false,
    useContains = false,
  }) => {
    let value = `${attrValue ?? ''}`;
    const tagName = ignoreElementTag ? '*' : getXPathTagName(element);
    const isFuncValue = USED_XPATH_FUNCTIONS.some((func) => value.startsWith(`${func}(`));
    
    if (!isFuncValue) {
      value = value.includes('"') ? `'${value}'` : `"${value}"`;
    }
    
    if (useContains) {
      return `${parentSelector}//${tagName}[contains(@${attrName},${value})]`;
    }
    
    if (isSVGElement(element)) {
      const transformedTagNameWithAttr = tagName.replace(']', ` and @${attrName}=${value}]`);
      return `${parentSelector}//${transformedTagNameWithAttr}`;
    }
    
    return `${parentSelector}//${tagName}[@${attrName}=${value}]`;
  };
  
  const getElementXPathUsingChildText = (element, parentSelector) => {
    const MIN_TEXT_LENGTH = 2;
    const MAX_TEXT_LENGTH = 250;
    const childTextNodes = getElementTextNodes(element);
    if (!childTextNodes.length) {
      return undefined;
    }
    
    let lastXpath;
    for (let i = 0; i < childTextNodes.length; i += 1) {
      const childText = childTextNodes[i].nodeValue;
      
      if (childText.length >= MIN_TEXT_LENGTH) {
        const cleanedChildText = normalizeValueForXPath(trim(childText));
        const xpath = `${parentSelector}//${element.tagName}[normalize-space(.)=${cleanedChildText}]`;
        
        const xpathWithIndex = convertToIndexedXpathIfNeeded(element, xpath);
        if (xpath === xpathWithIndex) {
          return xpathWithIndex;
        }
        
        lastXpath = xpathWithIndex;
      }
    }
    
    const { wholeText } = childTextNodes[0];
    
    if (wholeText.length < MIN_TEXT_LENGTH || wholeText.length > MAX_TEXT_LENGTH) {
      return lastXpath;
    }
    
    const xpathByWholeText = `${parentSelector}//${element.tagName}[.='${trim(wholeText)}']`;
    const xpathByWholeTextWithIndex = convertToIndexedXpathIfNeeded(element, xpathByWholeText);
    return xpathByWholeTextWithIndex || lastXpath;
  };
   function getDirectTextNodes(el) {
    const nodes = [];
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === Node.TEXT_NODE && n.nodeValue && trim(n.nodeValue).length > 0) nodes.push(n);
    }
    return nodes;
  }
  function getElementXPathByText(el) {
    const TEXT_SNIPPET_LEN = 40;
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
  
  const getParents = (element) => {
    const parents = [];
    let current = element.parentElement;
    
    while (current && current !== document.body) {
      parents.push(current);
      current = current.parentElement;
    }
    
    return parents;
  };
  
  const getPath = (element) => {
    const path = [];
    let current = element;
    
    while (current && current.nodeType === Node.ELEMENT_NODE) {
      path.push(current);
      current = current.parentElement;
    }
    
    return path;
  };
  
  const getElementFullXPath = (element) => {
    const path = getPath(element);
    const xpathParts = path.map(getTagIndexedOnSameLevelXPath).reverse();
    return ['', ...xpathParts].join('/');
  };
  
  const isAttributeUnique = (element, attrName, attrValue) => {
    if (!attrValue) return false;
    
    try {
      const xpath = `//*[@${attrName}="${attrValue}"]`;
      const elements = getElementsByXPath(xpath);
      return elements.length === 1 && elements[0] === element;
    } catch (e) {
      return false;
    }
  };
  
  const getFilteredAttributes = (element) => {
    const attributes = {
      generic: [],
      aria: [],
      data: [],
      other: [],
      custom: []
    };
    
    if (!element.attributes) return attributes;
    
    for (let i = 0; i < element.attributes.length; i++) {
      const attr = element.attributes[i];
      const { name, value } = attr;
      
      // Check if excluded
      const isExcluded = EXCLUDED_ATTRIBUTES.some(excluded => {
        if (excluded.endsWith(':') || excluded.endsWith('-')) {
          return name.startsWith(excluded);
        }
        return name === excluded;
      });
      
      if (isExcluded) continue;
      
      // Check if unwanted empty
      if (!value && UNWANTED_EMPTY_ATTRIBUTES.some(attr => name.startsWith(attr))) {
        continue;
      }
      
      // Check uniqueness for non-generic attributes
      const isUnique = isAttributeUnique(element, name, value);
      
      // Categorize
      const attrObj = { name, value, isUnique };
      
      if (['id', 'name', 'href', 'placeholder', 'class'].includes(name)) {
        attributes.generic.push(attrObj);
      } else if (name.startsWith('aria-')) {
        attributes.aria.push(attrObj);
      } else if (name.startsWith('data-')) {
        attributes.data.push(attrObj);
      } else {
        attributes.other.push(attrObj);
      }
    }
    
    return attributes;
  };
  
  const getElementXPathByAttribute = ({ element, methodName, attribute, parentSelector }) => {
    if (!attribute || !element || !element.hasAttribute?.(attribute.name)) return undefined;
    
    const { name, value } = attribute;
    
    switch (methodName) {
      case 'elementId': {
        const elementId = value?.toLowerCase() ?? '';
        if (!elementId) return undefined;
        
        const excludedIds = ['ember', 'select2'];
        if (excludedIds.some((id) => elementId.includes(id))) return undefined;
        
        const selector = createXPathByAttribute({
          element,
          attrName: 'id',
          attrValue: value,
          parentSelector,
        });
        return convertToIndexedXpathIfNeeded(element, selector);
      }
      case 'elementName': {
        if (value) {
          const isPartiallyDynamicValue = isProblematicIframeName(value);
          const attrValue = isPartiallyDynamicValue
            ? PROBLEMATIC_IFRAME_NAME_FRAGMENTS.find((fragment) => value.includes(fragment))
            : value;
          const selector = createXPathByAttribute({
            element,
            attrName: 'name',
            attrValue,
            parentSelector,
            useContains: isPartiallyDynamicValue,
          });
          return convertToIndexedXpathIfNeeded(element, selector);
        }
        break;
      }
      case 'elementClassName': {
        const className = (value ?? '').trim();
        if (!className) return undefined;
        
        const classNames = className.split(' ').filter((cls) => !EXCLUDED_CLASSES.includes(cls));
        for (let i = 0; i < classNames.length; i += 1) {
          const selector = createXPathByAttribute({
            element,
            attrName: 'class',
            attrValue: classNames[i],
            parentSelector,
            useContains: true,
          });
          
          if (selector === convertToIndexedXpathIfNeeded(element, selector)) {
            return selector;
          }
        }
        return undefined;
      }
      case 'elementPlaceholder': {
        if (!value) return undefined;
        
        const attrValue = value.includes('"') || value.includes("'") 
          ? normalizeValueForXPath(value) 
          : value;
        const locator = createXPathByAttribute({
          element,
          attrName: 'placeholder',
          attrValue,
          parentSelector,
          useContains: true,
        });
        
        return convertToIndexedXpathIfNeeded(element, locator);
      }
      case 'elementHref': {
        if (!value) return undefined;
        const selector = createXPathByAttribute({
          element,
          attrName: 'href',
          attrValue: value,
          parentSelector,
        });
        return convertToIndexedXpathIfNeeded(element, selector);
      }
      case 'elementData':
      case 'elementAria':
      case 'elementUniqueAttributes': {
        const selector = createXPathByAttribute({
          element,
          attrName: name,
          attrValue: value,
          parentSelector,
          ignoreElementTag: true,
        });
        return convertToIndexedXpathIfNeeded(element, selector);
      }
      default:
        return undefined;
    }
    
    return undefined;
  };
  
  const getParentRelatedXPaths = ({ element, methodName, attributes }) => {
    const parents = getParents(element).slice(0, PARENTS_CHECK_LIMIT);
    let currentParentXPaths = [];
    const sourceElementTagSelector = getTagIndexedOnSameLevelXPath(element);
    const parentsInBetweenList = [];
    
    for (let index = 0; index < parents.length; index += 1) {
      const parent = parents[index];
      const parentAttributes = getFilteredAttributes(parent);
      
      // Get XPaths for this parent
      const xpaths = [];
      
      switch (methodName) {
        case 'elementId':
        case 'elementName':
        case 'elementHref':
        case 'elementPlaceholder':
        case 'elementClassName': {
          const genericAttrsByMethod = {
            elementId: 'id',
            elementName: 'name',
            elementHref: 'href',
            elementPlaceholder: 'placeholder',
            elementClassName: 'class',
          };
          const attribute = parentAttributes.generic.find(
            (attr) => attr.name === genericAttrsByMethod[methodName]
          );
          if (attribute) {
            const xpath = getElementXPathByAttribute({ 
              element: parent, 
              methodName, 
              attribute, 
              parentSelector: '' 
            });
            if (xpath) xpaths.push(xpath);
          }
          break;
        }
        case 'elementAria': {
          parentAttributes.aria
            .filter(attr => attr.isUnique)
            .forEach(attribute => {
              const xpath = getElementXPathByAttribute({ 
                element: parent, 
                methodName, 
                attribute, 
                parentSelector: '' 
              });
              if (xpath) xpaths.push(xpath);
            });
          break;
        }
        case 'elementData': {
          parentAttributes.data
            .filter(attr => attr.isUnique)
            .forEach(attribute => {
              const xpath = getElementXPathByAttribute({ 
                element: parent, 
                methodName, 
                attribute, 
                parentSelector: '' 
              });
              if (xpath) xpaths.push(xpath);
            });
          break;
        }
        case 'elementUniqueAttributes': {
          parentAttributes.other
            .filter(attr => attr.isUnique)
            .forEach(attribute => {
              const xpath = getElementXPathByAttribute({ 
                element: parent, 
                methodName, 
                attribute, 
                parentSelector: '' 
              });
              if (xpath) xpaths.push(xpath);
            });
          break;
        }
        case 'elementCustomAttributes': {
          parentAttributes.custom.forEach(attribute => {
            const xpath = getElementXPathByAttribute({ 
              element: parent, 
              methodName, 
              attribute, 
              parentSelector: '' 
            });
            if (xpath) xpaths.push(xpath);
          });
          break;
        }
      }
      
      currentParentXPaths = xpaths;
      
      if (currentParentXPaths.length) break;
      
      parentsInBetweenList.push(getTagIndexedOnSameLevelXPath(parent));
    }
    
    return currentParentXPaths.map(xpath => {
      const selector = [sourceElementTagSelector, ...parentsInBetweenList, xpath]
        .reverse()
        .join('/');
      return selector.startsWith('/') || selector.startsWith('(/') ? selector : `//${selector}`;
    });
  };
  
  // ===== MAIN XPATH GENERATION FUNCTION (Following actual code flow) =====
  
  export const  generateXPaths = (element) => {
    const selectors = [];
    const parentSelector = '';
    console.log("element",element)
    
    // Get attributes for element
    const attributes = getFilteredAttributes(element);
    
    // Selector methods in priority order (matching actual implementation)
    const selectorMethods = [
      { name: 'elementAria', isActive: true },
      { name: 'elementData', isActive: true },
      { name: 'elementName', isActive: true },
      { name: 'elementHref', isActive: true },
      { name: 'elementPlaceholder', isActive: true },
      { name: 'elementUniqueAttributes', isActive: true },
      { name: 'elementId', isActive: true },
      { name: 'elementClassName', isActive: true },
      { name: 'elementText', isActive: true },
      { name: 'elementFullXPath', isActive: true },
    ];
    
    for (const method of selectorMethods) {
      try {
        const xPathLocators = [];
        
        switch (method.name) {
          case 'elementText': {
             if (!isSVGElement(element)) {
      const xpath = getElementXPathByText(element);
        if (xpath) xPathLocators.push(xpath);
            break;
       
    } 
           
          }
          case 'elementFullXPath': {
            const xpath = getElementFullXPath(element);
            if (xpath) xPathLocators.push(xpath);
            break;
          }
          case 'elementId':
          case 'elementName':
          case 'elementHref':
          case 'elementPlaceholder':
          case 'elementClassName': {
            if (attributes.generic?.length) {
              const genericAttrsByMethod = {
                elementId: 'id',
                elementName: 'name',
                elementHref: 'href',
                elementPlaceholder: 'placeholder',
                elementClassName: 'class',
              };
              const attribute = attributes.generic.find(
                (attr) => attr.name === genericAttrsByMethod[method.name]
              );
              if (attribute) {
                const xpath = getElementXPathByAttribute({ 
                  element, 
                  methodName: method.name, 
                  attribute, 
                  parentSelector 
                });
                if (xpath) xPathLocators.push(xpath);
              }
            }
            break;
          }
          case 'elementAria': {
            if (attributes.aria?.length) {
              attributes.aria
                .filter((attr) => attr.isUnique)
                .forEach((attribute) => {
                  const xpath = getElementXPathByAttribute({ 
                    element, 
                    methodName: method.name, 
                    attribute, 
                    parentSelector 
                  });
                  if (xpath) xPathLocators.push(xpath);
                });
            }
            break;
          }
          case 'elementData': {
            if (attributes.data?.length) {
              attributes.data
                .filter((attr) => attr.isUnique)
                .forEach((attribute) => {
                  const xpath = getElementXPathByAttribute({ 
                    element, 
                    methodName: method.name, 
                    attribute, 
                    parentSelector 
                  });
                  if (xpath) xPathLocators.push(xpath);
                });
            }
            break;
          }
          case 'elementUniqueAttributes': {
            if (attributes.other?.length) {
              attributes.other
                .filter((attr) => attr.isUnique)
                .forEach((attribute) => {
                  const xpath = getElementXPathByAttribute({ 
                    element, 
                    methodName: method.name, 
                    attribute, 
                    parentSelector 
                  });
                  if (xpath) xPathLocators.push(xpath);
                });
            }
            break;
          }
        }
        
        if (xPathLocators.length) {
          selectors.push(...xPathLocators);
        }
        
        // Check parent-related selectors for specific methods
        const shouldCheckParentAttrSelector = [
          'elementId',
          'elementName',
          'elementHref',
          'elementPlaceholder',
          'elementClassName',
          'elementAria',
          'elementData',
          'elementUniqueAttributes',
          'elementCustomAttributes',
        ].includes(method.name);
        
        if (shouldCheckParentAttrSelector) {
          const parentXPaths = getParentRelatedXPaths({ 
            element, 
            methodName: method.name, 
            attributes 
          });
          selectors.push(...parentXPaths);
        }
      } catch (error) {
        console.warn(`Error creating "${method.name}" selector:`, error);
      }
    }
    
    // If no selectors found, use full XPath as fallback
    if (!selectors.length) {
      const elementFullXPath = getElementFullXPath(element);
      if (elementFullXPath) {
        selectors.push(elementFullXPath);
      }
    }
    
    // Remove duplicates
    const uniqueSelectors = [...new Set(selectors)];
    console.log("xpath,",uniqueSelectors)
    return uniqueSelectors;
  };
  export function getElementInfo(element) {
      return {
        id: element.id || '',
        tagName: element.tagName,
        name: element.name || '',
        value: element.value || element.getAttribute('value') || '',
        xpath: generateXPaths(element),
      };
    }