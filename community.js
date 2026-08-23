const COMMUNITY_POLL_KEY = 'wiki48-community-poll';

async function communityApi(url, options) {
  const response = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...options });
  const body = await response.text();
  let data;
  try { data = JSON.parse(body); } catch (error) { throw new Error('Backend API komunitas belum terhubung.'); }
  if (!response.ok) throw new Error(data.error || 'Permintaan komunitas gagal.');
  return data;
}

function questionCardHTML(question, country) {
  const source = question.source === 'bot' ? 'WIKI48 Bot' : question.author;
  return `<article class="daily-question-card ${question.source === 'bot' ? 'is-bot' : 'is-fan'}"><div class="question-card-top"><span class="question-source">${question.source === 'bot' ? '✦ BOT' : '♡ FAN'}</span><span class="question-topic">${esc(question.topic)}</span></div><h3>${esc(question.prompt)}</h3><p class="question-card-meta">${esc(source)} · ${esc(country.name)} · ${question.day === new Date().toISOString().slice(0, 10) ? 'Hari ini' : esc(question.day)}</p></article>`;
}

async function initDailyQuestions() {
  const countrySelect = document.querySelector('#communityCountry');
  const askCountry = document.querySelector('#askCountry');
  const list = document.querySelector('#dailyQuestionList');
  const form = document.querySelector('#askQuestionForm');
  const message = document.querySelector('#askQuestionResult');
  if (!countrySelect || !askCountry || !list) return;

  try {
    const { countries } = await communityApi('/api/community/countries');
    const options = countries.map((country) => `<option value="${esc(country.code)}">${esc(country.flag)} ${esc(country.name)}</option>`).join('');
    countrySelect.innerHTML = options;
    askCountry.innerHTML = options;

    async function loadQuestions() {
      const country = countries.find((item) => item.code === countrySelect.value) || countries[0];
      list.innerHTML = '<p class="community-loading">Memuat pertanyaan...</p>';
      try {
        const data = await communityApi(`/api/community/questions?country=${encodeURIComponent(country.code)}`);
        list.innerHTML = data.questions.length ? data.questions.map((question) => questionCardHTML(question, country)).join('') : '<p class="community-loading">Belum ada pertanyaan untuk ruang ini.</p>';
      } catch (error) {
        list.innerHTML = `<p class="community-loading is-error">${esc(error.message)}</p>`;
      }
    }

    countrySelect.addEventListener('change', () => { askCountry.value = countrySelect.value; loadQuestions(); });
    askCountry.addEventListener('change', () => { countrySelect.value = askCountry.value; loadQuestions(); });
    await loadQuestions();

    if (form) form.addEventListener('submit', async (event) => {
      event.preventDefault();
      message.textContent = '';
      const body = { country: form.elements.country.value, topic: form.elements.topic.value.trim(), prompt: form.elements.prompt.value.trim() };
      try {
        await communityApi('/api/community/questions', { method: 'POST', body: JSON.stringify(body) });
        form.reset();
        countrySelect.value = body.country;
        askCountry.value = body.country;
        message.textContent = 'Pertanyaanmu sudah dibagikan ke ruang negara ini.';
        await loadQuestions();
      } catch (error) {
        message.textContent = `${error.message} Login diperlukan untuk membuat pertanyaan.`;
      }
    });
  } catch (error) {
    list.innerHTML = `<p class="community-loading is-error">${esc(error.message)}</p>`;
  }
}

function initCommunityPage() {
  setFooterYear();
  initI18n();
  initDrawer();
  initDailyQuestions();

  const form = document.querySelector('#communityPoll');
  const result = document.querySelector('#pollResult');
  const results = document.querySelector('#pollResults');
  if (!form || !result || !results) return;

  let voted = null;
  try { voted = localStorage.getItem(COMMUNITY_POLL_KEY); } catch (error) { voted = null; }
  if (voted) showPollResult(voted);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const choice = form.querySelector('input[name="song"]:checked');
    if (!choice) {
      result.textContent = 'Pilih satu lagu dulu, superstar.';
      return;
    }
    try { localStorage.setItem(COMMUNITY_POLL_KEY, choice.value); } catch (error) { /* storage optional */ }
    showPollResult(choice.value);
  });

  function showPollResult(value) {
    const labels = { rapsodi: 'Rapsodi', 'flying-high': 'Flying High', 'fortune-cookie': 'Fortune Cookie' };
    const percentages = { rapsodi: 46, 'flying-high': 32, 'fortune-cookie': 22 };
    form.querySelectorAll('input[name="song"]').forEach((input) => { input.checked = input.value === value; });
    results.innerHTML = Object.entries(percentages).map(([key, percentage]) => `<div class="poll-result-row"><span>${labels[key]}</span><span class="poll-bar"><i style="width: ${percentage}%"></i></span><strong>${percentage}%</strong></div>`).join('');
    results.hidden = false;
    result.textContent = `Vote kamu untuk ${labels[value]} sudah tercatat.`;
  }
}

document.addEventListener('DOMContentLoaded', initCommunityPage);
