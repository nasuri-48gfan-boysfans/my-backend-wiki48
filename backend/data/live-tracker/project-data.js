'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const COMMON_JS = path.resolve(__dirname, '..', '..', 'common.js');

function loadProjectData() {
  const stub = new Proxy({}, {
    get: (target, key) => typeof key === 'string' ? () => null : '',
    set: () => true,
  });
  const sandbox = {
    document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, createElement: () => stub, addEventListener: () => {}, documentElement: stub, body: stub },
    window: { addEventListener: () => {}, location: { search: '', hash: '' } },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    console: { warn: () => {}, log: () => {}, error: () => {} },
    encodeURIComponent,
    URLSearchParams,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  new vm.Script(fs.readFileSync(COMMON_JS, 'utf8'), { filename: 'common.js' }).runInContext(sandbox);
  return vm.runInContext('({ GROUPS, MEMBERS })', sandbox);
}

function initialMappings() {
  const { MEMBERS } = loadProjectData();
  return MEMBERS.map((member) => {
    const social = Array.isArray(member.bio?.social) ? member.bio.social : [];
    const idn = social.find((item) => item.key === 'idn');
    const showroom = social.find((item) => item.key === 'showroom');
    return {
      id: member.id,
      member_name: member.name,
      showroom_room_id: null,
      showroom_room_url_key: showroom ? showroom.url.split('/').filter(Boolean).pop() : null,
      idn_username: idn ? idn.url.split('/').filter(Boolean).pop() : null,
      is_live: false,
      last_live_at: null,
    };
  });
}

module.exports = { loadProjectData, initialMappings };
