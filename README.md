# DCT Code

Hafif, tarayıcı tabanlı mini editör (VSCode benzeri). LocalStorage kalıcılık, kayıt slotları, GitHub public repo klon, Light/Dark tema ve GitHub PAT ile push desteği içerir.

## Özellikler

- Yeni proje oluşturma (README.md başlangıcı)
- Dosya / klasör (sentinel) yönetimi
- Sekmeli çoklu dosya
- Dirty takibi, toplu kaydet (Ctrl+S)
- 5 Save Slot (snapshot)
- GitHub public repo klon (main/master tespiti)
- Light / Dark tema (kalıcı)
- GitHub’a Personal Access Token ile tek commit push
- Branch kontrol / oluşturma
- Opsiyonel alt klasör (prefix) ile push

## PAT (Personal Access Token) ile GitHub Push

### Neden PAT?
Backend olmadan (sadece client-side) güvenli OAuth akışı yapılamadığı için push işlemleri kullanıcıdan alınan PAT ile yapılır.

### Token Nasıl Alınır?
1. GitHub: Settings → Developer Settings → Personal Access Tokens (classic veya fine-grained).
2. Scope:
   - Sadece public repo: `public_repo`
   - Private repo da dahil: `repo`
3. Süre (expiration) belirleyin.
4. Token’ı kopyalayın (ghp_ veya fine-grained format).
5. Uygulamadaki “GitHub PAT” kutusuna yapıştır → “Token Kaydet” → “Doğrula”.

### Push Akışı
1. Token doğrulanır (USER bilgisi gelir).
2. “Repo Getir” → repo listesi seçilir.
3. Branch adı (örn. main) yazılır.
   - Yoksa “Branch Kontrol” → yoksa “Branch Oluştur”.
4. Commit mesajı yazılır.
5. (Opsiyonel) Alt klasör girilebilir (ör. `src` → tüm dosyalar repo içinde `src/` altına atılır).
6. “Push Proje” → Tek commit içinde tüm dosyalar gönderilir.

### Teknik Push Adımları
1. `GET /repos/:repo/git/ref/heads/:branch` → base commit
2. Base commit içinden base tree alınır
3. Yerel her dosya için `POST /git/blobs`
4. `POST /git/trees` (base_tree + yeni blob’lar)
5. `POST /git/commits` (parents = [base commit])
6. `PATCH /git/refs/heads/:branch` → ref güncelle

### Güvenlik Uyarısı
- Token localStorage’da saklanır (anahtar: `dctcode_pat`).
- XSS olursa token çalınabilir.
- İşiniz bitince “Sil / Çıkış” ile token’ı kaldırın.

## Kısayollar

| Kısayol | İşlev |
|--------|-------|
| Ctrl+S | Kaydet |
| Ctrl+Shift+N | Yeni proje |
| Ctrl+Alt+T | Tema değiştir |
| (Sekme ×) | Dosya sekmesini kapat |

## Veri Yapısı

```json
{
  "name": "ProjeAdı",
  "files": { "README.md": "# ..." },
  "openFiles": ["README.md"],
  "activeFile": "README.md",
  "created": "ISO",
  "updated": "ISO"
}
```

Klasörler için `.dct_folder` sentinel dosyası kullanılır.

## Roadmap Fikirleri

- Zip export / import
- Monaco Editor
- Dosya arama & filtre
- Çoklu repo push seçeneği
- Klasör rename
- Diff / değişiklik önizleme

## Geliştiricii
Ahmet Alparslan Maral
