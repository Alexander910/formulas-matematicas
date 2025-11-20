// Simulación de window.storage usando localStorage
if (!window.storage) {
  window.storage = {
    async set(key, value) {
      localStorage.setItem(key, value);
    },
    async get(key) {
      const v = localStorage.getItem(key);
      return v ? { value: v } : null;
    },
    async delete(key) {
      localStorage.removeItem(key);
    },
    async list(prefix = '') {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(prefix));
      return { keys };
    }
  };
}

const fileInput = document.getElementById('fileInput');
const uploadArea = document.getElementById('uploadArea');
const selectBtn = document.getElementById('selectBtn');
const fileList = document.getElementById('fileList');
const pdfViewer = document.getElementById('pdfViewer');

let currentPdf = null;
let currentPage = 1;

/* Inicializar */
document.addEventListener('DOMContentLoaded', () => {
  bindUi();
  loadSavedFiles();
});

/* UI bindings */
function bindUi(){
  uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('dragover'); });
  uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
  uploadArea.addEventListener('drop', e => { e.preventDefault(); uploadArea.classList.remove('dragover'); handleFiles(e.dataTransfer.files); });
  uploadArea.addEventListener('click', () => fileInput.click());
  selectBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => handleFiles(e.target.files));

  // Theme toggle (simple)
  const themeToggle = document.getElementById('themeToggle');
  themeToggle && themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    themeToggle.querySelector('i').classList.toggle('fa-sun');
    themeToggle.querySelector('i').classList.toggle('fa-moon');
  });
}

/* Cargar archivos guardados (persistencia) */
async function loadSavedFiles(){
  if (!window.storage) {
    fileList.innerHTML = `<div class="muted">La API de almacenamiento no está disponible en este entorno.</div>`;
    return;
  }

  try {
    const res = await window.storage.list('pdf:');
    if (res && res.keys && res.keys.length) {
      await renderFileList();
    } else {
      fileList.innerHTML = `<div class="muted">No hay archivos guardados aún.</div>`;
    }
  } catch (err) {
    console.warn('loadSavedFiles:', err);
    fileList.innerHTML = `<div class="muted">No hay archivos guardados aún.</div>`;
  }
}

/* Manejar subida: filesList es FileList */
async function handleFiles(filesList) {
  if (!filesList || filesList.length === 0) return;
  for (const file of Array.from(filesList)) {
    if (file.type !== 'application/pdf') continue;
    const id = 'pdf:' + Date.now() + '_' + Math.random().toString(36).slice(2,10);
    const base64 = await fileToBase64(file);

    const payload = { name: file.name, data: base64, uploadDate: new Date().toISOString() };
    try {
      await window.storage.set(id, JSON.stringify(payload));
    } catch (err) {
      alert('Error al guardar: ' + (err.message || err));
    }
  }
  await renderFileList();
}

/* Convertir archivo a base64 */
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* Render lista desde storage */
async function renderFileList(){
  fileList.innerHTML = '';
  try {
    const res = await window.storage.list('pdf:');
    if (!res || !res.keys || res.keys.length === 0) {
      fileList.innerHTML = `<div class="muted">No hay archivos guardados.</div>`;
      return;
    }
    for (const key of res.keys) {
      const stored = await window.storage.get(key);
      if (!stored) continue;
      const data = JSON.parse(stored.value);
      const node = document.createElement('div');
      node.className = 'file-item';
      node.innerHTML = `
        <div>
          <div class="name">${data.name}</div>
          <div class="muted" style="font-size:12px;">${new Date(data.uploadDate).toLocaleString()}</div>
        </div>
        <div class="file-actions">
          <button class="btn" onclick="viewPDF('${key}')">Ver</button>
          <button class="btn" onclick="downloadPDF('${key}')">Descargar</button>
          <button class="btn" style="background:#ff6b6b;color:white;" onclick="deleteFile('${key}')">Eliminar</button>
        </div>
      `;
      fileList.appendChild(node);
    }
  } catch (err) {
    console.error('renderFileList:', err);
    fileList.innerHTML = `<div class="muted">Error al listar archivos.</div>`;
  }
}

/* Visualizar PDF (usa pdf.js que MathJax no provee — asumimos el runtime de tu versión anterior) */
async function viewPDF(id){
  try {
    const stored = await window.storage.get(id);
    if (!stored) return;
    const data = JSON.parse(stored.value);
    const base64 = data.data.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);

    // Cargar pdf.js desde CDN (dinámico)
    if (!window.pdfjsLib) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    currentPdf = await pdfjsLib.getDocument(bytes).promise;
    currentPage = 1;
    renderPage();
  } catch (err) {
    alert('Error al abrir PDF: ' + (err.message || err));
  }
}

async function renderPage(){
  if (!currentPdf) return;
  pdfViewer.innerHTML = `
    <div class="pdf-controls" style="display:flex;gap:8px;align-items:center;justify-content:center;margin-bottom:8px;">
      <button class="btn" ${currentPage<=1?'disabled':''} onclick="prevPage()">◀ Anterior</button>
      <div class="muted">Página ${currentPage} / ${currentPdf.numPages}</div>
      <button class="btn" ${currentPage>=currentPdf.numPages?'disabled':''} onclick="nextPage()">Siguiente ▶</button>
    </div>
    <canvas id="pdfCanvas" style="max-width:100%;border-radius:8px;"></canvas>
  `;
  const page = await currentPdf.getPage(currentPage);
  const viewport = page.getViewport({ scale: 1.3 });
  const canvas = document.getElementById('pdfCanvas');
  canvas.height = viewport.height;
  canvas.width = viewport.width;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
}

function nextPage(){ if (currentPdf && currentPage < currentPdf.numPages) { currentPage++; renderPage(); } }
function prevPage(){ if (currentPdf && currentPage > 1) { currentPage--; renderPage(); } }

/* Descargar PDF */
async function downloadPDF(id){
  try {
    const stored = await window.storage.get(id);
    if (!stored) return;
    const data = JSON.parse(stored.value);
    const a = document.createElement('a');
    a.href = data.data;
    a.download = data.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    alert('Error al descargar: ' + (err.message || err));
  }
}

/* Eliminar */
async function deleteFile(id){
  if (!confirm('¿Eliminar este archivo?')) return;
  try {
    await window.storage.delete(id);
    await renderFileList();
    pdfViewer.innerHTML = `<p class="muted">Selecciona un archivo para visualizar</p>`;
    currentPdf = null;
  } catch (err) {
    alert('Error al eliminar: ' + (err.message || err));
  }
}

/* Helper: cargar script dinámico */
function loadScript(src){
  return new Promise((res,rej)=>{
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}
