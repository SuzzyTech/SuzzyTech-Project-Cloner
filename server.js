// SuzzyTech Project Cloner - Patched Server (supports fancy unicode styles + robust filename replacement)
// Save this as server.js (replace the original). Requires the same packages plus no extra deps.

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

// ---------- Utilities for fancy/unicode handling ----------
function toNFKD(s){ return s.normalize('NFKD'); }

// remove diacritics and combine marks
function stripCombiningMarks(s){
  return s.replace(/\p{M}/gu, '');
}

// map many fancy mathematical alphabets and fullwidth -> ascii
// We'll build a "skeleton" for a string: ASCII lowercase letters, digits, and punctuation preserved.
// For letters in mathematical alphanumeric blocks we map back to ascii letters.

const fancyBlocks = [
  // [startCodeForA_upper, startCodeFora_lower]
  // Mathematical Bold (A-Z: 0x1D400, a-z:0x1D41A)
  {A:0x1D400, a:0x1D41A},
  // Mathematical Italic
  {A:0x1D434, a:0x1D44E},
  // Mathematical Bold Italic
  {A:0x1D468, a:0x1D482},
  // Mathematical Script
  {A:0x1D49C, a:0x1D4B6},
  // Mathematical Bold Script
  {A:0x1D4D0, a:0x1D4EA},
  // Mathematical Fraktur
  {A:0x1D504, a:0x1D51E},
  // Mathematical Double-struck
  {A:0x1D538, a:0x1D552},
  // Mathematical Bold Fraktur
  {A:0x1D56C, a:0x1D586},
  // Mathematical Sans-serif
  {A:0x1D5A0, a:0x1D5BA},
  // Mathematical Sans-serif Bold
  {A:0x1D5D4, a:0x1D5EE},
  // Mathematical Sans-serif Italic
  {A:0x1D608, a:0x1D622},
  // Mathematical Sans-serif Bold Italic
  {A:0x1D63C, a:0x1D656},
  // Mathematical Monospace
  {A:0x1D670, a:0x1D68A},
];

// Fullwidth A-Z and a-z
const fullwidth = {A:0xFF21, a:0xFF41};

function fancyToAsciiChar(ch){
  const cp = ch.codePointAt(0);
  // ASCII letters and digits unchanged
  if (cp >= 0x30 && cp <= 0x39) return String.fromCodePoint(cp);
  if (cp >= 0x41 && cp <= 0x5A) return String.fromCodePoint(cp);
  if (cp >= 0x61 && cp <= 0x7A) return String.fromCodePoint(cp);
  // fullwidth
  if (cp >= fullwidth.A && cp < fullwidth.A+26) return String.fromCodePoint(0x41 + (cp - fullwidth.A));
  if (cp >= fullwidth.a && cp < fullwidth.a+26) return String.fromCodePoint(0x61 + (cp - fullwidth.a));
  // mathematical blocks
  for (const b of fancyBlocks){
    if (cp >= b.A && cp < b.A + 26) return String.fromCodePoint(0x41 + (cp - b.A));
    if (cp >= b.a && cp < b.a + 26) return String.fromCodePoint(0x61 + (cp - b.a));
  }
  // some circled/parenthesized/warped variants
  // circled a-z (examples exist at U+24B6..)
  if (cp >= 0x24B6 && cp <= 0x24CF) return String.fromCodePoint(0x41 + (cp - 0x24B6));
  if (cp >= 0x24D0 && cp <= 0x24E9) return String.fromCodePoint(0x61 + (cp - 0x24D0));

  // If it's a letter with diacritics normalize and strip
  const nf = toNFKD(ch);
  const stripped = stripCombiningMarks(nf);
  if (stripped.length === 1 && /[A-Za-z0-9]/.test(stripped)) return stripped;

  // fallback: if not mappable, return original char (will preserve punctuation like '-' etc)
  return ch;
}

function toSkeleton(s){
  // build ascii skeleton: map fancy letters to base ascii, lowercased for matching convenience
  let out = '';
  for (const ch of Array.from(s)){
    out += fancyToAsciiChar(ch);
  }
  return out.toLowerCase();
}

// Given a sampleFancy string (the original occurrence), produce a styled version of targetAscii
// by mapping each ASCII letter in targetAscii to the same Unicode block (if possible) as the corresponding char in sampleFancy.
function stylizeToSample(targetAscii, sampleFancy){
  const target = Array.from(targetAscii);
  const sample = Array.from(sampleFancy);
  const out = [];
  // We'll align characters by letters only (skip punctuation in sample when necessary)
  // Build array of sample letter blocks per letter
  const sampleLetters = sample.filter(ch=>/[A-Za-z0-9]/.test(fancyToAsciiChar(ch)));

  for (let i=0;i<target.length;i++){
    const tch = target[i];
    const sampleCh = sampleLetters[i] || null;
    if (!sampleCh){
      // no sample letter to copy style from: keep ASCII and preserve case
      out.push( preserveCase(tch, tch) );
      continue;
    }
    // determine block of sampleCh
    const block = detectBlock(sampleCh);
    if (block){
      // map target char into same block preserving case
      out.push(mapCharToBlock(tch, block));
    } else {
      // fallback: preserve case
      out.push(preserveCase(tch, sampleCh));
    }
  }
  return out.join('');
}

function preserveCase(ch, sampleCh){
  if (/[A-Z]/.test(sampleCh)) return ch.toUpperCase();
  if (/[a-z]/.test(sampleCh)) return ch.toLowerCase();
  return ch;
}

function detectBlock(ch){
  // Return an object describing the unicode block of ch that we can map into
  const cp = ch.codePointAt(0);
  // check fullwidth
  if (cp >= fullwidth.A && cp < fullwidth.A+26) return {type:'fullwidth'};
  for (const b of fancyBlocks){
    if (cp >= b.A && cp < b.A + 26) return {type:'math', A: b.A, a: b.a};
    if (cp >= b.a && cp < b.a + 26) return {type:'math', A: b.A, a: b.a};
  }
  // circled
  if (cp >= 0x24B6 && cp <= 0x24CF) return {type:'circled', base:0x24B6};
  if (cp >= 0x24D0 && cp <= 0x24E9) return {type:'circled', base:0x24D0};
  return null;
}

function mapCharToBlock(ch, block){
  if (!/[A-Za-z]/.test(ch)) return ch; // non letter
  const isUpper = /[A-Z]/.test(ch);
  const codeIndex = (isUpper? ch.toUpperCase().charCodeAt(0) - 0x41 : ch.toLowerCase().charCodeAt(0) - 0x61);
  if (block.type === 'fullwidth'){
    return String.fromCodePoint((isUpper? fullwidth.A : fullwidth.a) + codeIndex);
  }
  if (block.type === 'math'){
    const base = isUpper? block.A : block.a;
    return String.fromCodePoint(base + codeIndex);
  }
  if (block.type === 'circled'){
    return String.fromCodePoint(block.base + codeIndex);
  }
  return preserveCase(ch, ch);
}

// ---------- Replacement helpers ----------
function findAllOccurrencesBySkeleton(original, oldAsciiLower){
  // Build skeleton with mapping to original indices
  const chars = Array.from(original);
  const sk = chars.map(ch=>fancyToAsciiChar(ch).toLowerCase()).join('');
  const results = [];
  let idx = 0;
  while (true){
    const found = sk.indexOf(oldAsciiLower, idx);
    if (found === -1) break;
    // convert found index in skeleton to original string indices
    // find start index in original by counting code units
    // Since we used one-to-one mapping between chars array and sk chars, the index maps directly
    const start = Array.from(original).slice(0,found).join('').length;
    const matchOrig = Array.from(original).slice(found, found + oldAsciiLower.length).join('');
    results.push({startPosFoundCharIndex: found, start, lengthChars: Array.from(matchOrig).length, orig: matchOrig});
    idx = found + 1;
  }
  return results;
}

function replaceUsingSkeleton(original, oldAscii, newAscii){
  const oldAsciiLower = oldAscii.toLowerCase();
  const occ = findAllOccurrencesBySkeleton(original, oldAsciiLower);
  if (!occ.length) return original;
  // perform replacements from end to start so indices stable
  let out = original;
  for (let i = occ.length-1;i>=0;i--){
    const m = occ[i];
    const before = out.slice(0, m.start);
    const after = out.slice(m.start + m.lengthChars);
    const styled = stylizeToSample(newAscii, m.orig);
    out = before + styled + after;
  }
  return out;
}

// ---------- File system helpers ----------
function collectAllPathsRecursive(dir){
  const results = [];
  function rec(p){
    results.push(p);
    const stat = fs.lstatSync(p);
    if (stat.isDirectory()){
      for (const child of fs.readdirSync(p)) rec(path.join(p, child));
    }
  }
  rec(dir);
  return results;
}

function isTextExt(file, textExts){
  const ext = path.extname(file).toLowerCase();
  return textExts.includes(ext) || ['.js','.ts','.json','.md','.html','.css','.env','.txt'].includes(ext);
}

function addFolderToZip(zip, folderPath, basePath){
  const items = fs.readdirSync(folderPath);
  for (const it of items){
    const full = path.join(folderPath, it);
    const rel = path.relative(basePath, full);
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()){
      zip.addFile(rel + '/', Buffer.alloc(0));
      addFolderToZip(zip, full, basePath);
    } else {
      zip.addLocalFile(full, path.dirname(rel), path.basename(rel));
    }
  }
}

// ---------- Main upload route (similar behaviour but replaced with skeleton matching) ----------
app.post('/upload', upload.single('zip'), async (req,res)=>{
  try{
    const mappings = (req.body.mappings || []).map(m => ({old: String(m.old || ''), _new: String(m._new || '')})).filter(x=>x.old && x._new);
    const renameFiles = !!req.body.renameFiles;
    const jobId = uuidv4();
    const workDir = path.join(os.tmpdir(), `suzzycloner-${jobId}`);
    fs.mkdirSync(workDir, {recursive:true});

    // unzip
    const zip = new AdmZip(req.file.path);
    zip.extractAllTo(workDir, true);

    // get all files
    const allPaths = collectAllPathsRecursive(workDir);
    const textFiles = allPaths.filter(f => fs.lstatSync(f).isFile() && isTextExt(f, []) );

    // For each text file, read contents and perform skeleton-based replacements
    for (const f of textFiles){
      let content = fs.readFileSync(f, 'utf8');
      for (const m of mappings){
        content = replaceUsingSkeleton(content, m.old, m._new);
      }
      fs.writeFileSync(f, content, 'utf8');
    }

    // rename files and dirs if requested
    if (renameFiles){
      const allPaths2 = collectAllPathsRecursive(workDir);
      // sort deepest first
      allPaths2.sort((a,b)=>b.split(path.sep).length - a.split(path.sep).length);
      for (const p of allPaths2){
        const rel = path.relative(workDir, p);
        let newRel = rel;
        for (const m of mappings){
          // replace occurrences in the relative path using skeleton method
          newRel = replaceUsingSkeleton(newRel, m.old, m._new);
        }
        if (newRel !== rel){
          const src = p;
          const dest = path.join(workDir, newRel);
          const newDir = path.dirname(dest);
          fs.mkdirSync(newDir, {recursive:true});
          try { fs.renameSync(src, dest); } catch(e){ console.warn('rename failed', src, dest, e.message); }
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

  } catch (err){
    console.error(err);
    res.status(500).send('Server error: ' + String(err.message || err));
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log('SuzzyTech Project Cloner running on http://localhost:'+PORT));
