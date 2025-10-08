// SuzzyTech Project Cloner - Server
// Simple Express app to accept a ZIP, apply unlimited name-mappings, and return a modified ZIP.
const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const replaceInFile = require('replace-in-file');
const sanitize = require('sanitize-filename');

const app = express();
const upload = multer({ dest: os.tmpdir() });
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use('/assets', express.static(path.join(__dirname, 'public','assets')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function isTextExt(filename, textExts) {
  const ext = path.extname(filename).toLowerCase();
  return textExts.includes(ext);
}

function collectAllPathsRecursive(start) {
  const result = [];
  function rec(cur) {
    const items = fs.readdirSync(cur, { withFileTypes: true });
    for (const it of items) {
      const full = path.join(cur, it.name);
      result.push(full);
      if (it.isDirectory()) rec(full);
    }
  }
  rec(start);
  return result;
}

function addFolderToZip(zipObj, folderPath, basePath) {
  const items = fs.readdirSync(folderPath, { withFileTypes: true });
  for (const it of items) {
    const full = path.join(folderPath, it.name);
    const rel = path.relative(basePath, full).split(path.sep).join('/');
    if (it.isDirectory()) {
      zipObj.addFile(rel + '/', Buffer.alloc(0));
      addFolderToZip(zipObj, full, basePath);
    } else {
      const data = fs.readFileSync(full);
      zipObj.addFile(rel, data);
    }
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

app.post('/upload', upload.single('zipfile'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send('No file uploaded');
    // Read mappings: old[] and new[]
    const olds = Array.isArray(req.body.old) ? req.body.old : (req.body.old ? [req.body.old] : []);
    const news = Array.isArray(req.body._new) ? req.body._new : (req.body._new ? [req.body._new] : []);
    const mappings = [];
    for (let i=0;i<Math.max(olds.length, news.length); i++) {
      const o = (olds[i] || '').trim();
      const n = (news[i] || '').trim();
      if (o && n) mappings.push({ old: o, _new: n });
    }
    if (mappings.length===0) return res.status(400).send('Provide at least one mapping pair');
    const renameFiles = req.body.renameFilenames === 'on' || req.body.renameFilenames === 'true';
    const textExtsInput = (req.body.textExts || '.js,.json,.txt,.md,.html,.css,.py,.java,.xml,.yml,.yaml');
    const textExts = textExtsInput.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);

    const jobId = uuidv4();
    const workDir = path.join(os.tmpdir(), `suzzycl-${jobId}`);
    fs.mkdirSync(workDir, { recursive: true });

    // unzip
    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(workDir, true);

    // get all files
    const allFiles = collectAllPathsRecursive(workDir);
    const textFiles = allFiles.filter(f => fs.lstatSync(f).isFile() && isTextExt(f, textExts));

    // prepare replacements
    const fromRegexes = mappings.map(m => new RegExp(escapeRegExp(m.old), 'g'));
    const toValues = mappings.map(m => m._new);

    if (textFiles.length) {
      await replaceInFile({
        files: textFiles,
        from: fromRegexes,
        to: toValues,
      });
    }

    // rename files and dirs if requested
    if (renameFiles) {
      const allPaths = collectAllPathsRecursive(workDir);
      // sort deepest first
      allPaths.sort((a,b)=>b.split(path.sep).length - a.split(path.sep).length);
      for (const p of allPaths) {
        let newP = p;
        for (const m of mappings) {
          if (newP.includes(m.old)) newP = newP.split(m.old).join(m._new);
        }
        if (newP !== p) {
          const newDir = path.dirname(newP);
          fs.mkdirSync(newDir, { recursive: true });
          try { fs.renameSync(p, newP); } catch(e) { console.warn('rename failed', p, newP, e.message); }
        }
      }
    }

    // create output zip
    const outZip = new AdmZip();
    addFolderToZip(outZip, workDir, workDir);
    const outName = `SuzzyTech-Cloned-${jobId}.zip`;
    const outPath = path.join(os.tmpdir(), outName);
    outZip.writeZip(outPath);

    res.download(outPath, outName, (err) => {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch(e){}
      try { fs.unlinkSync(req.file.path); } catch(e){}
      try { fs.unlinkSync(outPath); } catch(e){}
    });

  } catch (err) {
    console.error(err);
    res.status(500).send('Server error: ' + String(err.message || err));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('SuzzyTech Project Cloner running on http://localhost:'+PORT));
