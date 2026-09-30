"use strict";
const $ = id => document.getElementById(id);
const CHAVE = "ecard.dados.v2";
const ESPERA_MS = 3000;            // ignora o mesmo código de barras por este tempo
let store = {evento: "Evento 1", eventos: {}};   // uma lista de registros por evento
let registros = [];                // registros do evento atual: {numero, hora}
let ultimo = {texto: "", t: 0};

/* ---------- armazenamento local (fica só neste celular) ---------- */
function carregar(){
  try{ const v = JSON.parse(localStorage.getItem(CHAVE)); if(v && v.eventos) store = v; }catch(e){}
  registros = store.eventos[store.evento] || (store.eventos[store.evento] = []);
}
function salvar(){
  store.eventos[store.evento] = registros;
  try{ localStorage.setItem(CHAVE, JSON.stringify(store)); }catch(e){ mostrar("err","Não foi possível salvar no celular. Baixe a planilha agora.",""); }
}
function trocarEvento(nome){
  nome = nome.trim(); if(!nome || nome === store.evento) return;
  salvar(); store.evento = nome; registros = store.eventos[nome] || (store.eventos[nome] = []);
  salvar(); renderizar(); listarEventos();
}
function listarEventos(){ $("lista-eventos").innerHTML = Object.keys(store.eventos).map(n => `<option value="${n.replace(/"/g,"&quot;")}">`).join(""); }
const slug = t => t.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[^A-Za-z0-9]+/g,"_").replace(/^_|_$/g,"") || "x";

/* ---------- registro ---------- */
function mostrar(classe, pequeno, numero){
  const r = $("res"); r.className = classe;
  r.innerHTML = `<small></small><span class="num"></span>`;
  r.children[0].textContent = pequeno; r.children[1].textContent = numero || "";
}
function bip(f){ try{ const a=new (window.AudioContext||window.webkitAudioContext)(), o=a.createOscillator(); o.frequency.value=f; o.connect(a.destination); o.start(); o.stop(a.currentTime+.12); }catch(e){} }
function vibrar(p){ try{ navigator.vibrate && navigator.vibrate(p); }catch(e){} }
function agora(){ const d=new Date(), p=n=>String(n).padStart(2,"0"); return `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }

function adicionar(numero){
  if(registros.some(x => x.numero === numero)){ mostrar("rep","Já estava registrado", numero); bip(400); vibrar([80,60,80]); return; }
  registros.push({numero, hora: agora()}); salvar(); renderizar();
  mostrar("ok","Registrado", numero); bip(880); vibrar(60);
}
const soNumero = t => t.replace(/\D/g,"").replace(/^0+/,"");

/* ---------- lista ---------- */
function renderizar(){
  $("n").textContent = registros.length;
  const ul = $("lista"); ul.innerHTML = "";
  for(const x of registros.slice().reverse()){
    const li = document.createElement("li");
    li.innerHTML = `<span class="t"></span><span class="h"></span><button type="button" class="sm sec" aria-label="Remover">✕</button>`;
    li.children[0].textContent = x.numero;
    li.children[1].textContent = x.hora.slice(11,16);
    li.children[2].onclick = () => { registros = registros.filter(y=>y!==x); salvar(); renderizar(); };
    ul.appendChild(li);
  }
  if(!registros.length) ul.innerHTML = `<li class="vazio">Nenhum registro ainda. Aponte a câmera para o código de barras do e-Card.</li>`;
}

/* ---------- planilha ---------- */
function baixar(){
  if(!registros.length) return;
  const linhas = [["Evento","Nº USP","Data/hora"], ...registros.map(x=>[store.evento,x.numero,x.hora])];
  const ws = XLSX.utils.aoa_to_sheet(linhas);
  for(let i=1;i<linhas.length;i++) ws["B"+(i+1)] = {t:"s", v:linhas[i][1]};   // texto, para o Excel não alterar o número
  ws["!cols"] = [{wch:24},{wch:12},{wch:20}];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Leituras");
  const d = new Date(), p = n => String(n).padStart(2,"0");
  const nome = `presenca_${slug(store.evento)}_${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}.xlsx`;
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

/* ---------- câmera e leitura do código de barras ---------- */
function aoLer(texto){
  const ag = Date.now();
  if(texto === ultimo.texto && ag - ultimo.t < ESPERA_MS) return;
  ultimo = {texto, t: ag};
  const numero = soNumero(texto);
  if(numero) adicionar(numero);
}
const RES = {facingMode:{ideal:"environment"}, width:{ideal:1280}, height:{ideal:720}};

// Detector nativo do navegador (Chrome/Android): bem mais rápido que a biblioteca.
async function iniciarNativo(){
  if(!("BarcodeDetector" in window)) return false;
  const formatos = (await BarcodeDetector.getSupportedFormats()).filter(f => ["itf","code_128","code_39"].includes(f));
  if(!formatos.includes("itf")) return false;
  const det = new BarcodeDetector({formats: formatos}), v = $("v");
  v.srcObject = await navigator.mediaDevices.getUserMedia({video: RES});
  await v.play();
  let lendo = false;
  setInterval(async () => {
    if(lendo || v.readyState < 2) return; lendo = true;
    try{ const r = await det.detect(v); if(r.length) aoLer(r[0].rawValue); }catch(e){}
    lendo = false;
  }, 80);
  return true;
}
// Alternativa: biblioteca ZXing.
async function iniciarZXing(){
  const F = ZXing.BarcodeFormat;
  const dicas = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS,[F.ITF,F.CODE_128,F.CODE_39]]]);
  const leitor = new ZXing.BrowserMultiFormatReader(dicas, 100);
  await leitor.decodeFromConstraints({video: RES}, "v", res => { if(res) aoLer(res.getText()); });
}
async function iniciarCamera(){
  if(!navigator.mediaDevices?.getUserMedia){ $("aviso").textContent = "Câmera indisponível. Abra pelo endereço https:// do app."; return; }
  try{
    let ok = false;
    try{ ok = await iniciarNativo(); }catch(e){ ok = false; }
    if(!ok) await iniciarZXing();
    $("aviso").hidden = true;
  }catch(e){ $("aviso").textContent = "Não abri a câmera. Permita o acesso e recarregue a página."; }
}

/* ---------- início ---------- */
$("f").onsubmit = e => { e.preventDefault(); const v = soNumero($("manual").value); if(v){ adicionar(v); $("manual").value = ""; } };
$("baixar").onclick = baixar; $("limpar").onclick = limpar;
$("evento").onchange = () => { trocarEvento($("evento").value); $("evento").value = store.evento; };
carregar(); $("evento").value = store.evento; listarEventos();
renderizar(); iniciarCamera();
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(()=>{});
