const fs = require('fs');
const path = require('path');
const folder = __dirname;
const file = path.join(folder, 'technical-proposal.html');
let html = fs.readFileSync(file, 'utf8');
const sources = [...new Set([...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match => match[1]))];
for (const source of sources) {
  const original = path.resolve(folder, source);
  const name = path.basename(source);
  const destination = path.join(folder, name);
  if (original !== destination) fs.copyFileSync(original, destination);
  html = html.split('src="' + source + '"').join('src="' + name + '"');
}
fs.writeFileSync(file, html);
console.log('All images are in:', folder);
for (const source of sources) console.log(path.basename(source));
