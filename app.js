/* =========================================================
   MergePaper — full app
   - Router (view switching)
   - Merge PDFs
   - Edit pages (reorder / rotate / delete)
   - Add text & signature
   - Compress (rasterize images)
   - Split (per page / ranges)
   ========================================================= */

const $  = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

const uid = () => Math.random().toString(36).slice(2, 10);
const fmtBytes = (b) => {
  if (b < 1024) return `${b} B`;
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 ** 2).toFixed(2)} MB`;
};
const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
};
const showStatus = (el, msg, type = "processing") => {
  el.hidden = false;
  el.className = `status ${type}`;
  el.innerHTML = type === "processing"
    ? `<span class="spinner"></span><span>${msg}</span>`
    : `<span>${msg}</span>`;
};
const hideStatus = (el) => { el.hidden = true; el.innerHTML = ""; };

/* =========================================================
   ROUTER
   ========================================================= */
const VIEWS = ["home", "merge", "edit-hub", "edit-pages", "edit-text", "edit-compress", "edit-split"];

function showView(name) {
  if (!VIEWS.includes(name)) name = "home";
  VIEWS.forEach((v) => {
    const el = $(`#view-${v}`);
    if (el) el.hidden = (v !== name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
  /* Update hash safely. In sandboxed iframes (e.g. about:srcdoc) replaceState
     throws SecurityError, so we wrap it and fall back to a no-op. */
  try {
    if (window.location.protocol !== "about:" && window.self === window.top) {
      history.replaceState(null, "", `#${name}`);
    }
  } catch (_) { /* ignore — sandboxed preview */ }
}

document.addEventListener("click", (e) => {
  const trigger = e.target.closest("[data-view]");
  if (trigger) {
    e.preventDefault();
    showView(trigger.dataset.view);
  }
});

/* Initial view from hash (safe-read) */
window.addEventListener("DOMContentLoaded", () => {
  let initial = "home";
  try {
    const h = (location.hash || "").slice(1);
    if (h && VIEWS.includes(h)) initial = h;
  } catch (_) { /* ignore */ }
  showView(initial);
});

/* Generic browse triggers (any button with .browse-trigger and data-target) */
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".browse-trigger");
  if (btn && btn.dataset.target) {
    e.stopPropagation();
    const inp = document.getElementById(btn.dataset.target);
    if (inp) inp.click();
  }
});

/* Generic drop zone helper */
function setupDropZone(zone, input, onFiles) {
  zone.addEventListener("click", (e) => {
    if (e.target.closest(".link-btn") || e.target.closest(".browse-trigger")) return;
    input.click();
  });
  zone.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  ["dragenter", "dragover"].forEach((ev) => {
    zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag-over"); });
  });
  ["dragleave", "drop"].forEach((ev) => {
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === "dragleave" && zone.contains(e.relatedTarget)) return;
      zone.classList.remove("drag-over");
    });
  });
  zone.addEventListener("drop", (e) => {
    if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
  });
  input.addEventListener("change", (e) => {
    if (e.target.files?.length) onFiles(e.target.files);
    input.value = "";
  });
}

const isPdf = (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");

/* =========================================================
   MERGE
   ========================================================= */
const mergeState = { files: [], lastBlob: null, lastName: null, dragSrc: null };

const mergeDropZone   = $("#mergeDropZone");
const mergeFileInput  = $("#mergeFileInput");
const mergeFileSection= $("#mergeFileSection");
const mergeListEl     = $("#mergeList");
const mergeCountEl    = $("#mergeCount");
const mergeClearBtn   = $("#mergeClearBtn");
const mergeBtn        = $("#mergeBtn");
const mergeStatus     = $("#mergeStatus");
const mergeResult     = $("#mergeResult");
const mergeResultMeta = $("#mergeResultMeta");
const mergeDownloadBtn= $("#mergeDownloadBtn");
const mergeEditBtn    = $("#mergeEditBtn");

setupDropZone(mergeDropZone, mergeFileInput, (files) => {
  const pdfs = Array.from(files).filter(isPdf);
  if (pdfs.length === 0) {
    showStatus(mergeStatus, "Hanya fail PDF dibenarkan.", "error");
    setTimeout(() => hideStatus(mergeStatus), 2500);
    return;
  }
  pdfs.forEach((f) => mergeState.files.push({ id: uid(), file: f }));
  renderMergeList();
  hideStatus(mergeStatus);
  mergeResult.hidden = true;
});

function renderMergeList() {
  const arr = mergeState.files;
  mergeCountEl.textContent = arr.length;
  mergeFileSection.hidden = arr.length === 0;
  mergeListEl.innerHTML = "";

  arr.forEach(({ id, file }) => {
    const li = document.createElement("li");
    li.className = "file-item"; li.draggable = true; li.dataset.id = id;
    li.innerHTML = `
      <span class="drag-handle" aria-hidden="true"></span>
      <div class="file-icon">PDF</div>
      <div class="file-info">
        <div class="file-name" title="${file.name}">${file.name}</div>
        <div class="file-meta">${fmtBytes(file.size)}</div>
      </div>
      <button class="remove-btn" type="button" aria-label="Buang fail" data-id="${id}">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" />
        </svg>
      </button>`;
    li.addEventListener("dragstart", (e) => {
      mergeState.dragSrc = id; li.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    li.addEventListener("dragend", () => {
      li.classList.remove("dragging");
      $$(".file-item").forEach((n) => n.classList.remove("drag-over-item"));
      mergeState.dragSrc = null;
    });
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (mergeState.dragSrc && mergeState.dragSrc !== id) li.classList.add("drag-over-item");
    });
    li.addEventListener("dragleave", () => li.classList.remove("drag-over-item"));
    li.addEventListener("drop", (e) => {
      e.preventDefault(); li.classList.remove("drag-over-item");
      if (!mergeState.dragSrc || mergeState.dragSrc === id) return;
      const from = arr.findIndex((f) => f.id === mergeState.dragSrc);
      const to   = arr.findIndex((f) => f.id === id);
      if (from < 0 || to < 0) return;
      const [m] = arr.splice(from, 1); arr.splice(to, 0, m);
      renderMergeList();
    });
    mergeListEl.appendChild(li);
  });

  $$(".remove-btn", mergeListEl).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      mergeState.files = mergeState.files.filter((f) => f.id !== btn.dataset.id);
      renderMergeList();
    });
  });
}

mergeClearBtn.addEventListener("click", () => {
  mergeState.files = []; renderMergeList(); hideStatus(mergeStatus);
  mergeResult.hidden = true;
});

mergeBtn.addEventListener("click", async () => {
  if (mergeState.files.length < 2) {
    showStatus(mergeStatus, "Tambah sekurang-kurangnya 2 fail untuk gabungkan.", "error");
    setTimeout(() => hideStatus(mergeStatus), 2500);
    return;
  }
  mergeBtn.disabled = true;
  showStatus(mergeStatus, "Menggabungkan fail PDF…", "processing");
  try {
    const { PDFDocument } = PDFLib;
    const merged = await PDFDocument.create();
    let totalPages = 0;
    for (const { file } of mergeState.files) {
      const buf = await file.arrayBuffer();
      const src = await PDFDocument.load(buf, { ignoreEncryption: true });
      const pages = await merged.copyPages(src, src.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
      totalPages += pages.length;
    }
    const bytes = await merged.save();
    const blob  = new Blob([bytes], { type: "application/pdf" });
    const ts    = new Date().toISOString().slice(0, 10);
    const name  = `mergepaper-${ts}.pdf`;
    mergeState.lastBlob = blob; mergeState.lastName = name;
    downloadBlob(blob, name);
    hideStatus(mergeStatus);
    mergeResult.hidden = false;
    mergeResultMeta.textContent = `${mergeState.files.length} fail · ${totalPages} page · ${fmtBytes(blob.size)}`;
  } catch (err) {
    console.error(err);
    showStatus(mergeStatus, `Ralat: ${err.message || "Gagal gabungkan."}`, "error");
  } finally {
    mergeBtn.disabled = false;
  }
});

mergeDownloadBtn.addEventListener("click", () => {
  if (mergeState.lastBlob) downloadBlob(mergeState.lastBlob, mergeState.lastName);
});

mergeEditBtn.addEventListener("click", () => {
  if (!mergeState.lastBlob) return;
  /* Hand off to edit-pages with the merged file */
  const file = new File([mergeState.lastBlob], mergeState.lastName, { type: "application/pdf" });
  showView("edit-pages");
  /* small delay so view shows first */
  setTimeout(() => loadPagesFromFile(file), 80);
});

/* =========================================================
   EDIT PAGES (reorder / rotate / delete)
   ========================================================= */
const pagesState = {
  file: null,
  pages: [], // { id, originalIndex, rotation, deleted, thumbDataUrl }
  dragSrc: null,
};

const pagesDropZone   = $("#pagesDropZone");
const pagesFileInput  = $("#pagesFileInput");
const pagesEditSection= $("#pagesEditSection");
const pagesGrid       = $("#pagesGrid");
const pagesCountEl    = $("#pagesCount");
const pagesHint       = $("#pagesHint");
const pagesClearBtn   = $("#pagesClearBtn");
const pagesSaveBtn    = $("#pagesSaveBtn");
const pagesStatus     = $("#pagesStatus");

setupDropZone(pagesDropZone, pagesFileInput, (files) => {
  const pdf = Array.from(files).find(isPdf);
  if (!pdf) {
    showStatus(pagesStatus, "Hanya fail PDF dibenarkan.", "error");
    setTimeout(() => hideStatus(pagesStatus), 2500);
    return;
  }
  loadPagesFromFile(pdf);
});

async function loadPagesFromFile(file) {
  pagesState.file = file;
  showStatus(pagesStatus, "Memuatkan thumbnails…", "processing");
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    pagesState.pages = [];
    pagesGrid.innerHTML = "";
    pagesEditSection.hidden = false;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale: 0.4 });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const thumb = canvas.toDataURL("image/jpeg", 0.7);
      pagesState.pages.push({
        id: uid(), originalIndex: i - 1, rotation: 0, deleted: false, thumb,
      });
    }
    renderPagesGrid();
    hideStatus(pagesStatus);
  } catch (err) {
    console.error(err);
    showStatus(pagesStatus, `Ralat: ${err.message || "Gagal muat PDF."}`, "error");
  }
}

function renderPagesGrid() {
  pagesGrid.innerHTML = "";
  const total = pagesState.pages.length;
  const kept  = pagesState.pages.filter((p) => !p.deleted).length;
  pagesCountEl.textContent = total;
  pagesHint.textContent = `${kept} daripada ${total} akan disimpan`;

  pagesState.pages.forEach((p, idx) => {
    const tile = document.createElement("div");
    tile.className = "page-tile" + (p.deleted ? " deleted" : "");
    tile.draggable = !p.deleted;
    tile.dataset.id = p.id;
    tile.innerHTML = `
      <div class="thumb-wrap">
        <img class="thumb-canvas" src="${p.thumb}" alt="Page ${idx + 1}" style="transform: rotate(${p.rotation}deg)" />
      </div>
      <div class="page-num">${idx + 1}${p.rotation ? ` · ${p.rotation}°` : ""}</div>
      <div class="page-actions">
        <button class="page-action-btn" data-act="rotate" data-id="${p.id}" title="Putar 90°">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M11 7a4 4 0 11-1.2-2.86M11 2v3h-3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <button class="page-action-btn danger" data-act="${p.deleted ? "restore" : "delete"}" data-id="${p.id}" title="${p.deleted ? "Pulihkan" : "Buang"}">
          ${p.deleted
            ? `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 7l3 3 5-6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`
            : `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 4h8M5 4V2.5h4V4M5 4v7h4V4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`}
        </button>
      </div>`;

    /* Drag reorder (skip if deleted) */
    tile.addEventListener("dragstart", (e) => {
      if (p.deleted) return;
      pagesState.dragSrc = p.id;
      tile.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    tile.addEventListener("dragend", () => {
      tile.classList.remove("dragging");
      $$(".page-tile").forEach((n) => n.classList.remove("drag-over-item"));
      pagesState.dragSrc = null;
    });
    tile.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (pagesState.dragSrc && pagesState.dragSrc !== p.id) tile.classList.add("drag-over-item");
    });
    tile.addEventListener("dragleave", () => tile.classList.remove("drag-over-item"));
    tile.addEventListener("drop", (e) => {
      e.preventDefault();
      tile.classList.remove("drag-over-item");
      if (!pagesState.dragSrc || pagesState.dragSrc === p.id) return;
      const from = pagesState.pages.findIndex((x) => x.id === pagesState.dragSrc);
      const to   = pagesState.pages.findIndex((x) => x.id === p.id);
      if (from < 0 || to < 0) return;
      const [m] = pagesState.pages.splice(from, 1);
      pagesState.pages.splice(to, 0, m);
      renderPagesGrid();
    });

    pagesGrid.appendChild(tile);
  });

  /* Action buttons */
  $$(".page-action-btn", pagesGrid).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      const page = pagesState.pages.find((p) => p.id === id);
      if (!page) return;
      if (act === "rotate") page.rotation = (page.rotation + 90) % 360;
      else if (act === "delete") page.deleted = true;
      else if (act === "restore") page.deleted = false;
      renderPagesGrid();
    });
  });
}

pagesClearBtn.addEventListener("click", () => {
  pagesState.file = null; pagesState.pages = [];
  pagesEditSection.hidden = true;
  pagesGrid.innerHTML = "";
  hideStatus(pagesStatus);
});

pagesSaveBtn.addEventListener("click", async () => {
  if (!pagesState.file || pagesState.pages.length === 0) return;
  const kept = pagesState.pages.filter((p) => !p.deleted);
  if (kept.length === 0) {
    showStatus(pagesStatus, "Sekurang-kurangnya 1 page mesti disimpan.", "error");
    setTimeout(() => hideStatus(pagesStatus), 2500);
    return;
  }
  pagesSaveBtn.disabled = true;
  showStatus(pagesStatus, "Menyimpan PDF…", "processing");
  try {
    const { PDFDocument, degrees } = PDFLib;
    const buf = await pagesState.file.arrayBuffer();
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const out = await PDFDocument.create();
    for (const p of kept) {
      const [copied] = await out.copyPages(src, [p.originalIndex]);
      if (p.rotation) {
        const orig = copied.getRotation().angle || 0;
        copied.setRotation(degrees((orig + p.rotation) % 360));
      }
      out.addPage(copied);
    }
    const bytes = await out.save();
    const blob  = new Blob([bytes], { type: "application/pdf" });
    const baseName = pagesState.file.name.replace(/\.pdf$/i, "");
    downloadBlob(blob, `${baseName}-edited.pdf`);
    showStatus(pagesStatus, `Berjaya! ${kept.length} page disimpan.`, "success");
  } catch (err) {
    console.error(err);
    showStatus(pagesStatus, `Ralat: ${err.message || "Gagal simpan."}`, "error");
  } finally {
    pagesSaveBtn.disabled = false;
  }
});

/* =========================================================
   EDIT TEXT & SIGNATURE
   ========================================================= */
const textState = {
  file: null,
  pageCanvases: [], // { wrap, canvas, scale, viewport, pageIndex }
  annotations: [],  // { id, type, pageIndex, x, y, ... }
  mode: "text",
  pendingSig: null, // dataURL after signature drawn
};

const textDropZone   = $("#textDropZone");
const textFileInput  = $("#textFileInput");
const textEditSection= $("#textEditSection");
const textPagesContainer = $("#textPagesContainer");
const textCountHint  = $("#textCountHint");
const textClearBtn   = $("#textClearBtn");
const textSaveBtn    = $("#textSaveBtn");
const textStatus     = $("#textStatus");
const textHint       = $("#textHint");
const textSize       = $("#textSize");
const textColor      = $("#textColor");
const sigModal       = $("#sigModal");
const sigCanvas      = $("#sigCanvas");
const sigClearBtn    = $("#sigClearBtn");
const sigCancelBtn   = $("#sigCancelBtn");
const sigConfirmBtn  = $("#sigConfirmBtn");

setupDropZone(textDropZone, textFileInput, (files) => {
  const pdf = Array.from(files).find(isPdf);
  if (!pdf) {
    showStatus(textStatus, "Hanya fail PDF dibenarkan.", "error");
    setTimeout(() => hideStatus(textStatus), 2500); return;
  }
  loadTextFile(pdf);
});

async function loadTextFile(file) {
  textState.file = file;
  textState.annotations = [];
  textPagesContainer.innerHTML = "";
  textEditSection.hidden = false;
  showStatus(textStatus, "Memuatkan PDF…", "processing");
  try {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    textState.pageCanvases = [];
    /* render every page at a nice scale */
    const targetWidth = Math.min(820, document.querySelector(".container").clientWidth - 40);
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const baseVp = page.getViewport({ scale: 1 });
      const scale = targetWidth / baseVp.width;
      const vp = page.getViewport({ scale });

      const wrap = document.createElement("div");
      wrap.className = "text-page-wrap";
      wrap.dataset.page = i - 1;
      wrap.style.width  = vp.width + "px";
      wrap.style.height = vp.height + "px";

      const canvas = document.createElement("canvas");
      canvas.className = "text-page-canvas";
      canvas.width = vp.width; canvas.height = vp.height;
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      wrap.appendChild(canvas);

      const overlay = document.createElement("div");
      overlay.className = "text-overlay";
      overlay.dataset.page = i - 1;
      wrap.appendChild(overlay);

      wrap.addEventListener("click", (e) => onPageClick(e, i - 1));

      textPagesContainer.appendChild(wrap);
      textState.pageCanvases.push({ wrap, canvas, scale, viewport: vp, pageIndex: i - 1 });
    }
    hideStatus(textStatus);
    updateTextCount();
  } catch (err) {
    console.error(err);
    showStatus(textStatus, `Ralat: ${err.message || "Gagal muat PDF."}`, "error");
  }
}

function onPageClick(e, pageIndex) {
  if (e.target.closest(".text-item") || e.target.closest(".sig-item")) return;
  const wrap = e.currentTarget;
  const rect = wrap.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  if (textState.mode === "text") {
    addTextItem(pageIndex, x, y);
  } else if (textState.mode === "signature") {
    if (!textState.pendingSig) {
      openSigModal(() => {
        if (textState.pendingSig) addSigItem(pageIndex, x, y, textState.pendingSig);
      });
    } else {
      addSigItem(pageIndex, x, y, textState.pendingSig);
    }
  }
}

function addTextItem(pageIndex, x, y) {
  const id = uid();
  const size = parseInt(textSize.value, 10) || 16;
  const color = textColor.value || "#1a1815";
  const ann = { id, type: "text", pageIndex, x, y, text: "Teks anda", size, color };
  textState.annotations.push(ann);

  const wrap = textState.pageCanvases[pageIndex].wrap;
  const overlay = wrap.querySelector(".text-overlay");
  const el = document.createElement("div");
  el.className = "text-item selected";
  el.style.left = x + "px";
  el.style.top  = y + "px";
  el.style.color = color;
  el.style.fontSize = size + "px";
  el.dataset.id = id;
  el.innerHTML = `<input class="ti-input" value="Teks anda" style="color:${color};font-size:${size}px;width:${Math.max(80, ann.text.length * (size * 0.55))}px" /><button class="ti-remove" type="button" aria-label="Buang">×</button>`;
  overlay.appendChild(el);

  const input = el.querySelector(".ti-input");
  input.focus(); input.select();
  input.addEventListener("input", () => {
    ann.text = input.value;
    input.style.width = Math.max(80, input.value.length * (size * 0.55)) + "px";
  });
  input.addEventListener("click", (e) => e.stopPropagation());
  el.querySelector(".ti-remove").addEventListener("click", (e) => {
    e.stopPropagation();
    textState.annotations = textState.annotations.filter((a) => a.id !== id);
    el.remove(); updateTextCount();
  });
  makeDraggable(el, ann);
  updateTextCount();
}

function addSigItem(pageIndex, x, y, dataUrl) {
  const id = uid();
  const sigW = 160; // default visual size
  const ann = { id, type: "sig", pageIndex, x, y, dataUrl, width: sigW };
  textState.annotations.push(ann);

  const wrap = textState.pageCanvases[pageIndex].wrap;
  const overlay = wrap.querySelector(".text-overlay");
  const el = document.createElement("div");
  el.className = "sig-item";
  el.style.left = x + "px";
  el.style.top  = y + "px";
  el.style.width = sigW + "px";
  el.dataset.id = id;
  el.innerHTML = `<img src="${dataUrl}" alt="signature" /><button class="ti-remove" type="button" aria-label="Buang" style="position:absolute;top:-10px;right:-10px;width:20px;height:20px;border-radius:50%;background:var(--accent);color:white;border:none;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center">×</button>`;
  overlay.appendChild(el);

  el.querySelector(".ti-remove").addEventListener("click", (e) => {
    e.stopPropagation();
    textState.annotations = textState.annotations.filter((a) => a.id !== id);
    el.remove(); updateTextCount();
  });
  makeDraggable(el, ann);
  updateTextCount();
}

function makeDraggable(el, ann) {
  let startX = 0, startY = 0, baseX = 0, baseY = 0, dragging = false;
  el.addEventListener("mousedown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.classList.contains("ti-remove")) return;
    dragging = true;
    startX = e.clientX; startY = e.clientY;
    baseX = ann.x; baseY = ann.y;
    e.preventDefault();
    document.body.style.userSelect = "none";
  });
  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    ann.x = baseX + (e.clientX - startX);
    ann.y = baseY + (e.clientY - startY);
    el.style.left = ann.x + "px";
    el.style.top  = ann.y + "px";
  });
  document.addEventListener("mouseup", () => {
    dragging = false; document.body.style.userSelect = "";
  });
}

function updateTextCount() {
  const n = textState.annotations.length;
  textCountHint.textContent = n === 0 ? "Tiada anotasi" : `${n} anotasi · klik 'Simpan PDF' untuk muat turun`;
}

/* Toolbar */
$$(".tool-btn", $("#view-edit-text")).forEach((btn) => {
  btn.addEventListener("click", () => {
    $$(".tool-btn", $("#view-edit-text")).forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    textState.mode = btn.dataset.mode;
    textHint.textContent = textState.mode === "text"
      ? "Tip: klik di mana-mana pada page untuk tambah teks."
      : "Tip: klik pada page untuk letakkan tandatangan.";
    $$(".text-page-wrap").forEach((w) => w.classList.toggle("sig-mode", textState.mode === "signature"));
    if (textState.mode === "signature" && !textState.pendingSig) openSigModal();
  });
});

textClearBtn.addEventListener("click", () => {
  textState.annotations = [];
  $$(".text-overlay").forEach((o) => o.innerHTML = "");
  updateTextCount();
});

/* Signature modal */
let sigCtx, sigDrawing = false, sigHasStrokes = false;
function setupSigCanvas() {
  sigCtx = sigCanvas.getContext("2d");
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = "round";
  sigCtx.lineJoin = "round";
  sigCtx.strokeStyle = "#1a1815";
}
setupSigCanvas();

function clearSig() {
  sigCtx.clearRect(0, 0, sigCanvas.width, sigCanvas.height);
  sigHasStrokes = false;
}

function sigPos(e) {
  const r = sigCanvas.getBoundingClientRect();
  const sx = sigCanvas.width  / r.width;
  const sy = sigCanvas.height / r.height;
  const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
  const cy = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
  return { x: cx * sx, y: cy * sy };
}
function startSig(e) { e.preventDefault(); sigDrawing = true; const p = sigPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); }
function moveSig(e)  { if (!sigDrawing) return; e.preventDefault(); const p = sigPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); sigHasStrokes = true; }
function endSig()    { sigDrawing = false; }

sigCanvas.addEventListener("mousedown", startSig);
sigCanvas.addEventListener("mousemove", moveSig);
sigCanvas.addEventListener("mouseup", endSig);
sigCanvas.addEventListener("mouseleave", endSig);
sigCanvas.addEventListener("touchstart", startSig);
sigCanvas.addEventListener("touchmove", moveSig);
sigCanvas.addEventListener("touchend", endSig);

let sigConfirmCb = null;
function openSigModal(cb) {
  sigConfirmCb = cb || null;
  clearSig();
  sigModal.hidden = false;
}
function closeSigModal() { sigModal.hidden = true; sigConfirmCb = null; }

sigClearBtn.addEventListener("click", clearSig);
sigCancelBtn.addEventListener("click", closeSigModal);
sigConfirmBtn.addEventListener("click", () => {
  if (!sigHasStrokes) { closeSigModal(); return; }
  /* Trim white space (approximate) and produce data URL */
  const dataUrl = sigCanvas.toDataURL("image/png");
  textState.pendingSig = dataUrl;
  closeSigModal();
  if (sigConfirmCb) sigConfirmCb();
});

textSaveBtn.addEventListener("click", async () => {
  if (!textState.file) return;
  textSaveBtn.disabled = true;
  showStatus(textStatus, "Menyimpan PDF…", "processing");
  try {
    const { PDFDocument, rgb, StandardFonts } = PDFLib;
    const buf = await textState.file.arrayBuffer();
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pages = doc.getPages();

    /* Group annotations per page */
    const byPage = {};
    textState.annotations.forEach((a) => {
      (byPage[a.pageIndex] = byPage[a.pageIndex] || []).push(a);
    });

    for (const idxStr of Object.keys(byPage)) {
      const idx = parseInt(idxStr, 10);
      const page = pages[idx];
      const pc = textState.pageCanvases[idx];
      const scale = pc.scale; // canvas px per pdf-pt
      const pageHeightPt = page.getHeight();

      for (const a of byPage[idxStr]) {
        if (a.type === "text") {
          if (!a.text || !a.text.trim()) continue;
          const sizePt = a.size / scale;
          const xPt = a.x / scale;
          const yPt = pageHeightPt - (a.y / scale) - sizePt;
          const c = hexToRgb01(a.color);
          page.drawText(a.text, {
            x: xPt, y: yPt, size: sizePt, font,
            color: rgb(c.r, c.g, c.b),
          });
        } else if (a.type === "sig") {
          const png = await doc.embedPng(a.dataUrl);
          const widthPt = a.width / scale;
          const heightPt = widthPt * (png.height / png.width);
          const xPt = a.x / scale;
          const yPt = pageHeightPt - (a.y / scale) - heightPt;
          page.drawImage(png, { x: xPt, y: yPt, width: widthPt, height: heightPt });
        }
      }
    }

    const bytes = await doc.save();
    const blob  = new Blob([bytes], { type: "application/pdf" });
    const base  = textState.file.name.replace(/\.pdf$/i, "");
    downloadBlob(blob, `${base}-annotated.pdf`);
    showStatus(textStatus, `Berjaya! ${textState.annotations.length} anotasi disimpan.`, "success");
  } catch (err) {
    console.error(err);
    showStatus(textStatus, `Ralat: ${err.message || "Gagal simpan."}`, "error");
  } finally {
    textSaveBtn.disabled = false;
  }
});

function hexToRgb01(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16) / 255, g: parseInt(m[2], 16) / 255, b: parseInt(m[3], 16) / 255 };
}

/* =========================================================
   COMPRESS  (rasterize each page as JPEG and rebuild PDF)
   ========================================================= */
const compressState = { file: null, lastBlob: null, lastName: null };

const compressDropZone   = $("#compressDropZone");
const compressFileInput  = $("#compressFileInput");
const compressSection    = $("#compressSection");
const compressName       = $("#compressName");
const compressOrigSize   = $("#compressOrigSize");
const compressClearBtn   = $("#compressClearBtn");
const compressBtn        = $("#compressBtn");
const compressStatus     = $("#compressStatus");
const compressResult     = $("#compressResult");
const compressResultMeta = $("#compressResultMeta");
const compressDownloadBtn= $("#compressDownloadBtn");

setupDropZone(compressDropZone, compressFileInput, (files) => {
  const pdf = Array.from(files).find(isPdf);
  if (!pdf) {
    showStatus(compressStatus, "Hanya fail PDF dibenarkan.", "error");
    setTimeout(() => hideStatus(compressStatus), 2500); return;
  }
  compressState.file = pdf;
  compressName.textContent = pdf.name;
  compressOrigSize.textContent = `Asal: ${fmtBytes(pdf.size)}`;
  compressSection.hidden = false;
  compressResult.hidden = true;
  hideStatus(compressStatus);
});

compressClearBtn.addEventListener("click", () => {
  compressState.file = null; compressSection.hidden = true; compressResult.hidden = true;
});

compressBtn.addEventListener("click", async () => {
  if (!compressState.file) return;
  compressBtn.disabled = true;
  showStatus(compressStatus, "Mengoptimumkan PDF… ini boleh ambil masa.", "processing");
  try {
    const level = $('input[name="compressLevel"]:checked').value;
    const presets = {
      low:    { scale: 2.0, quality: 0.85 },
      medium: { scale: 1.5, quality: 0.7  },
      high:   { scale: 1.0, quality: 0.55 },
    };
    const { scale, quality } = presets[level] || presets.medium;

    const { PDFDocument } = PDFLib;
    const out = await PDFDocument.create();
    const buf = await compressState.file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise;

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.width = vp.width; canvas.height = vp.height;
      await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;

      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      const imgBytes = await (await fetch(dataUrl)).arrayBuffer();
      const img = await out.embedJpg(imgBytes);
      const baseVp = page.getViewport({ scale: 1 });
      const newPage = out.addPage([baseVp.width, baseVp.height]);
      newPage.drawImage(img, { x: 0, y: 0, width: baseVp.width, height: baseVp.height });
    }

    const bytes = await out.save();
    const blob  = new Blob([bytes], { type: "application/pdf" });
    const base  = compressState.file.name.replace(/\.pdf$/i, "");
    const name  = `${base}-compressed.pdf`;
    compressState.lastBlob = blob; compressState.lastName = name;

    const orig = compressState.file.size;
    const reduction = orig > 0 ? Math.max(0, Math.round((1 - blob.size / orig) * 100)) : 0;
    hideStatus(compressStatus);
    compressResult.hidden = false;
    compressResultMeta.textContent = `${fmtBytes(orig)} → ${fmtBytes(blob.size)} (turun ${reduction}%)`;
    downloadBlob(blob, name);
  } catch (err) {
    console.error(err);
    showStatus(compressStatus, `Ralat: ${err.message || "Gagal compress."}`, "error");
  } finally {
    compressBtn.disabled = false;
  }
});

compressDownloadBtn.addEventListener("click", () => {
  if (compressState.lastBlob) downloadBlob(compressState.lastBlob, compressState.lastName);
});

/* =========================================================
   SPLIT
   ========================================================= */
const splitState = { file: null, numPages: 0, results: [] };

const splitDropZone = $("#splitDropZone");
const splitFileInput= $("#splitFileInput");
const splitSection  = $("#splitSection");
const splitName     = $("#splitName");
const splitMeta     = $("#splitMeta");
const splitClearBtn = $("#splitClearBtn");
const splitBtn      = $("#splitBtn");
const splitStatus   = $("#splitStatus");
const splitResult   = $("#splitResult");
const splitResultMeta = $("#splitResultMeta");
const splitFilesList= $("#splitFilesList");
const rangesInputWrap = $("#rangesInputWrap");
const rangesInput     = $("#rangesInput");

setupDropZone(splitDropZone, splitFileInput, async (files) => {
  const pdf = Array.from(files).find(isPdf);
  if (!pdf) {
    showStatus(splitStatus, "Hanya fail PDF dibenarkan.", "error");
    setTimeout(() => hideStatus(splitStatus), 2500); return;
  }
  splitState.file = pdf;
  try {
    const buf = await pdf.arrayBuffer();
    const doc = await PDFLib.PDFDocument.load(buf, { ignoreEncryption: true });
    splitState.numPages = doc.getPageCount();
    splitName.textContent = pdf.name;
    splitMeta.textContent = `${splitState.numPages} page · ${fmtBytes(pdf.size)}`;
    splitSection.hidden = false; splitResult.hidden = true;
    hideStatus(splitStatus);
  } catch (err) {
    showStatus(splitStatus, `Ralat: ${err.message || "Gagal baca PDF."}`, "error");
  }
});

document.addEventListener("change", (e) => {
  if (e.target.name === "splitMode") {
    rangesInputWrap.hidden = e.target.value !== "ranges";
  }
});

splitClearBtn.addEventListener("click", () => {
  splitState.file = null; splitState.results = [];
  splitSection.hidden = true; splitResult.hidden = true;
});

function parseRanges(str, max) {
  const out = [];
  const parts = str.split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!m) throw new Error(`Format tidak sah: "${p}"`);
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (a < 1 || b < 1 || a > max || b > max || a > b) {
      throw new Error(`Julat tidak sah: "${p}" (PDF ada ${max} page)`);
    }
    const arr = [];
    for (let i = a; i <= b; i++) arr.push(i - 1);
    out.push({ label: a === b ? `${a}` : `${a}-${b}`, indices: arr });
  }
  return out;
}

splitBtn.addEventListener("click", async () => {
  if (!splitState.file) return;
  splitBtn.disabled = true;
  showStatus(splitStatus, "Memisahkan PDF…", "processing");
  try {
    const mode = $('input[name="splitMode"]:checked').value;
    let groups;
    if (mode === "all") {
      groups = [];
      for (let i = 0; i < splitState.numPages; i++) groups.push({ label: `${i + 1}`, indices: [i] });
    } else {
      const str = rangesInput.value.trim();
      if (!str) throw new Error("Sila masukkan julat (cth: 1-3, 5).");
      groups = parseRanges(str, splitState.numPages);
    }

    const { PDFDocument } = PDFLib;
    const buf = await splitState.file.arrayBuffer();
    const src = await PDFDocument.load(buf, { ignoreEncryption: true });
    const base = splitState.file.name.replace(/\.pdf$/i, "");

    splitState.results = [];
    splitFilesList.innerHTML = "";

    for (const g of groups) {
      const out = await PDFDocument.create();
      const copied = await out.copyPages(src, g.indices);
      copied.forEach((p) => out.addPage(p));
      const bytes = await out.save();
      const blob  = new Blob([bytes], { type: "application/pdf" });
      const name  = `${base}-page-${g.label}.pdf`;
      splitState.results.push({ name, blob, label: g.label, count: g.indices.length });
    }

    /* Render list with download buttons */
    splitState.results.forEach((r) => {
      const li = document.createElement("li");
      li.className = "split-file-row";
      li.innerHTML = `
        <div class="file-icon">PDF</div>
        <div class="file-info">
          <div class="file-name">${r.name}</div>
          <div class="file-meta">${r.count} page · ${fmtBytes(r.blob.size)}</div>
        </div>
        <button class="btn-secondary dl" type="button">Muat turun</button>`;
      li.querySelector(".dl").addEventListener("click", () => downloadBlob(r.blob, r.name));
      splitFilesList.appendChild(li);
    });

    /* Auto-download all */
    splitState.results.forEach((r, i) => setTimeout(() => downloadBlob(r.blob, r.name), i * 200));

    hideStatus(splitStatus);
    splitResult.hidden = false;
    splitResultMeta.textContent = `${splitState.results.length} fail dijana · klik untuk muat turun semula`;
  } catch (err) {
    console.error(err);
    showStatus(splitStatus, `Ralat: ${err.message || "Gagal pisah."}`, "error");
  } finally {
    splitBtn.disabled = false;
  }
});
