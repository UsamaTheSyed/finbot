import { readdir, readFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join } from 'node:path';
const mime = { '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon', '.woff2':'font/woff2', '.woff':'font/woff', '.json':'application/json', '.txt':'text/plain', '.webmanifest':'application/manifest+json', '.avif':'image/avif' };
export async function serveFrontend(app, root) {
  const index = await readFile(join(root,'index.html'));
  async function register(dir, prefix) {
    for (const entry of await readdir(dir,{withFileTypes:true})) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const path = join(dir,entry.name), url = prefix+'/'+entry.name;
      if (entry.isDirectory()) { await register(path,url); continue; }
      const type = mime[extname(entry.name)];
      if (!entry.isFile() || !type || url.startsWith('/api/')) continue;
      app.get(url, (_req,reply) => reply.type(type).header('X-Content-Type-Options','nosniff')
        .header('Cache-Control',url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache').send(createReadStream(path)));
    }
  }
  await register(root,'');
  const html = reply => reply.type('text/html; charset=utf-8').header('Cache-Control','no-cache').send(index);
  app.get('/', (_req,reply) => html(reply));
  app.setNotFoundHandler((req,reply) => {
    const path=req.url.split('?')[0];
    if (['GET','HEAD'].includes(req.method) && req.headers.accept?.includes('text/html') &&
        !/^\/(api|assets)(\/|$)/.test(path) && !extname(path) && !path.split('/').some(x=>x.startsWith('.'))) return html(reply);
    return reply.code(404).send({code:'NOT_FOUND',message:'Not found.'});
  });
}
