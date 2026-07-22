/**
 * KBS poster page — open supplemental panels from in-poster links.
 */
(function () {
  function openPanel(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === 'DETAILS') {
      el.open = true;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function handleHash() {
    var hash = (location.hash || '').replace(/^#/, '');
    if (hash === 'bibliography' || hash === 'references') {
      openPanel('bibliography');
    } else if (hash === 'abstract') {
      openPanel('abstract');
    }
  }

  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-open-panel]');
    if (!a) return;
    var id = a.getAttribute('data-open-panel');
    if (!id) return;
    e.preventDefault();
    history.replaceState(null, '', '#' + id);
    openPanel(id);
  });

  window.addEventListener('hashchange', handleHash);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleHash);
  } else {
    handleHash();
  }
})();
