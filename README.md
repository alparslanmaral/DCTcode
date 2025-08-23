# DCT Code

Hafif, tarayıcı tabanlı bir mini “VSCode benzeri” proje/dosya editörü. LocalStorage üzerinde kalıcılık, çoklu kayıt slotları, GitHub public repo klonlama ve Light/Dark tema desteği sağlar.

## Özellikler

- Yeni Proje oluşturma (README.md ile otomatik başlangıç)
- Dosya / klasör (sentinel) oluşturma, yeniden adlandırma, silme
- Sekmeli çoklu açık dosya görünümü
- Değişiklik (dirty) takibi ve toplu kaydetme (Ctrl+S)
- 5 adet Save Slot (projenin tamamını kopyala/yükle)
- GitHub public repository klon (main/master branch otomatik tespit)
- Light / Dark tema (kalıcı) – Toggle: Activity bar’daki 🌙/☀️ ikon
- Klavyeden kısayollar
- Kaydedilmemiş değişiklik uyarısı (beforeunload)

## Ekran Görünümü (Özet)

- Sol Activity Bar: Explorer, Slots, GitHub Clone, Tema, About
- Explorer: Proje adı düzenleme + dosya ağacı
- Save Slots: Mevcut projenin anlık snapshot’ı
- GitHub Clone: Repo URL girişi (örn: `https://github.com/user/repo` veya belirli branch: `.../tree/dev`)
- Tema Simge: Light ↔ Dark
- Status Bar: Aktif proje, dosya, kaydetme durumu

## Kurulum

Tarayıcıda açmanız yeterli:
```
index.html
```

Sunucu gerekmez; tamamen LocalStorage kullanır.

## Kısayollar

| Kısayol | İşlev |
|--------|-------|
| Ctrl+S veya Cmd+S | Tüm değişiklikleri kaydet |
| Ctrl+Shift+N | Yeni proje oluştur |
| Ctrl+Alt+T | Tema değiştir (Light/Dark) |
| (Sekmedeki ×) | Dosya sekmesini kapat |

## Tema

- Varsayılan: Dark
- Anahtar: `dctcode_theme` (LocalStorage)
- CSS değişkenleriyle (CSS Custom Properties) kolay genişletilebilir.
- Açık modda arka planlar açık gri tonlara, metinler koyu renklere döner; vurgu (accent) kırmızı sabit kalır.

## Veri Yapısı

```json
{
  "name": "ProjeAdı",
  "files": { "path/dosya.txt": "içerik", "README.md": "# ..." },
  "openFiles": ["README.md","main.js"],
  "activeFile": "README.md",
  "created": "ISO",
  "updated": "ISO"
}
```

Slotlar: `dctcode_slots` -> (en fazla 5) proje snapshot dizisi  
Aktif proje: `dctcode_current_project`

## GitHub Klon Özeti

1. Repo URL girilir (public).
2. Varsayılan branch tespiti: (girildiyse branch), yoksa main/master kontrolü, fallback repo metadata.
3. `git/trees/:branch?recursive=1` ile tüm blob’lar liste.
4. Raw içerik indirip `project.files` objesine yazılır.

## Genişletme Fikirleri

- Zip export / import
- Monaco Editor entegrasyonu
- Syntax highlight + dil algılama
- Dosya arama (full-text)
- Basit terminal / komut paneli
- Klasör yeniden adlandırma desteği
- Çoklu proje yönetimi (liste ekranı)

## Geliştirme Notları

- Klasörler gerçek dizin değil; boş klasörü göstermek için `.dct_folder` sentinel dosyası ekleniyor.
- Performans küçük projeler içindir; binlerce dosyada optimize edilmesi gerekir.
- Güvenlik: Tamamen client-side; hassas token kullanmayın. Private repo klonu yok.

## Geliştirici

Ahmet Alparslan Maral
