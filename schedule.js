/* Schedule and status view. Status is shared with the member directory. */
function scheduleItem(member, label) {
  const stage = member.stage || {};
  const detail = label === 'live'
    ? (member.liveUrl ? `<a class="schedule-action" href="${esc(member.liveUrl)}" target="_blank" rel="noopener noreferrer">Tonton ${esc(member.livePlatform || 'Live')} →</a>` : 'URL live belum dicatat')
    : [stage.title, stage.time, stage.venue].filter(Boolean).join(' · ') || 'Detail jadwal menyusul';
  const official = officialScheduleUrl(member.groupId);
  const officialLink = official ? `<a class="schedule-action" href="${esc(official)}" target="_blank" rel="noopener noreferrer">Jadwal resmi →</a>` : '';
  return `<li class="stage-item"><a href="${esc(memberUrl(member.id))}"><strong>${esc(member.name)}</strong><span>${esc(member.group)}${member.team ? ` · ${esc(member.team)}` : ''}</span></a><span class="stage-item-detail">${detail} ${officialLink}</span></li>`;
}

function agendaItem(member, event) {
  const official = event.url || officialScheduleUrl(member.groupId);
  const detail = [event.date, event.time, event.title, event.venue, event.type].filter(Boolean).join(' · ');
  return `<li class="agenda-item"><a href="${esc(memberUrl(member.id))}"><strong>${esc(member.name)}</strong><span>${esc(member.group)}${member.team ? ` · ${esc(member.team)}` : ''}</span></a><span class="agenda-detail">${esc(detail || 'Agenda resmi')}</span>${official ? `<a class="schedule-action" href="${esc(official)}" target="_blank" rel="noopener noreferrer">Sumber resmi →</a>` : ''}</li>`;
}

async function renderSchedulePage() {
  try {
    await fetchLiveTrackerSnapshot();
  } catch (error) {
    if (window.console && console.warn) console.warn(error.message);
  }
  const live = prioritizePinnedLive(liveMembers());
  const stage = stageMembers();
  const agenda = MEMBERS.flatMap((member) => (member.schedule || []).map((event) => ({ member, event })));
  $('#scheduleSync').textContent = `${live.length} live · ${stage.length} stage · diperbarui ${new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}`;
  $('#scheduleLiveCount').textContent = live.length;
  $('#scheduleStageCount').textContent = stage.length;
  $('#liveSchedule').innerHTML = live.length ? live.map((m) => scheduleItem(m, 'live')).join('') : '<li class="schedule-empty">Belum ada member yang ditandai live.</li>';
  $('#stageSchedulePage').innerHTML = stage.length ? stage.map((m) => scheduleItem(m, 'stage')).join('') : '<li class="schedule-empty">Belum ada member yang ditandai stage.</li>';
  $('#scheduleCount').textContent = `${agenda.length} agenda tercatat`;
  $('#scheduleList').innerHTML = agenda.length
    ? agenda.map(({ member, event }) => agendaItem(member, event)).join('')
    : `<div class="empty-state"><p class="empty-title">Belum ada agenda lokal</p><p class="empty-sub">Agenda terbaru dibaca langsung dari situs resmi masing-masing grup.</p></div><div class="official-schedule-grid">${GROUPS.map((group) => `<a class="official-schedule-card" href="${esc(officialScheduleUrl(group.id))}" target="_blank" rel="noopener noreferrer"><strong>${esc(group.name)}</strong><span>Jadwal resmi →</span></a>`).join('')}</div>`;
}

function initSchedulePage() {
  setFooterYear();
  initI18n();
  initDrawer();
  renderSchedulePage();
  const refresh = $('#scheduleRefresh');
  if (refresh) refresh.addEventListener('click', renderSchedulePage);
  window.setInterval(renderSchedulePage, 30000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSchedulePage);
else initSchedulePage();
