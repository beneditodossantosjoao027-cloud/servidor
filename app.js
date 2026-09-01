// ============================================================
// COFRE INDIANOS - configuração
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

const EMAIL_DONO = "dono@cofre.indianos";
const TAMANHO_MAXIMO_ARQUIVO = 700 * 1024;

// ---------- Chat com o Indianos via Gemini ----------
const CHAVES_GEMINI = [
  "AQ.Ab8RN6LZLe9-DAPkMGxmIu3G3j9VyhJPmvzfLLKCs-X3skxFFg",
  "AQ.Ab8RN6KGOBB2_J4nUrqY7kb4zhOZFTwHivwTkrK4ZXLej40QUA",
  "AQ.Ab8RN6KU7ppnVOJnLF4L7WV7f1bie0Ct6rFsO-T31lOSw8iRlw"
];
const MODELOS_GEMINI = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];
const COMBOS_GEMINI = CHAVES_GEMINI.flatMap((chave) => MODELOS_GEMINI.map((modelo) => [chave, modelo]));
let indiceComboAtual = 0;

let falarAtivado = true;

// ============================================================
// Firebase Imports
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs, query, orderBy,
  serverTimestamp, deleteDoc, doc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getDatabase, ref, push, get, remove, serverTimestamp as rtdbServerTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const dbRT = getDatabase(app);

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
// Bolinha de status
// ============================================================
const CORES_ESTADO = {
  espera: "#00e5e5",
  ouvindo: "#ff7a1f",
  processando: "#e8c547",
  falando: "#2ecc71",
};

function atualizarEstadoIndianos(estado) {
  const bolinha = document.getElementById("bolinha-status");
  if (!bolinha) return;
  bolinha.style.background = CORES_ESTADO[estado] || CORES_ESTADO.espera;
  bolinha.style.boxShadow = `0 0 14px ${CORES_ESTADO[estado] || CORES_ESTADO.espera}`;
  bolinha.classList.toggle("pulsando", estado !== "espera");
}

// ============================================================
// Login / bloqueio
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
      msgIndianos.textContent = "Muitas tentativas erradas. Acesso bloqueado por um tempo — tenta de novo daqui a pouco.";
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
    atualizarEstadoIndianos("espera");
    carregarNotas();
    carregarArquivos();
    carregarAlertas();
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
// Notas / diário
// ============================================================
document.getElementById("btn-salvar-nota").addEventListener("click", salvarNota);

async function salvarNota() {
  const tituloEl = document.getElementById("nota-titulo");
  const conteudoEl = document.getElementById("nota-conteudo");
  const conteudo = conteudoEl.value.trim();
  if (!conteudo) return;
  await addDoc(collection(db, "arquivos_texto"), {
    titulo: tituloEl.value.trim() || "(sem título)",
    conteudo,
    criado_em: serverTimestamp(),
  });
  tituloEl.value = "";
  conteudoEl.value = "";
  carregarNotas();
}

async function carregarNotas() {
  const lista = document.getElementById("lista-notas");
  lista.textContent = "Carregando...";
  const q = query(collection(db, "arquivos_texto"), orderBy("criado_em", "desc"));
  const snap = await getDocs(q);
  lista.innerHTML = "";
  if (snap.empty) {
    lista.textContent = "Nenhuma nota ainda.";
    return;
  }
  snap.forEach((docSnap) => {
    const nota = docSnap.data();
    const item = document.createElement("div");
    item.className = "item-nota";
    const titulo = document.createElement("strong");
    titulo.textContent = nota.titulo;
    const corpo = document.createElement("p");
    corpo.textContent = nota.conteudo;
    const linhaAcoes = document.createElement("div");
    linhaAcoes.className = "linha-acoes";
    const btnDel = document.createElement("button");
    btnDel.textContent = "Excluir";
    btnDel.onclick = async () => {
      await deleteDoc(doc(db, "arquivos_texto", docSnap.id));
      carregarNotas();
    };
    linhaAcoes.appendChild(btnDel);
    item.append(titulo, corpo, linhaAcoes);
    lista.appendChild(item);
  });
}

// ============================================================
// Arquivos
// ============================================================
document.getElementById("input-arquivo").addEventListener("change", async (evento) => {
  const arquivo = evento.target.files[0];
  evento.target.value = "";
  if (!arquivo) return;

  if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) {
    alert(
      `Esse arquivo tem ${(arquivo.size / 1024).toFixed(0)} KB. ` +
      `O limite aqui é ${(TAMANHO_MAXIMO_ARQUIVO / 1024).toFixed(0)} KB.`
    );
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
// Alertas de segurança
// ============================================================
async function carregarAlertas() {
  const lista = document.getElementById("lista-alertas");
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

// ============================================================
// Chamada unificada ao Gemini (Atualizada para x-goog-api-key)
// ============================================================
async function chamarGemini(payload) {
  if (COMBOS_GEMINI.length === 0) return null;
  const tentativas = COMBOS_GEMINI.length * 2;
  for (let i = 0; i < tentativas; i++) {
    const [chave, modelo] = COMBOS_GEMINI[indiceComboAtual];
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`;
    try {
      const resposta = await fetch(url, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "x-goog-api-key": chave
        },
        body: JSON.stringify(payload),
      });
      if (resposta.status === 429) {
        indiceComboAtual = (indiceComboAtual + 1) % COMBOS_GEMINI.length;
        continue;
      }
      if (!resposta.ok) {
        console.warn(`[Gemini] Erro HTTP ${resposta.status}`);
        return null;
      }
      const dados = await resposta.json();
      return dados?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (e) {
      console.warn("[Gemini] Falha de conexão:", e);
    }
  }
  return null;
}

// ============================================================
// Voz: ouvir e falar
// ============================================================
const ReconhecimentoDeVoz = window.SpeechRecognition || window.webkitSpeechRecognition;
let reconhecedor = null;
if (ReconhecimentoDeVoz) {
  reconhecedor = new ReconhecimentoDeVoz();
  reconhecedor.lang = "pt-BR";
  reconhecedor.continuous = false;
  reconhecedor.interimResults = false;

  reconhecedor.onstart = () => atualizarEstadoIndianos("ouvindo");
  reconhecedor.onerror = () => atualizarEstadoIndianos("espera");
  reconhecedor.onend = () => atualizarEstadoIndianos("espera");
  reconhecedor.onresult = (evento) => {
    const texto = evento.results[0][0].transcript;
    document.getElementById("input-chat").value = "";
    adicionarBalao("voce", texto);
    processarComando(texto);
  };
}

const btnMicrofone = document.getElementById("btn-microfone");
if (btnMicrofone) {
  if (!reconhecedor) {
    btnMicrofone.disabled = true;
    btnMicrofone.title = "Seu navegador não suporta reconhecimento de voz (funciona no Chrome/Edge)";
  } else {
    btnMicrofone.addEventListener("click", () => reconhecedor.start());
  }
}

const checkFalar = document.getElementById("check-falar");
if (checkFalar) {
  checkFalar.checked = falarAtivado;
  checkFalar.addEventListener("change", () => { falarAtivado = checkFalar.checked; });
}

function falarTexto(texto) {
  if (!falarAtivado || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const fala = new SpeechSynthesisUtterance(texto);
  fala.lang = "pt-BR";
  fala.rate = 1.05;
  fala.pitch = 0.9;
  fala.onstart = () => atualizarEstadoIndianos("falando");
  fala.onend = () => atualizarEstadoIndianos("espera");
  window.speechSynthesis.speak(fala);
}

// ============================================================
// Geração de imagem
// ============================================================
async function gerarImagemChat(descricao) {
  adicionarBalao("indianos", "Gerando imagem...");
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(descricao)}?width=768&height=768&nologo=true`;
  const historico = document.getElementById("historico-chat");
  const ultimoBalao = historico.querySelectorAll(".balao-indianos");
  const balaoAtual = ultimoBalao[ultimoBalao.length - 1];
  const img = document.createElement("img");
  img.src = url;
  img.alt = descricao;
  img.className = "imagem-gerada";
  img.onerror = () => { balaoAtual.textContent = "Não consegui gerar a imagem agora."; };
  img.onload = () => { balaoAtual.textContent = ""; balaoAtual.appendChild(img); };
}

// ============================================================
// Roteador de comandos
// ============================================================
const GATILHOS_ESCRITA_LITERAL = [
  "escreve exatamente", "escreva exatamente", "escreve literalmente",
  "escreva literalmente", "anota exatamente", "escreve exato", "escreva exato",
];

async function processarComando(textoOriginal) {
  const texto = textoOriginal.trim();
  const textoMin = texto.toLowerCase();
  if (!texto) return;

  atualizarEstadoIndianos("processando");

  const gatilhoLiteral = GATILHOS_ESCRITA_LITERAL.find((g) => textoMin.includes(g));
  if (gatilhoLiteral) {
    const idx = textoMin.indexOf(gatilhoLiteral) + gatilhoLiteral.length;
    const conteudo = texto.slice(idx).trim().replace(/^[:.\s]+/, "");
    await addDoc(collection(db, "arquivos_texto"), {
      titulo: "(escrito exatamente)", conteudo, criado_em: serverTimestamp(),
    });
    carregarNotas();
    adicionarBalao("indianos", `Escrevi exatamente: ${conteudo}`);
    falarTexto(`Escrevi exatamente: ${conteudo}`);
    atualizarEstadoIndianos("espera");
    return;
  }
  if (["anota", "anote", "escreve", "escreva", "salva no bloco"].some((g) => textoMin.includes(g))) {
    const pedidoIA = (
      `O usuário pediu para escrever isto no bloco de notas: '${texto}'. ` +
      "Gere APENAS o conteúdo final e completo que deve ser escrito, sem " +
      "introduções, sem explicações e sem comentários — só o conteúdo puro."
    );
    const conteudoGerado = await chamarGemini({ contents: [{ parts: [{ text: pedidoIA }] }] });
    if (!conteudoGerado) {
      adicionarBalao("indianos", "Não consegui gerar o conteúdo agora (sem chave do Gemini configurada?).");
      atualizarEstadoIndianos("espera");
      return;
    }
    await addDoc(collection(db, "arquivos_texto"), {
      titulo: "(gerado pela IA)", conteudo: conteudoGerado, criado_em: serverTimestamp(),
    });
    carregarNotas();
    adicionarBalao("indianos", "Escrevi no bloco de notas.");
    falarTexto("Escrevi no bloco de notas.");
    atualizarEstadoIndianos("espera");
    return;
  }

  if (["gera uma imagem", "gerar imagem", "cria uma imagem", "desenha"].some((g) => textoMin.includes(g))) {
    await gerarImagemChat(texto);
    falarTexto("Pronto, gerei a imagem.");
    atualizarEstadoIndianos("espera");
    return;
  }

  const resposta = await chamarGemini({
    contents: [
      { role: "user", parts: [{ text: "Você é o Indianos, uma IA que gerencia o cofre pessoal do seu criador." }] },
      { role: "model", parts: [{ text: "Entendido, estou pronto." }] },
      { role: "user", parts: [{ text: texto }] },
    ],
  });
  const textoResposta = resposta || "Chat desativado — nenhuma chave do Gemini respondeu com sucesso.";
  adicionarBalao("indianos", textoResposta);
  falarTexto(textoResposta);
  atualizarEstadoIndianos("espera");
}

// ============================================================
// Chat
// ============================================================
document.getElementById("btn-enviar-chat").addEventListener("click", enviarMensagemChat);
document.getElementById("input-chat").addEventListener("keydown", (e) => {
  if (e.key === "Enter") enviarMensagemChat();
});

async function enviarMensagemChat() {
  const campo = document.getElementById("input-chat");
  const texto = campo.value.trim();
  if (!texto) return;
  campo.value = "";
  adicionarBalao("voce", texto);
  await processarComando(texto);
}

function adicionarBalao(quem, texto) {
  const historico = document.getElementById("historico-chat");
  const balao = document.createElement("div");
  balao.className = `balao balao-${quem}`;
  balao.textContent = texto;
  historico.appendChild(balao);
  historico.scrollTop = historico.scrollHeight;
}
