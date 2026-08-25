#!/usr/bin/env node
/* Builds the SKE48 roster source from active bold links in the wiki page. */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const OUTPUT = path.join(ROOT, 'data', 'sumber', 'ske48.txt');
const API = 'https://akb48.fandom.com/api.php?action=parse&page=SKE48_Members&prop=wikitext&format=json';

async function main() {
  const response = await fetch(API);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  const text = data.parse.wikitext['*'];
  const members = new Map();
  const sections = text.split(/(?=^===)/m);

  sections.forEach((section) => {
    const heading = (section.match(/^===+\s*([^=]+?)\s*=*$/m) || [])[1] || '';
    const generation = (heading.match(/(\d+)(?:st|nd|rd|th) Generation/i) || [])[1];
    const defaultTeam = /Kenkyuusei/i.test(heading) ? 'Kenkyuusei' : (generation ? `Gen ${generation}` : '');
    const links = [...section.matchAll(/'''\[\[([^|\]]+)/g)].map((match) => match[1].trim());
    links.forEach((name) => {
      if (/^(?:Team|SKE48|AKB48)/i.test(name)) return;
      if (!members.has(name)) members.set(name, { name, team: defaultTeam });
    });

    [...section.matchAll(/Now in \[\[Team\s+([^\]]+)\]\][^\n]*?(?:'''\[\[([^|\]]+)|\[\[([^|\]]+)\]\])/gi)]
      .forEach((match) => {
        const team = `Team ${match[1].trim().toUpperCase()}`;
        const name = (match[2] || match[3] || '').trim();
        if (members.has(name)) members.get(name).team = team;
      });
  });

  const rows = [...members.values()].map((member) => `${member.name} | ${member.team || '-'}`);
  fs.writeFileSync(OUTPUT, `# SKE48 active members from AKB48 Wiki\nGen 6\n${rows.join('\n')}\n`);
  console.log(`SKE48: ${rows.length} active members written to data/sumber/ske48.txt`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });