// help/help.js
(function(){
  'use strict';

  // "Soft-close drawer" feeling:
  // - wait 5s after clicking another chapter
  // - then close slowly and smoothly
  const BASE_DELAY_MS = 5000;         // 5 seconds
  const CLOSE_ANIM_MS = 1800;         // slow close (tune if needed)
  const STAGGER_MS    = 350;            // delay between each close (cascade)
  const SOFT_EASE     = 'cubic-bezier(0.16, 1, 0.3, 1)';             // smooth / damped ease

  function qsa(sel, root){ return Array.prototype.slice.call((root||document).querySelectorAll(sel)); }
  function qs(sel, root){ return (root||document).querySelector(sel); }

  // Per-chapter pending timers so multiple open chapters can close one-by-one.
  const timers = new Map(); // chapterEl -> timeoutId

  function bodyEl(chapter){ return chapter.querySelector('.chapter-body'); }
  function isOpen(chapter){ return chapter.dataset.open === '1'; }

  function setTransitionForSoftClose(chapter){
    const body = bodyEl(chapter);
    if (!body) return;
    body.style.transition = `max-height ${CLOSE_ANIM_MS}ms ${SOFT_EASE}, opacity ${CLOSE_ANIM_MS}ms ${SOFT_EASE}, transform ${CLOSE_ANIM_MS}ms ${SOFT_EASE}`;
  }

  function setTransitionDefault(chapter){
    const body = bodyEl(chapter);
    if (!body) return;
    body.style.transition = ''; // revert to CSS defaults
  }

  function openChapter(chapter){
    chapter.dataset.open = '1';
    const body = bodyEl(chapter);
    if (!body) return;

    // Ensure soft-close transition doesn't affect opening
    setTransitionDefault(chapter);

    const content = chapter.querySelector('.chapter-content');
    const h = content ? content.scrollHeight : 0;
    body.style.maxHeight = h + 'px';
  }

  function closeChapter(chapter){
    chapter.dataset.open = '0';
    const body = bodyEl(chapter);
    if (!body) return;
    body.style.maxHeight = '0px';
  }

  function cancelTimer(chapter){
    const t = timers.get(chapter);
    if (t) clearTimeout(t);
    timers.delete(chapter);
    setTransitionDefault(chapter);
  }

  function scheduleCascadeClose(exceptChapter){
    const openChapters = qsa('.chapter').filter(ch => isOpen(ch) && ch !== exceptChapter);

    // Reset timers for a clean "cascade plan"
    openChapters.forEach(cancelTimer);

    // DOM order -> closes in visual order ("one by one")
    openChapters.forEach(function(ch, idx){
      const delay = BASE_DELAY_MS + idx * (CLOSE_ANIM_MS + STAGGER_MS);

      setTransitionForSoftClose(ch);

      const id = setTimeout(function(){
        if (isOpen(ch)){
          closeChapter(ch);
        }
        setTransitionDefault(ch);
        timers.delete(ch);
      }, delay);

      timers.set(ch, id);
    });
  }

  function initAccordion(){
    const chapters = qsa('.chapter');
    if (!chapters.length) return;

    window.addEventListener('resize', function(){
      chapters.forEach(function(ch){
        if (!isOpen(ch)) return;
        const body = bodyEl(ch);
        const content = ch.querySelector('.chapter-content');
        if (body && content){
          body.style.maxHeight = content.scrollHeight + 'px';
        }
      });
    });

    chapters.forEach(function(ch){
      const header = ch.querySelector('.chapter-header');
      if (!header) return;

      header.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation(); // empty space clicks do nothing

        const wasOpen = isOpen(ch);

        // Clicking another chapter activates timers on all other open chapters.
        const anyOtherOpen = chapters.some(x => isOpen(x) && x !== ch);
        if (anyOtherOpen){
          scheduleCascadeClose(ch);
        }

        // Toggle clicked chapter immediately.
        if (wasOpen){
          cancelTimer(ch);
          closeChapter(ch);
        }else{
          cancelTimer(ch);
          openChapter(ch);
        }
      });
    });
  }

  function initExitControls(){
    const closeBtn = qs('#helpCloseBtn');
    if (closeBtn){
      closeBtn.addEventListener('click', function(e){
        e.preventDefault();
        try{
          window.close();
          setTimeout(function(){
            closeBtn.textContent = closeBtn.getAttribute('data-fallback-text') || 'Close the tab manually';
          }, 250);
        }catch(_){
          closeBtn.textContent = closeBtn.getAttribute('data-fallback-text') || 'Close the tab manually';
        }
      });
    }

    // ESC: best-effort close
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape'){
        try{ window.close(); }catch(_){}
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function(){
    initAccordion();
    initExitControls();
  });
})();
