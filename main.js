// ================= FOOTER YEAR =================
document.getElementById('year').textContent = new Date().getFullYear();

// Jalankan pembaruan visual maksimal satu kali untuk setiap frame animasi.
function onScrollFrame(callback) {
  let frameId = null;

  function schedule() {
    if (frameId !== null) return;
    frameId = requestAnimationFrame(() => {
      frameId = null;
      callback();
    });
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  schedule();
}

// ================= LANDING: FADE QUOTE SAAT SCROLL =================
(() => {
  const landing = document.getElementById('landing');
  const inner = landing.querySelector('.landing__inner');
  const lines = landing.querySelectorAll('[data-quote-line]');

  // Arah gerak tiap baris: kiri, kanan, kiri (berselang-seling)
  const DIRECTIONS = [-1, 1, -1];
  const MAX_SHIFT = 400; // px, jarak gerak maksimum saat progress = 1

  function updateFade() {
    const rect = landing.getBoundingClientRect();
    const landingHeight = landing.offsetHeight;
    const viewportHeight = window.innerHeight;

    // Fade harus persis sinkron dengan rentang scroll saat section Nama
    // menutupi layar (1 viewport terakhir dari wrapper landing).
    const scrolled = -rect.top;
    const fadeStart = landingHeight - viewportHeight;
    const fadeRange = viewportHeight;

    let progress = (scrolled - fadeStart) / fadeRange;
    progress = Math.min(Math.max(progress, 0), 1);

    inner.style.opacity = 1 - progress;
    inner.style.pointerEvents = progress > 0 ? 'none' : 'auto';
    

    lines.forEach((line, i) => {
      const shift = DIRECTIONS[i % DIRECTIONS.length] * MAX_SHIFT * progress;
      line.style.transform = `translateX(${shift}px)`;
    });
  }

  onScrollFrame(updateFade);
})();

// ================= NAMA & ROLE: AUTO CYCLE + KLIK MANUAL =================
(() => {
  const cycler = document.querySelector('[data-role-cycler]');
  if (!cycler) return;

  const current = cycler.querySelector('[data-role-current]');
  const items = Array.from(cycler.querySelectorAll('[data-role]'));
  let index = 0;
  let timer = null;
  const AUTO_INTERVAL = 3000;

  function showRole(i) {
    index = (i + items.length) % items.length;
    current.textContent = items[index].dataset.role;
    current.classList.remove('is-animating');
    // trigger reflow supaya animasi bisa restart
    void current.offsetWidth;
    current.classList.add('is-animating');
  }

  function startAuto() {
    stopAuto();
    timer = setInterval(() => showRole(index + 1), AUTO_INTERVAL);
  }

  function stopAuto() {
    if (timer) clearInterval(timer);
  }

  current.addEventListener('click', () => {
    showRole(index + 1);
    startAuto(); // reset timer supaya tidak double-ganti terlalu cepat
  });

  showRole(0);
  startAuto();
})();

// ================= TEKS: SCRAMBLE REVEAL SAAT MASUK VIEWPORT =================
(() => {
  const targets = document.querySelectorAll('[data-scramble]');
  if (!targets.length) return;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+-/=';
  const STAGGER = 109; // ms jeda "landing" antar karakter, kiri ke kanan

  function scramble(el) {
    const finalText = el.textContent.trim();
    if (!finalText) return;

    if (reduceMotion) {
      el.textContent = finalText;
      return;
    }

    const chars = finalText.split('');
    const revealAt = chars.map((_, i) => i * STAGGER + Math.random() * STAGGER);
    let startTime = null;

    function frame(timestamp) {
      if (startTime === null) startTime = timestamp;
      const elapsed = timestamp - startTime;

      let output = '';
      let settled = 0;

      chars.forEach((ch, i) => {
        if (ch === ' ') { output += ' '; settled++; return; }
        if (elapsed >= revealAt[i]) {
          output += ch;
          settled++;
        } else {
          output += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
      });

      el.textContent = output;

      if (settled < chars.length) {
        requestAnimationFrame(frame);
      } else {
        el.textContent = finalText;
      }
    }

    requestAnimationFrame(frame);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          scramble(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.6 }
  );

  targets.forEach((el) => observer.observe(el));
})();

// ================= NAVIGASI: SEMBUNYI HANYA SAAT QUOTE AWAL =================
// ================= NAVBAR =================

const sectionNav = document.querySelector("[data-section-nav]");
const introSection = document.querySelector("#intro");

const observer = new IntersectionObserver(
  (entries) => {
    const entry = entries[0];

    if (entry.isIntersecting) {
      sectionNav.classList.add("is-visible");
      sectionNav.setAttribute("aria-hidden", "false");
    } else {
      if (window.scrollY < introSection.offsetTop) {
        sectionNav.classList.remove("is-visible");
        sectionNav.setAttribute("aria-hidden", "true");
      }
    }
  },
  {
    threshold: 0.25
  }
);

observer.observe(introSection);

// Navbar beralih ke warna kontras saat panel berlatar oranye mengisi viewport.
(() => {
  const accentSections = document.querySelectorAll('#skills, #contact');
  if (!sectionNav || !accentSections.length) return;

  const visibleAccentSections = new Set();

  const accentObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) visibleAccentSections.add(entry.target);
        else visibleAccentSections.delete(entry.target);
      });
      sectionNav.classList.toggle('is-on-accent', visibleAccentSections.size > 0);
    },
    { threshold: 0.55 }
  );

  accentSections.forEach((section) => accentObserver.observe(section));
})();

// ================= KONTEN: SCROLL VERTIKAL MENJADI HORIZONTAL =================
(() => {
  const wrapper = document.querySelector('[data-horizontal-scroll]');
  const track = document.querySelector('[data-horizontal-track]');
  if (!wrapper || !track) return;

  const desktop = window.matchMedia('(min-width: 721px)');
  let travel = 0;

  function measure() {
    if (!desktop.matches) {
      wrapper.style.height = '';
      track.style.transform = '';
      return;
    }

    travel = Math.max(0, track.scrollWidth - window.innerWidth);
    // Satu viewport terakhir membuat panel penutup tetap terlihat penuh.
    wrapper.style.height = `${travel + window.innerHeight}px`;
  }

  function updateHorizontalScroll() {
    if (!desktop.matches || !travel) return;

    const progress = Math.min(Math.max(-wrapper.getBoundingClientRect().top / travel, 0), 1);
    track.style.transform = `translate3d(${-travel * progress}px, 0, 0)`;
  }

  // Anchor biasa mencoba scroll ke koordinat X panel. Karena halaman ini
  // mengunci trek secara horizontal, arahkan navbar ke progress vertikalnya.
  function scrollToHorizontalPanel(hash, behavior = 'smooth') {
    const panel = document.querySelector(hash);
    if (!desktop.matches || !panel?.classList.contains('horizontal-panel')) return false;

    const wrapperTop = wrapper.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({
      top: wrapperTop + panel.offsetLeft,
      behavior
    });
    return true;
  }

  document.querySelectorAll('[data-section-nav] a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (!scrollToHorizontalPanel(link.hash)) return;

      event.preventDefault();
      history.pushState(null, '', link.hash);
    });
  });

  window.addEventListener('hashchange', () => scrollToHorizontalPanel(window.location.hash));
  window.addEventListener('load', () => {
    if (window.location.hash) scrollToHorizontalPanel(window.location.hash, 'auto');
  });

  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  desktop.addEventListener('change', measure);
  measure();
  onScrollFrame(updateHorizontalScroll);
})();

// ================= FOTO: PARALLAX SUBTLE SAAT SCROLL =================
(() => {
  const photo = document.querySelector('[data-parallax]');
  if (!photo) return;

  function updateParallax() {
    const rect = photo.getBoundingClientRect();
    const viewportCenter = window.innerHeight / 2;
    const distanceFromCenter = rect.top + rect.height / 2 - viewportCenter;
    const offset = distanceFromCenter * 0.08; // pelan, subtle
    photo.style.transform = `translateY(${offset}px)`;
  }

  onScrollFrame(updateParallax);
})();

// ================= SKILLS: STAGGERED REVEAL SAAT SCROLL =================
(() => {
  const cards = document.querySelectorAll('[data-reveal]');
  if (!cards.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const allCards = Array.from(cards);
          const i = allCards.indexOf(entry.target);
          setTimeout(() => {
            entry.target.classList.add('is-visible');
          }, i * 150); // delay berurutan
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.2 }
  );

  cards.forEach((card) => observer.observe(card));
})();

// ================= PROJECTS: KLIK UNTUK EXPAND DETAIL =================
(() => {
  const stage = document.querySelector('[data-project-stage]');
  const list = document.querySelector('[data-project-list]');
  const detail = document.querySelector('[data-project-detail]');
  const detailContent = document.querySelector('[data-project-detail-content]');
  if (!stage || !list || !detail) return;

  const cards = Array.from(list.querySelectorAll('.project-card'));

  const PROJECT_DETAILS = {
    'reject-infus': {
      title: 'Factory Reject Analytics Dashboard',
      status: '[DONE]',
      body: [
        'A production quality monitoring system that analyzes reject trends',
        'identifies major defect causes',
        'and provides interactive dashboards for manufacturing insights.'
      ]
    },
    'tren-reject': {
      title: 'Sales Performance Dashboard',
      status: '[IN PROGRESS]',
      body: [
        'Visualize sales performance, revenue growth, and product profitability',
        'with dynamic reports and interactive business dashboards.'
      ]
    },
    'dashboard-downtime': {
      title: 'Inventory Management System',
      status: '[PLANNED]',
      body: [
        'Manage inventory efficiently by tracking stock movements',
        'monitoring availability, and generating real-time inventory reports.'
      ]
    }
  };

  function openProject(id) {
    const data = PROJECT_DETAILS[id];
    if (!data) return;

    cards.forEach((card) => {
      card.classList.toggle('is-hidden', card.dataset.projectId !== id);
    });

    detailContent.innerHTML = `
      <span class="tag">${data.status}</span>
      <h3>${data.title}</h3>
      ${data.body.map((p) => `<p>${p}</p>`).join('')}
      <p class="project-detail__hint">Klik untuk kembali</p>
    `;

    stage.classList.add('is-expanded');
    detail.hidden = false;
    requestAnimationFrame(() => detail.classList.add('is-visible'));
  }

  function closeProject() {
    stage.classList.remove('is-expanded');
    detail.classList.remove('is-visible');
    cards.forEach((card) => card.classList.remove('is-hidden'));
    setTimeout(() => { detail.hidden = true; }, 300);
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => openProject(card.dataset.projectId));
  });

  detail.addEventListener('click', closeProject);
})();

// ================= CONTACT: COPY EMAIL =================
(() => {
  const emailLink = document.querySelector('[data-copy-email]');
  if (!emailLink) return;

  emailLink.addEventListener('click', (e) => {
    e.preventDefault();
    const email = emailLink.getAttribute('href').replace('mailto:', '');

    navigator.clipboard.writeText(email).then(() => {
      const emailText = emailLink.querySelector('span');
      const original = emailText.textContent;
      emailText.textContent = 'Copied!';
      setTimeout(() => { emailText.textContent = original; }, 1500);
    });
  });
})();

// ================= BIODATA: PANEL KLIK (BUKAN SCROLL) =================
(() => {
  const trigger = document.querySelector('[data-biodata-trigger]');
  const panel = document.querySelector('[data-biodata]');
  const backdrop = document.querySelector('[data-biodata-backdrop]');
  const closeBtn = document.querySelector('[data-biodata-close]');
  if (!trigger || !panel || !backdrop || !closeBtn) return;

  function openBiodata() {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    requestAnimationFrame(() => backdrop.classList.add('is-visible'));
    trigger.setAttribute('aria-expanded', 'true');
    closeBtn.focus();
  }

  function closeBiodata() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    backdrop.classList.remove('is-visible');
    trigger.setAttribute('aria-expanded', 'false');
    setTimeout(() => { backdrop.hidden = true; }, 300);
    trigger.focus();
  }

  trigger.addEventListener('click', openBiodata);
  closeBtn.addEventListener('click', closeBiodata);
  backdrop.addEventListener('click', closeBiodata);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) closeBiodata();
  });
})();
