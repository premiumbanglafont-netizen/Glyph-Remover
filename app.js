const $=id=>document.getElementById(id);

let file=null;
let font=null;
let records=[];
let removed=new Set();
let pyodide=null;
let enginePromise=null;
let engineReady=false;

const input=$("fileInput");
const choose=$("chooseBtn");
const drop=$("dropZone");
const grid=$("glyphGrid");

choose.addEventListener("click",e=>{
  e.preventDefault();
  e.stopPropagation();
  input.click();
});

input.addEventListener("change",()=>{
  const f=input.files && input.files[0];
  if(f) loadFile(f);
  input.value="";
});

drop.addEventListener("dragover",e=>{
  e.preventDefault();
  drop.classList.add("drag");
});

drop.addEventListener("dragleave",()=>drop.classList.remove("drag"));

drop.addEventListener("drop",e=>{
  e.preventDefault();
  drop.classList.remove("drag");
  const f=e.dataTransfer.files && e.dataTransfer.files[0];
  if(f) loadFile(f);
});

$("resetBtn").onclick=()=>{
  removed.clear();
  render();
};

$("search").oninput=render;
$("downloadBtn").onclick=downloadFont;

function loadFile(f){
  const ext=(f.name.split(".").pop()||"").toLowerCase();

  if(!["ttf","otf"].includes(ext)){
    alert("শুধু TTF অথবা OTF font upload করুন।");
    return;
  }

  if(f.size>30*1024*1024){
    alert("Font file 30MB-এর বেশি হতে পারবে না।");
    return;
  }

  file=f;
  removed.clear();
  $("fileInfo").textContent=`Selected: ${f.name} · ${(f.size/1048576).toFixed(2)} MB`;
  $("downloadBtn").disabled=true;

  const reader=new FileReader();

  reader.onload=ev=>{
    try{
      font=opentype.parse(ev.target.result);

      records=[];
      for(let i=0;i<font.glyphs.length;i++){
        const g=font.glyphs.get(i);
        let us=[];
        try{
          us=Array.isArray(g.unicodes)
            ?g.unicodes
            :(g.unicode!=null?[g.unicode]:[]);
        }catch(_){}

        records.push({gid:i,g,unicodes:us});
      }

      $("editor").classList.remove("hidden");
      $("fontName").textContent=
        font.getEnglishName("fullName") ||
        font.getEnglishName("fontFamily") ||
        f.name;

      $("fontMeta").textContent=
        `${font.glyphs.length} glyphs · ${ext.toUpperCase()}`;

      $("engineStatus").textContent="Ready";
      $("engineStatus").className="engine idle";

      render();

    }catch(err){
      console.error(err);
      alert("Font parse করা যায়নি:\n"+err.message);
    }
  };

  reader.onerror=()=>{
    alert("Font file পড়তে সমস্যা হয়েছে।");
  };

  reader.readAsArrayBuffer(f);
}

function render(){
  grid.innerHTML="";

  const q=$("search").value.trim().toLowerCase();
  let shown=0;

  for(const r of records){

    const uni=r.unicodes
      .map(x=>x.toString(16).toUpperCase())
      .join(" ");

    const hay=
      `${r.gid} ${uni} ${r.g.name||""}`.toLowerCase();

    if(q && !hay.includes(q)) continue;

    const card=document.createElement("div");
    card.className="glyphCard"+
      (removed.has(r.gid)?" selected":"");

    const canvas=document.createElement("canvas");
    canvas.className="glyphCanvas";
    canvas.width=172;
    canvas.height=172;

    drawGlyph(canvas,r.g);

    const gid=document.createElement("span");
    gid.className="gid";
    gid.textContent="#"+r.gid;

    const u=document.createElement("span");
    u.className="uni";
    u.textContent=uni?"U+"+uni:"—";

    card.append(canvas,gid,u);

    card.title=
      `Glyph ${r.gid}`+
      (uni?" · U+"+uni:"");

    card.onclick=()=>{
      if(removed.has(r.gid))
        removed.delete(r.gid);
      else
        removed.add(r.gid);

      updateStatusOnly();
      card.classList.toggle("selected",removed.has(r.gid));
    };

    grid.appendChild(card);
    shown++;
  }

  $("status").textContent=
    `Total: ${records.length} · Selected: ${removed.size} · Showing: ${shown}`;
}

function updateStatusOnly(){
  $("status").textContent=
    `Total: ${records.length} · Selected: ${removed.size} · Showing: ${grid.children.length}`;
}

/*
  Preview renderer:
  - Uses the glyph's real outline bounding box.
  - Adds equal padding.
  - Uses high-resolution canvas internally.
  - Centers the outline mathematically.
  This prevents the old fixed-size 28/38px rendering bug.
*/
function drawGlyph(canvas,g){
  const ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);

  try{
    const box=g.getBoundingBox();

    let bw=box.x2-box.x1;
    let bh=box.y2-box.y1;

    if(!isFinite(bw)||bw<=0) bw=(font.unitsPerEm||1000)*.5;
    if(!isFinite(bh)||bh<=0) bh=(font.unitsPerEm||1000);

    const pad=22;
    const usable=canvas.width-(pad*2);

    /*
      Limit the scale so extreme decorative glyphs do not become
      enormous compared with normal glyphs.
    */
    const visualScale=Math.min(
      usable/bw,
      usable/bh
    );

    const em=font.unitsPerEm||1000;
    const size=em*visualScale;

    const bx=(box.x1+box.x2)/2;
    const by=(box.y1+box.y2)/2;

    const x=(canvas.width/2)-(bx*visualScale);
    const y=(canvas.height/2)+(by*visualScale);

    const path=g.getPath(x,y,size);
    path.fill="#111111";
    path.draw(ctx);

  }catch(err){
    ctx.fillStyle="#888";
    ctx.font="24px Arial";
    ctx.textAlign="center";
    ctx.fillText("?",canvas.width/2,canvas.height/2);
  }
}

function setEngine(text,cls){
  const e=$("engineStatus");
  e.textContent=text;
  e.className="engine "+cls;
}

async function ensureEngine(){

  if(engineReady) return;

  if(enginePromise) return enginePromise;

  enginePromise=(async()=>{

    setEngine("Loading font engine…","busy");

    pyodide=await loadPyodide({
      indexURL:"https://cdn.jsdelivr.net/pyodide/v0.29.3/full/"
    });

    setEngine("Installing fontTools…","busy");

    await pyodide.loadPackage("micropip");

    await pyodide.runPythonAsync(`
import micropip
await micropip.install("fonttools")
`);

    await pyodide.runPythonAsync(`
from fontTools.ttLib import TTFont
from fontTools import subset
`);

    engineReady=true;
    setEngine("Font engine ready","ready");

  })().catch(err=>{
    console.error(err);
    setEngine("Engine failed","error");
    throw err;
  });

  return enginePromise;
}

async function downloadFont(){

  if(!file||!font) return;

  if(!removed.size){
    alert("অন্তত একটি glyph select করুন।");
    return;
  }

  if(removed.has(0)){
    alert("Glyph #0 (.notdef) remove করা যাবে না।");
    return;
  }

  if(removed.size>=records.length){
    alert("অন্তত একটি glyph রাখতে হবে।");
    return;
  }

  $("downloadBtn").disabled=true;
  $("progressWrap").classList.remove("hidden");
  $("progressBar").style.width="5%";

  try{

    await ensureEngine();

    $("progressBar").style.width="28%";

    const keep=
      records
      .filter(r=>!removed.has(r.gid))
      .map(r=>r.gid);

    const bytes=
      new Uint8Array(
        await file.arrayBuffer()
      );

    pyodide.globals.set("font_bytes",bytes);
    pyodide.globals.set(
      "keep_json",
      JSON.stringify(keep)
    );

    $("progressBar").style.width="45%";

    const result=
      await pyodide.runPythonAsync(`
import io, json
from fontTools.ttLib import TTFont
from fontTools import subset

keep=json.loads(keep_json)

font=TTFont(
    io.BytesIO(bytes(font_bytes)),
    recalcBBoxes=False,
    recalcTimestamp=False
)

opt=subset.Options()

opt.layout_features=["*"]
opt.name_IDs=["*"]
opt.name_languages=["*"]

opt.glyph_names=True
opt.hinting=True
opt.retain_gids=False
opt.notdef_glyph=True
opt.recommended_glyphs=True
opt.desubroutinize=False
opt.recalc_average_width=True
opt.recalc_timestamp=False

sub=subset.Subsetter(options=opt)
sub.populate(gids=keep)
sub.subset(font)

out=io.BytesIO()
font.save(out,reorderTables=False)

out.getvalue()
`);

    $("progressBar").style.width="88%";

    const out=
      new Uint8Array(
        result.toJs({
          create_memoryview:false
        })
      );

    result.destroy();

    const ext=
      file.name.toLowerCase().endsWith(".otf")
      ?".otf"
      :".ttf";

    const base=
      file.name
      .replace(/\.(ttf|otf)$/i,"")
      .replace(/[\\/:*?"<>|]+/g,"_");

    const downloadName=
      `PBFF_${base}_Removed${ext}`;

    const blob=
      new Blob(
        [out],
        {type:"font/"+ext.slice(1)}
      );

    const url=
      URL.createObjectURL(blob);

    const a=document.createElement("a");
    a.href=url;
    a.download=downloadName;

    document.body.appendChild(a);
    a.click();
    a.remove();

    setTimeout(
      ()=>URL.revokeObjectURL(url),
      5000
    );

    $("progressBar").style.width="100%";
    setEngine("Font ready","ready");

  }catch(err){

    console.error(err);

    alert(
      "Font processing failed:\\n\\n"+
      (err.message||err)
    );

    setEngine("Engine error","error");

  }finally{

    $("downloadBtn").disabled=false;

    setTimeout(()=>{
      $("progressWrap").classList.add("hidden");
      $("progressBar").style.width="0";
    },900);
  }
}
