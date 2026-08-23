/* Official news directory. Links stay on each group's official domain. */
function officialNewsUrl(group) {
  const paths = {
    akb48: 'news', ske48: 'news', nmb48: 'news', hkt48: 'news', ngt48: 'news', stu48: 'news',
    jkt48: 'news', bnk48: 'news', akb48tsh: 'news', tpe48: 'news', cgm48: 'news', klp48: 'news',
  };
  return `${group.site.replace(/\/$/, '')}/${paths[group.id] || 'news'}`;
}

function newsCard(group) {
  const count = membersOfGroup(group.id).length;
  return `<article class="news-card" data-accent="${esc(group.accent)}">
    <div class="news-card-top"><span class="news-mark">${esc(monogramOf(group.name))}</span><span class="news-source">Sumber resmi</span></div>
    <h2>${esc(group.name)}</h2>
    <p>${esc(group.tagline)}</p>
    <div class="news-meta"><span>${count} member terdaftar</span><a href="${esc(officialNewsUrl(group))}" target="_blank" rel="noopener noreferrer">Buka berita →</a></div>
  </article>`;
}

function initNewsPage() {
  setFooterYear();
  initI18n();
  initDrawer();
  $('#newsGrid').innerHTML = GROUPS.map(newsCard).join('');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initNewsPage);
else initNewsPage();
