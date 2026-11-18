# Arsitektur RapiNota

Dokumen ini merangkum cara kerja internal aplikasi. Untuk cara menjalankan, lihat `README.md`.

## 1. Gambaran Umum

RapiNota adalah aplikasi operasional laundry satu cabang. Fokusnya: mencatat pesanan
(beberapa layanan per order), memantau progres produksi, mencatat pembayaran/DP dan
pelunasan, mencatat pengeluaran, serta mencetak nota. Ada dua role: `owner` dan
`pegawai` (employee).

Runtime-nya bukan Node biasa, melainkan **Cloudflare Workers** melalui **Vinext**
(runtime Next.js di atas Workers). Database memakai **Cloudflare D1** (SQLite) lewat
**Drizzle ORM**.

```
Browser
  │  (React 19 / Next App Router, satu endpoint /api/data)
  ▼
Cloudflare Worker (worker/index.ts)  ──vinext──▶  Next fetch handler
  │                                                    │
  │                                            app/api/**/route.ts
  ▼                                                    │
Cloudflare D1 (SQLite) ◀──── drizzle-orm / prepared statements ────┘
```

## 2. Lapisan & Tanggung Jawab

| Area | Berkas | Peran |
|---|---|---|
| Entry Worker | `worker/index.ts` | Membungkus fetch Next, mengelola request-scoped connector binding (scaffolding). |
| Gate sesi | `app/page.tsx` | Sesi valid → `LaundryApp`, jika tidak → `LoginForm`. |
| Shell UI | `app/laundry-app.tsx` | Sidebar, topbar, dashboard, daftar pesanan, katalog, detail, form. |
| UI turunan | `app/finance-view.tsx`, `app/order-editor.tsx`, `app/customer-search.tsx`, `app/receipt/[id]/*` | Laporan keuangan, edit order, pencarian pelanggan, nota. |
| API | `app/api/**/route.ts` | Endpoint HTTP. |
| Domain | `lib/domain.ts` | Katalog layanan, validasi, kalkulasi, alur status. |
| Auth | `lib/auth.ts`, `lib/password.ts`, `lib/permissions.ts` | Sesi, hashing, otorisasi. |
| Keuangan | `lib/finance.ts`, `lib/finance-export.ts` | Perhitungan laporan + ekspor Excel. |
| Nota | `lib/receipt-data.ts`, `lib/receipt-pdf.ts` | Ambil data nota + generator PDF. |
| DB | `db/schema.ts`, `db/index.ts`, `drizzle/*.sql` | Skema Drizzle + migrasi. |
| Tes | `tests/*.test.mjs` | `node:test` (native TS strip-types). |

## 3. Model Data (D1)

Migrasi (urut): `0000` (orders/payments/expenses) → `0001` (akun/sesi/rate-limit) →
`0002` (customers) → `0003` (`payments.deposit_change`).

- **orders**: `id`, `number` (unik, `RN-YYYYMMDD-NNN`), `customer`, `phone`, `items`
  (JSON snapshot), `total`, `discount`, `extra`, `status`, `due`, `created`, `notes`,
  `packages`, `rack`, `history` (JSON).
- **payments**: `id`, `order_id`, `amount`, `method`, `deposit_change`, `created`,
  `actor`. Method khusus: `Deposit` dan `Saldo awal deposit`.
- **expenses**: `id`, `category` (enum terbatas), `amount`, `note`, `created`, `actor`.
- **app_users / app_sessions / auth_attempts**: akun, sesi (hash token), penghitung login.
- **customers**: hasil impor owner (`id`, `name`, `phone`).

Catatan penting:
- **Nominal uang disimpan sebagai integer rupiah** — create maupun edit rincian
  membulatkan subtotal ke rupiah terdekat; harga/extra/diskon wajib bilangan bulat
  (sesuai `README.md`).
- `orders.items` menyimpan **snapshot harga**. Perubahan katalog tidak mengubah order lama.

## 4. Alur API

Hampir semua baca/tulis lewat **satu endpoint**: `app/api/data/route.ts`.

- `GET /api/data` → snapshot: semua orders (+ payments + `paid`), expenses (kosong untuk
  pegawai), customers, dan `deposit` per order.
- `POST /api/data` dengan `{ action, id, ... }`:
  - `create` — validasi + alokasi nomor order atomik + pembayaran awal, dalam satu `batch`.
  - `edit` — edit rincian; optimistic concurrency via perbandingan `history`.
  - `payment` — pelunasan/DP berulang; idempotent via `id` unik.
  - `status` — maju ke tahap berikutnya; `Selesai` butuh lunas.
  - `expense` — catat pengeluaran (owner).

Endpoint lain:
- `POST /api/auth/login` — rate-limit → provision akun → verifikasi → buat sesi.
- `POST /api/auth/logout` — hapus sesi server + cookie.
- `POST /api/auth/password` — ganti password (verifikasi password lama, cabut semua sesi).
- `POST /api/customers` — impor pelanggan (owner).
- `GET /api/receipts/[id]` — PDF nota (80/58 mm) atau label keranjang.

Setiap mutasi sukses mengembalikan **snapshot penuh** terbaru, dan klien mengganti
seluruh state — sederhana, tapi boros saat data besar.

## 5. Keamanan

- **Sesi**: token acak 256-bit; DB hanya menyimpan hash SHA-256. Cookie `HttpOnly`,
  `SameSite=Lax`, `Secure` pada HTTPS, umur 12 jam. Logout menghapus sesi di server.
- **Password**: PBKDF2-SHA256, 100.000 iterasi, salt acak per akun. Dummy hash menjaga
  waktu respons agar tidak membocorkan keberadaan akun.
- **Rate limit login**: per email (10) dan per IP (40) dalam 15 menit, dihitung di DB.
- **CSRF**: `sameOrigin()` diperiksa pada semua POST.
- **Otorisasi**: role dibaca dari DB setiap request (`getSession`), bukan dari klien.
  `canPerform`/`canViewFinance` di `lib/permissions.ts`.
- **Bootstrap akun**: dari secret runtime `AUTH_BOOTSTRAP_USERS` (hash, bukan plaintext),
  dijalankan `ON CONFLICT(email) DO NOTHING` sehingga tidak menimpa akun yang ada.

## 6. Logika Domain (`lib/domain.ts`)

- **Katalog**: 7 kategori, 24 varian (harga & durasi dari foto menu toko). Satuan `kg`
  (boleh 3 desimal), `pcs`/`set` (bulat), atau `custom`.
- **Alur produksi** via `nextStatus()`:
  - semua `iron` → Diterima → Disetrika → Siap Diambil → Selesai
  - semua `fold` → Diterima → Dicuci → Dikeringkan → Siap Diambil → Selesai
  - campuran → jalur penuh (`STATUSES`)
- **Estimasi** via `estimatedHours()`: durasi terlama bila semua layanan punya durasi;
  jika ada layanan satuan (durasi null) → `null` (isi manual).
- **Validasi**: normalisasi nomor WA ke `62...`, batas total 0–100 juta, subtotal
  dibulatkan ke rupiah, batas 20 layanan/order, paket 1–100.
- **Deposit**: saldo dihitung dari `SUM(deposit_change)` per nomor telepon; kembalian
  dapat disimpan menjadi deposit (butuh nomor WA).

## 7. Cetak & Ekspor

- `lib/receipt-pdf.ts` menghasilkan PDF roll-paper **tanpa dependency**: font Courier,
  lebar 58/80 mm, tinggi mengikuti isi, sanitasi karakter + perlindungan injeksi operator
  PDF. Ada juga **label keranjang**.
- `lib/finance-export.ts` membuat workbook Excel multi-sheet (Ringkasan, Transaksi Kas,
  Pesanan, Piutang) dengan format Rupiah dan waktu WIB.

## 8. Pengujian

```bash
node --experimental-strip-types --test tests/domain.test.mjs
node --experimental-strip-types --test tests/auth.test.mjs tests/domain.test.mjs
```

`tests/finance.test.mjs` memakai `node:sqlite` + `exceljs` (butuh `node_modules`) dan
fixture `tests/finance-fixtures.sql`. `tests/receipt.test.mjs` memverifikasi isi PDF,
lebar, xref, dan anti-injeksi.

## 9. Temuan & Utang Teknis

Sudah dibereskan:
1. **Tes overpayment (usang)** — `tests/domain.test.mjs` dulu mengharap `validateOrder`
   menolak pembayaran > total. Implementasi memang mengizinkannya (aman: `recordPayment()`
   meng-clamp `MIN(received, remaining)`, kelebihan jadi kembalian/deposit). Tes
   diperbarui agar sesuai perilaku.
2. **Bug harness tes keuangan** — `tests/finance.test.mjs` tidak meng-`JSON.parse` kolom
   `items`/`history` sebelum dipakai `createFinanceReport`. Diperbaiki agar meniru
   `snapshot()` di `app/api/data/route.ts`.
3. **Scaffolding template dibuang** — `components/` (50+ komponen shadcn +
   `connector-error`), `hooks/use-mobile.ts`, `lib/utils.ts`, `lib/connectors.ts`,
   `lib/connector-*`, `app/chatgpt-auth.ts`, `examples/d1/`, `scripts/connector-preview/`,
   `scripts/vite/connector-preview-plugin.mjs`, `vendor/`, `components.json`. Wiring
   connector di `worker/index.ts` dan `vite.config.ts` disederhanakan, override shadcn di
   `eslint.config.mjs` dihapus.
4. **Lint bersih** — 31 error lama (`no-explicit-any`, `no-html-link-for-pages`,
   `set-state-in-effect`) diperbaiki dengan tipe yang benar, bukan melonggarkan config:
   tipe baris DB di `lib/auth.ts`, `lib/receipt-data.ts`, `app/api/data/route.ts`; tipe
   input `validateOrder`/`editOrderDetails` di `lib/domain.ts`; `<a>` → `<Link>` di
   `login-form.tsx`/`receipt-view.tsx`; setState dipindah ke fungsi bersarang di
   `share-receipt.tsx`/`laundry-app.tsx`. `npm run lint` kini 0 error (6 warning sisa).
5. **Kode mati `scope=finance` dibuang** — cek 403 di `GET /api/data` dihapus karena
   klien tidak pernah memakai parameter itu.
6. **Dependensi tak terpakai dipangkas** — 181 paket dihapus dari `package.json` +
   lockfile: `@base-ui/react`, `@hookform/resolvers`, `@shadcn/react`, `radix-ui`,
   `recharts`, `sonner`, `cmdk`, `vaul`, `class-variance-authority`, `clsx`,
   `tailwind-merge`, `date-fns`, `embla-carousel-react`, `input-otp`, `next-themes`,
   `react-day-picker`, `react-hook-form`, `react-resizable-panels`, `html-to-image`,
   `zod`, `tw-animate-css`, dan dev `json-rpc-2.0`, `raw-body`. Sisa dependency runtime:
   `drizzle-orm`, `exceljs`, `lucide-react`, `next`, `react`, `react-dom`.
7. **Inkonsistensi nominal disamakan** — `editOrderDetails` dulu membolehkan subtotal dan
   nominal 2 desimal, sedangkan `validateOrder` (create) membulatkan ke rupiah. Sekarang
   keduanya memakai `amount()` (integer rupiah) dan `Math.round(quantity*price)`, sesuai
   `README.md` dan tipe kolom `integer` di skema.

Masih terbuka:
4. **Migrasi berisi data uji**: `drizzle/0002_milky_king_cobra.sql` menghapus 3 order ID
   hardcoded. Dibiarkan (sudah pernah diterapkan); jangan diedit — bila perlu bersihkan,
   buat migrasi baru. Berbahaya bila dijalankan di database lain.
5. **Tanpa paginasi**: `snapshot()` memuat seluruh orders + payments tiap request.
