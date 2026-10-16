/**
 * YASAL METİNLER (16.10.2026) — KVKK aydınlatma metni, gizlilik + çerez ve
 * kullanım şartları. Saf modül: metin burada, şirket bilgileri
 * `config/legal.config.json`dan gelir. Bilgi eksikse metin "[eklenecek]" yazar
 * ve config `draft` iken sayfa TASLAK uyarısı taşır — hukuki incelemeden
 * geçmemiş metin kesinleşmiş gibi gösterilmez.
 *
 * Metin, kodun GERÇEKTE tuttuğu veriye göre yazıldı (hesap dışa aktarma
 * bölümleri, oturum kaydı, hız sınırı, profil fotoğrafı meta veri silme, hesap
 * silme). `DATA_CATEGORY_BY_EXPORT_SECTION` bir `Record`tır: oyuncuya bağlı yeni
 * bir veri bölümü eklenip burada anlatılmazsa tip denetimi durur.
 */
import type { AccountExportSectionName } from '@at-sevdalisi/shared-types';
import type { LegalConfig } from '@at-sevdalisi/game-config';

export type LegalDocKey = 'kvkk-aydinlatma' | 'gizlilik' | 'kullanim-sartlari';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  items?: string[];
}

export interface LegalDocument {
  key: LegalDocKey;
  title: string;
  summary: string;
  sections: LegalSection[];
}

export const LEGAL_DOC_ORDER: readonly LegalDocKey[] = ['kvkk-aydinlatma', 'gizlilik', 'kullanim-sartlari'];
export const LEGAL_PLACEHOLDER = '[eklenecek]';

export function legalHref(key: LegalDocKey): string {
  return `/yasal/${key}`;
}

/** Hesap dışa aktarma bölümü → aydınlatma metnindeki veri kategorisi. */
export const DATA_CATEGORY_BY_EXPORT_SECTION: Record<AccountExportSectionName, string> = {
  account: 'Hesap ve kimlik',
  loginMethods: 'Hesap ve kimlik',
  sessions: 'Oturum ve güvenlik',
  sanctions: 'Oturum ve güvenlik',
  horses: 'Oyun verileri',
  raceEntries: 'Oyun verileri',
  questClaims: 'Oyun verileri',
  achievementClaims: 'Oyun verileri',
  cosmetics: 'Oyun verileri',
  transactions: 'Oyun içi ekonomi ve satın almalar',
  gifts: 'Oyun içi ekonomi ve satın almalar',
  friendGifts: 'Oyun içi ekonomi ve satın almalar',
  tribuneGifts: 'Oyun içi ekonomi ve satın almalar',
  payments: 'Oyun içi ekonomi ve satın almalar',
  messages: 'İletişim içerikleri',
  clubMessages: 'İletişim içerikleri',
  friendships: 'Sosyal ilişkiler',
  blocks: 'Sosyal ilişkiler',
  reportsFiled: 'Sosyal ilişkiler',
  notifications: 'Sosyal ilişkiler',
  club: 'Sosyal ilişkiler',
  clubInvites: 'Sosyal ilişkiler',
  referrals: 'Sosyal ilişkiler',
  avatar: 'Görsel içerikler',
  profilePhoto: 'Görsel içerikler',
  avatarJobs: 'Görsel içerikler',
};

const CATEGORY_DETAILS: Record<string, string> = {
  'Hesap ve kimlik':
    'kullanıcı adı, görünen ad, e-posta adresi (kayıtlıysan), şifrenin tek yönlü özeti (şifrenin kendisi saklanmaz), bağladıysan Google hesap kimliği',
  'Oturum ve güvenlik':
    'oturum kayıtları ve tarayıcı/cihaz bilgisi (user agent), hesaba uygulanan yaptırım kayıtları; IP adresi yalnızca hız sınırlaması için dakikalar süren geçici bellekte tutulur',
  'Oyun verileri': 'atların, yarış katılımların ve sonuçların, görev/başarım ödüllerin, kozmetik ürünlerin',
  'Oyun içi ekonomi ve satın almalar':
    'oyun içi çip ve elmas hareketleri (değiştirilemez defter), arkadaş ve tribün hediyeleri, mağaza siparişleri (tutar, durum, tarih — kart bilgisi bu sistemde tutulmaz, ödeme sağlayıcısında işlenir)',
  'İletişim içerikleri': 'arkadaşlarınla özel mesajların, kulüp sohbeti ve yarış sohbeti mesajların',
  'Sosyal ilişkiler': 'arkadaşlıkların, engellediğin oyuncular, gönderdiğin şikâyetler, bildirimlerin, kulüp üyeliğin ve davetlerin, davet kodu ilişkin',
  'Görsel içerikler':
    'avatar seçimlerin, yüklediğin profil fotoğrafı (konum dahil meta verileri yüklemede silinir), AI avatar özelliği açıksa selfie (iş bitince silinir) ve üretilen avatar',
};

export function dataCategories(): Array<{ name: string; detail: string }> {
  const names = [...new Set(Object.values(DATA_CATEGORY_BY_EXPORT_SECTION))];
  return names.map((name) => ({ name, detail: CATEGORY_DETAILS[name] ?? '' }));
}

/** Config'te boş kalan şirket alanları (TASLAK uyarısında listelenir). */
export function missingLegalFields(config: LegalConfig): string[] {
  const missing: string[] = [];
  if (!config.controller.name) missing.push('şirket unvanı');
  if (!config.controller.address) missing.push('adres');
  if (!config.controller.contactEmail) missing.push('başvuru e-postası');
  if (!config.controller.mersisNo) missing.push('MERSİS numarası');
  if (config.minimumAge === null) missing.push('asgari yaş');
  if (!config.hostingProvider) missing.push('barındırma sağlayıcısı');
  if (!config.backupRetention) missing.push('yedek saklama süresi');
  if (!config.jurisdiction) missing.push('yetkili mahkeme');
  return missing;
}

export function isLegalDraft(config: LegalConfig): boolean {
  return config.status === 'draft' || missingLegalFields(config).length > 0;
}

const orPlaceholder = (value: string | number | null): string => (value === null || value === '' ? LEGAL_PLACEHOLDER : String(value));

export function buildLegalDocuments(config: LegalConfig): Record<LegalDocKey, LegalDocument> {
  const c = config.controller;
  const controllerLine = `${orPlaceholder(c.name)} — adres: ${orPlaceholder(c.address)}, e-posta: ${orPlaceholder(c.contactEmail)}, MERSİS: ${orPlaceholder(c.mersisNo)}${c.kepAddress ? `, KEP: ${c.kepAddress}` : ''}`;
  const contact = orPlaceholder(c.contactEmail);

  return {
    'kvkk-aydinlatma': {
      key: 'kvkk-aydinlatma',
      title: 'KVKK Aydınlatma Metni',
      summary: '6698 sayılı Kişisel Verilerin Korunması Kanunu md. 10 kapsamında hangi verini neden ve nasıl işlediğimiz.',
      sections: [
        { heading: '1. Veri sorumlusu', paragraphs: [controllerLine] },
        {
          heading: '2. İşlenen kişisel veriler',
          paragraphs: ['Oyunu oynadığın sürece aşağıdaki veriler işlenir:'],
          items: dataCategories().map((category) => `${category.name}: ${category.detail}.`),
        },
        {
          heading: '3. İşleme amaçları',
          paragraphs: [],
          items: [
            'Hesabının oluşturulması, oturumunun güvenle sürdürülmesi ve oyun hizmetinin sunulması.',
            'Oyun içi ekonominin (çip, elmas, ödüller, hediyeler) doğru ve denetlenebilir tutulması.',
            'Hile, çoklu hesapla değer aktarma ve kötüye kullanımın önlenmesi; şikâyetlerin incelenmesi.',
            'Arkadaşlık, mesajlaşma, kulüp ve davet gibi sosyal özelliklerin çalışması.',
            'Satın alma yapılırsa siparişin yürütülmesi ve mali kayıt yükümlülükleri.',
          ],
        },
        {
          heading: '4. Hukuki sebepler',
          paragraphs: [
            'KVKK md. 5/2-c (sözleşmenin kurulması ve ifası — oyun hizmeti), md. 5/2-ç (hukuki yükümlülük — mali kayıtlar), md. 5/2-f (meşru menfaat — güvenlik ve hile önleme). Selfie ile AI avatar oluşturma özelliği açıldığında yalnızca açık rızanla (md. 5/1) işlenir.',
          ],
        },
        {
          heading: '5. Aktarım',
          paragraphs: ['Veriler yalnızca hizmetin işlemesi için gereken tedarikçilere aktarılır:'],
          items: [
            `Barındırma: ${orPlaceholder(config.hostingProvider)}.`,
            'E-posta gönderimi (doğrulama, şifre sıfırlama): yapılandırıldığında Resend (yurt dışı).',
            'Google ile giriş seçersen: Google (yurt dışı).',
            'Mağaza açıldığında: seçilecek ödeme sağlayıcısı.',
          ],
        },
        {
          heading: '6. Toplama yöntemi',
          paragraphs: ['Veriler oyun arayüzü ve sunucusu üzerinden, elektronik ortamda, otomatik yollarla toplanır.'],
        },
        {
          heading: '7. Saklama ve silme',
          paragraphs: [
            `Hesabını Hesap sayfasından silebilirsin: kişisel verilerin silinir ve hesap anonimleşir. Değiştirilemez oyun içi defter kayıtları ve ödeme siparişleri, kişiyle ilişkisi kaldırılmış biçimde mali kayıt olarak saklanır. Yedeklerde kalan kopyalar ${orPlaceholder(config.backupRetention)} sonra silinir.`,
          ],
        },
        {
          heading: '8. Hakların (KVKK md. 11)',
          paragraphs: [
            `Verilerinin işlenip işlenmediğini öğrenme, bilgi ve kopya isteme, düzeltme, silme, aktarılan üçüncü kişileri öğrenme, otomatik analiz sonucuna itiraz ve zararın giderilmesini isteme haklarına sahipsin. Başvuru: ${contact}. Verilerinin bir kopyası (dışa aktarma) bu başvuruyla verilir.`,
          ],
        },
      ],
    },
    gizlilik: {
      key: 'gizlilik',
      title: 'Gizlilik ve Çerez Politikası',
      summary: 'Tarayıcında neyi sakladığımız, herkese neyin göründüğü ve gizlilik ayarların.',
      sections: [
        {
          heading: 'Tarayıcı depolaması',
          paragraphs: [
            'Reklam ya da analiz çerezi ve üçüncü taraf izleme KULLANILMAZ. Tarayıcının yerel depolamasında yalnızca oturum anahtarların, ses ve grafik kalitesi tercihin, kapattığın duyurular ve davet bağlantısıyla geldiysen davet kodu tutulur.',
            'Yazı tipleri sitenin kendisinden sunulur; 3D sahneler dış kaynaktan dosya indirmez. "Google ile giriş" düğmesi yalnızca Google girişi açıksa Google\'ın betiğini yükler.',
          ],
        },
        {
          heading: 'Herkese açık profil',
          paragraphs: [
            'Profilinde kullanıcı adın, görünen adın, seviyen, avatarın, varsa profil fotoğrafın ve ödülünü aldığın başarımlar görünür. Bakiyen ve işlem geçmişin hiçbir zaman herkese açık değildir.',
          ],
        },
        {
          heading: 'Gizlilik ayarların',
          paragraphs: [
            'Çevrimiçi durumunu ve son görülme bilgini Sosyal ekranından gizleyebilirsin. Bir oyuncuyu engellersen mesaj, hediye, davet ve arkadaşlık isteği iki yönde de kapanır; engellenen kişiye bildirilmez.',
          ],
        },
        {
          heading: 'Güvenlik',
          paragraphs: [
            'Şifreler tek yönlü özetle saklanır; şifre sıfırlama ve doğrulama bağlantıları tek kullanımlıktır ve veritabanında yalnızca özetleri tutulur. Profil fotoğrafındaki konum gibi meta veriler yüklemede silinir.',
          ],
        },
      ],
    },
    'kullanim-sartlari': {
      key: 'kullanim-sartlari',
      title: 'Kullanım Şartları',
      summary: 'Oyunu kullanırken geçerli kurallar.',
      sections: [
        {
          heading: 'Hesap',
          paragraphs: [
            `Oyunu misafir olarak başlatabilir, e-posta ya da Google ile hesabını kaydedebilirsin. Asgari yaş: ${orPlaceholder(config.minimumAge)}. Hesabının güvenliğinden sen sorumlusun; tek kişi tek hesap kullanır.`,
          ],
        },
        {
          heading: 'Oyun içi çip ve elmas',
          paragraphs: [
            'Çip ve elmas yalnızca oyun içinde kullanılan sanal birimlerdir; gerçek para karşılığı yoktur, paraya çevrilemez ve oyun dışına aktarılamaz. Çip yalnızca oyun kurallarının izin verdiği arkadaş transferiyle başka oyuncuya geçer; mağazadan satın alınan çip arkadaşa gönderilemez. Elmas yalnızca görünüş ve kolaylık ürünlerinde kullanılır.',
          ],
        },
        {
          heading: 'Satın almalar',
          paragraphs: [
            'Mağaza bugün kapalıdır. Açıldığında ödemeler ödeme sağlayıcısının sayfasında yapılır; ürün yalnızca sağlayıcının onayıyla hesabına geçer. Mesafeli satış sözleşmesi, ön bilgilendirme ve cayma hakkı metinleri mağaza açılmadan önce eklenecektir. İade edilen satın almanın ürünü hesabından geri alınır.',
          ],
        },
        {
          heading: 'Davranış kuralları',
          paragraphs: [],
          items: [
            'Hile, otomasyon, açıkların kötüye kullanımı ve birden çok hesapla değer aktarmak yasaktır.',
            'Taciz, nefret söylemi, dolandırıcılık ve başkasının kişisel verisini paylaşmak yasaktır.',
            'Kurallara aykırılıkta hesap süreli askıya alınabilir ya da yasaklanabilir; kararlar kayıt altına alınır.',
          ],
        },
        {
          heading: 'İçerik',
          paragraphs: [
            'Gönderdiğin mesajlardan ve yüklediğin fotoğraftan sen sorumlusun; kurallara aykırı içerik kaldırılabilir. Yarış sonuçları sunucuda belirlenir ve kesindir.',
          ],
        },
        {
          heading: 'Hizmet ve uyuşmazlık',
          paragraphs: [
            `Oyun geliştirilmeye devam eder; özellikler ve denge değişebilir. Uyuşmazlıklarda yetkili mahkeme: ${orPlaceholder(config.jurisdiction)}. İletişim: ${contact}.`,
          ],
        },
      ],
    },
  };
}
