/* =============================================================
   IDOL & GROUP WIKI HUB — groups.js
   Halaman: groups.html
   - Render card untuk SETIAP grup dari array GROUPS
   - Klik card → members.html?group=<slug>#directory (memilih grup itu di
     dropdown kategori/grup Member Directory)
   - Search: filter grup berdasar nama grup / tagline / nama member

   Data (GROUPS, MEMBERS) + util berada di common.js.
   ============================================================= */

/* -------------------------------------------------------------
   1. STATE
   ------------------------------------------------------------- */
const groupState = {
  query: '',
};

/* -------------------------------------------------------------
   2. TEMPLATE: AVATAR STACK
   Menampilkan maks. 4 inisial member + sisa sebagai "+n".
   ------------------------------------------------------------- */
function avatarStackHTML(members) {
  const MAX = 4;
  const shown = members.slice(0, MAX);
  const rest = members.length - shown.length;

  const items = shown.map((m) => `
    <li class="stack-item" data-accent="${esc(m.accent)}" title="${esc(m.name)}">
      <span aria-hidden="true">${esc(initialOf(m.name))}</span>
    </li>`).join('');

  const more = rest > 0
    ? `<li class="stack-item stack-more"><span aria-hidden="true">+${rest}</span></li>`
    : '';

  return `
    <ul class="avatar-stack" aria-label="${members.length} member: ${esc(members.map((m) => m.name).join(', '))}">
      ${items}${more}
    </ul>`;
}

/* -------------------------------------------------------------
   3. TEMPLATE CARD GRUP
   ------------------------------------------------------------- */
function groupCardHTML(group) {
  const members = membersOfGroup(group.id);
  /* Tujuannya members.html, BUKAN index.html: grid direktori sudah pindah ke
     sana, dan hanya halaman itu yang punya dropdown kategori/grup yang membaca
     param ini. */
  const href = `members.html?group=${encodeURIComponent(group.slug)}#directory`;
  const memberLabel = members.length
    ? `${members.length} ${uiCardText('member')}`
    : uiCardText('rosterEmpty');

  /* Tombol situs resmi berada DI LUAR <a class="group-link"> karena
     tautan bersarang tidak valid HTML dan membuat klik jadi ambigu. */
  return `
    <article class="group-card" data-slug="${esc(group.slug)}">
      <a class="group-link" href="${href}"
         aria-label="${esc(uiCardText('viewMembers'))} ${esc(group.name)}">

        <div class="group-cover" data-accent="${esc(group.accent)}">
          <img class="group-image" src="img/group-${esc(group.id)}.jpg"
            alt="Logo ${esc(group.name)}" loading="lazy"
            onerror="this.style.display='none'" />
          <span class="group-monogram" aria-hidden="true">${esc(monogramOf(group.name))}</span>
          <span class="group-badge">${esc(memberLabel)}</span>
        </div>

        <div class="group-body">
          <h3 class="group-name">${esc(group.name)}</h3>
          <p class="group-tagline">${esc(group.tagline)}</p>

          ${members.length ? avatarStackHTML(members) : ''}

          <dl class="group-meta">
            <div class="group-meta-item">
              <dt>${esc(uiCardText('debut'))}</dt>
              <dd>${esc(group.debut)}</dd>
            </div>
            <div class="group-meta-item">
              <dt>${esc(uiCardText('base'))}</dt>
              <dd>${esc(group.base)}</dd>
            </div>
          </dl>

          <span class="group-cta">${esc(uiCardText('viewMembers'))} <span aria-hidden="true">→</span></span>
        </div>
      </a>

      <a class="group-site" href="${esc(group.site)}"
         target="_blank" rel="noopener noreferrer"
         aria-label="Buka situs resmi ${esc(group.name)} di tab baru">
        <span class="group-site-icon" aria-hidden="true">🔗</span>
        <span class="group-site-text">${esc(uiCardText('officialSite'))}</span>
      </a>
    </article>`;
}

/* -------------------------------------------------------------
   4. RENDER: GROUP DIRECTORY (dikelompokkan Domestik / Kaigai)
   ------------------------------------------------------------- */
/* Label kategori (KATEGORI_GRUP) ada di common.js karena dropdown di
   members.html memakai teks yang sama untuk <optgroup>-nya. */

function matchesQuery(group, q) {
  if (!q) return true;
  return group.name.toLowerCase().includes(q)
      || group.tagline.toLowerCase().includes(q)
      || group.base.toLowerCase().includes(q)
      || membersOfGroup(group.id).some((m) => m.name.toLowerCase().includes(q)
        || (m.nameNative && m.nameNative.toLowerCase().includes(q)));
}

function categoryBlockHTML(key, list) {
  const label = kategoriLabel(key);
  const memberTotal = list.reduce((n, g) => n + membersOfGroup(g.id).length, 0);

  return `
    <section class="group-category" aria-labelledby="cat-${esc(key)}">
      <div class="category-head">
        <h3 class="category-title" id="cat-${esc(key)}">${esc(label.title)}</h3>
        <span class="category-count">${list.length} ${uiCardText('groups') || 'grup'}${memberTotal ? ` · ${memberTotal} ${uiCardText('member')}` : ''}</span>
      </div>
      <p class="category-sub">${esc(label.sub)}</p>
      <div class="group-grid">${list.map(groupCardHTML).join('')}</div>
    </section>`;
}

function renderGroups() {
  const grid = $('#groupGrid');
  const count = $('#groupCount');
  if (!grid) return;

  const q = groupState.query.trim().toLowerCase();
  const list = GROUPS.filter((g) => matchesQuery(g, q));

  if (list.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">🔍</span>
        <p class="empty-title">Tidak ada hasil</p>
        <p class="empty-sub">Tidak ada grup yang cocok dengan “${esc(groupState.query)}”.</p>
      </div>`;
  } else {
    // Urutan blok mengikuti GROUP_ORDER di common.js (domestic → kaigai).
    const keys = kategoriTerurut();

    grid.innerHTML = keys
      .map((key) => [key, list.filter((g) => g.category === key)])
      .filter(([, arr]) => arr.length > 0)
      .map(([key, arr]) => categoryBlockHTML(key, arr))
      .join('');
  }

  if (count) {
    const totalMembers = list.reduce((n, g) => n + membersOfGroup(g.id).length, 0);
    count.textContent = q
      ? `${list.length} dari ${GROUPS.length} grup`
      : `${GROUPS.length} ${uiCardText('groups')}${totalMembers ? ` · ${totalMembers} ${uiCardText('member')}` : ` · ${uiCardText('rosterEmpty')}`}`;
  }
}

/* -------------------------------------------------------------
   5. EVENT: SEARCH
   ------------------------------------------------------------- */
function initGroupSearch() {
  const form = $('#groupSearchForm');
  const input = $('#groupSearchInput');
  if (!form || !input) return;

  input.addEventListener('input', () => {
    groupState.query = input.value;
    renderGroups();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    groupState.query = input.value;
    renderGroups();
  });
}

/* -------------------------------------------------------------
   6. INIT
   ------------------------------------------------------------- */
function initGroupsPage() {
  setFooterYear();
  initI18n();
  renderGroups();
  initGroupSearch();
  initDrawer();
  document.addEventListener('wiki48-language-change', renderGroups);
}

// Jalankan setelah DOM siap.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGroupsPage);
} else {
  initGroupsPage();
}
