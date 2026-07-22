/**
 * KBS poster page — section jumps, supplemental panels, back-to-top.
 */
(function () {
  var MOBILE_MQ = window.matchMedia("(max-width: 960px)");
  var SCROLL_HIDE_Y = 48;

  function stickyOffset() {
    var nav = document.getElementById("section-jump");
    if (!nav || nav.classList.contains("is-scrolled-away")) return 12;
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
    if (id === "bibliography" || id === "references" || id === "abstract" || id === "proposal") {
      openPanel(id === "references" ? "bibliography" : id);
      return;
    }
    // Prefer the visible section title under the sticky nav
    var section = el.closest(".poster-box, .model-panel, .poster-panel") || el;
    var target =
      section.querySelector(".poster-box__header") ||
      section.querySelector(".model-head h3") ||
      section;
    scrollToEl(target);
  }

  function handleHash() {
    var hash = (location.hash || "").replace(/^#/, "");
    if (!hash) return;
    if (hash === "bibliography" || hash === "references") {
      openPanel("bibliography");
    } else if (hash === "abstract") {
      openPanel("abstract");
    } else if (hash === "proposal") {
      openPanel("proposal");
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
  var sectionJump = document.getElementById("section-jump");

  function updateChrome() {
    var y = window.scrollY || 0;
    if (backTop) {
      if (y > 420) backTop.classList.add("is-visible");
      else backTop.classList.remove("is-visible");
    }
    if (sectionJump) {
      var hide = MOBILE_MQ.matches && y > SCROLL_HIDE_Y;
      sectionJump.classList.toggle("is-scrolled-away", hide);
    }
  }

  window.addEventListener("scroll", updateChrome, { passive: true });
  if (typeof MOBILE_MQ.addEventListener === "function") {
    MOBILE_MQ.addEventListener("change", updateChrome);
  } else if (typeof MOBILE_MQ.addListener === "function") {
    MOBILE_MQ.addListener(updateChrome);
  }
  updateChrome();

  window.addEventListener("hashchange", handleHash);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", handleHash);
  } else {
    handleHash();
  }
})();
