// ============================================================
// COFRE INDIANOS - Configuração Firebase & Cloudinary
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyA8sZufnKy5GR4aw5Xq29sXnxvipMjQZlQ",
  authDomain: "cofre-e010d.firebaseapp.com",
  databaseURL: "https://cofre-e010d-default-rtdb.firebaseio.com",
  projectId: "cofre-e010d",
  storageBucket: "cofre-e010d.firebasestorage.app",
  messagingSenderId: "551335230604",
  appId: "1:551335230604:web:3213c472257fe9007e4fa9",
};

// ⚠️ PREENCHA AQUI COM OS DADOS DO SEU CLOUDINARY:
const CLOUDINARY_CLOUD_NAME = "nojdy9nl"; 
const CLOUDINARY_UPLOAD_PRESET = "f3lufesy";

const EMAIL_DONO = "dono@cofre.indianos";
const TAMANHO_MAXIMO_ARQUIVO = 700 * 1024;

// ============================================================
// Firebase Imports
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy, where,
  serverTimestamp, deleteDoc, doc, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getDatabase, ref, push, get, remove, serverTimestamp as rtdbServerTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const dbRT = getDatabase(app);

// ============================================================
// Sistema de Criptografia Web Crypto API (AES-GCM)
// ============================================================
const CHAVE_CRIPTOGRAFIA_LOCAL = "CofreSeguroIndianosChave2026"; // Altere para sua chave secreta

async function obterChaveCrypto() {
  const enc = new TextEncoder();
  const rawKey = enc.encode(CHAVE_CRIPTOGRAFIA_LOCAL.padEnd(32, '0').slice(0, 32));
  return await crypto.subtle.importKey(
    "raw", rawKey, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
  );
}

async function criptografarTexto(texto) {
  if (!texto) return "";
  const key = await obterChaveCrypto();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv }, key, enc.encode(texto)
  );
  const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');
  const contentHex = Array.from(new Uint8Array(encrypted)).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${ivHex}:${contentHex}`;
}

async function descriptografarTexto(dadosCriptografados) {
  try {
    if (!dadosCriptografados || !dadosCriptografados.includes(':')) return dadosCriptografados;
    const [ivHex, contentHex] = dadosCriptografados.split(':');
    const iv = new Uint8Array(ivHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const encrypted = new Uint8Array(contentHex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
    const key = await obterChaveCrypto();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv }, key, encrypted
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return "[Erro ao descriptografar: Chave incorreta]";
  }
}

// ============================================================
// Elementos da tela
// ============================================================
const telaSenha = document.getElementById("tela-senha");
const telaCofre = document.getElementById("tela-cofre");
const inputSenha = document.getElementById("input-senha");
const btnEntrar = document.getElementById("btn-entrar");
const msgIndianos = document.getElementById("msg-indianos");

let tentativasErradas = 0;

// ============================================================
// Login / Bloqueio
// ============================================================
btnEntrar.addEventListener("click", tentarEntrar);
inputSenha.addEventListener("keydown", (e) => { if (e.key === "Enter") tentarEntrar(); });

async function tentarEntrar() {
  const senha = inputSenha.value;
  if (!senha) return;
  btnEntrar.disabled = true;
  msgIndianos.textContent = "Verificando a senha...";
  try {
    await signInWithEmailAndPassword(auth, EMAIL_DONO, senha);
  } catch (erro) {
    tentativasErradas++;
    registrarAlerta(`Tentativa de senha errada (nº ${tentativasErradas} desta sessão)`);
    if (erro.code === "auth/too-many-requests") {
      msgIndianos.textContent = "Muitas tentativas erradas. Acesso bloqueado temporariamente.";
    } else {
      msgIndianos.textContent = "Senha incorreta. Acesso negado.";
    }
    inputSenha.value = "";
  } finally {
    btnEntrar.disabled = false;
  }
}

onAuthStateChanged(auth, (usuario) => {
  if (usuario) {
    telaSenha.classList.add("escondido");
    telaCofre.classList.remove("escondido");
    carregarNotas();
    carregarLixeira();
    carregarArquivos();
    carregarAlertas();
    carregarGaleriaCloudinary();
  } else {
    telaSenha.classList.remove("escondido");
    telaCofre.classList.add("escondido");
  }
});

document.getElementById("btn-sair").addEventListener("click", () => signOut(auth));

async function registrarAlerta(motivo) {
  try {
    await addDoc(collection(db, "alertas_seguranca"), {
      motivo,
      criado_em: serverTimestamp(),
      user_agent: navigator.userAgent,
    });
  } catch (e) {
    console.warn("[Cofre] Não consegui registrar o alerta:", e);
  }
}

// ============================================================
// Notas Criptografadas com Sistema de Lixeira (Soft Delete)
// ============================================================
const btnSalvarNota = document.getElementById("btn-salvar-nota");
if (btnSalvarNota) btnSalvarNota.addEventListener("click", salvarNota);

async function salvarNota() {
  const tituloEl = document.getElementById("nota-titulo");
  const conteudoEl = document.getElementById("nota-conteudo");
  const conteudo = conteudoEl.value.trim();
  if (!conteudo) return;

  const conteudoCriptografado = await criptografarTexto(conteudo);
  const tituloCriptografado = await criptografarTexto(tituloEl.value.trim() || "(sem título)");

  await addDoc(collection(db, "arquivos_texto"), {
    titulo: tituloCriptografado,
    conteudo: conteudoCriptografado,
    na_lixeira: false,
    criado_em: serverTimestamp(),
  });
  
  tituloEl.value = "";
  conteudoEl.value = "";
  carregarNotas();
}

async function carregarNotas() {
  const lista = document.getElementById("lista-notas");
  if (!lista) return;
  lista.textContent = "Carregando...";
  
  const q = query(
    collection(db, "arquivos_texto"),
    where("na_lixeira", "==", false),
    orderBy("criado_em", "desc")
  );
  
  const snap = await getDocs(q);
  lista.innerHTML = "";
  if (snap.empty) {
    lista.textContent = "Nenhuma nota ativa.";
    return;
  }
  
  for (const docSnap of snap.docs) {
    const nota = docSnap.data();
    const tituloDescriptografado = await descriptografarTexto(nota.titulo);
    const conteudoDescriptografado = await descriptografarTexto(nota.conteudo);

    const item = document.createElement("div");
    item.className = "item-nota";
    const titulo = document.createElement("strong");
    titulo.textContent = tituloDescriptografado;
    const corpo = document.createElement("p");
    corpo.textContent = conteudoDescriptografado;
    
    const linhaAcoes = document.createElement("div");
    linhaAcoes.className = "linha-acoes";
    const btnDel = document.createElement("button");
    btnDel.textContent = "Mover para Lixeira";
    btnDel.onclick = async () => {
      await updateDoc(doc(db, "arquivos_texto", docSnap.id), { na_lixeira: true });
      carregarNotas();
      carregarLixeira();
    };
    
    linhaAcoes.appendChild(btnDel);
    item.append(titulo, corpo, linhaAcoes);
    lista.appendChild(item);
  }
}

async function carregarLixeira() {
  const lista = document.getElementById("lista-lixeira");
  if (!lista) return;
  lista.textContent = "Carregando lixeira...";

  const q = query(
    collection(db, "arquivos_texto"),
    where("na_lixeira", "==", true),
    orderBy("criado_em", "desc")
  );

  const snap = await getDocs(q);
  lista.innerHTML = "";
  if (snap.empty) {
    lista.textContent = "Lixeira vazia.";
    return;
  }

  for (const docSnap of snap.docs) {
    const nota = docSnap.data();
    const tituloDescriptografado = await descriptografarTexto(nota.titulo);

    const item = document.createElement("div");
    item.className = "item-lixeira";
    const titulo = document.createElement("span");
    titulo.textContent = tituloDescriptografado;

    const btnRestaurar = document.createElement("button");
    btnRestaurar.textContent = "Restaurar";
    btnRestaurar.onclick = async () => {
      await updateDoc(doc(db, "arquivos_texto", docSnap.id), { na_lixeira: false });
      carregarNotas();
      carregarLixeira();
    };

    const btnExcluirPerm = document.createElement("button");
    btnExcluirPerm.textContent = "Excluir Definitivamente";
    btnExcluirPerm.onclick = async () => {
      await deleteDoc(doc(db, "arquivos_texto", docSnap.id));
      carregarLixeira();
    };

    item.append(titulo, btnRestaurar, btnExcluirPerm);
    lista.appendChild(item);
  }
}

// ============================================================
// Armazenamento de Fotos Gratuitas via Cloudinary
// ============================================================
const inputImagemCloudinary = document.getElementById("input-imagem-cloudinary");
if (inputImagemCloudinary) {
  inputImagemCloudinary.addEventListener("change", async (evento) => {
    const arquivo = evento.target.files[0];
    evento.target.value = "";
    if (!arquivo) return;

    const formData = new FormData();
    formData.append("file", arquivo);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

    try {
      const resp = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: "POST",
        body: formData,
      });

      if (!resp.ok) throw new Error("Falha no upload para o Cloudinary");

      const dados = await resp.json();
      
      await addDoc(collection(db, "galeria_fotos"), {
        url: dados.secure_url,
        public_id: dados.public_id,
        criado_em: serverTimestamp(),
      });

      carregarGaleriaCloudinary();
    } catch (e) {
      alert("Erro ao enviar a imagem. Verifique as credenciais do Cloudinary.");
      console.error(e);
    }
  });
}

async function carregarGaleriaCloudinary() {
  const galeria = document.getElementById("galeria-fotos");
  if (!galeria) return;
  galeria.textContent = "Carregando imagens...";

  const q = query(collection(db, "galeria_fotos"), orderBy("criado_em", "desc"));
  const snap = await getDocs(q);
  galeria.innerHTML = "";

  if (snap.empty) {
    galeria.textContent = "Nenhuma foto armazenada.";
    return;
  }

  snap.forEach((docSnap) => {
    const foto = docSnap.data();
    const container = document.createElement("div");
    container.className = "item-foto";

    const img = document.createElement("img");
    img.src = foto.url;
    img.style.width = "150px";
    img.style.borderRadius = "8px";

    const btnDel = document.createElement("button");
    btnDel.textContent = "Excluir";
    btnDel.onclick = async () => {
      await deleteDoc(doc(db, "galeria_fotos", docSnap.id));
      carregarGaleriaCloudinary();
    };

    container.append(img, btnDel);
    galeria.appendChild(container);
  });
}

// ============================================================
// Arquivos Locais (Realtime Database)
// ============================================================
const inputArquivo = document.getElementById("input-arquivo");
if (inputArquivo) {
  inputArquivo.addEventListener("change", async (evento) => {
    const arquivo = evento.target.files[0];
    evento.target.value = "";
    if (!arquivo) return;

    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
      alert(`O arquivo excede o limite local de ${(TAMANHO_MAXIMO_ARQUIVO / 1024).toFixed(0)} KB.`);
      return;
    }

    const base64Completo = await lerArquivoComoBase64(arquivo);
    const base64Puro = base64Completo.split(",")[1];

    await push(ref(dbRT, "arquivos"), {
      nome: arquivo.name,
      tipo: arquivo.type || "application/octet-stream",
      tamanho: arquivo.size,
      conteudo_base64: base64Puro,
      criado_em: rtdbServerTimestamp(),
    });
    carregarArquivos();
  });
}

function lerArquivoComoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(arquivo);
  });
}

async function carregarArquivos() {
  const lista = document.getElementById("lista-arquivos");
  if (!lista) return;
  lista.textContent = "Carregando...";
  const snap = await get(ref(dbRT, "arquivos"));
  lista.innerHTML = "";
  if (!snap.exists()) {
    lista.textContent = "Nenhum arquivo ainda.";
    return;
  }
  const entradas = [];
  snap.forEach((filho) => { entradas.push({ chave: filho.key, ...filho.val() }); });
  entradas.sort((a, b) => (b.criado_em || 0) - (a.criado_em || 0));

  entradas.forEach((arquivo) => {
    const linha = document.createElement("div");
    linha.className = "item-arquivo";
    const link = document.createElement("a");
    link.href = `data:${arquivo.tipo};base64,${arquivo.conteudo_base64}`;
    link.download = arquivo.nome;
    link.textContent = `${arquivo.nome} (${(arquivo.tamanho / 1024).toFixed(0)} KB)`;
    const btnDel = document.createElement("button");
    btnDel.textContent = "Excluir";
    btnDel.onclick = async () => { await remove(ref(dbRT, `arquivos/${arquivo.chave}`)); carregarArquivos(); };
    linha.append(link, btnDel);
    lista.appendChild(linha);
  });
}

// ============================================================
// Alertas de Segurança
// ============================================================
async function carregarAlertas() {
  const lista = document.getElementById("lista-alertas");
  if (!lista) return;
  lista.textContent = "Carregando...";
  const q = query(collection(db, "alertas_seguranca"), orderBy("criado_em", "desc"));
  const snap = await getDocs(q);
  lista.innerHTML = "";
  if (snap.empty) {
    lista.textContent = "Nenhum alerta registrado.";
    return;
  }
  snap.forEach((docSnap) => {
    const alerta = docSnap.data();
    const quando = alerta.criado_em ? alerta.criado_em.toDate().toLocaleString("pt-BR") : "agora há pouco";
    const linha = document.createElement("div");
    linha.className = "item-alerta";
    linha.textContent = `${alerta.motivo} — ${quando}`;
    lista.appendChild(linha);
  });
}
