const $=id=>document.getElementById(id);
let file=null,font=null,removed=new Set(),pyodide=null,ready=false,records=[];

const drop=$("dropZone"), input=$("fileInput"), grid=$("glyphGrid");
$("chooseBtn").onclick=e=>{e.stopPropagation();input.click()};
drop.onclick=()=>input.click();
["dragover"].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add("drag")}));
["dragleave"].forEach(ev=>drop.addEventListener(ev,()=>drop.classList.remove("drag")));
drop.addEventListener("drop",e=>{e.preventDefault();drop.classList.remove("drag");if(e.dataTransfer.files[0])loadFile(e.dataTransfer.files[0])});
input.onchange=()=>{if(input.files[0])loadFile(input.files[0])};
$("resetBtn").onclick=()=>{removed.clear();render()};
$("search").oninput=()=>render();
$("downloadBtn").onclick=downloadFont;

async function initEngine(){
  $("engineStatus").textContent="Loading font engine…";
  try{
    pyodide=await loadPyodide({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.29.3/full/"});
    $("engineStatus").textContent="Installing fontTools…";
    await pyodide.loadPackage("micropip");
    await pyodide.runPythonAsync(`
import micropip
await micropip.install("fonttools")
`);
    await pyodide.runPythonAsync(`
from fontTools.ttLib import TTFont
from fontTools import subset
`);
    ready=true;
    $("engineStatus").textContent="Font engine ready";
    $("engineStatus").className="engine ready";
    if(file) $("downloadBtn").disabled=false;
  }catch(e){
    console.error(e);
    $("engineStatus").textContent="Engine failed to load";
    $("engineStatus").className="engine error";
  }
}
initEngine();

async function loadFile(f){
  const ext=f.name.split(".").pop().toLowerCase();
  if(!["ttf","otf"].includes(ext)){alert("শুধু TTF বা OTF ফাইল দিন।");return}
  if(f.size>30*1024*1024){alert("ফাইল 30MB-এর বেশি হতে পারবে না।");return}
  file=f; removed.clear(); $("fileInfo").textContent=`Selected: ${f.name} · ${(f.size/1048576).toFixed(2)} MB`;
  try{
    const buf=await f.arrayBuffer();
    font=opentype.parse(buf);
    $("editor").classList.remove("hidden");
    $("fontName").textContent=font.getEnglishName("fullName")||font.getEnglishName("fontFamily")||f.name;
    $("fontMeta").textContent=`${font.glyphs.length} glyphs · ${ext.toUpperCase()}`;
    records=[];
    for(let i=0;i<font.glyphs.length;i++){
      const g=font.glyphs.get(i);
      let unicodes=[];
      try{if(g.unicodes) unicodes=g.unicodes; else if(g.unicode!=null) unicodes=[g.unicode]}catch{}
      records.push({gid:i,g,unicodes});
    }
    render();
    if(ready)$("downloadBtn").disabled=false;
  }catch(e){console.error(e);alert("Font parse করা যায়নি: "+e.message)}
}

function render(){
  grid.innerHTML="";
  const q=$("search").value.trim().toLowerCase();
  let shown=0;
  for(const r of records){
    const uni=r.unicodes.map(x=>x.toString(16).toUpperCase()).join(" ");
    const hay=(`${r.gid} ${uni} ${r.g.name||""}`).toLowerCase();
    if(q && !hay.includes(q))continue;
    const card=document.createElement("div");
    card.className="glyph-card"+(removed.has(r.gid)?" selected":"");
    const c=document.createElement("canvas");
    c.width=86;
    c.height=86;
    try{
      const ctx=c.getContext("2d");
      ctx.clearRect(0,0,c.width,c.height);

      const box=r.g.getBoundingBox();
      const bw=Math.max(1, box.x2-box.x1);
      const bh=Math.max(1, box.y2-box.y1);
      const pad=9;

      // Dynamically fit each glyph to the preview box.
      const sx=(c.width-pad*2)/bw;
      const sy=(c.height-pad*2)/bh;
      const scale=Math.min(sx,sy);
      const fontSize=font.unitsPerEm*scale;
      const x=pad-(box.x1*scale);
      const y=(c.height-pad)+(box.y1*scale);

      const path=r.g.getPath(x,y,fontSize);
      path.fill="#111111";
      path.draw(ctx);
    }catch(err){
      console.warn("Glyph preview failed:",r.gid,err);
    }
    const gid=document.createElement("span");gid.className="gid";gid.textContent="#"+r.gid;
    const u=document.createElement("span");u.className="uni";u.textContent=uni?"U+"+uni:"—";
    card.append(c,gid,u);
    card.title=`Glyph ${r.gid}${uni?" · U+"+uni:""}`;
    card.onclick=()=>{removed.has(r.gid)?removed.delete(r.gid):removed.add(r.gid);render()};
    grid.appendChild(card);shown++;
  }
  $("status").textContent=`Total: ${records.length} · Selected for removal: ${removed.size} · Showing: ${shown}`;
}

async function downloadFont(){
  if(!ready||!file||!font){alert("Font engine এখনো প্রস্তুত নয়।");return}
  if(!removed.size){alert("অন্তত একটি glyph select করুন।");return}
  if(removed.has(0)){alert("Glyph #0 (.notdef) সরানো যাবে না।");return}
  if(removed.size>=records.length){alert("অন্তত একটি glyph রাখতে হবে।");return}

  const keep=records.filter(r=>!removed.has(r.gid)).map(r=>r.gid);
  const bytes=new Uint8Array(await file.arrayBuffer());
  $("progress").classList.remove("hidden");$("progress").firstElementChild.style.width="20%";
  $("downloadBtn").disabled=true;

  try{
    pyodide.globals.set("font_bytes",bytes);
    pyodide.globals.set("keep_json",JSON.stringify(keep));
    $("progress").firstElementChild.style.width="45%";
    const result=await pyodide.runPythonAsync(`
import json, io
from fontTools.ttLib import TTFont
from fontTools import subset

keep = json.loads(keep_json)
inp = io.BytesIO(bytes(font_bytes))
font = TTFont(inp, recalcBBoxes=False, recalcTimestamp=False)

options = subset.Options()
options.layout_features = ["*"]
options.name_IDs = ["*"]
options.name_languages = ["*"]
options.glyph_names = True
options.hinting = True
options.retain_gids = False
options.notdef_glyph = True
options.recommended_glyphs = True
options.desubroutinize = False

subsetter = subset.Subsetter(options=options)
subsetter.populate(gids=keep)
subsetter.subset(font)

out = io.BytesIO()
font.save(out, reorderTables=False)
out.getvalue()
`);
    $("progress").firstElementChild.style.width="85%";
    const out=new Uint8Array(result.toJs({create_memoryview:false}));
    result.destroy();
    const ext=file.name.toLowerCase().endsWith(".otf")?".otf":".ttf";
    const base=file.name.replace(/\.(ttf|otf)$/i,"");
    const safe=base.replace(/[\\/:*?"<>|]+/g,"_");
    const name=`PBFF_${safe}_Removed${ext}`;
    const blob=new Blob([out],{type:"font/ttf"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),3000);
    $("progress").firstElementChild.style.width="100%";
  }catch(e){
    console.error(e);
    alert("Font processing failed:\n\n"+(e.message||e));
  }finally{
    $("downloadBtn").disabled=false;
    setTimeout(()=>$("progress").classList.add("hidden"),700);
  }
}
