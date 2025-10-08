const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const busboy = require('busboy');
const { replaceUsingSkeleton } = require('../replacer');

module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');
  const bb = busboy({ headers: req.headers });
  const tmp = os.tmpdir();
  let mappings = [];
  let uploadedPath = null;
  bb.on('file', (name, file, info) => {
    const saveTo = path.join(tmp, `upload-${Date.now()}.zip`);
    uploadedPath = saveTo;
    const ws = fs.createWriteStream(saveTo);
    file.pipe(ws);
  });
  bb.on('field', (name, val) => {
    if (name === 'mappings') {
      try { mappings = JSON.parse(val); } catch(e){ mappings = []; }
    }
  });
  bb.on('close', async () => {
    if (!uploadedPath) return res.status(400).send('No file');
    try {
      const extractDir = path.join(tmp, 'vercel-'+Date.now());
      fs.mkdirSync(extractDir);
      const zip = new AdmZip(uploadedPath);
      zip.extractAllTo(extractDir, true);
      // process files
      const walk = (d) => {
        for (const f of fs.readdirSync(d)) {
          const full = path.join(d,f);
          const stat = fs.statSync(full);
          if (stat.isDirectory()) walk(full);
          else {
            const ext = path.extname(full).toLowerCase();
            const textExts = ['.js','.ts','.json','.md','.html','.css','.env','.txt','.py','.java'];
            if (textExts.includes(ext) || ext === '') {
              let data = fs.readFileSync(full, 'utf8');
              for (const m of mappings) {
                data = replaceUsingSkeleton(data, m.old || m.from, m._new || m.to || m.new);
              }
              fs.writeFileSync(full, data, 'utf8');
            }
          }
        }
      };
      walk(extractDir);
      const outZip = new AdmZip();
      outZip.addLocalFolder(extractDir);
      const outP = path.join(tmp, `out-${Date.now()}.zip`);
      outZip.writeZip(outP);
      res.setHeader('Content-Type','application/zip');
      res.setHeader('Content-Disposition','attachment; filename=cloned.zip');
      const stream = fs.createReadStream(outP);
      stream.pipe(res);
      stream.on('end', ()=>{
        try{ fs.unlinkSync(uploadedPath); fs.unlinkSync(outP); }catch(e){}
      });
    } catch (e) {
      console.error(e);
      res.status(500).send(String(e));
    }
  });
  req.pipe(bb);
};
