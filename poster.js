/**
 * KBS poster page — section jumps, supplemental panels, back-to-top.
 */
(function () {
  function stickyOffset() {
    var nav = document.getElementById("section-jump");
    if (!nav) return 12;
    return Math.ceil(nav.getBoundingClientRect().height) + 10;
  }

  function scrollToEl(el) {
    if (!el) return;
    var top = el.getBoundingClientRect().top + window.scrollY - stickyOffset();
    window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  function openPanel(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "DETAILS") {
      el.open = true;
    }
    scrollToEl(el);
  }

  function scrollToId(id) {
    if (!id || id === "poster") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    var el = document.getElementById(id);
    if (!el) return;
    if (id === "bibliography" || id === "references" || id === "abstract") {
      openPanel(id === "references" ? "bibliography" : id);
      return;
    }
    // Prefer the section box so the colored header lands under the sticky nav
    var section = el.closest(".poster-box, .model-panel, .poster-panel") || el;
    var target = section.querySelector(".poster-box__header") || section;
    scrollToEl(target);
  }

  function handleHash() {
    var hash = (location.hash || "").replace(/^#/, "");
    if (!hash) return;
    if (hash === "bibliography" || hash === "references") {
      openPanel("bibliography");
    } else if (hash === "abstract") {
      openPanel("abstract");
    } else if (hash === "poster") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      scrollToId(hash);
    }
  }

  document.addEventListener("click", function (e) {
    var a = e.target.closest("a[href^='#']");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    var id = href.replace(/^#/, "");
    if (!id) return;

    if (a.hasAttribute("data-open-panel")) {
      e.preventDefault();
      history.replaceState(null, "", "#" + (a.getAttribute("data-open-panel") || id));
      openPanel(a.getAttribute("data-open-panel") || id);
      return;
    }

    if (document.getElementById(id) || id === "poster") {
      e.preventDefault();
      history.replaceState(null, "", "#" + id);
      scrollToId(id);
    }
  });

  var backTop = document.getElementById("back-top");
  function updateBackTop() {
    if (!backTop) return;
    if (window.scrollY > 420) backTop.classList.add("is-visible");
    else backTop.classList.remove("is-visible");
  }
  window.addEventListener("scroll", updateBackTop, { passive: true });
  updateBackTop();

  window.addEventListener("hashchange", handleHash);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handleHash);
  } else {
    handleHash();
  }
})();
