document.addEventListener('DOMContentLoaded',()=>{
const pairsEl=document.getElementById('pairs');
const addPairBtn=document.getElementById('addPair');
const zipInput=document.getElementById('zipInput');
const pickBtn=document.getElementById('pickBtn');
const fileInfo=document.getElementById('fileInfo');
const processBtn=document.getElementById('processBtn');
const progressBar=document.getElementById('progressBar');
const status=document.getElementById('status');
let uploadedFile=null;

function makePair(a='',b=''){
 const div=document.createElement('div');
 div.className='pair';
 const i1=document.createElement('input');i1.placeholder='Original name';i1.value=a;
 const i2=document.createElement('input');i2.placeholder='New name';i2.value=b;
 const rm=document.createElement('button');rm.className='remove';rm.textContent='✕';
 rm.onclick=()=>div.remove();
 div.append(i1,i2,rm);
 pairsEl.append(div);
}
addPairBtn.onclick=()=>makePair();
makePair('BossLady-Xmd','SuzzyCore-X');

pickBtn.onclick=()=>zipInput.click();
zipInput.onchange=e=>{
 uploadedFile=e.target.files[0];
 if(!uploadedFile){fileInfo.textContent='No file';return;}
 fileInfo.textContent=uploadedFile.name+' — '+(uploadedFile.size/1024|0)+' KB';
};

function isText(name){
 const ex=name.split('.').pop().toLowerCase();
 return ['js','json','html','css','txt','md','php','py','java','ts','yml','env'].includes(ex);
}

processBtn.onclick=async()=>{
 if(!uploadedFile){alert('Upload a ZIP first');return;}
 const jszip=new JSZip();
 const buf=await uploadedFile.arrayBuffer();
 const zip=await jszip.loadAsync(buf);
 const pairs=[...pairsEl.children].map(d=>({orig:d.children[0].value,repl:d.children[1].value})).filter(p=>p.orig&&p.repl);
 if(!pairs.length){alert('Add at least one pair');return;}
 status.textContent='Processing...';
 const newZip=new JSZip();
 let done=0;
 for(const name of Object.keys(zip.files)){
  const f=zip.files[name];
  if(f.dir){newZip.folder(name);continue;}
  let content;
  if(isText(name)) content=await f.async('string');
  else content=await f.async('uint8array');
  if(typeof content==='string'){
   for(const {orig,repl} of pairs){
    for(const style of fancy.styles){
     const styledOrig=fancy.apply(style.map,orig);
     const styledRepl=fancy.apply(style.map,repl);
     content=content.split(styledOrig).join(styledRepl);
    }
    content=content.split(orig).join(repl);
   }
  }
  newZip.file(name,content);
  done++;progressBar.style.width=(done/Object.keys(zip.files).length*100)+'%';
 }
 const blob=await newZip.generateAsync({type:'blob'});
 saveAs(blob,'cloned-'+uploadedFile.name);
 status.textContent='Done!';
 progressBar.style.width='100%';
};
});