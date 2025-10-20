(() => {
  const ICON_SPRITE = `
<svg id="social-sprite" width="0" height="0" style="position:absolute;left:-9999px;top:-9999px">
  <defs>
    <symbol id="ic-bandcamp" viewBox="0 0 24 24" fill="currentColor"><path d="M9.2 5h9.3L14.8 19H5.5L9.2 5z"/></symbol>
    <symbol id="ic-instagram" viewBox="0 0 24 24" fill="currentColor"><path d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7zm5 3.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zm0 2a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm5.75-2.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5z"/></symbol>
    <symbol id="ic-x" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h3.7l5.1 6.9L17.9 3H21l-7.3 9.4L21 21h-3.7l-5.4-7.3L6.1 21H3l7.8-10.1L3 3z"/></symbol>
    <symbol id="ic-youtube" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 7.5a4 4 0 0 0-2.8-2.8C18.9 4 12 4 12 4s-6.9 0-8.7.7A4 4 0 0 0 .5 7.5 41.7 41.7 0 0 0 0 12a41.7 41.7 0 0 0 .5 4.5 4 4 0 0 0 2.8 2.8C5.1 20 12 20 12 20s6.9 0 8.7-.7a4 4 0 0 0 2.8-2.8c.4-1.5.5-3 .5-4.5s0-3-.5-4.5zM9.8 15.5V8.5L15.8 12l-6 3.5z"/></symbol>
    <symbol id="ic-soundcloud" viewBox="0 0 24 24" fill="currentColor"><path d="M12.5 7a5 5 0 0 1 4.7 3.1 3.5 3.5 0 1 1 1.8 6.5H8.3A3.3 3.3 0 0 1 5 13.3c0-1.7 1.3-3.1 3-3.3A5 5 0 0 1 12.5 7z"/></symbol>
    <symbol id="ic-spotify" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5a10.5 10.5 0 1 0 0 21 10.5 10.5 0 0 0 0-21zm4.6 14.7a.9.9 0 0 1-1.2.3c-3-1.8-6.8-2.2-11.3-1.2a.9.9 0 1 1-.4-1.7c5-1.2 9.2-.8 12.6 1.2.4.2.5.8.3 1.4zm1-3a1 1 0 0 1-1.3.3c-3.5-2-8.9-2.6-13-1.4a1 1 0 1 1-.6-1.9c4.7-1.4 10.8-.7 14.8 1.7.5.3.7 1 .3 1.3zm.1-3a1.1 1.1 0 0 1-1.4.4c-3.9-2.3-10.5-2.5-14.3-1.4a1.1 1.1 0 1 1-.6-2.1c4.4-1.3 11.8-1 16.3 1.7.5.3.6 1 .2 1.4z"/></symbol>
    <symbol id="ic-link" viewBox="0 0 24 24" fill="currentColor"><path d="M10.6 13.4a4 4 0 0 0 5.7 0l2.1-2.1a4 4 0 1 0-5.7-5.7L11.8 7M13.4 10.6a4 4 0 0 0-5.7 0L5.6 12.7a4 4 0 0 0 5.7 5.7l.9-.9"/></symbol>
    <symbol id="ic-mail" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zm0 2v.2l9 5.3 9-5.3V7H3z"/></symbol>
    <symbol id="ic-tiktok" viewBox="0 0 24 24" fill="currentColor"><path d="M14.5 3c.6 1.8 1.8 3.2 3.6 3.7.5.1 1 .2 1.4.2v3a7.2 7.2 0 0 1-5-1.8v6.3a5.4 5.4 0 1 1-3.8-5.2v3.1a2.4 2.4 0 1 0 1.7 2.3V3h2.1z"/></symbol>
  </defs>
</svg>`;

  const ICON_MAP = {
    bandcamp:'ic-bandcamp', instagram:'ic-instagram', x:'ic-x',
    youtube:'ic-youtube', soundcloud:'ic-soundcloud', spotify:'ic-spotify',
    link:'ic-link', email:'ic-mail', tiktok:'ic-tiktok'
  };
  const CLASS_MAP = {
    bandcamp:'bc', instagram:'ig', x:'x', youtube:'yt', soundcloud:'sc',
    spotify:'sp', link:'lk', email:'mail', tiktok:'tt'
  };
  const KEYS = Object.keys(ICON_MAP);

  function ensureSprite() {
    if (!document.getElementById('social-sprite')) {
      document.body.insertAdjacentHTML('afterbegin', ICON_SPRITE);
    }
  }
  function slugFromPage() {
    const byData = (document.body.dataset.discog || '').trim();
    const byFile = location.pathname.split('/').pop().replace(/\.html$/,'');
    return (byData || byFile || 'index').toLowerCase().replace(/[^a-z0-9]/g,'');
  }
  async function loadMeta(slug) {
    // 1) external JSON
    try {
      const res = await fetch(`/artists/${slug}.json`, { cache:'no-store' });
      if (res.ok) return await res.json();
    } catch {}
    // 2) inline JSON
    const el = document.getElementById('artist-meta');
    if (el && el.textContent.trim()) {
      try { return JSON.parse(el.textContent); } catch {}
    }
    // 3) body data-* fallback
    const socials = {};
    KEYS.forEach(k => { const v = document.body.dataset[k]; if (v) socials[k] = v; });
    return { socials };
  }
  function build(target, socials) {
    if (!target || !socials) return;
    ensureSprite();
    target.classList.add('socials');
    target.innerHTML = '';
    for (const [k, hrefRaw] of Object.entries(socials)) {
      if (!hrefRaw || !ICON_MAP[k]) continue;
      const href = (k === 'email' && !/^mailto:/i.test(hrefRaw)) ? `mailto:${hrefRaw}` : hrefRaw;
      const a = document.createElement('a');
      a.className = CLASS_MAP[k] || '';
      a.href = href;
      if (k !== 'email') { a.target = '_blank'; a.rel = 'noopener'; }
      a.setAttribute('aria-label', k);
      a.innerHTML = `<svg><use href="#${ICON_MAP[k]}"/></svg>`;
      target.appendChild(a);
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const host = document.querySelector('[data-socials]');
    if (!host) return;
    const slug = slugFromPage();
    const meta = await loadMeta(slug);
    build(host, meta?.socials || meta);
  });
})();