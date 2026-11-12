<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:000000,60:111111,100:C6FF00&height=200&section=header&text=M4ZK1PL4Y%20CHAT&fontSize=52&fontColor=C6FF00&fontAlignY=38&desc=chat%20anonim%20%E2%80%A2%20tanpa%20nomor%20hp%20%E2%80%A2%20privasi%20dulu&descAlignY=60&descSize=16&animation=fadeIn" width="100%" />

<a href="https://github.com/"><img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=700&size=22&pause=900&color=C6FF00&background=00000000&center=true&vCenter=true&width=760&lines=ID+otomatis%2C+tanpa+daftar+nomor+HP;Terhubung+lewat+QR+%E2%80%94+dekat+maupun+jauh;Voice+%26+video+call+HD+%E2%80%A2+chat+terenkripsi;Dark+brutal+UI+%E2%80%A2+100%25+bahasa+Indonesia" alt="typing" /></a>

<br/>

![Status](https://img.shields.io/badge/status-aktif-C6FF00?style=for-the-badge&labelColor=000000)
![Versi](https://img.shields.io/badge/versi-1.0.0-C6FF00?style=for-the-badge&labelColor=000000)
![Platform](https://img.shields.io/badge/android-8.0%2B-C6FF00?style=for-the-badge&labelColor=000000&logo=android&logoColor=C6FF00)
![Lisensi](https://img.shields.io/badge/lisensi-MIT-C6FF00?style=for-the-badge&labelColor=000000)

<br/>

**[Fitur](#-fitur) · [Arsitektur](#-arsitektur) · [Mulai](#-mulai-cepat) · [Build APK](#-build-apk) · [Kontribusi](#-kontribusi)**

</div>

---

> **M4zk1pL4y Chat** adalah messenger mandiri: identitas dibuat otomatis oleh perangkat, tanpa nomor HP, tanpa email, tanpa akun pusat. Dua orang terhubung hanya kalau saling scan QR. Semua lalu lintas chat dienkripsi, isi pesan disimpan terenkripsi di server, dan kamu bisa hapus riwayat atau blokir siapa pun kapan saja.

<div align="center">
<img src="https://user-images.githubusercontent.com/74038190/212284100-561aa473-3905-4a80-b561-0d28506553ee.gif" width="700" />
</div>

## ✦ Fitur

| | Fitur | Keterangan |
|---|---|---|
| 🆔 | **ID otomatis** | Format `MZK-XXXX-XXXX`, dibuat di perangkat. Nol registrasi. |
| 📷 | **Koneksi via QR** | Generate QR sendiri, atau scan QR orang lain untuk berteman. |
| 💬 | **Chat real-time** | Teks, stiker, gift, kirim dokumen/foto/video. |
| 📍 | **Lokasi live** | Bagikan posisi real-time selama durasi tertentu. |
| 🎙️ | **Pesan suara** | Rekam dan kirim voice note. |
| 📞 | **Telepon suara** | Panggilan audio peer-to-peer (WebRTC). |
| 🎥 | **Video call HD** | 720p+, audio jernih, tombol mute/kamera/flip. |
| 📖 | **Story 24 jam** | Unggah story, lihat daftar penonton lengkap. |
| 🧭 | **Pengguna sekitar** | Cari pengguna lain berbasis radius (Haversine). |
| 🚫 | **Blokir / buka blokir** | Putuskan kontak sepihak, bisa dibuka lagi. |
| 🗑️ | **Hapus riwayat** | Hapus per percakapan atau seluruh akun. |
| 🎨 | **Dark brutal UI** | Hitam pekat, aksen acid lime, animasi masuk, responsif & scrollable. |

> **Privasi tingkat tinggi:** tidak ada nama asli wajib, tidak ada sinkronisasi kontak HP, tidak ada iklan, tidak ada pelacak pihak ketiga. Handle & bio sepenuhnya opsional.

## ✦ Arsitektur

```mermaid
flowchart LR
  A[App Android<br/>Expo + RN] -- HTTPS --> B[API Express]
  A <-- WSS --> C[Socket.IO]
  B --> D[(SQLite<br/>terenkripsi AES-256-GCM)]
  C --> D
  A <-. WebRTC P2P .-> E[App lawan bicara]
  B --> F[Penyimpanan media]
