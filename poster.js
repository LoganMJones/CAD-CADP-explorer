/**
 * KBS poster page — section jumps, supplemental panels, back-to-top.
 */
(function () {
  function openPanel(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.tagName === "DETAILS") {
      el.open = true;
    }
    el.scrollIntoView({ behavior: "smooth", block: "start" });
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
    el.scrollIntoView({ behavior: "smooth", block: "start" });
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

    // Smooth-scroll in-page section links (including Home / Top)
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
