const $=x=>document.getElementById(x);
let file=null,font=null,rows=[],removed=new Set(),py=null,loading=null,ready=false;

const input=$("fileInput"),drop=$("dropZone"),grid=$("grid"),dl=$("download");

$("chooseBtn").onclick=e=>{e.stopPropagation();input.click()};
drop.onclick=e=>{if(e.target.id!=="chooseBtn")input.click()};
input.onchange=()=>{if(input.files[0])load(input.files[0]);input.value=""};

drop.ondragover=e=>{e.preventDefault();drop.classList.add("drag")};
drop.ondragleave=()=>drop.classList.remove("drag");
drop.ondrop=e=>{e.preventDefault();drop.classList.remove("drag");if(e.dataTransfer.files[0])load(e.dataTransfer.files[0])};

$("reset").onclick=()=>{removed.clear();render()};
$("search").oninput=render;
dl.onclick=download;

function load(f){
  const ext=(f.name.split(".").pop()||"").toLowerCase();
  if(!["ttf","otf"].includes(ext)){alert("শুধু TTF অথবা OTF upload করুন।");return}
  if(f.size>30*1024*1024){alert("Font 30MB-এর বেশি হতে পারবে না।");return}

  file=f; removed.clear(); dl.disabled=false;
  $("fileInfo").textContent=`Selected: ${f.name} · ${(f.size/1048576).toFixed(2)} MB`;

  const r=new FileReader();
  r.onload=e=>{
    try{
      font=opentype.parse(e.target.result);
      rows=[];
      for(let i=0;i<font.glyphs.length;i++){
        const g=font.glyphs.get(i);
        let u=[];
        try{u=Array.isArray(g.unicodes)?g.unicodes:(g.unicode!=null?[g.unicode]:[])}catch(_){}
        rows.push({id:i,g,u});
      }
      $("editor").classList.remove("hide");
      $("fontName").textContent=font.getEnglishName("fullName")||font.getEnglishName("fontFamily")||f.name;
      $("fontMeta").textContent=`${font.glyphs.length} glyphs · ${ext.toUpperCase()}`;
      $("engine").textContent="Ready";
      render();
    }catch(err){
      dl.disabled=true;
      alert("Font parse করা যায়নি:\n"+err.message);
    }
  };
  r.onerror=()=>{dl.disabled=true;alert("Font file পড়তে সমস্যা হয়েছে।")};
  r.readAsArrayBuffer(f);
}

function render(){
  grid.innerHTML="";
  const q=$("search").value.toLowerCase().trim();
  let n=0;

  for(const r of rows){
    const u=r.u.map(x=>x.toString(16).toUpperCase()).join(" ");
    const hay=`${r.id} ${u} ${r.g.name||""}`.toLowerCase();
    if(q&&!hay.includes(q))continue;

    const c=document.createElement("div");
    const locked=r.id===0;
    c.className="card"+(removed.has(r.id)?" sel":"")+(locked?" lock":"");

    const cv=document.createElement("canvas");
    cv.className="cv";cv.width=172;cv.height=172;draw(cv,r.g);

    const a=document.createElement("span");a.className="gid";a.textContent="#"+r.id;
    const b=document.createElement("span");b.className="uni";b.textContent=u?"U+"+u:"—";

    c.append(cv,a,b);
    c.title=locked?"Glyph #0 (.notdef) is protected":"Click to select/remove";

    c.onclick=()=>{
      if(locked)return;
      if(removed.has(r.id))removed.delete(r.id);else removed.add(r.id);
      c.classList.toggle("sel",removed.has(r.id));
      status();
    };
    grid.appendChild(c);n++;
  }
  $("status").textContent=`Total: ${rows.length} · Selected: ${removed.size} · Showing: ${n}`;
}

function status(){
  $("status").textContent=`Total: ${rows.length} · Selected: ${removed.size} · Showing: ${grid.children.length}`;
}

function draw(cv,g){
  const x=cv.getContext("2d");
  x.clearRect(0,0,172,172);
  try{
    const b=g.getBoundingBox();
    let w=b.x2-b.x1,h=b.y2-b.y1;
    if(!w||w<1)w=500;if(!h||h<1)h=1000;
    const sc=Math.min(128/w,128/h),em=font.unitsPerEm||1000,sz=em*sc;
    const cx=(b.x1+b.x2)/2,cy=(b.y1+b.y2)/2;
    const p=g.getPath(86-cx*sc,86+cy*sc,sz);
    p.fill="#111";p.draw(x);
  }catch(e){
    x.fillStyle="#888";x.font="24px Arial";x.textAlign="center";x.fillText("?",86,94);
  }
}

async function engine(){
  if(ready)return;
  if(loading)return loading;

  loading=(async()=>{
    $("engine").textContent="Loading engine…";
    if(typeof loadPyodide!=="function")throw Error("Pyodide failed to load. Check internet connection.");
    py=await loadPyodide({indexURL:"https://cdn.jsdelivr.net/pyodide/v0.29.3/full/"});
    $("engine").textContent="Installing fontTools…";
    await py.loadPackage("micropip");
    await py.runPythonAsync(`import micropip
await micropip.install("fonttools")`);
    ready=true;$("engine").textContent="Engine ready";
  })().catch(e=>{$("engine").textContent="Engine error";throw e});
  return loading;
}

async function download(){
  if(!file||!font)return;
  if(!removed.size){alert("অন্তত একটি glyph select করুন।");return}

  dl.disabled=true;
  $("prog").classList.remove("hide");
  $("pb").style.width="8%";

  try{
    await engine();
    $("pb").style.width="30%";

    const keep=rows.filter(r=>!removed.has(r.id)).map(r=>r.id);
    const bytes=new Uint8Array(await file.arrayBuffer());

    py.globals.set("fb",bytes);
    py.globals.set("keep",JSON.stringify(keep));

    /*
      IMPORTANT:
      The old build used layout_closure=True and recommended_glyphs=True.
      That allowed fontTools to silently add some removed glyphs back.
      no_layout_closure=True tells fontTools not to expand the requested
      glyph set through GSUB/GPOS. The layout tables are still subsetted
      to the glyphs that remain, so stale references are pruned.
    */
    const result=await py.runPythonAsync(`
import io,json
from fontTools.ttLib import TTFont
from fontTools import subset

keep=json.loads(keep)

f=TTFont(
    io.BytesIO(bytes(fb)),
    recalcBBoxes=False,
    recalcTimestamp=False
)

o=subset.Options()
o.layout_closure=False
o.layout_features=["*"]
o.layout_scripts=["*"]

o.recommended_glyphs=False
o.notdef_glyph=True
o.notdef_outline=True

o.glyph_names=True
o.hinting=True
o.retain_gids=False
o.desubroutinize=False
o.recalc_average_width=True
o.recalc_timestamp=False

s=subset.Subsetter(options=o)
s.populate(gids=keep)
s.subset(f)

out=io.BytesIO()
f.save(out,reorderTables=False)
out.getvalue()
`);

    $("pb").style.width="88%";

    const data=new Uint8Array(result.toJs({create_memoryview:false}));
    result.destroy();

    const ext=file.name.toLowerCase().endsWith(".otf")?".otf":".ttf";
    const base=file.name
      .replace(/\.(ttf|otf)$/i,"")
      .replace(/[\\/:*?"<>|]+/g,"_");

    const name=`PBFF_${base}_Removed${ext}`;
    const blob=new Blob([data],{type:"font/"+ext.slice(1)});
    const url=URL.createObjectURL(blob);

    const a=document.createElement("a");
    a.href=url;a.download=name;a.style.display="none";
    document.body.appendChild(a);a.click();

    setTimeout(()=>{a.remove();URL.revokeObjectURL(url)},2500);

    $("pb").style.width="100%";
    $("engine").textContent="Download complete";

  }catch(e){
    console.error(e);
    alert("Download failed:\n\n"+(e.message||e));
    $("engine").textContent="Engine error";
  }finally{
    dl.disabled=false;
    setTimeout(()=>{
      $("prog").classList.add("hide");
      $("pb").style.width="0";
    },1000);
  }
}
