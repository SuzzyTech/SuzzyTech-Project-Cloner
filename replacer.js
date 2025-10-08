// replacer.js - common replacement utilities (CommonJS)
const fs = require('fs');

const fancyBlocks = [
  {A:0x1D400, a:0x1D41A},
  {A:0x1D434, a:0x1D44E},
  {A:0x1D468, a:0x1D482},
  {A:0x1D49C, a:0x1D4B6},
  {A:0x1D4D0, a:0x1D4EA},
  {A:0x1D504, a:0x1D51E},
  {A:0x1D538, a:0x1D552},
  {A:0x1D56C, a:0x1D586},
  {A:0x1D5A0, a:0x1D5BA},
  {A:0x1D5D4, a:0x1D5EE},
  {A:0x1D608, a:0x1D622},
  {A:0x1D63C, a:0x1D656},
  {A:0x1D670, a:0x1D68A},
];
const fullwidth = {A:0xFF21, a:0xFF41};

function fancyToAsciiChar(ch){
  const cp = ch.codePointAt(0);
  if (cp >= 0x30 && cp <= 0x39) return String.fromCodePoint(cp);
  if (cp >= 0x41 && cp <= 0x5A) return String.fromCodePoint(cp);
  if (cp >= 0x61 && cp <= 0x7A) return String.fromCodePoint(cp);
  if (cp >= fullwidth.A && cp < fullwidth.A+26) return String.fromCodePoint(0x41 + (cp - fullwidth.A));
  if (cp >= fullwidth.a && cp < fullwidth.a+26) return String.fromCodePoint(0x61 + (cp - fullwidth.a));
  for (const b of fancyBlocks){
    if (cp >= b.A && cp < b.A + 26) return String.fromCodePoint(0x41 + (cp - b.A));
    if (cp >= b.a && cp < b.a + 26) return String.fromCodePoint(0x61 + (cp - b.a));
  }
  if (cp >= 0x24B6 && cp <= 0x24CF) return String.fromCodePoint(0x41 + (cp - 0x24B6));
  if (cp >= 0x24D0 && cp <= 0x24E9) return String.fromCodePoint(0x61 + (cp - 0x24D0));
  const nf = ch.normalize('NFKD');
  const stripped = nf.replace(/\p{M}/gu, '');
  if (stripped.length === 1 && /[A-Za-z0-9]/.test(stripped)) return stripped;
  return ch;
}

function detectBlock(ch){
  const cp = ch.codePointAt(0);
  if (cp >= fullwidth.A && cp < fullwidth.A+26) return {type:'fullwidth'};
  for (const b of fancyBlocks){
    if (cp >= b.A && cp < b.A + 26) return {type:'math', A: b.A, a: b.a};
    if (cp >= b.a && cp < b.a + 26) return {type:'math', A: b.A, a: b.a};
  }
  if (cp >= 0x24B6 && cp <= 0x24CF) return {type:'circled', base:0x24B6};
  if (cp >= 0x24D0 && cp <= 0x24E9) return {type:'circled', base:0x24D0};
  return null;
}

function mapCharToBlock(ch, block){
  if (!/[A-Za-z]/.test(ch)) return ch;
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
  return ch;
}

function stylizeToSample(targetAscii, sampleFancy){
  const target = Array.from(targetAscii);
  const sample = Array.from(sampleFancy);
  const sampleLetters = sample.filter(ch=>/[A-Za-z0-9]/.test(fancyToAsciiChar(ch)));
  const out = [];
  for (let i=0;i<target.length;i++){
    const tch = target[i];
    const sampleCh = sampleLetters[i] || null;
    if (!sampleCh){
      out.push(/[A-Z]/.test(sampleCh)? tch.toUpperCase() : tch.toLowerCase());
      continue;
    }
    const block = detectBlock(sampleCh);
    if (block){
      out.push(mapCharToBlock(tch, block));
    } else {
      out.push(/[A-Z]/.test(sampleCh)? tch.toUpperCase() : tch.toLowerCase());
    }
  }
  return out.join('');
}

function findAllOccurrencesBySkeleton(original, oldAsciiLower){
  const chars = Array.from(original);
  const sk = chars.map(ch=>fancyToAsciiChar(ch).toLowerCase()).join('');
  const results = [];
  let idx = 0;
  while (true){
    const found = sk.indexOf(oldAsciiLower, idx);
    if (found === -1) break;
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

module.exports = {
  replaceUsingSkeleton,
};
