// Executa um script R no webR (R 4.6 base em WebAssembly, offline, pacote npm `webr`).
//   node tools/webr/run.mjs <script.R> --mount=<pasta-host>:<pasta-vfs> ... --pull=<pasta-vfs>:<pasta-host>
// As pastas do host são COPIADAS para o sistema de arquivos virtual (nada no host é alterado,
// exceto os destinos de --pull). Adaptado de taiga-design-system/tools/bench/run_r.mjs.
import { WebR } from 'webr';
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const script = args.find((a) => !a.startsWith('--'));
const mounts = args.filter((a) => a.startsWith('--mount=')).map((a) => a.slice(8).split(':'));
const pulls = args.filter((a) => a.startsWith('--pull=')).map((a) => a.slice(7).split(':'));
const PULAR = new Set(['.git', 'renv', 'node_modules', '.Rproj.user', '__MACOSX', 'taiga-design-system']);

const webR = new WebR({ interactive: false });
await webR.init();
const feitos = new Set();
const mkdirp = async (p) => {
  let cur = '';
  for (const d of p.split('/').filter(Boolean)) {
    cur += '/' + d;
    if (!feitos.has(cur)) { feitos.add(cur); try { await webR.FS.mkdir(cur); } catch (e) { /* já existe */ } }
  }
};
const copiar = async (host, vfs) => {
  const st = fs.statSync(host);
  if (st.isDirectory()) {
    await mkdirp(vfs);
    for (const f of fs.readdirSync(host)) if (!PULAR.has(f)) await copiar(path.join(host, f), vfs + '/' + f);
  } else if (st.size < 40e6) {
    await mkdirp(path.dirname(vfs));
    await webR.FS.writeFile(vfs, new Uint8Array(fs.readFileSync(host)));
  }
};
for (const [h, v] of mounts) await copiar(path.resolve(h), v);
await mkdirp('/run');
await webR.FS.writeFile('/run/script.R', new Uint8Array(fs.readFileSync(script)));
const abrigo = await new webR.Shelter();
const res = await abrigo.captureR(
  "tryCatch(source('/run/script.R', echo = FALSE), error = function(e) cat('R ERROR:', conditionMessage(e), '\\n'))",
  { captureStreams: true, captureConditions: true });
let falhou = false;
for (const o of res.output) {
  if (o.type === 'stdout') { console.log(o.data); if (String(o.data).includes('R ERROR') || /^FALHOU/.test(o.data)) falhou = true; }
  else if (o.type === 'stderr') console.error(o.data);
  else if (o.type === 'warning' || o.type === 'error') {
    let m = '';
    try { m = (await (await o.data.get('message')).toJs()).values.join(' '); } catch (e) { m = '(condição)'; }
    console.error(o.type.toUpperCase() + ':', m);
    if (o.type === 'error') falhou = true;
  }
}
const puxar = async (vfs, host) => {
  const no = await webR.FS.lookupPath(vfs);
  if (no.isFolder) {
    fs.mkdirSync(host, { recursive: true });
    for (const n of Object.keys(no.contents || {})) await puxar(vfs + '/' + n, path.join(host, n));
  } else fs.writeFileSync(host, Buffer.from(await webR.FS.readFile(vfs)));
};
for (const [v, h] of pulls) await puxar(v, path.resolve(h));
abrigo.purge();
process.exit(falhou ? 1 : 0);
