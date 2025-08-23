# DCT Code

Tarayıcı içinde çalışan, hafif, kurulum gerektirmeyen bir mini kod editörü.  
Amaç: Bilgisayarınıza ekstra program (VSCode / GitHub Desktop) kurmadan; hatta **mobil cihazlardan bile** (telefon / tablet) hızlıca kod düzenleyip GitHub repository’lerinize push edebilmenizi sağlamak.

> Sadece siteye gidin, Personal Access Token (PAT) oluşturun, kodunuzu yazın ve push edin. Hepsi tarayıcıda.

---

## İçindekiler
1. Özellikler
2. Hızlı Başlangıç (1 dakikada)
3. Kullanım Adımları (Detay)
4. GitHub Personal Access Token (PAT) Oluşturma
5. GitHub’a Push Akışı
6. Klavye Kısayolları
7. Güvenlik Uyarıları
8. Sık Sorulan Sorular (SSS)
9. Sorun Giderme
10. Geliştirici

---

## 1. Özellikler

- Tamamen client‑side (tüm veriler LocalStorage’da)
- Yeni proje oluşturma / proje adı düzenleme
- Dosya & “klasör” oluşturma (klasörler sentinel dosyasıyla temsil edilir)
- Sekmeli çoklu dosya düzenleme
- Değişiklik (dirty) takibi ve tek tuşla kaydetme
- 5 adet “Save Slot” (proje snapshot kaydet / yükle)
- Light / Dark tema (kalıcı)
- Public GitHub repo içeriğini URL ile klonlama (main/master otomatik tespit)
- GitHub’a **Personal Access Token (PAT)** kullanarak tek commit ile tüm proje push
- Branch var mı kontrol etme ve yoksa oluşturma
- Opsiyonel alt dizin (prefix) ile push (örn. tüm içeriği `src/` altına koymak)
- Mobil uyumlu (dokunma ile sekme/dosya gezilebilir)

Hiçbir backend veya sunucu bileşeni gerektirmez. (Klonlama public raw içerik, push işlemleri GitHub API üzerinden token ile yapılır.)

---

## 2. Hızlı Başlangıç (1 Dakika)

1. Siteye git:  https://alparslanmaral.github.io/DCTcode/
2. “GitHub” paneline geç → PAT alanına tıklama
3. GitHub’da PAT oluştur (aşağıdaki bölümde anlatılıyor) ve token’ı yapıştır → “Token Kaydet” → “Doğrula”
4. “Repo Getir” → push yapmak istediğin repo’yu seç
5. Branch adı (örn. `main`) gir → “Branch Kontrol”; yoksa “Branch Oluştur”
6. Dosyaları düzenle veya yeni oluştur
7. “Commit mesajı” yaz → “Push Proje” → GitHub’a git ve sonucu gör

---

## 3. Kullanım Adımları (Detay)

### 3.1 Arayüz Bölgeleri
- Sol Activity Bar: Explorer, Save Slots, GitHub (Clone & Push), Tema, Hakkında
- Explorer Paneli: Proje adı, dosya ağacı, yeni dosya/klasör butonları
- GitHub Paneli:
  - PAT yönetimi (kaydet/doğrula/sil)
  - Repo klonlama (public URL)
  - Push bölümü (repo seçimi, branch, prefix, commit mesajı)
  - Log alanı (İlerleme + hata mesajları)
- Alt Status Bar: Proje adı, aktif dosya, kaydetme durumu

### 3.2 Yeni Proje
- Explorer üst kısmındaki “+P” (Yeni Proje) butonu veya kısayol: `Ctrl+Shift+N`
- Otomatik bir `README.md` oluşturulur ve açılır.

### 3.3 Dosya / Klasör
- +F → Dosya
- +D → Klasör (arka planda `.dct_folder` sentinel dosyası eklenir)
- Dosya sekmeleri tıklanarak veya ağaçtan seçilerek değiştirilir.
- Sağ tıklama (context menu): Yeni dosya, yeni klasör, yeniden adlandır (dosya), sil

### 3.4 Kaydetme
- Düzenleme yapınca sekmede “*” belirir, ağaçta dosya ismi yıldızlı görünür.
- `Ctrl+S` → tüm açık değişiklikleri LocalStorage’a yazar ve “Saved” durumuna geçirir.

### 3.5 Save Slots
- 5 slot (snapshot) vardır.
- Mevcut proje durumunu slot’a kaydedebilir, sonra geri yükleyebilirsin.
- Komple proje JSON kopyası şeklinde saklanır.

### 3.6 Tema
- Activity Bar’daki 🌙 / ☀️ simgesine tıklayarak Light ↔ Dark
- Kısayol: `Ctrl+Alt+T`
- Tercih LocalStorage’a kaydedilir.

### 3.7 Public Repo Klonlama
- GitHub panelindeki “Repo URL” alanına şu formatlardan biri:
  - `https://github.com/kullanici/repo`
  - `https://github.com/kullanici/repo/tree/branch`
- “Clone” butonuna bas → Dosyalar indirildikten sonra proje içeriği değişir.
- Bu işlem mevcut (kaydedilmemiş) çalışmanı ezebilir; uyarı verebilir.

### 3.8 Push (PAT ile)
- PAT doğrulanmış olmalı.
- “Repo Getir” ile listede gözüken repo seçilir.
- Branch girilir:
  - Mevcutsa “Branch Kontrol” başarılı döner.
  - Yoksa “Branch Oluştur” ile (main/master taban alınarak) oluşturulabilir.
- İsteğe bağlı “Alt Klasör (prefix)” girersen tüm dosyalar push sırasında o klasör altına yerleştirilir.
- Commit mesajı yaz → “Push Proje”
- İşlem adımları (blob → tree → commit → ref update) log’da izlenebilir.

### 3.9 Mobil Kullanım
- Dokunarak dosya/sekme seçimi, butonlar da kullanılabilir.

---

## 4. GitHub Personal Access Token (PAT) Oluşturma

### 4.1 Fine-Grained (Önerilen)
1. GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens
2. “Generate new token”
3. Name: Örn. `DCT Code`
4. Expiration: Kısa bir süre (örn. 30 gün) seç
5. Resource owner: (Kendi hesabın veya push yapmak istediğin organizasyon)
6. Repository access: “Only select repositories” → push edeceğin repo(ları) seç
7. Permissions → Repository permissions → “Contents: Read and write”
8. Generate → Token’ı kopyala (tek sefer gösterilir)

### 4.2 Uygulamaya Girme
- GitHub panelinde PAT alanına yapıştır → “Token Kaydet” → “Doğrula”
- Başarılı doğrulama sonrası kullanıcı adı & avatar görünür.

### 4.3 Minimum Gerekli İzin
- Sadece repo içeriği pushlamak için “Contents: Read and write” (fine-grained) yeterlidir.

---

## 5. GitHub’a Push Akışı (Özet)

1. Ref (branch) SHA alınır (`/git/ref/heads/{branch}`)
2. Base commit incelenir → tree SHA elde edilir
3. Her yerel dosya için blob oluşturulur (`/git/blobs`)
4. Yeni tree (`/git/trees`) base tree + yeni blob’lar ile hazırlanır
5. Yeni commit (`/git/commits`) oluşturulur (parent = base commit)
6. Branch ref (`/git/refs/heads/{branch}`) yeni commit SHA ile güncellenir

Push tamamlandığında GitHub repo’da commit’i görebilirsin.

---

## 6. Klavye Kısayolları

| Kısayol | İşlev |
|---------|-------|
| Ctrl+S | Tüm değişiklikleri kaydet |
| Ctrl+Shift+N | Yeni proje |
| Ctrl+Alt+T | Tema değiştir |
| (Sekme üzerindeki ×) | Sekmeyi kapat |

MacOS’ta `Cmd` tuşu aynı işleve sahiptir.

---

## 7. Güvenlik Uyarıları

- PAT tarayıcı LocalStorage’da tutulur (anahtar: `dctcode_pat`)
- XSS (cross-site scripting) açığı oluşursa token sızabilir
- Güvenmediğin cihazlarda token bırakma → iş bitince “Sil / Çıkış”
- Şüphe durumunda GitHub Settings → ilgili token → “Revoke” yap

---

## 8. Sık Sorulan Sorular (SSS)

**S: Branch yok uyarısı alıyorum.**  
Y: “Branch Oluştur” butonunu kullan; base olarak main/master tespit ediliyor.

**S: Token süresi doldu ne yapacağım?**  
Y: Yeni PAT oluştur → uygulamada eskisini sil → yenisini gir.

---

## 9. Sorun Giderme

| Belirti | Muhtemel Neden | Çözüm |
|---------|----------------|-------|
| 401 Unauthorized | Token yanlış / Expired / Revoke | Token’ı yeniden gir veya yenile |
| 403 Ref update hatası | Branch korumalı | Repo ayarlarını kontrol et |
| 404 Repo yok | Fine-grained seçerken repo eklenmedi | Yeni token oluştur, doğru repo seç |
| Branch oluşturmuyor | Base branch bulunamadı | Repo default branch adını manuel gir (örn. `develop`) |
| Push çok yavaş | Çok dosya / büyük içerik | Dosya sayısını azalt veya parça parça push |
| Değişiklik kayboldu | Yeni clone yaptın | Clone öncesi kaydedilmemiş değişikleri kaydet |

Rate limit durumunu görmek için (token ile):
```
GET https://api.github.com/rate_limit
Authorization: token <PAT>
```

---

## 10. Geliştirici

Ahmet Alparslan Maral

X: @dctstudios2024

---

## Özet

DCT Code; tarayıcıdan (masaüstü veya mobil) hızlıca kod düzenleyip GitHub’a push yapabilmek için tasarlanmış basit, bağımsız bir editördür.  
Başlamak için: siteyi aç → PAT oluştur → doğrula → repo & branch seç → düzenle → push.

Sorularınız veya geliştirme talepleriniz için issue açabilirsiniz. İyi çalışmalar!