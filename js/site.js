// Traka sa dugmetom se pojavljuje kad dugme iz uvodnog dela izađe sa ekrana
(function () {
  var bar = document.getElementById("bar");
  var heroCta = document.getElementById("hero-cta");
  if (!("IntersectionObserver" in window)) { bar.classList.add("show"); return; }
  new IntersectionObserver(function (entries) {
    var hidden = !entries[0].isIntersecting && entries[0].boundingClientRect.top < 0;
    bar.classList.toggle("show", hidden);
    bar.setAttribute("aria-hidden", hidden ? "false" : "true");
    bar.querySelector("a").tabIndex = hidden ? 0 : -1;
  }).observe(heroCta);
})();

// Kad video stvarno krene, crno-beli kadar dobija boju i video se pojavljuje
(function () {
  var v = document.getElementById("hero-video");
  var media = v.parentNode;
  function live() { media.classList.add("live"); }
  if (!v.paused && v.readyState > 2) live();
  v.addEventListener("playing", live, { once: true });
})();

// Bez automatskog videa za one koji su isključili animacije
if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  var v = document.getElementById("hero-video");
  v.removeAttribute("autoplay");
  v.pause();
}
