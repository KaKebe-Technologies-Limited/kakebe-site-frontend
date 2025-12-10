/* script.js - refactored full script
   - Full refactor for safe rendering + caching + rich text DOM renderer
   - Usage: include on any page; functions will gracefully skip missing elements
*/

const API_BASE_URL = 'http://localhost:1337'; // change to deployed URL when needed

/* ---------- CONFIG ---------- */
const CACHE_ENABLED = true;        // set false to disable caching
const CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes cache TTL
const AOS_MOBILE_BREAKPOINT = 768; // disable AOS on widths <= this

/* ---------- UTILS ---------- */

// safe element getter
function getEl(selectorOrId) {
  if (!selectorOrId) return null;
  // accept both '#id' and 'id'
  const sel = selectorOrId.startsWith ? (selectorOrId.startsWith('#') ? selectorOrId : `#${selectorOrId}`) : selectorOrId;
  return document.querySelector(sel);
}

// safe append (skips if element missing)
function safeAppend(parentSelectorOrEl, node) {
  const parent = (typeof parentSelectorOrEl === 'string') ? getEl(parentSelectorOrEl) : parentSelectorOrEl;
  if (!parent || !node) return false;
  parent.appendChild(node);
  return true;
}

// very small cache wrapper around sessionStorage
/* ------------ SAFE FETCH (updated to respect session cache-disable flag) ------------ */
function safeFetch(url, { cacheKey = null, ttl = CACHE_TTL_MS, useCache = CACHE_ENABLED } = {}) {
  // If session disabled, ignore caching entirely
  const cacheDisabled = sessionStorage.getItem('CACHE_DISABLED') === '1';
  const useCacheEffective = useCache && !cacheDisabled;

  if (useCacheEffective && cacheKey) {
    try {
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const obj = JSON.parse(raw);
        if (Date.now() - obj._ts < ttl) {
          return Promise.resolve(obj.value);
        } else {
          sessionStorage.removeItem(cacheKey);
        }
      }
    } catch (e) {
      console.warn('cache read error', e);
    }
  }

  return fetch(url)
    .then(resp => {
      if (!resp.ok) throw new Error(`Fetch ${url} failed: ${resp.status}`);
      return resp.json();
    })
    .then(json => {
      if (useCacheEffective && cacheKey) {
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify({ _ts: Date.now(), value: json }));
        } catch (e) {
          console.warn('cache write error', e);
        }
      }
      return json;
    });
}

// universal image URL resolver - handles multiple Strapi shapes
function getImageUrl(mediaObj = null, sizeKey = null) {
  // mediaObj may be:
  // - null
  // - { url: '/uploads/..' } (older/simple)
  // - { data: { attributes: { url: '/uploads/..', formats: { small: {url:...} }}}} (v4)
  // - { formats: { small: {url: '/...'} }, url: '/uploads/..' } (sometimes direct)
  try {
    if (!mediaObj) return null;

    // case: direct { url: '/uploads/..' }
    if (typeof mediaObj.url === 'string') {
      // if formats present, prefer formats[sizeKey]
      if (mediaObj.formats && sizeKey && mediaObj.formats[sizeKey] && mediaObj.formats[sizeKey].url) {
        return `${API_BASE_URL}${mediaObj.formats[sizeKey].url}`;
      }
      return `${API_BASE_URL}${mediaObj.url}`;
    }

    // case: Strapi v4 shape: mediaObj.data.attributes
    if (mediaObj.data && mediaObj.data.attributes) {
      const attr = mediaObj.data.attributes;
      if (attr.formats && sizeKey && attr.formats[sizeKey] && attr.formats[sizeKey].url) {
        return `${API_BASE_URL}${attr.formats[sizeKey].url}`;
      }
      if (attr.url) return `${API_BASE_URL}${attr.url}`;
    }

    // case: nested mediaObj.attributes (sometimes used)
    if (mediaObj.attributes) {
      const attr = mediaObj.attributes;
      if (attr.formats && sizeKey && attr.formats[sizeKey] && attr.formats[sizeKey].url) {
        return `${API_BASE_URL}${attr.formats[sizeKey].url}`;
      }
      if (attr.url) return `${API_BASE_URL}${attr.url}`;
    }

  } catch (e) {
    console.warn('getImageUrl error', e);
  }
  return null;
}

/* ---------- RICH TEXT => DOM RENDERER (safe, no innerHTML) ---------- */

// returns a DocumentFragment or element container
function renderRichTextDOM(blocks) {
  // fallback guard
  if (!Array.isArray(blocks) || blocks.length === 0) return document.createDocumentFragment();

  const wrapper = document.createElement('div');
  const enableAOS = (window.innerWidth > AOS_MOBILE_BREAKPOINT);

  blocks.forEach(block => {
    if (!block || !block.type) return;

    let el = null;
    const type = block.type;

    if (type === 'heading') {
      const level = block.level && block.level >= 1 && block.level <= 6 ? block.level : 3;
      el = document.createElement(`h${level}`);
      el.appendChild(renderChildrenDOM(block.children));
    } else if (type === 'paragraph') {
      el = document.createElement('p');
      el.appendChild(renderChildrenDOM(block.children));
    } else if (type === 'list') {
      el = document.createElement(block.format === 'ordered' ? 'ol' : 'ul');
      (block.children || []).forEach(item => {
        const li = document.createElement('li');
        li.appendChild(renderChildrenDOM(item.children));
        el.appendChild(li);
      });
    } else {
      // unknown block - attempt to render children inside a div
      el = document.createElement('div');
      el.appendChild(renderChildrenDOM(block.children));
    }

    if (el) {
      if (enableAOS) {
        el.setAttribute('data-aos', block.aos || 'fade-up');
        el.setAttribute('data-aos-duration', block.aosDuration || '700');
      }
      wrapper.appendChild(el);
    }
  });

  return wrapper;
}

function renderChildrenDOM(children = []) {
  const frag = document.createDocumentFragment();
  if (!Array.isArray(children) || children.length === 0) return frag;

  children.forEach(child => {
    if (!child || !child.type) return;

    if (child.type === 'text') {
      // inline text (may have formatting flags)
      if (child.code) {
        const code = document.createElement('code');
        code.textContent = child.text ?? '';
        frag.appendChild(code);
        return;
      }

      // use span for text to allow inline styling
      const span = document.createElement('span');
      span.textContent = child.text ?? '';

      // apply styles (we use styling to avoid nested tags except code)
      if (child.bold) span.style.fontWeight = '600';
      if (child.italic) span.style.fontStyle = 'italic';
      // underline/strikethrough use textDecoration (if both present, combine)
      const decorations = [];
      if (child.underline) decorations.push('underline');
      if (child.strikethrough) decorations.push('line-through');
      if (decorations.length) span.style.textDecoration = decorations.join(' ');

      frag.appendChild(span);
      return;
    }

    if (child.type === 'link') {
      const a = document.createElement('a');
      a.href = child.url || '#';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.appendChild(renderChildrenDOM(child.children || []));
      frag.appendChild(a);
      return;
    }

    // unknown inline type: try to render its children
    if (child.children) {
      frag.appendChild(renderChildrenDOM(child.children));
      return;
    }

    console.warn('Unknown child type in rich text:', child);
  });

  return frag;
}

/* ---------- Helper to inject rich text into a selector (safe) ---------- */
function injectRichText(selectorOrEl, blocks) {
  const el = typeof selectorOrEl === 'string' ? getEl(selectorOrEl) : selectorOrEl;
  if (!el) return false;

  // Render into a temporary container so we can tag injected nodes reliably
  const node = renderRichTextDOM(blocks);
  const temp = document.createElement('div');
  temp.appendChild(node);

  // Mark any elements that come from this injection so fallback can target them only
  temp.querySelectorAll('[data-aos]').forEach(n => n.setAttribute('data-injected', '1'));

  // Move children from temp into destination element
  while (temp.firstChild) el.appendChild(temp.firstChild);

  // AOS handling: prefer to refresh AOS; otherwise add `aos-animate` to injected nodes
  try {
    if (window.AOS && typeof window.AOS.refresh === 'function') {
      // Try to refresh immediately
      window.AOS.refresh();
      if (typeof window.AOS.refreshHard === 'function') window.AOS.refreshHard();

      // Schedule a short retry in case AOS wasn't ready or used lazy-loading
      setTimeout(() => {
        try {
          if (window.AOS && typeof window.AOS.refresh === 'function') window.AOS.refresh();
        } catch (e) {
          // ignore
        }
        // After retry, if any injected nodes are still un-animated, force them visible
        const stillInjected = el.querySelectorAll('[data-injected]');
        if (stillInjected.length) {
          stillInjected.forEach(n => {
            n.classList.add('aos-animate');
            n.removeAttribute('data-injected');
          });
        }
      }, 80);

    } else {
      // Fallback: AOS not present — make injected elements visible by adding aos-animate
      setTimeout(() => {
        const injected = el.querySelectorAll('[data-injected]');
        injected.forEach(n => {
          n.classList.add('aos-animate');
          n.removeAttribute('data-injected');
        });
      }, 20);
    }
  } catch (e) {
    // On any error, ensure injected nodes are visible
    const injected = el.querySelectorAll('[data-injected]');
    injected.forEach(n => {
      n.classList.add('aos-animate');
      n.removeAttribute('data-injected');
    });
  }

  return true;
}

/* ---------- IMAGE SIZE helper ---------- */
function setImageSize() {
  const width = window.innerWidth;
  if (width <= 600) return 'small';
  if (width <= 1200) return 'medium';
  return 'large';
}

/* ------------ HELPER: Format Ugandan phone numbers from +256xxxxxxxxx → +256 777 676 206 ------------ */
/**
 * Format Ugandan phone numbers from +256xxxxxxxxx → +256 777 676 206
 * Works for both +256777676206 and +256 777676206 (already formatted)
 * @param {string} raw - Raw phone number (e.g. "+256777676206")
 * @returns {string} - Formatted: "+256 777 676 206"
 */
function formatUgandaPhone(raw = '') {
  // 1. Keep only digits and the leading “+”
  const clean = raw.replace(/[^\d+]/g, '');

  // 2. Must be +256 followed by 9 digits
  if (/^\+256\d{9}$/.test(clean)) {
    const local = clean.slice(4);                     // remove +256
    return `+256 ${local.slice(0,3)} ${local.slice(3,6)} ${local.slice(6)}`;
  }
  // 3. If it is already formatted (has spaces) – just return it
  if (/^\+256\s\d{3}\s\d{3}\s\d{3}$/.test(raw)) {
    return raw;
  }
  // 4. Anything else → return untouched (so you see the problem)
  return raw;
}

/* ------------ HELPER: When team members are loaded → push their individual keys ------------ */
function addMemberCacheKey(encodedName) {
  const key = `member_${encodedName}`;
  if (!keysToClear.includes(key)) {
    keysToClear.push(key);
  }
}

/* ---------- RENDERERS: Company Profile / Team / Products / Initiatives / Testimonials / Services ---------- */
function populateCompanyProfile() {
  const containerTitle = getEl('about-title');
  const containerText = getEl('about-text');
  const containerMission = getEl('mission');
  const containerVision = getEl('vision');
  const containerValues = getEl('values');
  const containerImage = getEl('about-image');
  const containerContact = getEl('about-contact');
  const footer = getEl('footer');
  const phoneLink = getEl('phone');
  const whatsappLink = getEl('whatsapp');
  const emailLink = getEl('contact-email');
  const webLink = getEl('website');

  // if none of the main nodes exist, skip fetching to save time
  if (!containerTitle && !containerText && !containerMission && !containerVision && !containerValues && !containerImage && !containerContact && !footer) {
    return;
  }

  const url = `${API_BASE_URL}/api/company-profile?populate=*`;
  safeFetch(url, { cacheKey: 'company_profile', ttl: CACHE_TTL_MS, useCache: CACHE_ENABLED })
    .then(res => {
      if (!res || !res.data) throw new Error('Invalid company profile response');
      const info = res.data;

      // title
      if (containerTitle && typeof info.title === 'string') {
        const st = document.createElement('strong');
        st.textContent = info.title;
        containerTitle.appendChild(st);
      }

      // image (fallback)
      const imgUrl = getImageUrl(info.image, setImageSize()) || 'assets/img/6.JPG';
      if (containerImage) containerImage.setAttribute('src', imgUrl);

      // rich text areas (safe)
      if (containerText) injectRichText(containerText, info.intro_text || info.info_text || []);
      if (containerMission) injectRichText(containerMission, info.mission || []);
      if (containerVision) injectRichText(containerVision, info.vision || []);
      if (containerValues) injectRichText(containerValues, info.values || []);

      // contact & footer
    const email   = info.contact_email || '';
    const phone   = info.telephone || info.landline || '';
    const whatsapp = info.whatsapp || '';
    const location = info.location || '';
    const website  = info.website || '';

    /* ---------- CONTACT BLOCK ---------- */
    if (containerContact) {
      containerContact.innerHTML = `
        ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
        ${phone ? `<p><strong>Phone:</strong> ${formatUgandaPhone(phone)}</p>` : ''}
        ${location ? `<p><strong>Location:</strong> ${location}</p>` : ''}
      `;
    }

    /* ---------- FOOTER LINKS ---------- */
    if (footer) {
      // phone
      if (phoneLink) {
        phoneLink.href        = `tel:${phone}`;
        phoneLink.textContent = formatUgandaPhone(phone);
      }
      // whatsapp (same format, but href uses the WhatsApp link)
      if (whatsappLink) {
        whatsappLink.href        = `https://wa.me/${whatsapp.replace(/[^\d]/g, '')}`;
        whatsappLink.textContent = formatUgandaPhone(whatsapp);
        whatsappLink.referrer    = 'no-referrer';
        whatsappLink.target      = '_blank';
      }
      // email
      if (emailLink) {
        emailLink.href        = `mailto:${email}`;
        emailLink.textContent = email;
      }
      // website
      if (webLink) {
        webLink.href        = website.startsWith('http') ? website : `https://${website}`;
        webLink.textContent = website;
      }
    }
  })
  .catch(err => console.error('Error loading company profile:', err));
}

function populateTeamMembers() {
  const container = getEl('team-container');
  if (!container) return;

  const url = `${API_BASE_URL}/api/team-members?populate=*`;
  safeFetch(url, { cacheKey: 'team_members', ttl: CACHE_TTL_MS, useCache: CACHE_ENABLED })
    .then(res => {
      if (!res || !res.data) throw new Error('Invalid team members response');
      const teamMembers = res.data;

      // group by department
      const groups = {};
      teamMembers.forEach(memberRaw => {
        // handle attributes wrapper if present (Strapi v4)
        const member = memberRaw.attributes ? { id: memberRaw.id, ...memberRaw.attributes } : memberRaw;
        const dept = (member.department && member.department.trim()) ? member.department : 'General';
        if (!groups[dept]) groups[dept] = [];
        groups[dept].push(member);
      });

      // clear existing
      // container.innerHTML = '';

    // Sort departments alphabetically (A → Z)
    Object.entries(groups)
      .sort(([deptA], [deptB]) => deptA.localeCompare(deptB))
      .forEach(([department, members]) => {
        const section = document.createElement('div');
        section.className = 'department-section mb-5';

        // Department Header
        const header = document.createElement('div');
        header.className = 'department-header p-3 bg-light border rounded';
        header.innerHTML = `<h3 class="mb-0"><strong>${department}</strong></h3>`;
        section.appendChild(header);

        // Members Grid
        const membersContainer = document.createElement('div');
        membersContainer.className = 'row mt-3 g-3';

        members.forEach(member => {
          const descBlocks = member.description || [];
          let descPreview = 'No description available.';
          if (Array.isArray(descBlocks) && descBlocks.length > 0) {
            const first = descBlocks.find(b => b.type === 'paragraph');
            if (first?.children?.[0]?.text) {
              descPreview = first.children[0].text;
            }
          }

          const imageSize = setImageSize();
          const avatarUrl = getImageUrl(member.avatar, imageSize) || 'assets/img/default-avatar.jpg';

          const col = document.createElement('div');
          col.className = 'col-10 col-md-4 col-lg-3 mx-auto';

          const card = document.createElement('div');
          card.className = 'team-card text-center p-3 border rounded shadow-sm hover-shadow';

          const img = document.createElement('img');
          img.src = avatarUrl;
          img.dataset.src = avatarUrl;
          img.alt = member.name;
          img.className = 'img-fluid rounded-circle mb-3 lazy';
          img.style.cssText = 'width:120px; height:120px; object-fit:cover;';

          const name = document.createElement('h5');
          name.className = 'mb-1';
          name.textContent = member.name;

          const position = document.createElement('p');
          position.className = 'text-muted small mb-2';
          position.textContent = member.position || '';

          const preview = document.createElement('p');
          preview.className = 'text-muted small mb-3';
          preview.textContent = descPreview.length > 80 ? descPreview.slice(0, 80) + '...' : descPreview;

          const learnMore = document.createElement('a');
          learnMore.href = `team.html?member=${encodeURIComponent((member.name || '').replace(/\s+/g, '-'))}`;
          learnMore.className = 'theme-btn2';
          learnMore.textContent = 'Learn More';

          card.append(img, name, position, preview, learnMore);
          col.appendChild(card);
          membersContainer.appendChild(col);
        });

        section.appendChild(membersContainer);
        container.appendChild(section);
      });
    
    })
    .catch(err => console.error('Error fetching team members:', err));
}

function renderSingleTeamMember() {
  const profileSection    = getEl('team-detail');
  const profileEl         = getEl('member-profile');
  const messageEl         = getEl('member-message');
  const teamListSection   = getEl('team');
  const teamListContainer = getEl('team-container');

  if (!profileEl && !messageEl) return;

  const memberIdOrName = getMemberIdentifierFromURL();

  // ——— NO MEMBER → SHOW LIST ———
  if (!memberIdOrName) {
    if (profileSection)    profileSection.classList.add('d-none');
    if (profileEl)         profileEl.classList.add('d-none');
    if (messageEl)         messageEl.classList.add('d-none');
    if (teamListSection)   teamListSection.classList.remove('d-none');
    if (teamListContainer) teamListContainer.classList.remove('d-none');
    populateTeamMembers();
    return;
  }

  // ——— MEMBER → SHOW PROFILE ———
  if (teamListSection)   teamListSection.classList.add('d-none');
  if (teamListContainer) teamListContainer.classList.add('d-none');
  if (profileSection)    profileSection.classList.remove('d-none');
  if (profileEl)         profileEl.classList.remove('d-none');
  if (messageEl)         messageEl.classList.remove('d-none');

  profileEl.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary"></div></div>';
  if (messageEl) messageEl.innerHTML = '';

  const searchName = memberIdOrName.replace(/-/g, ' ');
  const encoded    = encodeURIComponent(searchName);
  addMemberCacheKey(encoded);
  const apiUrl = `${API_BASE_URL}/api/team-members?populate[0]=avatar&populate[1]=gallery.image&filters[name][$eqi]=${encoded}`;

  safeFetch(apiUrl, { cacheKey: `member_${encoded}` })
    .then(res => {
      if (!res?.data?.length) {
        messageEl.innerHTML = `<h3>Not Found</h3><p>No member named <strong>${escapeHtml(memberIdOrName)}</strong></p><a href="team.html" class="theme-btn2">Back</a>`;
        return;
      }

      const member = res.data[0].attributes ? { ...res.data[0].attributes } : res.data[0];
      document.title = `${member.name} | Kakebe Technologies`;

      profileEl.innerHTML = ''; // clear loader

      const row = document.createElement('div');
      row.className = 'row align-items-start';

      // ——— LEFT: Avatar ———
      const colImg = document.createElement('div');
      colImg.className = 'col-md-4 text-center mb-4 mb-md-0';
      const img = document.createElement('img');
      img.src = getImageUrl(member.avatar, setImageSize()) || 'assets/img/default-avatar.jpg';
      img.alt = member.name;
      img.className = 'img-fluid rounded-circle shadow';
      img.style.cssText = 'width:220px;height:220px;object-fit:cover;';
      colImg.appendChild(img);
      row.appendChild(colImg);

      // ——— RIGHT: Details + Gallery ———
      const colTxt = document.createElement('div');
      colTxt.className = 'col-md-8';

      // Name, Position, Dept
      const h2 = document.createElement('h2'); h2.textContent = member.name;
      const pos = document.createElement('p'); pos.className = 'text-muted'; pos.textContent = member.position || '';
      const dept = document.createElement('p'); dept.className = 'text-muted'; dept.innerHTML = `<strong>Department:</strong> ${member.department || 'General'}`;
      colTxt.append(h2, pos, dept);

      // Bio
      const bio = document.createElement('div');
      bio.className = 'mt-3';
      bio.appendChild(renderRichTextDOM(member.description || []));
      colTxt.appendChild(bio);

      // Social Links (FA6)
      const links = [];
      if (member.email)    links.push({ icon1: 'fa-solid fa-envelope', href: `mailto:${member.email}` });
      if (member.phone)    links.push({ icon1: 'fa-solid fa-phone', href: `tel:${member.phone}` });
      if (member.linkedin) links.push({ icon1: 'fa-brands fa-linkedin', href: member.linkedin });
      if (member.github)   links.push({ icon1: 'fa-brands fa-github', href: member.github });

      if (links.length) {
        const ul = document.createElement('ul');
        ul.className = 'list-inline mt-3';
        links.forEach(l => {
          const li = document.createElement('li');
          li.className = 'list-inline-item me-3';
          const a = document.createElement('a');
          a.href = l.href; a.target = '_blank'; a.rel = 'noopener noreferrer';
          a.innerHTML = `<i class="${l.icon1}"></i>`;
          a.title = l.href;
          li.appendChild(a);
          ul.appendChild(li);
        });
        colTxt.appendChild(ul);
      }

      // ——— GALLERY (with Lightbox + Lazy Load) ———
      if (member.gallery && member.gallery.length) {
        const galleryTitle = document.createElement('h4');
        galleryTitle.className = 'mt-5 mb-3';
        galleryTitle.textContent = 'Gallery';
        colTxt.appendChild(galleryTitle);

        const galleryRow = document.createElement('div');
        galleryRow.className = 'row g-3';

        member.gallery.slice(0, 3).forEach((item, idx) => {
          const imgData = item.image?.data?.attributes || item.image;
          if (!imgData) return;

          const imgUrl = getImageUrl(item.image, 'small') || 'assets/img/placeholder.jpg';
          const imgUrlLarge = getImageUrl(item.image, 'large') || imgUrl;
          const caption = imgData.caption || 'Team member photo';

          const col = document.createElement('div');
          col.className = 'col-6 col-md-4';

          const a = document.createElement('a');
          a.href = imgUrlLarge;
          a.className = 'glightbox';
          a.setAttribute('data-gallery', 'member-gallery');
          //a.setAttribute('data-glightbox', `title: ${caption}; description: ${caption}`);
          a.setAttribute('data-glightbox', `description: ${caption}`);

          const imgEl = document.createElement('img');
          imgEl.src = imgData.formats.thumbnail.url ? `${API_BASE_URL}${imgData.formats.thumbnail.url}` : 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
          imgEl.dataset.src = imgUrl;
          imgEl.alt = caption;
          imgEl.className = 'img-fluid rounded shadow-sm figure-img lazy';
          imgEl.style.cssText = 'height:150px; object-fit:cover; width:100%; background:#f8f9fa;';

          a.appendChild(imgEl);
          col.appendChild(a);
          galleryRow.appendChild(col);
        });

        colTxt.appendChild(galleryRow);

        // Init GLightbox
        setTimeout(() => {
          if (typeof GLightbox !== 'undefined') {
            GLightbox({ selector: '[data-gallery="member-gallery"]' });
          }
        }, 100);
      }

      // Back button
      const back = document.createElement('div');
      back.className = 'mt-4';
      back.innerHTML = `<a href="team.html" class="theme-btn2">Back to Team</a>`;
      colTxt.appendChild(back);

      row.appendChild(colTxt);
      profileEl.appendChild(row);
    })
    .catch(err => {
      console.error(err);
      messageEl.innerHTML = `<p class="text-danger">Failed to load member.</p>`;
    });
}

function populateProducts() {
  const container = getEl('product-container');
  if (!container) return;

  const url = `${API_BASE_URL}/api/products?populate=*`;
  safeFetch(url, { cacheKey: 'products', ttl: CACHE_TTL_MS, useCache: CACHE_ENABLED })
    .then(res => {
      if (!res || !res.data) throw new Error('Invalid products response');
      const products = res.data;

      // clear container
      container.innerHTML = '';

      products.forEach(prodRaw => {
        const info = prodRaw.attributes ? { id: prodRaw.id, ...prodRaw.attributes } : prodRaw;
        const image = getImageUrl(info.image, setImageSize()) || 'assets/img/logo.png';
        const descriptionBlocks = info.description || [];

        const prod = document.createElement('div');
        prod.classList.add('col-md-4');
        prod.setAttribute('data-aos', 'fade-up');
        prod.setAttribute('data-aos-duration', '900');

        // create inner structure
        const inner = document.createElement('div');
        inner.classList.add('item-box');

        const pWrapper = document.createElement('div');
        pWrapper.classList.add('product');

        // header row
        const headerRow = document.createElement('div');
        headerRow.classList.add('d-flex', 'align-items-center');

        const icon1Div = document.createElement('div');
        icon1Div.classList.add('icon1');
        const imgEl = document.createElement('img');
        imgEl.src = image;
        imgEl.alt = info.image?.alternativeText || info.name || '';
        icon1Div.appendChild(imgEl);

        const h3 = document.createElement('h3');
        const a = document.createElement('a');
        a.href = info.weblink || '#';
        a.target = '_blank';
        a.rel = 'noreferrer noopener';
        a.textContent = info.name || 'No name';
        h3.appendChild(a);

        headerRow.appendChild(icon1Div);
        headerRow.appendChild(h3);

        pWrapper.appendChild(headerRow);
        pWrapper.appendChild(document.createElement('div')).classList.add('space10');

        // description (render rich text)
        const descContainer = document.createElement('div');
        descContainer.appendChild(renderRichTextDOM(descriptionBlocks));

        pWrapper.appendChild(descContainer);
        inner.appendChild(pWrapper);
        prod.appendChild(inner);
        container.appendChild(prod);
      });
    })
    .catch(err => console.error('Error fetching products: ', err));
}

function populateInitiatives() {
  const container = getEl('initiatives-container');
  if (!container) return;

  const url = `${API_BASE_URL}/api/initiatives?populate=*`;
  safeFetch(url, { cacheKey: 'initiatives', ttl: CACHE_TTL_MS, useCache: CACHE_ENABLED })
  .then(res => {
    if (!res || !res.data) throw new Error('Invalid initiatives response');
    const initiatives = res.data;

    container.innerHTML = '';

    initiatives.forEach(initRaw => {
      const info = initRaw.attributes ? { id: initRaw.id, ...initRaw.attributes } : initRaw;
      const imgURL = getImageUrl(info.image);
      const altText = info.image.alternativeText ? info.image.alternativeText : '';
      const desc = info.description || '';

      const initiative = document.createElement('div');
      initiative.classList.add('col-md-6', 'col-lg-4', 'd-flex');

      const box = document.createElement('div');
      box.classList.add('work2-box');
      box.setAttribute('data-aos', 'zoom-in-up');
      box.setAttribute('data-aos-duration', '700');

      const imageWrapper = document.createElement('div');
      imageWrapper.classList.add('image', 'image-anime');

      const initImg = document.createElement('img');
      initImg.setAttribute('src', imgURL);
      initImg.setAttribute('alt', altText);
      imageWrapper.appendChild(initImg);

      const spacer = document.createElement('div');
      spacer.classList.add('space20');

      const headingEl = document.createElement('div');
      headingEl.classList.add('heading2');
      const h4 = document.createElement('h4');
      const h4a = document.createElement('a');
      h4a.href = '#';
      h4a.textContent = `${info.name || 'Initiative'}`;
      h4.appendChild(h4a);

      const space = document.createElement('div');

      space.classList.add('space10');
      const p = document.createElement('p');
      p.textContent = `${desc}`;

      headingEl.appendChild(h4);
      headingEl.appendChild(space);
      headingEl.appendChild(p);

      box.appendChild(imageWrapper);
      box.appendChild(spacer);
      box.appendChild(headingEl);

      initiative.appendChild(box);
      container.appendChild(initiative);
    })
  })
  .catch(err => console.error('Error loading initiatives: ', err))
}

function populateTestimonials() {
  const container = getEl('testimonials-container');
  if (!container) return;

  const url = `${API_BASE_URL}/api/testimonials?populate=*`;
  safeFetch(url, { cacheKey: 'testimonials', ttl: CACHE_TTL_MS, useCache: CACHE_ENABLED })
  .then(res => {
    if (!res || !res.data) throw new Error('Invalid testimonials response');
    const testimonials = res.data;

    container.innerHTML = '';

    testimonials.forEach(tesRaw => {
      const info = tesRaw.attributes ? { id: tesRaw.id, ...tesRaw.attributes } : tesRaw;
      const author = info.author;
      const msg = info.message;
      const rating = info.rating;

      const singleSlider = document.createElement('div');
      singleSlider.classList.add('single-slider');
      
      const icon1 = document.createElement('div');
      icon1.classList.add('icon1');

      const img = document.createElement('img');
      img.src = 'assets/img/icons/tes2-icon.png';
      img.alt = 'Testimonial Icon1';
      icon1.appendChild(img);
      singleSlider.appendChild(icon1);

      const p = document.createElement('p');
      p.classList.add('pera');
      p.textContent = `${msg}`;
      singleSlider.appendChild(p);

      const bottomArea = document.createElement('div');
      bottomArea.classList.add('bottom-area', 'row');
      
      const authorDiv = document.createElement('div');
      authorDiv.classList.add('author', 'col-12');
      
      const authorName = document.createElement('a');
      authorName.href = '#';
      authorName.textContent = `${author}`;
      authorDiv.appendChild(authorName);
      bottomArea.appendChild(authorDiv)

      const ratingDiv = document.createElement('div');
      ratingDiv.classList.add('rating', 'col-8', 'ms-auto');
      ratingDiv.appendChild(makeStars(rating));
      bottomArea.appendChild(ratingDiv);

      const rateP = document.createElement('p');
      rateP.textContent = `(${rating.toPrecision(2)})`
      ratingDiv.appendChild(rateP);
      bottomArea.appendChild(ratingDiv);
      singleSlider.appendChild(bottomArea);
      container.appendChild(singleSlider);
    })
  })
}

function populateInnovators() {
  const container = getEl('innovators-container');
  if (!container) return;

  const url = `${API_BASE_URL}/api/innovators?populate=*`;
  safeFetch(url, { cacheKey: 'innovators', ttl: CACHE_TTL_MS, useCache: CACHE_ENABLED })
    .then(res => {
      if (!res || !res.data) throw new Error('Invalid innovators response');
      const innovators = res.data;

      container.innerHTML = '';

      innovators.forEach(invRaw => {
        const info = invRaw.attributes ? { id: invRaw.id, ...invRaw.attributes } : invRaw;

        const imgURL = getImageUrl(info.image, 'medium') || 'assets/img/innovators-placeholder.jpg';

        const col = document.createElement('div');
        col.className = 'col-md-6 col-lg-4 d-flex';

        const article = document.createElement('article');
        article.className = 'innovator-card innovator-card--bordered w-100';
        article.style.cursor = 'pointer';
        article.onclick = () => {
          location.href = `innovator.html?name=${encodeURIComponent(info.name.replace(/\s+/g, '-').toLowerCase())}`;
        };
        // === CARD MEDIA ===
        const cardMedia = document.createElement('div');
        cardMedia.className = 'card-media position-relative';

        const img = document.createElement('img');
        img.src = imgURL;
        img.alt = info.name || 'Innovator project';
        img.className = 'w-100 h-100';
        img.style.objectFit = 'cover';

        const stageBadge = document.createElement('span');
        stageBadge.className = `stage-badge stage-${(info.stage || 'beginner').toLowerCase()}`;
        stageBadge.textContent = info.stage || 'Beginner';
        stageBadge.ariaLabel = `Project Stage: ${info.stage || 'Beginner'}`;

        cardMedia.append(img, stageBadge);
        article.appendChild(cardMedia);

        // === CARD BODY ===
        const cardBody = document.createElement('div');
        cardBody.className = 'card-body';

        const title = document.createElement('h5');
        title.className = 'project-title pb-2 mb-0';
        title.textContent = info.name || 'Untitled Project';
        cardBody.appendChild(title);

        const blurb = document.createElement('p');
        blurb.className = 'project-blurb text-muted small';
        injectRichText(blurb, info.description || []);
        cardBody.appendChild(blurb);

        // === INFO LINE – EMOJI VERSION (NO SHIFT!) ===
        const infoLine = document.createElement('div');
        infoLine.className = 'info-line small mt-2';
        infoLine.ariaLabel = 'Project Details';

        // Team
        const teamNames = (info.teamMembers || [])
          .map(m => m.name || 'Unknown')
          .slice(0, 2)
          .join(' & ');
        const teamExtra = (info.teamMembers || []).length > 2 ? '...' : '';
        infoLine.innerHTML += `<span class="info-chip">👥 Team: ${teamNames}${teamExtra}</span>`;

        infoLine.insertAdjacentHTML('beforeend', '<span class="divider">•</span>');

        // Maturity
        const maturity = info.maturity || 0;
        infoLine.innerHTML += `
          <span class="info-chip">
            🚀 Maturity: <strong>${maturity}%</strong>
            <span class="microbar ms-2" role="progressbar" aria-valuenow="${maturity}" aria-valuemin="0" aria-valuemax="100">
              <span class="microbar-fill" style="width: ${maturity}%"></span>
            </span>
          </span>`;

        infoLine.insertAdjacentHTML('beforeend', '<span class="divider">•</span>');

        // Stage
        infoLine.innerHTML += `<span class="info-chip">🏁 Stage: <strong>${info.stage || 'Beginner'}</strong></span>`;

        cardBody.appendChild(infoLine);

        // === CTA ===
        const cta = document.createElement('div');
        cta.className = 'card-actions mt-3';
        const ctaLink = document.createElement('a');
        ctaLink.className = 'ghost-btn ghost-btn--brand';
        ctaLink.href = `innovator.html?name=${encodeURIComponent(info.name.replace(/\s+/g, '-').toLowerCase())}`;
        ctaLink.textContent = 'View Project →';
        cta.appendChild(ctaLink);
        cardBody.appendChild(cta);

        article.appendChild(cardBody);
        col.appendChild(article);
        container.appendChild(col);
      });
    })
    .catch(err => console.error('Error loading innovators: ', err));
}

function populateServices() {
  const container = getEl('services-container');
  if (!container) return;

  const url = `${API_BASE_URL}/api/services?populate=*`;
  safeFetch(url, { cacheKey: 'services', ttl: CACHE_TTL_MS, useCache: CACHE_ENABLED })
    .then(res => {
      if (!res || !res.data) throw new Error('Invalid services response');
      const services = res.data;

      container.innerHTML = '';

      services.forEach(svcRaw => {
        const info = svcRaw.attributes ? { id: svcRaw.id, ...svcRaw.attributes } : svcRaw;
        const icon1Url = getImageUrl(info.icon1) || `${API_BASE_URL}/uploads/default_icon.png`;
        const desc = info.description || '';

        const serve = document.createElement('div');
        serve.classList.add('service', 'col-md-6', 'col-lg-4');

        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-aos', 'zoom-in-up');
        wrapper.setAttribute('data-aos-duration', '700');

        const box = document.createElement('div');
        box.classList.add('servcie2-box');

        const icon1Div = document.createElement('div');
        icon1Div.classList.add('icon1');
        const icon1Img = document.createElement('img');
        icon1Img.src = icon1Url;
        icon1Img.alt = info.name || '';
        icon1Div.appendChild(icon1Img);

        const link = document.createElement('a');
        link.classList.add('arrow');
        link.href = '#';
        link.innerHTML = `<i class="fa-solid fa-arrow-right"></i>`;

        const headingEl = document.createElement('div');
        headingEl.classList.add('heading2');
        const h4 = document.createElement('h4');
        const h4a = document.createElement('a');
        h4a.href = '#';
        h4a.textContent = info.name || 'Service';
        h4.appendChild(h4a);

        const spacer = document.createElement('div');
        spacer.classList.add('space16');

        const p = document.createElement('p');
        p.textContent = (typeof desc === 'string') ? desc : (desc?.[0]?.children?.[0]?.text || '');

        headingEl.appendChild(h4);
        headingEl.appendChild(spacer);
        headingEl.appendChild(p);

        box.appendChild(icon1Div);
        box.appendChild(link);
        box.appendChild(headingEl);
        wrapper.appendChild(box);
        serve.appendChild(wrapper);

        container.appendChild(serve);
      });
    })
    .catch(err => console.error('Error loading services: ', err));
}

/* ------------ HELPER: Get member identifier from URL ------------ */
function getMemberIdentifierFromURL() {
  const qs = window.location.search;
  if (!qs) return null;

  const params = new URLSearchParams(qs);

  // Explicit: ?member=... or ?name=...
  const explicit = params.get('member') || params.get('name');
  if (explicit !== null) {
    return decodeURIComponent(explicit);
  }

  // Legacy: ?John (no = sign)
  const raw = qs.slice(1);
  if (raw && !raw.includes('=')) {
    return decodeURIComponent(raw);
  }

  return null;
}

/* ------------ HELPER: Calculate and create stars for testimonial rating ------------ */
function makeStars(rating) {
  let fullStars = Math.floor(rating);
  
  let halfStar = rating - fullStars;

  let starList = document.createElement('ul');
  starList.className = 'starlist';

  for (fullStars; fullStars > 0; fullStars--) {
    let fullStarIcon1 = document.createElement('li');
    fullStarIcon1.classList.add('fa-solid', 'fa-star', 'star-icon1');
    starList.appendChild(fullStarIcon1);
  }

  if (halfStar) {
    const halfStarIcon1 = document.createElement('li');
    halfStarIcon1.classList.add('fa-solid', 'fa-star-half', 'star-icon1');
    starList.appendChild(halfStarIcon1);
  }
  
  return starList;
}

/* ------------ DEV: Clear & Disable Cache Button (visible only in DEV_MODE) ------------ */
const DEV_MODE = new URLSearchParams(window.location.search).get('dev') === 'true'; // set to false in production

const BASE_CACHE_KEYS = [
  'company_profile',
  'team_members',
  'initiatives',
  'testimonials',
  'products',
  'services',
  'innovators'
];

let keysToClear = [...BASE_CACHE_KEYS];

function createDevCacheButton() {
  if (!DEV_MODE) return;
  // create button
  const btn = document.createElement('button');
  btn.id = 'dev-clear-cache-btn';
  btn.title = 'Clear cache (dev only)';
  btn.innerHTML = 'Clear Cache';
  btn.style.position = 'fixed';
  btn.style.zIndex = '9999';
  btn.style.right = '16px';
  btn.style.bottom = '16px';
  btn.style.padding = '10px 14px';
  btn.style.borderRadius = '999px';
  btn.style.background = '#ef476f';
  btn.style.color = '#fff';
  btn.style.border = 'none';
  btn.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)';
  btn.style.cursor = 'pointer';
  btn.style.fontWeight = '600';

  btn.addEventListener('click', () => {
    // clear known cache keys and disable caching for session
    // if you want to target all keys, you can iterate sessionStorage keys
    const keysToClear = [...BASE_CACHE_KEYS];
    try {
      keysToClear.forEach(k => sessionStorage.removeItem(k));
      // also remove any other keys set by script
      sessionStorage.setItem('CACHE_DISABLED','1'); // disable caching for this session
      showToast('Cache cleared and caching disabled for this session ✔️');
      // optionally reload page to show fresh data
      setTimeout(() => window.location.reload(), 700);
    } catch (e) {
      console.warn('Error clearing cache', e);
      showToast('Error clearing cache');
    }
  });

  document.body.appendChild(btn);
}

function showToast(message, timeout = 2500) {
  // small toast that auto-hides
  const id = 'dev-toast';
  let t = document.getElementById(id);
  if (t) t.remove();

  t = document.createElement('div');
  t.id = id;
  t.textContent = message;
  t.style.position = 'fixed';
  t.style.right = '16px';
  t.style.bottom = '80px';
  t.style.background = 'rgba(0,0,0,0.8)';
  t.style.color = '#fff';
  t.style.padding = '10px 14px';
  t.style.borderRadius = '8px';
  t.style.zIndex = '99999';
  t.style.fontSize = '14px';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), timeout);
}

/* ---------- Initialization ---------- */

document.addEventListener('DOMContentLoaded', () => {
  createDevCacheButton();

  // SINGLE-MEMBER VIEW (profile elements exist on the page)
  if (getEl('member-profile')) {
    renderSingleTeamMember();          // <-- handles both list & detail
  } else {
    // If the page does NOT have a profile section at all (e.g. a dedicated list page)
    populateTeamMembers();
  }

  // The other sections are always safe to populate
  populateCompanyProfile();
  populateProducts();
  populateInitiatives();
  populateServices();
  populateTestimonials();
  populateInnovators();
});

window.formatPhoneLinks = () => {
  document.querySelectorAll('a[href^="tel:"]').forEach(link => {
    let num = link.getAttribute('href').replace('tel:', '').replace(/[^\d+]/g, '');
    if (/^\+256\d{9}$/.test(num)) {
      const local = num.slice(4);
      link.textContent = `+256 ${local.slice(0,3)} ${local.slice(3,6)} ${local.slice(6)}`;
    }
  });
};

// Run on load
document.addEventListener('DOMContentLoaded', formatPhoneLinks);
