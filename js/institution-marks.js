/* Keep affiliation marks independent of the editable, plain-text sentence. */
(() => {
  'use strict';
  document.querySelectorAll('[data-institution-field]').forEach(container => {
    const field=container.querySelector('[data-edit-field]');
    const marks=new Map([...container.querySelectorAll('[data-institution-template]')].map(template => [
      template.dataset.institutionName || container.dataset.institutionField,
      template.content.firstElementChild
    ]).filter(([name,mark]) => name && mark));
    if (!field || !marks.size) return;
    const pattern=new RegExp([...marks.keys()].sort((a,b) => b.length-a.length)
      .map(name => name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
    const textNodes=text => {
      const fragment=document.createDocumentFragment();
      const term=container.dataset.institutionTerm;
      const termUrl=container.dataset.institutionTermUrl;
      (term ? text.split(term) : [text]).forEach((part,index) => {
        if (index) {
          const phrase=document.createElement(termUrl ? 'a' : 'span');
          phrase.className='institution-term';
          phrase.textContent=term;
          if (termUrl) {
            phrase.href=termUrl;
            phrase.target='_blank';
            phrase.rel='noopener noreferrer';
          }
          fragment.append(phrase);
        }
        fragment.append(document.createTextNode(part));
      });
      return fragment;
    };
    let renderedText=null;
    const render=() => {
      const mentions=[...field.querySelectorAll('.institution-mention')];
      const editing=document.body.classList.contains('is-reviewing') || new URLSearchParams(location.search).get('edit')==='1';
      // Do not replace DOM under the caret; the editor saves the sentence as text.
      if (editing && field.contains(document.activeElement)) return;
      const text=mentions.length ? field.textContent : field.innerText;
      const matches=[...text.matchAll(pattern)];
      if (text===renderedText && mentions.length===matches.length &&
          mentions.every((mention,index) => mention.dataset.institutionName===matches[index][0])) return;
      renderedText=text;
      if (!matches.length) {
        field.replaceChildren(textNodes(text));
        return;
      }
      const fragment=document.createDocumentFragment();
      let cursor=0;
      matches.forEach(match => {
        const name=match[0];
        fragment.append(textNodes(text.slice(cursor,match.index)));
        const branded=document.createElement('span');
        branded.className='institution-mention';
        branded.dataset.institutionName=name;
        const mark=marks.get(name).cloneNode(true);
        mark.contentEditable='false';
        const label=document.createTextNode(name);
        if (mark.dataset.institutionPosition==='before') branded.append(mark,label);
        else branded.append(label,mark);
        fragment.append(branded);
        cursor=match.index+name.length;
      });
      fragment.append(textNodes(text.slice(cursor)));
      field.replaceChildren(fragment);
    };
    new MutationObserver(render).observe(field,{childList:true,characterData:true,subtree:true});
    document.addEventListener('lr:review-mode',render);
    field.addEventListener('focusout',() => queueMicrotask(render));
    render();
  });
})();
