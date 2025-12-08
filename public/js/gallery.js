// public/js/gallery.js
// Simple, autoplaying artist gallery
// Accepts JSON at /galleries/<slug>.json as either:
//
//   { "photos": [ { "src": "...", "alt": "..." }, ... ] }
//
// or the older form:
//   { "images": [ "/path/one.jpg", "/path/two.jpg", ... ] }

document.addEventListener('DOMContentLoaded', () => {
  const galleries = document.querySelectorAll('.artist-gallery');
  if (!galleries.length) return;

  const DEBUG = /[?&]debugGallery=1\b/.test(location.search);

  galleries.forEach(initGallery);

  function initGallery(root) {
    const frame = root.querySelector('.artist-gallery-frame');
    if (!frame) return;

    const dotsContainer = root.querySelector('.artist-gallery-dots');
    const prevBtn = root.querySelector('[data-prev]');
    const nextBtn = root.querySelector('[data-next]');

    // slug priority: data-gallery on container → data-artist on body → filename
    const bodySlug = (document.body.dataset.artist || '').trim();
    const containerSlug = (root.dataset.gallery || '').trim();
    const fileSlug = location.pathname.split('/').pop().replace(/\.html$/, '');
    const slug = (containerSlug || bodySlug || fileSlug).toLowerCase();

    const jsonUrl = `/galleries/${slug}.json`;
    if (DEBUG) console.log('[gallery] slug:', slug, 'url:', jsonUrl);

    fetch(jsonUrl, { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        // 💡 Make this tolerant of different JSON shapes
        let photos = [];

        // Preferred: { photos: [ { src, alt? }, ... ] }
        if (Array.isArray(data.photos)) {
          photos = data.photos.map(p => {
            if (typeof p === 'string') {
              return { src: p, alt: '' };
            }
            return {
              src: p.src,
              alt: p.alt || ''
            };
          });
        }
        // Backwards compat: { images: [ "/img/one.jpg", ... ] }
        else if (Array.isArray(data.images)) {
          photos = data.images.map(src => ({ src, alt: '' }));
        }

        if (DEBUG) console.log('[gallery] photos:', photos.length, photos);

        if (!photos.length) {
          frame.innerHTML = '<div class="muted" style="padding:0.75rem 0;">no photos yet</div>';
          return;
        }

        buildSlides(frame, dotsContainer, photos, prevBtn, nextBtn);
      })
      .catch(err => {
        console.warn('[gallery] failed to load', jsonUrl, err);
        if (DEBUG) console.log('[gallery] error:', err.message);
        frame.innerHTML = '<div class="muted" style="padding:0.75rem 0;">gallery unavailable</div>';
      });
  }

  function buildSlides(frame, dotsContainer, photos, prevBtn, nextBtn) {
    frame.innerHTML = '';

    const slides = photos.map((p, i) => {
      const img = document.createElement('img');
      img.className = 'artist-gallery-slide';
      img.src = p.src;
      img.alt = p.alt || '';
      if (i === 0) img.classList.add('is-active');
      frame.appendChild(img);
      return img;
    });

    let index = 0;
    let timer = null;
    const AUTOPLAY_MS = 5000;

    const dots = [];
    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      photos.forEach((_, i) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'artist-gallery-dot';
        dot.setAttribute('aria-label', `go to slide ${i + 1}`);
        dot.addEventListener('click', () => {
          show(i, true);
        });
        dotsContainer.appendChild(dot);
        dots.push(dot);
      });
    }

    function show(i, fromUser = false) {
      index = (i + slides.length) % slides.length;
      slides.forEach((img, idx) => {
        img.classList.toggle('is-active', idx === index);
      });
      dots.forEach((dot, idx) => {
        dot.classList.toggle('is-active', idx === index);
      });
      if (!fromUser) {
        schedule();
      } else {
        clearTimeout(timer);
        schedule();
      }
    }

    function schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => show(index + 1), AUTOPLAY_MS);
    }

    // buttons
    if (prevBtn) prevBtn.addEventListener('click', () => show(index - 1, true));
    if (nextBtn) nextBtn.addEventListener('click', () => show(index + 1, true));

    // pause on hover
    frame.addEventListener('mouseenter', () => clearTimeout(timer));
    frame.addEventListener('mouseleave', () => schedule());

    // kick off autoplay
    schedule();
  }
});