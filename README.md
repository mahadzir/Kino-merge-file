# MergePaper

Aplikasi web ringan untuk menggabungkan dan mengedit fail PDF — serupa dengan Sejda. Semua pemprosesan berlaku **dalam pelayar pengguna** menggunakan [pdf-lib](https://pdf-lib.js.org/) dan [pdf.js](https://mozilla.github.io/pdf.js/), jadi tiada fail dihantar ke mana-mana pelayan.

## ✨ Ciri-ciri

### 🏠 Halaman Utama
Pilih antara **Gabung** atau **Edit** PDF dari awal — kedua-dua optional.

### 🔗 Gabung PDF
- Seret-dan-lepas beberapa fail PDF
- Susun semula urutan dengan drag-and-drop
- Selepas gabung, pilih untuk **Edit hasil ini** terus (terus pergi ke editor)

### ✏️ Edit PDF (4 tools)
1. **Susun & Putar Page** — Drag thumbnail untuk susun semula, putar 90°, atau buang page
2. **Tambah Teks & Tandatangan** — Klik mana-mana pada page untuk tambah teks; lukis tandatangan dengan mouse/jari
3. **Compress PDF** — 3 tahap kompresi (ringan/sederhana/tinggi)
4. **Pisah (Split) PDF** — Setiap page jadi fail asingan, atau julat tersuai (cth: `1-3, 5, 7-9`)

### 🔒 Privasi
- 100% client-side — tiada upload ke server
- Tiada cookie pelacak, tiada langganan, tiada cap air

## 🛠️ Teknologi

- HTML, CSS, JavaScript vanilla (tiada build step)
- [pdf-lib](https://pdf-lib.js.org/) — manipulasi PDF
- [pdf.js](https://mozilla.github.io/pdf.js/) — render thumbnail & rasterize untuk compress
- Google Fonts: Fraunces (serif), Manrope (sans), JetBrains Mono

## 🚀 Jalankan secara tempatan

```bash
npx serve .
```

## ☁️ Deploy ke Vercel via GitHub

### 1) Push ke GitHub

```bash
git init
git add .
git commit -m "Initial commit: MergePaper"
git branch -M main
git remote add origin https://github.com/<USERNAME-ANDA>/mergepaper.git
git push -u origin main
```

### 2) Connect ke Vercel

1. Pergi [vercel.com](https://vercel.com) → log masuk dengan GitHub
2. Klik **Add New → Project** → pilih repo `mergepaper`
3. Konfigurasi: Framework Preset = *Other*, biarkan Build/Output/Install Command kosong
4. Klik **Deploy**

Setiap push ke `main` akan auto-deploy versi baru.

## 📁 Struktur fail

```
mergepaper/
├── index.html       # Multi-view markup
├── styles.css       # Reka bentuk
├── app.js           # Logik untuk semua tools
├── vercel.json      # Config Vercel
├── package.json
└── README.md
```

## 📜 Lesen

MIT
