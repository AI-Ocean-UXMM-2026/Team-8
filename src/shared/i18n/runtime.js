// UI-only localization. Record values and user-authored text never change.
(() => {
  const catalog = window.ParcelCareMyanmar;
  const key = 'pc-language-v1';
  let language = 'en';
  try { language = localStorage.getItem(key) === 'my' ? 'my' : 'en'; } catch {}
  const originals = new WeakMap();
  const attributes = new WeakMap();
  const normalize = text => text.replace(/\s+/g, ' ').trim();
  const ordered = Object.keys(catalog).sort((a, b) => b.length - a.length);
  function translate(text) {
    text = window.ParcelCareEnglish[normalize(text)] || text;
    if (language === 'en') return text;
    const clean = normalize(text);
    if (catalog[clean]) return text.replace(clean, catalog[clean]);
    const monthNames={Jan:'ဇန်နဝါရီ',Feb:'ဖေဖော်ဝါရီ',Mar:'မတ်',Apr:'ဧပြီ',May:'မေ',Jun:'ဇွန်',Jul:'ဇူလိုင်',Aug:'ဩဂုတ်',Sep:'စက်တင်ဘာ',Oct:'အောက်တိုဘာ',Nov:'နိုဝင်ဘာ',Dec:'ဒီဇင်ဘာ'};
    let result = text.replace(/(\d{1,2}) (Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?) (\d{4})/g, (_,day,month,year)=>day+' '+monthNames[month.slice(0,3)]+' '+year).replace(/(\d+) of (\d+) reports/g, '$2 ခုအနက် $1 ခု').replace(/(\d+) reports?/g, '$1 တိုင်ကြားချက်');
    // Composed labels (counts, references, units) use the same catalog as static copy.
    for (const source of ordered) {
      if (Object.hasOwn(monthNames, source) || !result.includes(source)) continue;
      const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(new RegExp('(?<![A-Za-z])' + escaped + '(?![A-Za-z])', 'g'), catalog[source]);
    }
    return result;
  }
  function renderLanguage() {
    observer.disconnect();
    document.documentElement.lang = language;
    document.documentElement.dataset.language = language;
    const switcher = document.querySelector('#language-switch');
    if (switcher?.hasAttribute('aria-label')) switcher.setAttribute('aria-label', language === 'my' ? 'ဘာသာစကား ရွေးရန်' : 'Choose language');
    for (const option of document.querySelectorAll('option:not([value])')) option.setAttribute('value', option.textContent);
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (!node.parentElement || node.parentElement.closest('script,style,textarea,pre,[data-user-content],[translate="no"],#language-switch,[data-language-choice]')) continue;
      const old = originals.get(node);
      const source = old && node.nodeValue === old.output ? old.source : node.nodeValue;
      const output = translate(source);
      if (output !== node.nodeValue) node.nodeValue = output;
      originals.set(node, {source, output});
    }
    for (const element of document.querySelectorAll('[placeholder],[aria-label],[title],[data-label]')) {
      if (element.closest('[data-user-content],[translate="no"],#language-switch,[data-language-choice]')) continue;
      let saved = attributes.get(element); if (!saved) { saved = {}; attributes.set(element, saved); }
      for (const attr of ['placeholder', 'aria-label', 'title', 'data-label']) {
        if (!element.hasAttribute(attr)) continue;
        const current = element.getAttribute(attr), old = saved[attr];
        const source = old && current === old.output ? old.source : current;
        const output = translate(source); saved[attr] = {source, output};
        if (output !== current) element.setAttribute(attr, output);
      }
    }
    document.querySelectorAll('[data-language-choice]').forEach(button => {button.disabled=false;button.setAttribute('aria-pressed', String(button.dataset.languageChoice === language));});
    const label = document.querySelector('#language-label'); if (label) label.textContent = language === 'my' ? 'ဘာသာစကား' : 'Language';
    observer.observe(document.body, {childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['placeholder','aria-label','title','data-label']});
  }
  const observer = new MutationObserver(renderLanguage);
  document.addEventListener('click', event => {
    const choice = event.target.closest('[data-language-choice]'); if (!choice) return;
    language = choice.dataset.languageChoice === 'my' ? 'my' : 'en';
    try { localStorage.setItem(key, language); } catch {}
    renderLanguage();
  });
  window.addEventListener('parcelcare:set-language', event => {
    language = event.detail === 'my' ? 'my' : 'en';
    try { localStorage.setItem(key, language); } catch {}
    renderLanguage();
  });
  document.addEventListener('invalid', event => { const field = event.target; if (!field.setCustomValidity) return; const message = field.validity.valueMissing ? 'Fill in this field.' : field.validity.rangeUnderflow || field.validity.rangeOverflow ? 'Enter a number within the allowed range.' : 'Enter a valid value.'; field.setCustomValidity(translate(message)); }, true);
  for (const type of ['input','change']) document.addEventListener(type, event => { if (event.target.setCustomValidity) event.target.setCustomValidity(''); });
  window.addEventListener('storage', event => {if (event.key === key) {language = event.newValue === 'my' ? 'my' : 'en';renderLanguage();}});
  if (!document.querySelector('#language-switch')) {const bar=document.createElement('div');bar.id='language-switch';bar.setAttribute('role','group');bar.setAttribute('aria-labelledby','language-label');bar.innerHTML='<span id="language-label">Language</span><button type="button" data-language-choice="en" lang="en">English</button><button type="button" data-language-choice="my" lang="my">မြန်မာ</button>';document.body.prepend(bar);}
  renderLanguage();
})();
