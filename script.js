
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.demo-panel');
tabs.forEach(btn => btn.addEventListener('click', () => {
  tabs.forEach(b => b.classList.remove('active'));
  panels.forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(btn.dataset.target).classList.add('active');
}));

const revealEls = document.querySelectorAll('.reveal');
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => { if(e.isIntersecting){ e.target.classList.add('visible'); io.unobserve(e.target);} });
},{threshold:.12});
revealEls.forEach(el => io.observe(el));

const menuBtn = document.querySelector('.menu-btn');
const nav = document.querySelector('.nav');
menuBtn.addEventListener('click',()=>nav.classList.toggle('open'));
nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>nav.classList.remove('open')));

function setLang(lang){
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-fr][data-en]').forEach(el=>{
    el.innerHTML = el.dataset[lang];
  });
  document.querySelectorAll('.lang-btn').forEach(b=>b.classList.toggle('active', b.dataset.lang===lang));
  localStorage.setItem('icare-lang',lang);
}
document.querySelectorAll('.lang-btn').forEach(b=>b.addEventListener('click',()=>setLang(b.dataset.lang)));
setLang(localStorage.getItem('icare-lang') || 'fr');


/* ==================================================================
   ICARE_R3D_LIGHTBOX
   Jury inspection of authenticated product screenshots.
   ================================================================== */

(() => {

  const candidates = document.querySelectorAll(
    '.real-demo-visual img, ' +
    '.real-proof-grid img, ' +
    '.compact-proof-grid img'
  );

  if (!candidates.length) return;

  const box = document.createElement('div');

  box.className = 'icare-lightbox';

  box.setAttribute(
    'role',
    'dialog'
  );

  box.setAttribute(
    'aria-modal',
    'true'
  );

  box.setAttribute(
    'aria-label',
    'Agrandissement de la capture ICARE'
  );

  box.innerHTML = `
    <div class="icare-lightbox-inner">
      <button
        class="icare-lightbox-close"
        type="button"
        aria-label="Fermer">
        ×
      </button>

      <img alt="">

      <div class="icare-lightbox-caption"></div>
    </div>
  `;

  document.body.appendChild(box);

  const largeImage =
    box.querySelector('img');

  const caption =
    box.querySelector(
      '.icare-lightbox-caption'
    );

  const closeButton =
    box.querySelector(
      '.icare-lightbox-close'
    );

  let previousFocus = null;

  function openLightbox(image) {

    previousFocus =
      document.activeElement;

    largeImage.src =
      image.currentSrc ||
      image.src;

    largeImage.alt =
      image.alt || '';

    const figure =
      image.closest('figure');

    let text = '';

    if (figure) {

      const figcaption =
        figure.querySelector(
          'figcaption'
        );

      if (figcaption) {
        text =
          figcaption.innerText.trim();
      }
    }

    if (!text) {
      text =
        image.alt || 'ICARE';
    }

    caption.textContent = text;

    box.classList.add('open');

    document.body.classList.add(
      'lightbox-open'
    );

    closeButton.focus();
  }

  function closeLightbox() {

    box.classList.remove('open');

    document.body.classList.remove(
      'lightbox-open'
    );

    largeImage.removeAttribute(
      'src'
    );

    if (
      previousFocus &&
      typeof previousFocus.focus ===
        'function'
    ) {
      previousFocus.focus();
    }
  }

  candidates.forEach(image => {

    image.setAttribute(
      'tabindex',
      '0'
    );

    image.setAttribute(
      'role',
      'button'
    );

    image.setAttribute(
      'aria-label',
      (
        image.alt ||
        'Capture ICARE'
      ) +
      ' — agrandir'
    );

    image.addEventListener(
      'click',
      () => openLightbox(image)
    );

    image.addEventListener(
      'keydown',
      event => {

        if (
          event.key === 'Enter' ||
          event.key === ' '
        ) {
          event.preventDefault();

          openLightbox(image);
        }
      }
    );
  });

  closeButton.addEventListener(
    'click',
    closeLightbox
  );

  box.addEventListener(
    'click',
    event => {

      if (event.target === box) {
        closeLightbox();
      }
    }
  );

  document.addEventListener(
    'keydown',
    event => {

      if (
        event.key === 'Escape' &&
        box.classList.contains('open')
      ) {
        closeLightbox();
      }
    }
  );

})();
