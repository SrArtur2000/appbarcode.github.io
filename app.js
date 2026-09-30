"use strict";
const $ = id => document.getElementById(id);
const CHAVE = "ecard.dados.v2", CHAVE_V1 = "ecard.registros.v1";
const ESPERA_MS = 3000;            // ignora o mesmo código de barras por este tempo
let store = {evento: "Evento 1", aparelho: "Celular 1", eventos: {}};   // uma lista de registros por evento
let registros = [];                // registros do evento atual: {numero, nome, hora, bruto, aparelho}
let editando = null;               // número em edição
let ocupado = false;
let ultimo = {texto: "", t: 0};
let lerNome = true;                // desligue para registrar só o número (mais leve)
try{ lerNome = localStorage.getItem("ecard.lerNome") !== "0"; }catch(e){}

/* ---------- armazenamento local (fica só neste celular) ---------- */
function carregar(){
  try{
    const v2 = JSON.parse(localStorage.getItem(CHAVE));
    if(v2 && v2.eventos) store = v2;
    else{                                                    // versão antiga: uma lista só
      const v1 = JSON.parse(localStorage.getItem(CHAVE_V1));
      if(Array.isArray(v1)) store.eventos[store.evento] = v1;
    }
  }catch(e){}
  registros = store.eventos[store.evento] || (store.eventos[store.evento] = []);
}
function salvar(){
  store.eventos[store.evento] = registros;
  try{ localStorage.setItem(CHAVE, JSON.stringify(store)); }catch(e){ mostrar("err","Não foi possível salvar no celular. Baixe a planilha agora.","—"); }
}
function trocarEvento(nome){
  nome = nome.trim(); if(!nome || nome === store.evento) return;
  salvar(); store.evento = nome; registros = store.eventos[nome] || (store.eventos[nome] = []);
  editando = null; salvar(); renderizar(); listarEventos();
}
function listarEventos(){ $("lista-eventos").innerHTML = Object.keys(store.eventos).map(n => `<option value="${n.replace(/"/g,"&quot;")}">`).join(""); }
const slug = t => t.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"_").replace(/^_|_$/g,"") || "x";

/* ---------- interpretação do texto do cartão ---------- */
// número USP: linha só de dígitos (6 a 9); nome: linha com letras logo acima dela
function interpretar(linhas){
  const lim = t => t.replace(/\s+/g," ").trim();
  const cand = linhas.map(l => ({y:(l.bbox.y0+l.bbox.y1)/2, t:lim(l.text)})).filter(l => l.t);
  const num = cand.filter(l => /^\d{6,9}$/.test(l.t.replace(/\s/g,""))).sort((a,b)=>a.y-b.y)[0];
  if(!num) return {numero:"", nome:""};
  const acima = cand.filter(l => l.y < num.y && /[A-Za-zÀ-ÿ]{2}/.test(l.t) && !/\d/.test(l.t) && l.t.includes(" "))
                    .sort((a,b)=>b.y-a.y)[0];
  return {numero: num.t.replace(/\s/g,"").replace(/^0+/,""), nome: acima ? acima.t : ""};
}

/* ---------- OCR (Tesseract, tudo no aparelho) ---------- */
let workerP = null;
function ocr(){
  if(!workerP){
    const base = new URL("lib/", location.href).href;
    workerP = Tesseract.createWorker("por", 1, {workerPath: base+"worker.min.js", corePath: base, langPath: base, workerBlobURL:false, gzip:true});
  }
  return workerP;
}
async function lerImagem(fonte){
  const w = await ocr();
  const r = await w.recognize(fonte, {}, {blocks:true});
  const linhas = [];
  for(const b of r.data.blocks||[]) for(const p of b.paragraphs) for(const l of p.lines) linhas.push(l);
  return interpretar(linhas);
}

/* ---------- registro ---------- */
function mostrar(classe, pequeno, nome, numero){
  const r = $("res"); r.className = classe;
  r.innerHTML = `<small></small><span class="nome"></span><span class="num"></span>`;
  r.children[0].textContent = pequeno; r.children[1].textContent = nome || ""; r.children[2].textContent = numero || "";
}
function bip(f){ try{ const a=new (window.AudioContext||window.webkitAudioContext)(), o=a.createOscillator(); o.frequency.value=f; o.connect(a.destination); o.start(); o.stop(a.currentTime+.12); }catch(e){} }
function agora(){ const d=new Date(), p=n=>String(n).padStart(2,"0"); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }

// devolve o registro criado, ou o já existente (repetido: true)
function adicionar(numero, nome, bruto, lendoNome){
  const ja = registros.find(x => x.numero === numero);
  if(ja){ mostrar("rep","Já estava registrado", ja.nome, numero); bip(400); vibrar([80,60,80]); return {reg: ja, repetido: true}; }
  const reg = {numero, nome, hora: agora(), bruto: bruto||"", aparelho: store.aparelho};
  registros.push(reg); salvar(); renderizar();
  mostrar(nome || lendoNome ? "ok" : "rep", nome ? "Registrado" : lendoNome ? "Registrado. Lendo o nome…" : "Registrado sem nome. Toque em ✎ na lista para preencher.", nome, numero);
  bip(880); vibrar(60);
  return {reg, repetido: false};
}
function vibrar(p){ try{ navigator.vibrate && navigator.vibrate(p); }catch(e){} }

async function processar(fonte, bruto){
  if(ocupado) return; ocupado = true;
  mostrar("", "Lendo o cartão…", "", "");
  try{
    const {numero, nome} = await lerImagem(fonte);
    if(numero) adicionar(numero, nome, bruto);
    else if(bruto && /\d/.test(bruto)){ adicionar(bruto.replace(/\D/g,"").replace(/^0+/,""), "", bruto); }
    else{ mostrar("err","Não achei o número USP. Aproxime e tente de novo.","",""); bip(200); }
  }catch(e){ mostrar("err","Falha na leitura: "+(e.message||e),"",""); }
  ocupado = false;
}

/* O número vem do código de barras (instantâneo); o nome é lido por OCR em
   segundo plano e só é aceito se o OCR confirmar o mesmo número no cartão. */
let fila = Promise.resolve();
function preencherNome(reg, fonte){
  fila = fila.then(async () => {
    try{
      const r = await lerImagem(fonte);
      if(r.numero !== reg.numero || !r.nome) { if(!reg.nome) mostrar("rep","Nome não lido. Escaneie de novo ou toque em ✎ na lista.", "", reg.numero); return; }
      reg.nome = r.nome; salvar(); renderizar();
      if($("res").querySelector(".num")?.textContent === reg.numero) mostrar("ok","Registrado", reg.nome, reg.numero);
    }catch(e){}
  });
}

/* ---------- lista ---------- */
function renderizar(){
  $("n").textContent = registros.length;
  const ul = $("lista"); ul.innerHTML = "";
  for(const x of registros.slice().reverse()){
    const li = document.createElement("li");
    if(editando === x.numero){
      li.className = "edita";
      li.innerHTML = `<input aria-label="Nº USP" inputmode="numeric"><input aria-label="Nome"><button type="button" class="sm">Salvar</button>`;
      const [i1,i2,b] = li.children; i1.value = x.numero; i2.value = x.nome;
      b.onclick = () => {
        const nn = i1.value.replace(/\D/g,"").replace(/^0+/,"");
        if(!nn) return;
        if(nn !== x.numero && registros.some(y=>y.numero===nn)){ mostrar("rep","Esse número já está na lista","",nn); return; }
        x.numero = nn; x.nome = i2.value.trim(); editando = null; salvar(); renderizar();
      };
    }else{
      li.innerHTML = `<span class="t"></span><span class="h"></span><button type="button" class="sm sec" aria-label="Editar">✎</button><button type="button" class="sm sec" aria-label="Remover">✕</button>`;
      li.children[0].textContent = `${x.numero} · ${x.nome || "(sem nome)"}`;
      li.children[1].textContent = x.hora.slice(11,16);
      li.children[2].onclick = () => { editando = x.numero; renderizar(); };
      li.children[3].onclick = () => { registros = registros.filter(y=>y!==x); salvar(); renderizar(); };
    }
    ul.appendChild(li);
  }
  if(!registros.length) ul.innerHTML = `<li class="vazio">Nenhum registro ainda. Aponte a câmera para o código de barras do e-Card.</li>`;
}

/* ---------- planilha ---------- */
function baixar(){
  if(!registros.length) return;
  const linhas = [["Evento","Nº USP","Nome","Data/hora","Aparelho"], ...registros.map(x=>[store.evento,x.numero,x.nome,x.hora,x.aparelho||store.aparelho])];
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  for(let i=1;i<linhas.length;i++) ws["B"+(i+1)] = {t:"s", v:linhas[i][1]};   // texto, para o Excel não alterar o número
  ws["!cols"] = [{wch:24},{wch:12},{wch:40},{wch:20},{wch:16}];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Leituras");
  const d = new Date(), nome = `presenca_${slug(store.evento)}_${slug(store.aparelho)}_${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}.xlsx`;
  const buf = XLSX.write(wb, {bookType:"xlsx", type:"array"});
  const blob = new Blob([buf], {type:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"});
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000);
}
let limpando = false;
function limpar(){
  const b = $("limpar");
  if(!limpando){ limpando = true; b.textContent = "Toque de novo para apagar este evento"; setTimeout(()=>{ limpando=false; b.textContent="Apagar este evento"; }, 4000); return; }
  registros = []; salvar(); renderizar(); limpando = false; b.textContent = "Apagar este evento";
}

/* ---------- câmera ---------- */
const LARG_OCR = 1280;   // o OCR não ganha nada com mais que isso e fica bem mais lento
function quadro(){
  const v = $("v"), k = Math.min(1, LARG_OCR / v.videoWidth), c = document.createElement("canvas");
  c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
  c.getContext("2d").drawImage(v, 0, 0, c.width, c.height); return c;
}
async function iniciarCamera(){
  if(!navigator.mediaDevices?.getUserMedia){ $("aviso").textContent = "Câmera indisponível aqui. Use “Tirar foto do e-Card”."; return; }
  const F = ZXing.BarcodeFormat;
  const dicas = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS,[F.ITF,F.CODE_128,F.CODE_39]]]);
  const leitor = new ZXing.BrowserMultiFormatReader(dicas, 120);
  try{
    await leitor.decodeFromConstraints({video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}}}, "v", res => {
      if(!res) return;
      const t = res.getText(), ag = Date.now();
      if(t === ultimo.texto && ag - ultimo.t < ESPERA_MS) return;
      ultimo = {texto:t, t:ag};
      const numero = t.replace(/\D/g,"").replace(/^0+/,"");
      if(!numero) return;
      const {reg, repetido} = adicionar(numero, "", t, lerNome);
      if(lerNome && (!repetido || !reg.nome)) preencherNome(reg, quadro());
    });
    $("aviso").hidden = true; $("capturar").disabled = false;
  }catch(e){ $("aviso").textContent = "Não abri a câmera. Permita o acesso, recarregue, ou use “Tirar foto do e-Card”."; }
}

/* ---------- início ---------- */
$("capturar").onclick = () => { if($("v").videoWidth) processar(quadro(), ""); };
$("arq").onchange = e => { const f = e.target.files[0]; if(f) processar(f, ""); e.target.value = ""; };
$("f").onsubmit = e => { e.preventDefault(); const v = $("manual").value.replace(/\D/g,"").replace(/^0+/,""); if(v){ adicionar(v, "", ""); $("manual").value = ""; } };
$("baixar").onclick = baixar; $("limpar").onclick = limpar;
$("evento").onchange = () => { trocarEvento($("evento").value); $("evento").value = store.evento; };
$("aparelho").onchange = () => { store.aparelho = $("aparelho").value.trim() || store.aparelho; $("aparelho").value = store.aparelho; salvar(); };
carregar(); $("evento").value = store.evento; $("aparelho").value = store.aparelho; listarEventos();
renderizar(); iniciarCamera();
$("nome").checked = lerNome;
$("nome").onchange = () => {
  lerNome = $("nome").checked;
  try{ localStorage.setItem("ecard.lerNome", lerNome ? "1" : "0"); }catch(e){}
  if(lerNome) ocr().catch(()=>{});
};
if(lerNome) setTimeout(()=>ocr().catch(()=>{}), 800);   // aquece o OCR em segundo plano
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
