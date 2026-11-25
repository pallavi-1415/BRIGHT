/* =========================================================
   BrightSmile — page controller
   Motion: GSAP + ScrollTrigger + Lenis (CDN). 3D: js/mascot-stage.js
   Everything degrades gracefully: without WebGL the mascot falls back
   to images; without GSAP the page is static but fully usable.
   ========================================================= */
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
const root = document.documentElement;
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
const G = window.gsap;
const ST = window.ScrollTrigger;
const motion = !!(G && ST) && !reduce;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

window.__bsBoot = true;
if (G && ST) { G.registerPlugin(ST); root.classList.add("has-motion"); }
if (!motion) root.classList.add("no-motion");
$("#year").textContent = new Date().getFullYear();

let stage = null; // the 3D mascot (set after boot)

/* ---------------------------------------------------------
   Mascot speech bubbles
   --------------------------------------------------------- */
const bubbleFor = (name) => $(`[data-bubble="${name}"]`);
const setBubble = (name) => $$("[data-bubble]").forEach((b) => b.classList.toggle("is-on", b.dataset.bubble === name));
/** Make the mascot say something in a section (and gesture if it's there). */
function say(name, text, gesture = "hello") {
  const b = bubbleFor(name);
  if (!b) return;
  if (text && b.textContent !== text) b.textContent = text;
  b.classList.remove("is-pop");
  void b.offsetWidth;
  b.classList.add("is-pop");
  if (stage && stage.active && stage.active.name === name && gesture) stage.gesture(gesture);
}

/* ---------------------------------------------------------
   Split headings into words (keeps highlight spans + svgs intact)
   --------------------------------------------------------- */
function splitWords(el) {
  const walk = (node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(" ")); return; }
          const w = document.createElement("span"); w.className = "sw";
          const i = document.createElement("span"); i.className = "sw__i"; i.textContent = part;
          w.appendChild(i); frag.appendChild(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1 && !/^(BR|svg)$/i.test(child.tagName)) {
        walk(child);
      }
    });
  };
  walk(el);
  $$(".grad-gold, .grad-green", el).forEach((g) => g.classList.add("is-split"));
}
if (motion) $$("[data-split]").forEach(splitWords);

// gold underline highlights draw in when visible
const hlIO = new IntersectionObserver((es) => es.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add("is-drawn"); hlIO.unobserve(e.target); }
}), { threshold: 0.8 });
$$(".hl").forEach((h) => hlIO.observe(h));

/* ---------------------------------------------------------
   NAV
   --------------------------------------------------------- */
const nav = $("#nav");
const links = $$(".nav__pill a");
const ink = $(".nav__ink");
const moveInk = (a) => {
  if (!ink) return;
  if (!a) { ink.style.width = "0px"; return; }
  const w = Math.max(18, a.offsetWidth * 0.36);
  ink.style.width = `${w}px`;
  ink.style.transform = `translateX(${a.offsetLeft + (a.offsetWidth - w) / 2}px)`;
};
const activeLink = () => $(".nav__pill a.is-active");
links.forEach((a) => a.addEventListener("mouseenter", () => moveInk(a)));
$(".nav__pill")?.addEventListener("mouseleave", () => moveInk(activeLink()));
window.addEventListener("resize", () => moveInk(activeLink()));
moveInk(null);

let lastY = 0;
const onScroll = () => {
  const y = window.scrollY;
  nav.classList.toggle("is-scrolled", y > 40 || nav.classList.contains("menu-open"));
  if (y > lastY + 2 && y > window.innerHeight * 0.8 && !nav.classList.contains("menu-open")) nav.classList.add("is-hidden");
  if (y < lastY - 2) nav.classList.remove("is-hidden");
  lastY = y;
};
window.addEventListener("scroll", onScroll, { passive: true });
onScroll();

const sectionIO = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const id = e.target.id === "location" ? "contact" : e.target.id === "why" ? "visit" : e.target.id;
    const link = links.find((l) => l.getAttribute("href") === `#${id}`) || null;
    links.forEach((l) => l.classList.toggle("is-active", l === link));
    moveInk(link);
  });
}, { rootMargin: "-45% 0px -50% 0px" });
$$("main > section[id]").forEach((s) => sectionIO.observe(s));

const burger = $(".nav__burger");
const menu = $("#menu");
burger?.addEventListener("click", () => {
  const open = burger.getAttribute("aria-expanded") !== "true";
  burger.setAttribute("aria-expanded", String(open));
  burger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  menu.hidden = !open;
  nav.classList.toggle("menu-open", open);
  onScroll();
});
menu?.addEventListener("click", (e) => { if (e.target.closest("a")) burger.click(); });

/* ---------------------------------------------------------
   VIDEO MODAL — put an embed URL into the button's data-video-src
   --------------------------------------------------------- */
const modal = $("#video-modal");
const play = $(".play");
if (modal && play) {
  const frame = $(".video-modal__frame", modal);
  const empty = $(".video-modal__empty", modal);
  play.addEventListener("click", () => {
    const src = play.dataset.videoSrc;
    if (src) {
      empty.hidden = true;
      const f = document.createElement("iframe");
      Object.assign(f, { src, title: "BrightSmile clinic tour", allowFullscreen: true });
      f.allow = "autoplay; encrypted-media; picture-in-picture";
      frame.appendChild(f);
    }
    modal.showModal();
  });
  $(".video-modal__close", modal).addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.close(); });
  modal.addEventListener("close", () => { $("iframe", frame)?.remove(); empty.hidden = false; });
}

/* ---------------------------------------------------------
   SERVICES — treatment picker
   --------------------------------------------------------- */
const SERVICES = [
  { title: "Cosmetic dentistry", desc: "Veneers, bonding and smile design tailored to your face, with a digital preview before anything changes.", time: "60–90 min", visits: "1–2", expect: ["A digital smile preview on day one", "Shade-matched to your natural teeth", "Little to no drilling for bonding"], say: "Cosmetic dentistry? Great pick!" },
  { title: "Dental implants", desc: "A permanent, natural-looking replacement for a missing tooth that looks, feels and works like the real thing.", time: "60–120 min", visits: "2–3", expect: ["3D scan to plan the exact position", "Numbing gel and local anaesthetic", "A temporary tooth while you heal"], say: "Implants are built to last. Like me!" },
  { title: "Orthodontics", desc: "Braces or clear aligners that straighten your teeth gradually, with a 3D preview of your finished smile.", time: "30–45 min", visits: "Every 6–8 weeks", expect: ["A 3D preview of your new smile", "Clear aligners or discreet braces", "Short, regular progress check-ins"], say: "Straight smiles, one step at a time!" },
  { title: "Teeth whitening", desc: "Professional in-clinic and take-home whitening that brightens your smile safely, without the sensitivity.", time: "60 min", visits: "1", expect: ["A shade check before and after", "Gum protection during treatment", "A take-home touch-up kit"], say: "Ooh, sparkly! You'll love this one." },
  { title: "General check-up", desc: "An unhurried exam, gentle clean and a plain-English plan to keep problems away for good.", time: "45 min", visits: "Twice a year", expect: ["Digital X-rays only when needed", "A gentle clean and polish", "A photo tour of your teeth on screen"], say: "Check-ups keep me shining!" },
  { title: "Kids' dentistry", desc: "Fun, fear-free visits that build healthy habits, with plenty of patience (and stickers).", time: "30 min", visits: "Twice a year", expect: ["A tour of the chair before we start", "Tooth-friendly tips for parents", "A sticker for every brave smile"], say: "Kids are my favourite visitors!" },
];
const tiles = $$(".tile");
const panel = $("#svc-panel");
let svcIndex = 0;
function selectService(i, focus = false) {
  if (i === svcIndex && tiles[i].classList.contains("is-active")) return;
  svcIndex = i;
  const s = SERVICES[i];
  tiles.forEach((t, k) => {
    const on = k === i;
    t.classList.toggle("is-active", on);
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  if (focus) tiles[i].focus();
  panel.classList.add("is-swapping");
  setTimeout(() => {
    $('[data-f="title"]', panel).textContent = s.title;
    $('[data-f="desc"]', panel).textContent = s.desc;
    $('[data-f="time"]', panel).textContent = s.time;
    $('[data-f="visits"]', panel).textContent = s.visits;
    $('[data-f="expect"]', panel).innerHTML = s.expect.map((e) => `<li>${e}</li>`).join("");
    $('[data-f="cta"] span', panel).textContent = `Book ${s.title.toLowerCase()}`;
    panel.classList.remove("is-swapping");
  }, 230);
  say("services", s.say);
}
tiles.forEach((t, i) => {
  t.addEventListener("click", () => selectService(i));
  t.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); selectService((svcIndex + 1) % tiles.length, true); }
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); selectService((svcIndex - 1 + tiles.length) % tiles.length, true); }
  });
});
$('[data-f="cta"]', panel)?.addEventListener("click", () => {
  const sel = $("#book-form select[name=service]");
  if (sel) sel.selectedIndex = svcIndex + 1;
});
$$("[data-svc-link]").forEach((a) => a.addEventListener("click", () => selectService(+a.dataset.svcLink)));

/* ---------------------------------------------------------
   TEAM — "Book with …" pre-fills the form
   --------------------------------------------------------- */
$$("[data-doctor]").forEach((a) => a.addEventListener("click", () => {
  const notes = $("#book-form input[name=notes]");
  if (notes) notes.value = `I'd like to see ${a.dataset.doctor}.`;
}));

/* ---------------------------------------------------------
   REVIEWS — slider (arrows, swipe, autoplay while visible)
   --------------------------------------------------------- */
(() => {
  const track = $(".slider__track");
  if (!track) return;
  const cards = $$(".review", track);
  const prev = $('.slider-btn[data-dir="-1"]');
  const next = $('.slider-btn[data-dir="1"]');
  const reviewSays = ["People say the nicest things!", "This one made me blush!", "Aww, happy smiles everywhere!", "Best job in the world, honestly."];
  let i = 0;
  const step = () => cards[0].offsetWidth + parseFloat(getComputedStyle(track).columnGap || 20);
  const maxI = () => Math.max(0, cards.length - Math.max(1, Math.floor(track.parentElement.offsetWidth / step())));
  const go = (n, user) => {
    i = clamp(n, 0, maxI());
    track.style.transform = `translateX(${-i * step()}px)`;
    prev.disabled = i === 0;
    next.disabled = i === maxI();
    if (user) say("reviews", reviewSays[i % reviewSays.length], "squeeze");
  };
  prev.addEventListener("click", () => go(i - 1, true));
  next.addEventListener("click", () => go(i + 1, true));
  window.addEventListener("resize", () => go(i));
  // swipe
  let sx = null;
  track.addEventListener("pointerdown", (e) => { sx = e.clientX; });
  window.addEventListener("pointerup", (e) => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 50) go(i + (dx < 0 ? 1 : -1), true);
  });
  // autoplay
  let timer = null, inView = false, hover = false;
  const tick = () => { if (inView && !hover && !reduce) go(i >= maxI() ? 0 : i + 1); };
  new IntersectionObserver(([e]) => {
    inView = e.isIntersecting;
    clearInterval(timer);
    if (inView) timer = setInterval(tick, 5500);
  }, { threshold: 0.5 }).observe(track);
  track.addEventListener("mouseenter", () => (hover = true));
  track.addEventListener("mouseleave", () => (hover = false));
  go(0);
})();

/* ---------------------------------------------------------
   FAQ — animated <details>, one open at a time, mascot reacts
   --------------------------------------------------------- */
const accs = $$(".acc");
const openAcc = (d) => {
  d.open = true;
  requestAnimationFrame(() => requestAnimationFrame(() => d.classList.add("is-open")));
  if (d.dataset.say) say("faq", d.dataset.say);
};
const closeAcc = (d) => { d.classList.remove("is-open"); setTimeout(() => { if (!d.classList.contains("is-open")) d.open = false; }, 520); };
accs.forEach((d) => {
  if (d.open) d.classList.add("is-open");
  $("summary", d).addEventListener("click", (e) => {
    e.preventDefault();
    if (d.classList.contains("is-open")) closeAcc(d);
    else { accs.filter((x) => x !== d && x.classList.contains("is-open")).forEach(closeAcc); openAcc(d); }
  });
});

/* ---------------------------------------------------------
   BOOKING — comfort chips + form (front-end only)
   --------------------------------------------------------- */
const chips = $$(".comfort .chip");
chips.forEach((c) => c.addEventListener("click", () => {
  const on = c.getAttribute("aria-pressed") !== "true";
  c.setAttribute("aria-pressed", String(on));
  const n = chips.filter((x) => x.getAttribute("aria-pressed") === "true").length;
  say("book", n ? `${n} comfort extra${n > 1 ? "s" : ""} packed for you!` : "Pick your comfort extras, I'll pack them!", on ? "squeeze" : null);
}));

const form = $("#book-form");
if (form) {
  const date = form.elements.date;
  if (date) date.min = new Date().toISOString().split("T")[0];
  const note = $(".form__note", form);
  form.addEventListener("input", (e) => e.target.closest(".field")?.classList.remove("is-invalid"));
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let firstBad = null;
    $$("input, select", form).forEach((f) => {
      const bad = !f.checkValidity();
      f.closest(".field")?.classList.toggle("is-invalid", bad);
      if (bad && !firstBad) firstBad = f;
    });
    if (firstBad) {
      note.textContent = "Please complete the highlighted fields.";
      note.classList.add("is-error");
      firstBad.focus();
      say("book", "Almost there, just a few details!", "squeeze");
      return;
    }
    const comfort = chips.filter((c) => c.getAttribute("aria-pressed") === "true").map((c) => c.textContent.trim());
    // TODO: send this to your booking system / email service:
    // const payload = { ...Object.fromEntries(new FormData(form)), comfort };
    const name = form.elements.name.value.trim().split(" ")[0];
    note.classList.remove("is-error");
    note.textContent = `Thank you, ${name}! We'll confirm your visit within one working day.${comfort.length ? " Your comfort kit is noted." : ""}`;
    form.classList.add("is-sent");
    $("button[type=submit] span", form).textContent = "Request sent";
    say("book", `Yay! See you soon, ${name}!`, null);
    stage?.celebrate();
  });
}

/* ---------------------------------------------------------
   LOCATION — live opening hours + directions link
   --------------------------------------------------------- */
(() => {
  const HOURS = { 0: null, 1: [8, 19], 2: [8, 19], 3: [8, 19], 4: [8, 19], 5: [8, 19], 6: [9, 14] };
  const fmt = (h) => `${h > 12 ? h - 12 : h}:00 ${h >= 12 ? "pm" : "am"}`;
  const now = new Date();
  const d = now.getDay(), h = now.getHours() + now.getMinutes() / 60;
  $(`[data-hours] [data-day="${d}"]`)?.classList.add("is-today");
  const badge = $("[data-open-badge]");
  if (badge) {
    const today = HOURS[d];
    if (today && h >= today[0] && h < today[1]) badge.textContent = `Open now · until ${fmt(today[1])}`;
    else {
      badge.classList.add("is-closed");
      let nd = d, tries = 0;
      do { nd = (nd + (today && h < today[0] && tries === 0 ? 0 : 1)) % 7; tries++; } while (!HOURS[nd] && tries < 8);
      const label = nd === d ? "today" : nd === (d + 1) % 7 ? "tomorrow" : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][nd];
      badge.textContent = `Closed · opens ${label} ${fmt(HOURS[nd][0])}`;
    }
  }
  const dir = $("[data-directions]");
  if (dir) { dir.href = "https://www.google.com/maps/search/?api=1&query=123+Smile+Avenue"; dir.target = "_blank"; dir.rel = "noopener"; }
})();

/* ---------------------------------------------------------
   CURSOR + MAGNETIC BUTTONS
   --------------------------------------------------------- */
if (fine && motion) {
  const cur = $(".cursor");
  const cx = G.quickTo(cur, "x", { duration: 0.35, ease: "power3.out" });
  const cy = G.quickTo(cur, "y", { duration: 0.35, ease: "power3.out" });
  window.addEventListener("pointermove", (e) => { cx(e.clientX); cy(e.clientY); cur.classList.add("is-on"); }, { passive: true });
  document.addEventListener("pointerleave", () => cur.classList.remove("is-on"));
  document.addEventListener("pointerover", (e) => {
    const t = e.target;
    const m = !!t.closest(".m-anchor");
    cur.classList.toggle("is-mascot", m);
    cur.classList.toggle("is-link", !m && !!t.closest("a, button, summary, input, select"));
  });
  $$(".magnetic").forEach((btn) => {
    btn.addEventListener("pointermove", (e) => {
      const r = btn.getBoundingClientRect();
      G.to(btn, { x: (e.clientX - r.left - r.width / 2) * 0.25, y: (e.clientY - r.top - r.height / 2) * 0.35, duration: 0.4, ease: "power3.out" });
    });
    btn.addEventListener("pointerleave", () => G.to(btn, { x: 0, y: 0, duration: 0.8, ease: "elastic.out(1, 0.4)" }));
  });
}

/* ---------------------------------------------------------
   SMOOTH SCROLL
   --------------------------------------------------------- */
let lenis = null;
if (motion && window.Lenis) {
  lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on("scroll", ST.update);
  G.ticker.add((t) => lenis.raf(t * 1000));
  G.ticker.lagSmoothing(0);
  lenis.stop();
}
$$('a[href^="#"]').forEach((a) => {
  a.addEventListener("click", (e) => {
    const id = a.getAttribute("href");
    if (id.length < 2) return;
    const target = $(id);
    if (!target) return;
    e.preventDefault();
    if (lenis) lenis.scrollTo(id === "#home" ? 0 : target, { duration: 1.6 });
    else target.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  });
});

/* ---------------------------------------------------------
   BOOT: preloader → load 3D mascot → reveal
   --------------------------------------------------------- */
function webglOK() {
  try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; }
}

async function boot() {
  const pct = $("#loader-pct");
  const bar = $(".loader__bar span");
  let target = 0.06, shown = 0, done = false;
  const draw = () => {
    shown += (target - shown) * 0.1;
    pct.textContent = Math.round(shown * 100);
    bar.style.transform = `scaleX(${shown})`;
    if (!done) requestAnimationFrame(draw);
  };
  draw();
  const minTime = wait(1200);
  let s = null;
  try {
    if (!webglOK()) throw new Error("WebGL unavailable");
    const { MascotStage } = await import("./mascot-stage.js");
    s = new MascotStage({ canvas: $("#stage3d"), modelUrl: "assets/models/mascot.glb", reduceMotion: reduce });
    await Promise.race([
      s.load((p) => { target = Math.max(target, 0.06 + p * 0.9); }),
      wait(30000).then(() => { throw new Error("Model load timed out"); }),
    ]);
  } catch (err) {
    console.warn("[BrightSmile] 3D mascot disabled:", err);
    root.classList.add("no-3d");
    s = null;
  }
  await minTime;
  target = 1;
  await wait(450);
  done = true;
  pct.textContent = "100";
  bar.style.transform = "scaleX(1)";
  return s;
}

function startStageLoop(s) {
  $$(".m-anchor").forEach((a) => a.addEventListener("click", () => s.spin()));
  s.on("anchor", setBubble);
  s.on("landed", setBubble);
  if (G) G.ticker.add((t, dt) => s.tick(dt / 1000));
  else {
    let last = performance.now();
    const loop = (now) => { s.tick((now - last) / 1000); last = now; requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}

/* =========================================================
   MOTION
   ========================================================= */
function heroIntro() {
  const neon = $$(".hero__neon path");
  neon.forEach((p) => { const L = p.getTotalLength(); G.set(p, { strokeDasharray: L, strokeDashoffset: L }); });
  const curves = $$(".hero__curves path");
  curves.forEach((p) => { const L = p.getTotalLength(); G.set(p, { strokeDasharray: L, strokeDashoffset: L }); });

  const tl = G.timeline({ defaults: { ease: "expo.out" } });
  tl.from(".hero__wall", { scale: 1.14, duration: 2.6, ease: "power3.out" }, 0)
    .from(".hero__floor", { yPercent: 30, opacity: 0, duration: 1.8 }, 0.1)
    .from(".lamp", { yPercent: -130, duration: 2, stagger: 0.14, ease: "elastic.out(1, 0.6)" }, 0.25)
    .to(neon, { strokeDashoffset: 0, duration: 2.2, ease: "power2.inOut", onComplete: () => $(".hero__neon").classList.add("is-on") }, 0.45)
    .to(curves, { strokeDashoffset: 0, duration: 2.6, ease: "power2.inOut", stagger: 0.2 }, 0.5)
    .from(".plant--front", { x: -140, rotation: -10, opacity: 0, duration: 2 }, 0.2)
    .from(".plant--pot", { x: 90, opacity: 0, duration: 1.8 }, 0.35)
    .from(".plant--back", { opacity: 0, duration: 1.6 }, 0.5)
    .from(".hero__counter", { x: 140, opacity: 0, duration: 1.8 }, 0.3)
    .from(".hero__dash", { scaleX: 0, duration: 1.1 }, 0.7)
    .from(".hero__title .sw__i", { yPercent: 118, rotation: 4, duration: 1.4, stagger: 0.09 }, 0.75)
    .fromTo(".hero__swoosh path", { strokeDashoffset: 220 }, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, 1.4)
    .from("[data-hero-fade]", { y: 34, opacity: 0, duration: 1.2, stagger: 0.12 }, 1.05)
    .from("[data-hero-card]", { x: 100, opacity: 0, rotationY: -35, transformPerspective: 900, duration: 1.5, stagger: 0.13 }, 0.95)
    .from(".band", { yPercent: 140, duration: 1.3 }, 1.3);
  if (stage) tl.add(() => stage.intro(), 0.45);
  else tl.add(() => setBubble("hero"), 1.6);
  return tl;
}

function heroParallax() {
  if (!fine) return;
  const hero = $(".hero");
  const layers = $$(".hero__scene [data-depth]").map((el) => ({
    d: parseFloat(el.dataset.depth),
    x: G.quickTo(el, "x", { duration: 1.4, ease: "power3.out" }),
    y: G.quickTo(el, "y", { duration: 1.4, ease: "power3.out" }),
  }));
  hero.addEventListener("pointermove", (e) => {
    const nx = e.clientX / window.innerWidth - 0.5;
    const ny = e.clientY / window.innerHeight - 0.5;
    layers.forEach((l) => { l.x(-nx * l.d * 70); l.y(-ny * l.d * 30); });
  });
  hero.addEventListener("pointerleave", () => layers.forEach((l) => { l.x(0); l.y(0); }));
}

function scrollScenes() {
  ST.create({ start: 0, end: "max", onUpdate: (self) => G.set(".progress span", { scaleX: self.progress }) });

  // hero exits with depth
  const heroST = { trigger: ".hero", start: "top top", end: "bottom top", scrub: true };
  G.to(".hero__copy", { yPercent: -22, opacity: 0, ease: "none", scrollTrigger: heroST });
  G.to(".hero__services", { y: -120, opacity: 0, ease: "none", scrollTrigger: heroST });
  G.to(".hero__scene", { yPercent: 14, ease: "none", scrollTrigger: heroST });

  // marquee band
  const band = G.to(".band__track", { xPercent: -50, repeat: -1, duration: 34, ease: "none" });
  ST.create({
    trigger: ".band", start: "top bottom", end: "bottom top",
    onUpdate: (self) => G.to(band, { timeScale: 1 + Math.min(Math.abs(self.getVelocity()) / 300, 5), duration: 0.2, overwrite: true, onComplete: () => G.to(band, { timeScale: 1, duration: 1 }) }),
  });

  // generic reveals
  $$("[data-reveal]").forEach((el) => {
    G.from(el, { y: 40, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 90%" } });
  });
  $$("[data-stagger]").forEach((el) => {
    G.from(el.children, { y: 44, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.07, scrollTrigger: { trigger: el, start: "top 90%" } });
  });
  $$("[data-split]").forEach((h) => {
    if (h.closest(".hero")) return;
    G.from($$(".sw__i", h), { yPercent: 115, duration: 1.15, ease: "expo.out", stagger: 0.045, scrollTrigger: { trigger: h, start: "top 88%" } });
  });

  // counters
  $$("[data-count]").forEach((el) => {
    const end = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || "0", 10);
    el.textContent = (0).toFixed(dec);
    const o = { v: 0 };
    ST.create({ trigger: el, start: "top 92%", once: true, onEnter: () => G.to(o, { v: end, duration: 2.2, ease: "power3.out", onUpdate: () => { el.textContent = o.v.toFixed(dec); } }) });
  });

  // floating chips
  $$("[data-float]").forEach((el, i) => {
    const amt = parseFloat(el.dataset.float);
    G.to(el, { y: amt * 0.8, duration: 2.6 + i * 0.5, ease: "sine.inOut", yoyo: true, repeat: -1 });
  });
  const archNeon = $(".arch__neon path");
  if (archNeon) {
    const L = archNeon.getTotalLength();
    G.fromTo(archNeon, { strokeDasharray: L, strokeDashoffset: L }, { strokeDashoffset: 0, duration: 2.4, ease: "power2.inOut", scrollTrigger: { trigger: ".arch", start: "top 70%" } });
  }

  /* ---------- YOUR VISIT: pinned, cards slide in, steps fill ---------- */
  const mm = G.matchMedia();
  mm.add("(min-width: 1081px)", () => {
    const track = $(".journey__track");
    const viewport = $(".journey__viewport");
    const cards = $$(".vcard");
    const bars = $$(".steps-bar li");
    const n = cards.length;
    const dist = () => {
      const last = cards[n - 1];
      return Math.max(1, last.offsetLeft + last.offsetWidth - viewport.offsetWidth);
    };
    let cur = -1;
    const update = (p) => {
      bars.forEach((b, i) => {
        b.querySelector("i").style.setProperty("--p", clamp(p * n - i, 0, 1));
        b.classList.toggle("is-on", p * n >= i);
      });
      const idx = Math.min(n - 1, Math.floor(p * n * 0.999));
      if (idx !== cur) {
        cur = idx;
        cards.forEach((c, i) => c.classList.toggle("is-active", i === idx));
        say("journey", cards[idx].dataset.say, cur === 0 ? null : "hello");
      }
    };
    const horizontal = G.to(track, {
      x: () => -dist(),
      ease: "none",
      scrollTrigger: {
        trigger: ".journey", start: "top top", end: () => `+=${dist() * 1.6}`,
        pin: true, scrub: 0.8, invalidateOnRefresh: true,
        onUpdate: (self) => update(self.progress),
        onRefresh: (self) => update(self.progress),
      },
    });
    cards.forEach((c) => {
      G.fromTo(c, { rotationY: -24, scale: 0.92, opacity: 0.5, transformPerspective: 1200, transformOrigin: "left center" }, {
        rotationY: 0, scale: 1, opacity: 1, ease: "none",
        scrollTrigger: { trigger: c, containerAnimation: horizontal, start: "left 100%", end: "left 70%", scrub: true },
      });
    });
    update(0);
  });
  mm.add("(max-width: 1080px)", () => {
    $$(".steps-bar li").forEach((b) => { b.classList.add("is-on"); b.querySelector("i").style.setProperty("--p", 1); });
    $$(".vcard").forEach((c) => G.from(c, { y: 50, opacity: 0, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: c, start: "top 90%" } }));
  });
}

/* =========================================================
   GO
   ========================================================= */
(async () => {
  stage = await boot();
  window.brightsmile = { stage, lenis, say };
  if (stage) startStageLoop(stage);

  if (motion) {
    const tl = heroIntro();
    heroParallax();
    scrollScenes();
    G.timeline()
      .to(".loader__inner", { y: -30, opacity: 0, duration: 0.6, ease: "power2.in" })
      .to("#loader", { clipPath: "inset(0% 0% 100% 0%)", duration: 1.1, ease: "expo.inOut" }, 0.25)
      .add(() => { root.classList.add("is-loaded"); lenis?.start(); }, ">-0.2");
    tl.delay(0.55);
    document.fonts?.ready.then(() => ST.refresh());
    window.addEventListener("load", () => ST.refresh());
  } else {
    root.classList.add("is-loaded");
    $$(".steps-bar li").forEach((b) => { b.classList.add("is-on"); b.querySelector("i").style.setProperty("--p", 1); });
    stage?.intro();
    if (!stage) {
      setBubble("hero");
      const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) e.target.classList.add("is-on"); }), { threshold: 0.6 });
      $$("[data-bubble]").forEach((b) => io.observe(b));
    }
  }
})();
