// server.js - Render-ready server using multer and replacer
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { replaceUsingSkeleton } = require('./replacer');

const app = express();
const upload = multer({ dest: os.tmpdir() });

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Upload endpoint
app.post('/clone', upload.single('zipFile'), async (req, res) => {
  try {
    const mappings = JSON.parse(req.body.mappings || '[]');
    const renameFiles = req.body.renameFiles === 'true' || req.body.renameFiles === true;
    if (!req.file) return res.status(400).send('No zip uploaded');

    const jobId = uuidv4();
    const workDir = path.join(os.tmpdir(), `suzzycloner-${jobId}`);
    await fs.ensureDir(workDir);

    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(workDir, true);

    // process text files
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir)) {
        const full = path.join(dir, f);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) { walk(full); }
        else {
          const ext = path.extname(full).toLowerCase();
          const textExts = ['.js','.ts','.json','.md','.html','.css','.env','.txt','.py','.java'];
          if (textExts.includes(ext) || ext === '') {
            let data = fs.readFileSync(full, 'utf8');
            for (const m of mappings) {
              data = replaceUsingSkeleton(data, m.old || m.oldName || m.oldname || m.from, m._new || m.new || m.newName || m.to);
            }
            fs.writeFileSync(full, data, 'utf8');
          }
        }
      }
    };
    walk(workDir);

    // optional rename files/dirs
    if (renameFiles) {
      const allPaths = [];
      const rec = (p) => {
        allPaths.push(p);
        if (fs.statSync(p).isDirectory()) {
          for (const c of fs.readdirSync(p)) rec(path.join(p,c));
        }
      };
      rec(workDir);
      allPaths.sort((a,b)=>b.split(path.sep).length - a.split(path.sep).length);
      for (const p of allPaths) {
        const rel = path.relative(workDir, p);
        let newRel = rel;
        for (const m of mappings) {
          newRel = replaceUsingSkeleton(newRel, m.old || m.oldName || m.from, m._new || m.new || m.to);
        }
        if (newRel !== rel) {
          const dest = path.join(workDir, newRel);
          await fs.ensureDir(path.dirname(dest));
          try { await fs.move(p, dest, { overwrite: true }); } catch(e){ console.warn('rename failed', e.message); }
        }
      }
    }

    const outZip = new AdmZip();
    outZip.addLocalFolder(workDir);
    const outName = `SuzzyCloned-${jobId}.zip`;
    const outPath = path.join(os.tmpdir(), outName);
    outZip.writeZip(outPath);

    // cleanup upload
    try { fs.unlinkSync(req.file.path); } catch(e){}
    // send file
    res.download(outPath, outName, (err) => {
      try { fs.removeSync(workDir); } catch(e){}
      try { fs.unlinkSync(outPath); } catch(e){}
    });

  } catch (err) {
    console.error(err);
    res.status(500).send(String(err));
  }
});

// fallback to index
app.get('*', (req,res)=> {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log('Server running on port', PORT));
