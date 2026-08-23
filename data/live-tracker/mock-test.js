'use strict';

const assert = require('assert/strict');
const path = require('path');
const { readStore } = require('./store');
const { discoverMappings } = require('./discovery');
const { checkLiveStatus } = require('./status');

const file = path.join(__dirname, '.mock-members.json');
const initial = {
  members: [{ id: 'jkt48-01', member_name: 'Fiony Alveria Tantri', showroom_room_id: null, idn_username: 'fiony', is_live: false, last_live_at: null }],
  updated_at: null,
};
require('fs').writeFileSync(file, JSON.stringify(initial));

const showroom = {
  async discover() { return [{ room_id: '123', room_url_key: 'fiony', member_name: 'Fiony Alveria Tantri', live_started_at: '2026-08-22T00:00:00Z' }]; },
  async check() { return { platform: 'showroom', is_live: true, live_url: 'https://www.showroom-live.com/fiony', title: 'Fiony live' }; },
};
const idn = { async check() { return { platform: 'idn', is_live: false }; } };

(async () => {
  await discoverMappings({ showroom, file, logger: { warn() {} } });
  const live = await checkLiveStatus({ showroom, idn, file, logger: { warn() {} } });
  assert.equal(readStore(file).members[0].showroom_room_id, '123');
  assert.equal(live.length, 1);
  assert.equal(live[0].live_url, 'https://www.showroom-live.com/fiony');
  require('fs').unlinkSync(file);
  console.log('mock-test: OK');
})().catch((error) => { try { require('fs').unlinkSync(file); } catch (ignored) {} console.error(error); process.exitCode = 1; });
