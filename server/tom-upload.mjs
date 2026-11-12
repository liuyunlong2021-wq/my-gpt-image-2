import { createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import { Transform } from 'node:stream';
import Busboy from 'busboy';

const root = process.env.STATIC_ROOT || '/var/www/dazi-preview';
const dataFile = process.env.TOM_DATA_FILE || join(root, 'data', 'tom-teacher.json');
const mediaDir = process.env.TOM_MEDIA_DIR || join(root, 'tom-media');
const password = process.env.TOM_UPLOAD_PASSWORD || '';
const port = Number(process.env.PORT || 3178);
const sessions = new Map();
const attempts = new Map();
const sessionTtl = 12 * 60 * 60 * 1000;
const maxFileSize = 1024 * 1024 * 1024;
const maxCoverSize = 10 * 1024 * 1024;
const allowed = new Map([
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.png', 'image/png'],
  ['.webp', 'image/webp'], ['.gif', 'image/gif'], ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
]);

if (!password || password.length < 16) throw new Error('TOM_UPLOAD_PASSWORD must contain at least 16 characters');
await mkdir(join(dataFile, '..'), { recursive: true });
await mkdir(mediaDir, { recursive: true });
try { await readFile(dataFile); } catch { await writeFile(dataFile, '[]\n', { mode: 0o640 }); }

const send = (res, status, value, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers });
  res.end(JSON.stringify(value));
};
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(part => part.trim().split('=').map(decodeURIComponent)).filter(pair => pair.length === 2));
const sameOrigin = req => {
  const origin = req.headers.origin;
  const forwarded = req.headers['x-forwarded-proto'];
  return Boolean(origin && new URL(origin).host === req.headers.host && forwarded === 'https');
};
const getSession = req => {
  const token = cookies(req).tom_session;
  const expires = token && sessions.get(token);
  if (!expires || expires < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }
  return token;
};
const readJson = async req => {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4096) throw new Error('Request too large');
  }
  return JSON.parse(body || '{}');
};
const saveWorks = async works => {
  const temp = `${dataFile}.${randomBytes(6).toString('hex')}.tmp`;
  await writeFile(temp, `${JSON.stringify(works, null, 2)}\n`, { mode: 0o640 });
  await rename(temp, dataFile);
};
const readWorks = async () => JSON.parse(await readFile(dataFile, 'utf8'));
const managedMediaPath = value => {
  if (typeof value !== 'string' || !value.startsWith('/tom-media/')) return null;
  const filename = value.slice('/tom-media/'.length);
  if (!/^tom-[a-z0-9-]+\.(?:jpe?g|png|webp|gif|mp4|webm)$/i.test(filename)) return null;
  return join(mediaDir, filename);
};
const requireSession = (req, res) => {
  if (getSession(req)) return true;
  send(res, 401, { error: '请先登录' });
  return false;
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/tom') {
    try { return send(res, 200, (await readWorks()).filter(work => !work.hidden)); }
    catch { return send(res, 500, { error: '作品清单读取失败' }); }
  }
  if (req.method === 'GET' && url.pathname === '/api/session') {
    return send(res, getSession(req) ? 200 : 401, { authenticated: Boolean(getSession(req)) });
  }
  if (req.method === 'POST' && ['/api/login', '/api/logout', '/api/upload'].includes(url.pathname) && !sameOrigin(req)) {
    return send(res, 403, { error: '请求来源无效' });
  }
  if (['PATCH', 'DELETE', 'PUT'].includes(req.method) && url.pathname.startsWith('/api/admin/works/') && !sameOrigin(req)) {
    return send(res, 403, { error: '请求来源无效' });
  }
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const ip = req.socket.remoteAddress || 'unknown';
    const prior = attempts.get(ip) || { count: 0, until: 0 };
    if (prior.until > Date.now()) return send(res, 429, { error: '尝试次数过多，请稍后再试' });
    try {
      const data = await readJson(req);
      const actual = Buffer.from(String(data.password || ''));
      const expected = Buffer.from(password);
      const valid = actual.length === expected.length && timingSafeEqual(actual, expected);
      if (!valid) {
        prior.count += 1;
        if (prior.count >= 6) { prior.count = 0; prior.until = Date.now() + 15 * 60 * 1000; }
        attempts.set(ip, prior);
        return send(res, 401, { error: '密码不正确' });
      }
      attempts.delete(ip);
      const token = randomBytes(32).toString('base64url');
      sessions.set(token, Date.now() + sessionTtl);
      return send(res, 200, { authenticated: true }, { 'set-cookie': `tom_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${sessionTtl / 1000}` });
    } catch { return send(res, 400, { error: '登录请求格式无效' }); }
  }
  if (req.method === 'POST' && url.pathname === '/api/logout') {
    const token = getSession(req);
    if (token) sessions.delete(token);
    return send(res, 200, { authenticated: false }, { 'set-cookie': 'tom_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0' });
  }
  if (req.method === 'GET' && url.pathname === '/api/admin/works') {
    if (!requireSession(req, res)) return;
    try { return send(res, 200, await readWorks()); }
    catch { return send(res, 500, { error: '作品清单读取失败，请稍后刷新。' }); }
  }
  const workRoute = url.pathname.match(/^\/api\/admin\/works\/([^/]+)$/);
  const coverRoute = url.pathname.match(/^\/api\/admin\/works\/([^/]+)\/cover$/);
  if (coverRoute && req.method === 'PUT') {
    if (!requireSession(req, res)) return;
    let id;
    try { id = decodeURIComponent(coverRoute[1]); }
    catch { return send(res, 400, { error: '作品编号无效。请刷新作品列表后重试。' }); }
    let tempCover = null;
    let coverData = null;
    try {
      const works = await readWorks();
      const index = works.findIndex(work => work.id === id);
      if (index < 0) return send(res, 404, { error: '找不到这条作品。请刷新列表后重试。' });
      if (!works[index].media?.some(item => item.type === 'video')) return send(res, 400, { error: '只有视频作品可以设置封面。' });
      const parser = Busboy({ headers: req.headers, limits: { files: 1, fields: 0, fileSize: maxCoverSize } });
      const received = new Promise((resolve, reject) => {
        let outputDone;
        parser.on('file', (name, file, info) => {
          const ext = extname(basename(info.filename)).toLowerCase();
          const mime = allowed.get(ext);
          if (name !== 'cover' || !mime?.startsWith('image/') || info.mimeType !== mime) {
            file.resume();
            reject(new Error('请选择 JPG、PNG、WebP 或 GIF 封面图片。'));
            return;
          }
          tempCover = join(mediaDir, `.cover-${randomBytes(12).toString('hex')}`);
          coverData = { ext };
          const output = createWriteStream(tempCover, { flags: 'wx', mode: 0o640 });
          let tooLarge = false;
          file.on('limit', () => { tooLarge = true; });
          output.on('error', reject);
          file.on('error', reject);
          outputDone = new Promise((done, fail) => { output.on('finish', done); output.on('error', fail); });
          file.pipe(output);
          file.on('end', () => { if (tooLarge) reject(new Error('封面图片不能超过 10 MiB。')); });
        });
        parser.on('filesLimit', () => reject(new Error('每次只能选择一张封面图片。')));
        parser.on('error', reject);
        parser.on('finish', async () => {
          try {
            if (outputDone) await outputDone;
            if (!coverData) throw new Error('请选择封面图片。');
            resolve();
          } catch (error) { reject(error); }
        });
      });
      req.pipe(parser);
      await received;
      const filename = `${id}-cover-${randomBytes(4).toString('hex')}${coverData.ext}`;
      const newPath = join(mediaDir, filename);
      const oldCover = works[index].cover;
      await rename(tempCover, newPath);
      tempCover = null;
      works[index] = { ...works[index], cover: `/tom-media/${filename}` };
      try { await saveWorks(works); }
      catch (error) { await rm(newPath, { force: true }); throw error; }
      const oldPath = managedMediaPath(oldCover);
      if (oldPath && !works[index].media.some(item => item.url === oldCover)) await rm(oldPath, { force: true });
      return send(res, 200, { work: works[index] });
    } catch (error) {
      if (tempCover) await rm(tempCover, { force: true }).catch(() => {});
      return send(res, 400, { error: error.message || '封面更新失败，请重试。' });
    }
  }
  if (workRoute && ['PATCH', 'DELETE'].includes(req.method)) {
    if (!requireSession(req, res)) return;
    let id;
    try { id = decodeURIComponent(workRoute[1]); }
    catch { return send(res, 400, { error: '作品编号无效。请刷新作品列表后重试。' }); }
    try {
      const works = await readWorks();
      const index = works.findIndex(work => work.id === id);
      if (index < 0) return send(res, 404, { error: '找不到这条作品。请刷新列表后重试。' });
      if (req.method === 'PATCH') {
        const data = await readJson(req);
        if (typeof data.hidden !== 'boolean') return send(res, 400, { error: '操作状态无效，请刷新列表后重试。' });
        works[index] = { ...works[index], hidden: data.hidden };
        await saveWorks(works);
        return send(res, 200, { work: works[index] });
      }
      const [removed] = works.splice(index, 1);
      await saveWorks(works);
      const media = new Set([removed.cover, ...(removed.media || []).map(item => item.url)].map(managedMediaPath).filter(Boolean));
      await Promise.all([...media].map(path => rm(path, { force: true })));
      return send(res, 200, { removed: true });
    } catch {
      return send(res, 500, { error: '保存作品变更失败。请刷新列表确认状态后再试。' });
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/upload') {
    if (!requireSession(req, res)) return;
    let fields = {};
    const uploads = Object.create(null);
    const temporaryPaths = [];
    const savedPaths = [];
    let tooLarge = false;
    let coverTooLarge = false;
    try {
      const parser = Busboy({ headers: req.headers, limits: { files: 2, fields: 4, fileSize: maxFileSize } });
      const fileDone = new Promise((resolve, reject) => {
        const writes = [];
        parser.on('field', (name, value) => { fields[name] = value; });
        parser.on('file', (name, file, info) => {
          const ext = extname(basename(info.filename)).toLowerCase();
          const mime = allowed.get(ext);
          const validField = name === 'media' || name === 'cover';
          const validMime = name === 'cover' ? mime && mime.startsWith('image/') && info.mimeType === mime : mime && info.mimeType === mime;
          if (!validField || !validMime || uploads[name]) { file.resume(); reject(new Error('视频封面请选择图片；作品文件支持 JPG、PNG、WebP、GIF、MP4、WebM。')); return; }
          const tempPath = join(mediaDir, `.upload-${randomBytes(12).toString('hex')}`);
          temporaryPaths.push(tempPath);
          uploads[name] = { ext, mime, tempPath };
          const output = createWriteStream(tempPath, { flags: 'wx', mode: 0o640 });
          file.on('limit', () => { if (name === 'media') tooLarge = true; else coverTooLarge = true; });
          file.on('error', reject);
          output.on('error', reject);
          let input = file;
          if (name === 'cover') {
            let bytes = 0;
            const limiter = new Transform({
              transform(chunk, encoding, callback) {
                bytes += chunk.length;
                if (bytes > maxCoverSize) { coverTooLarge = true; callback(); }
                else callback(null, chunk);
              },
            });
            input = file.pipe(limiter);
          }
          writes.push(new Promise((done, fail) => {
            output.on('finish', done);
            output.on('error', fail);
          }));
          input.pipe(output);
        });
        parser.on('filesLimit', () => reject(new Error('最多选择一个作品文件和一张封面图片。')));
        parser.on('fieldsLimit', () => reject(new Error('表单字段过多')));
        parser.on('error', reject);
        parser.on('finish', async () => {
          try { await Promise.all(writes); resolve(); }
          catch (error) { reject(error); }
        });
      });
      req.pipe(parser);
      await fileDone;
      if (!uploads.media) throw new Error('请选择图片或视频文件');
      if (tooLarge) throw new Error('单个文件不能超过 1 GiB');
      if (coverTooLarge) throw new Error('封面图片不能超过 10 MiB。请压缩封面后重试。');
      const upload = uploads.media;
      const isVideo = upload.mime.startsWith('video/');
      if (isVideo && !uploads.cover) throw new Error('视频作品需要同时选择一张封面图片。');
      if (!isVideo && uploads.cover) throw new Error('图片作品无需单独上传封面，请移除封面图片后重试。');
      const title = String(fields.title || '').trim().slice(0, 120);
      const prompt = String(fields.prompt || '').trim().slice(0, 20000);
      const description = String(fields.description || '').trim().slice(0, 2000);
      if (!title || !prompt) throw new Error('标题和提示词不能为空');
      const id = `tom-${new Date().toISOString().slice(0, 10)}-${randomBytes(5).toString('hex')}`;
      const filename = `${id}${upload.ext}`;
      const mediaPath = join(mediaDir, filename);
      const coverUpload = uploads.cover;
      const coverFilename = isVideo ? `${id}-cover${coverUpload.ext}` : filename;
      const coverPath = join(mediaDir, coverFilename);
      const works = JSON.parse(await readFile(dataFile, 'utf8'));
      await rename(upload.tempPath, mediaPath);
      savedPaths.push(mediaPath);
      if (isVideo) {
        await rename(coverUpload.tempPath, coverPath);
        savedPaths.push(coverPath);
      }
      const cover = `/tom-media/${coverFilename}`;
      const entry = {
        id, title, description, prompt,
        cover,
        media: [{ type: isVideo ? 'video' : 'image', url: `/tom-media/${filename}`, mime: upload.mime, alt: title }],
        tags: [], hidden: false, publishedAt: new Date().toISOString(),
      };
      await saveWorks([entry, ...works]);
      return send(res, 201, { work: entry });
    } catch (error) {
      await Promise.all([...temporaryPaths, ...savedPaths].map(path => rm(path, { force: true }).catch(() => {})));
      return send(res, 400, { error: error.message || '上传失败' });
    }
  }
  return send(res, 404, { error: 'Not found' });
});
server.requestTimeout = 2 * 60 * 60 * 1000;
server.headersTimeout = 65_000;
server.listen(port, '127.0.0.1', () => console.log(`Tom upload API listening on 127.0.0.1:${port}`));
