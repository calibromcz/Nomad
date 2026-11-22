/**
 * db.js — IndexedDB Promise wrapper per Nomad (00 Work)
 * Due store:
 * 1. 'trips_store': Viaggi strutturati in JSON, checklist, tappe, spese, impostazioni
 * 2. 'files_store': Blob binari compressi (immagini/PDF) con metadati e ID file
 */

const DB_NAME = 'nomad_db';
const DB_VERSION = 2;

let dbInstance = null;

export async function getDB() {
  if (dbInstance) return dbInstance;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('trips_store')) {
        db.createObjectStore('trips_store', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('files_store')) {
        db.createObjectStore('files_store', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('templates_store')) {
        db.createObjectStore('templates_store', { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB error:', event.target.error);
      reject(event.target.error);
    };
  });
}

// Operazioni Generiche su Store
export async function getAllFromStore(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function getById(storeName, id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putToStore(storeName, item) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(item);
    request.onsuccess = () => resolve(item);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteFromStore(storeName, id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(id);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

export async function clearStore(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Compressione e ridimensionamento immagini client-side via <canvas>
 * Lato lungo max 1800px, WebP qualità 0.82 (con fallback JPEG).
 * Mantiene QR code e documenti nitidissimi con peso <300KB.
 */
export async function processAndStoreFile(file, metadata = {}) {
  const fileId = 'file_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  let finalBlob = file;

  if (file.type.startsWith('image/')) {
    finalBlob = await compressImageToWebP(file, 1600, 0.80);
  }

  const fileRecord = {
    id: fileId,
    name: file.name,
    type: finalBlob.type,
    size: finalBlob.size,
    lastModified: Date.now(),
    tripId: metadata.tripId || null,
    category: metadata.category || 'documents',
    title: metadata.title || file.name,
    notes: metadata.notes || '',
    isPinned: Boolean(metadata.isPinned !== undefined ? metadata.isPinned : metadata.pinnedDashboard || false),
    pinnedDashboard: Boolean(metadata.pinnedDashboard !== undefined ? metadata.pinnedDashboard : metadata.isPinned || false),
    pinnedWallet: Boolean(metadata.pinnedWallet || false),
    inVault: Boolean(metadata.inVault || false),
    blob: finalBlob
  };

  await putToStore('files_store', fileRecord);
  return fileRecord;
}

export function compressImageToWebP(file, maxSide = 1600, quality = 0.80) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;

      if (width > maxSide || height > maxSide) {
        if (width > height) {
          height = Math.round((height * maxSide) / width);
          width = maxSide;
        } else {
          width = Math.round((width * maxSide) / height);
          height = maxSide;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Supporto WebP con fallback JPEG
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback JPEG
            canvas.toBlob((jpegBlob) => resolve(jpegBlob || file), 'image/jpeg', quality);
          }
        },
        'image/webp',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };

    img.src = url;
  });
}

function compressImage(file, maxSide = 1600, quality = 0.80) {
  return compressImageToWebP(file, maxSide, quality);
}

/**
 * Richiesta persistenza Storage nativa PWA
 */
export async function ensureStoragePersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        await navigator.storage.persist();
      }
    } catch (e) {
      console.warn('Storage persist check error:', e);
    }
  }
}

/**
 * Template predefiniti per la valigia
 */
export const DEFAULT_PACKING_TEMPLATES = [
  {
    id: 'template_weekend',
    name: 'Weekend Fuoriporta',
    items: [
      { category: 'Documenti', text: 'Documento identità / Patente', checked: false },
      { category: 'Tech', text: 'Caricatore smartphone & cavo', checked: false },
      { category: 'Tech', text: 'Powerbank 10.000 mAh', checked: false },
      { category: 'Abbigliamento', text: '2x T-shirt / Intimo / Calze', checked: false },
      { category: 'Abbigliamento', text: 'Giacca a vento / Felpa', checked: false },
      { category: 'Farmaci', text: 'Antidolorifico / Cerotti', checked: false },
      { category: 'Extra', text: 'Spazzolino e mini dentifricio', checked: false },
      { category: 'Extra', text: 'Ombrello compatto', checked: false }
    ]
  },
  {
    id: 'template_lungo',
    name: 'Viaggio Lungo Internazionale',
    items: [
      { category: 'Documenti', text: 'Passaporto originale + copia cartacea', checked: false },
      { category: 'Documenti', text: 'Visto d\'ingresso / e-Visa', checked: false },
      { category: 'Documenti', text: 'Polizza Sanitaria H24 stampata', checked: false },
      { category: 'Tech', text: 'Adattatore universale prese', checked: false },
      { category: 'Tech', text: 'Powerbank da viaggio + cavi USB-C/Lightning', checked: false },
      { category: 'Tech', text: 'Cuffie con cancellazione rumore', checked: false },
      { category: 'Tech', text: 'eSIM / SIM locale pronta', checked: false },
      { category: 'Abbigliamento', text: '7x cambi intimo e calze tecniche', checked: false },
      { category: 'Abbigliamento', text: 'Scarpe da camminata comode collaudate', checked: false },
      { category: 'Abbigliamento', text: 'Guscio impermeabile & sciarpa leggera', checked: false },
      { category: 'Farmaci', text: 'Kit pronto soccorso + antibiotico generico', checked: false },
      { category: 'Farmaci', text: 'Fermenti lattici & disinfettante intestinale', checked: false },
      { category: 'Extra', text: 'Lucchetto TSA per valigia', checked: false },
      { category: 'Extra', text: 'Cuscino da collo gonfiabile & mascherina', checked: false }
    ]
  },
  {
    id: 'template_business',
    name: 'Trasferta di Lavoro (3 Giorni)',
    items: [
      { category: 'Documenti', text: 'Biglietti treno/aereo salvati nel Wallet', checked: false },
      { category: 'Documenti', text: 'Badge aziendale e biglietti da visita', checked: false },
      { category: 'Tech', text: 'Laptop + Alimentatore USB-C 65W', checked: false },
      { category: 'Tech', text: 'Adattatore HDMI / Dongle USB', checked: false },
      { category: 'Tech', text: 'Mouse wireless compatto', checked: false },
      { category: 'Abbigliamento', text: '2x Camicie / Polo stirate', checked: false },
      { category: 'Abbigliamento', text: 'Blazer / Giacca smart casual', checked: false },
      { category: 'Abbigliamento', text: 'Scarpe eleganti confortevoli', checked: false },
      { category: 'Farmaci', text: 'Analgesico & integratore magnesio', checked: false },
      { category: 'Extra', text: 'Taccuino & penna gel', checked: false }
    ]
  }
];

/**
 * Dati Demo realistici al primo avvio (es. Shanghai & Yiwu)
 */
export function getDemoTrip() {
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 12 * 24 * 60 * 60 * 1000);
  const returnDate = new Date(nextMonth.getTime() + 10 * 24 * 60 * 60 * 1000);

  const startStr = nextMonth.toISOString().split('T')[0];
  const endStr = returnDate.toISOString().split('T')[0];

  return {
    id: 'trip_shanghai_yiwu',
    name: 'Shanghai & Yiwu Express',
    destination: 'Shanghai, Cina',
    startDate: startStr,
    endDate: endStr,
    status: 'active', // 'active' | 'upcoming' | 'past'
    homeCurrency: 'EUR',
    destCurrency: 'CNY',
    exchangeRate: 7.82, // 1 EUR = 7.82 CNY
    rateUpdatedAt: Date.now() - (2 * 60 * 60 * 1000), // 2 ore fa
    rateSource: 'auto', // 'auto' | 'manual'
    homeTimeZone: 'Europe/Rome',
    destTimeZone: 'Asia/Shanghai',
    weatherData: {
      current: {
        temp: 22,
        weathercode: 1,
        time: new Date().toISOString()
      },
      daily: {
        time: [
          new Date().toISOString().split('T')[0],
          new Date(Date.now() + 86400000).toISOString().split('T')[0],
          new Date(Date.now() + 172800000).toISOString().split('T')[0],
          new Date(Date.now() + 259200000).toISOString().split('T')[0],
          new Date(Date.now() + 345600000).toISOString().split('T')[0],
          new Date(Date.now() + 432000000).toISOString().split('T')[0],
          new Date(Date.now() + 518400000).toISOString().split('T')[0]
        ],
        weathercode: [1, 2, 0, 61, 1, 0, 2],
        temperature_2m_max: [24, 25, 23, 20, 22, 24, 25],
        temperature_2m_min: [16, 17, 15, 14, 15, 16, 17]
      }
    },
    weatherUpdatedAt: Date.now() - 3600000,
    accommodations: [
      {
        id: 'acc_demo_1',
        name: 'The PuLi Hotel & Spa',
        nameLocal: '璞丽酒店 (静安区常德路1号)',
        address: '1 Changde Rd, Jing\'an District, Shanghai',
        addressLocal: '上海市静安区常德路1号（近延安中路）',
        pnr: 'AF116-K89X4P',
        wifi: 'PuLi_Guest / SilkRoad2026',
        lockbox: 'A-7492#'
      }
    ],
    accommodation: {
      name: 'The PuLi Hotel & Spa',
      nameLocal: '璞丽酒店 (静安区常德路1号)',
      address: '1 Changde Rd, Jing\'an District, Shanghai',
      addressLocal: '上海市静安区常德路1号（近延安中路）',
      checkIn: '14:00',
      checkOut: '12:00',
      phone: '+86 21 3203 9999',
      lat: 31.2235,
      lng: 121.4475
    },
    codes: {
      pnr: 'AF116-K89X4P',
      lockbox: 'A-7492#',
      wifi: 'PuLi_Guest / SilkRoad2026',
      insurance: 'Allianz Global Care — Polizza #IT-948190',
      emergencyPhone: '+39 02 2660 9999'
    },
    preTripChecklist: [
      { id: 'pt_1', text: 'Scaricare mappe offline Shanghai (Amap / Organic Maps)', checked: true },
      { id: 'pt_2', text: 'Configurare Alipay / WeChat Pay con carta Revolut', checked: true },
      { id: 'pt_3', text: 'Attivare eSIM dati Roaming Asia', checked: false },
      { id: 'pt_4', text: 'Caricare powerbank e cavi da viaggio', checked: false },
      { id: 'pt_5', text: 'Verificare validità passaporto (>6 mesi)', checked: true }
    ],
    packingList: [
      { id: 'pk_1', category: 'Documenti', text: 'Passaporto originale con visto Cinese', checked: true },
      { id: 'pk_2', category: 'Documenti', text: 'Modulo sbarco / Arrival Card compilato', checked: false },
      { id: 'pk_3', category: 'Tech', text: 'Adattatore spina tipo A/I per prese cinesi', checked: true },
      { id: 'pk_4', category: 'Tech', text: 'Powerbank Anker 20.000 mAh (con scritta Wh visibile per controlli)', checked: true },
      { id: 'pk_5', category: 'Tech', text: 'Cavo di scorta USB-C to Lightning', checked: false },
      { id: 'pk_6', category: 'Abbigliamento', text: '4x t-shirt cotone traspirante', checked: true },
      { id: 'pk_7', category: 'Abbigliamento', text: 'Giacca antivento ultraleggera', checked: false },
      { id: 'pk_8', category: 'Abbigliamento', text: 'Sneakers da camminata resistenti', checked: true },
      { id: 'pk_9', category: 'Farmaci', text: 'Fermenti lattici, Imodium & Tachipirina', checked: true },
      { id: 'pk_10', category: 'Farmaci', text: 'Mascherine FFP2 per aereo & treni', checked: true },
      { id: 'pk_11', category: 'Extra', text: 'Pacchetti di fazzoletti tascabili (indispensabili)', checked: false },
      { id: 'pk_12', category: 'Extra', text: 'Monete e contanti ¥500 RMB di riserva', checked: false }
    ],
    itineraryDays: [
      {
        id: 'day_1',
        date: startStr,
        title: 'Arrivo a Pudong & Check-in',
        events: [
          {
            id: 'ev_1_1',
            time: '11:30',
            title: 'Atterraggio Volo AF116 @ PVG Terminal 2',
            category: 'Volo/Treno',
            notes: "Ritiro bagagli nastro 6, controllo impronte digitali",
            location: 'Shanghai Pudong Airport Terminal 2',
            mapsQuery: 'Shanghai Pudong International Airport',
            lat: 31.1443,
            lng: 121.8083
          },
          {
            id: 'ev_1_2',
            time: '13:00',
            title: 'Treno Maglev fino a Longyang Road',
            category: 'Volo/Treno',
            notes: "Biglietto 50 RMB mostrando carta d\\'imbarco. Velocità 430 km/h!",
            location: 'Maglev Station Longyang Rd',
            mapsQuery: 'Longyang Road Station Shanghai',
            lat: 31.2039,
            lng: 121.5577
          },
          {
            id: 'ev_1_3',
            time: '14:30',
            title: 'Check-in @ The PuLi Hotel',
            category: 'Alloggio',
            notes: "Deposito bagagli o camera pronta. Mostrare passaporto alla reception.",
            location: '1 Changde Rd, Jing\'an District',
            mapsQuery: 'The PuLi Hotel and Spa Shanghai',
            lat: 31.2235,
            lng: 121.4475
          },
          {
            id: 'ev_1_4',
            time: '19:00',
            title: 'Cena tipica: Xiaolongbao da Jia Jia Tang Bao',
            category: 'Cibo',
            notes: "I ravioli al vapore con brodo di granchio più famosi della città.",
            location: '90 Huanghe Rd, People\'s Square',
            mapsQuery: 'Jia Jia Tang Bao Huanghe Road Shanghai',
            lat: 31.2355,
            lng: 121.4690
          }
        ]
      },
      {
        id: 'day_2',
        date: new Date(nextMonth.getTime() + 1 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        title: 'The Bund, Yu Garden & Treno per Yiwu',
        events: [
          {
            id: 'ev_2_1',
            time: '08:30',
            title: 'Passeggiata mattutina su The Bund (Wai Tan)',
            category: 'Visita',
            notes: "Vista iconica sui grattacieli di Lujiazui prima della folla.",
            location: 'Zhongshan East 1st Rd, The Bund',
            mapsQuery: 'The Bund Shanghai'
          },
          {
            id: 'ev_2_2',
            time: '10:30',
            title: 'Giardino del Mandarino Yu (Yu Garden)',
            category: 'Visita',
            notes: "Giardino dinastico Ming con padiglioni d\\'epoca e carpe koi.",
            location: '279 Yuyuan Old St, Huangpu',
            mapsQuery: 'Yu Garden Shanghai'
          },
          {
            id: 'ev_2_3',
            time: '14:45',
            title: 'Treno Alta Velocità G1387 per Yiwu (1h 38m)',
            category: 'Volo/Treno',
            notes: "Partenza da Shanghai Hongqiao Railway Station. Binario 12B.",
            location: 'Shanghai Hongqiao Railway Station',
            mapsQuery: 'Shanghai Hongqiao Railway Station'
          },
          {
            id: 'ev_2_4',
            time: '17:30',
            title: 'Meeting fornitori Yiwu Trade Mart District 2',
            category: 'Lavoro',
            notes: "Padiglione ferramenta, orologeria ed elettronica.",
            location: 'Chouzhou North Rd, Yiwu',
            mapsQuery: 'Yiwu International Trade City'
          }
        ]
      }
    ],
    expenses: [
      {
        id: 'exp_1',
        date: startStr,
        time: '12:45',
        amountLocal: 100, // 100 CNY
        amountHome: 12.79, // ~12.79 EUR
        category: 'Trasporti',
        notes: "2x Biglietti Shanghai Maglev Express",
        currency: 'CNY',
        isSplit: true,
        paidBy: 'Io',
        splitWith: ['Io', 'Marco'],
        splitShares: { 'Io': 6.40, 'Marco': 6.39 }
      },
      {
        id: 'exp_2',
        date: startStr,
        time: '19:40',
        amountLocal: 88, // 88 CNY
        amountHome: 11.25, // ~11.25 EUR
        category: 'Cibo',
        notes: "Cena ravioli Jia Jia Tang Bao & té al gelsomino",
        currency: 'CNY',
        isSplit: true,
        paidBy: 'Marco',
        splitWith: ['Io', 'Marco'],
        splitShares: { 'Io': 5.62, 'Marco': 5.63 }
      },
      {
        id: 'exp_3',
        date: startStr,
        time: '21:15',
        amountLocal: 45, // 45 CNY
        amountHome: 5.75, // ~5.75 EUR
        category: 'Shopping',
        notes: "Adattatore da viaggio e acqua minerale in minimarket",
        currency: 'CNY',
        isSplit: false,
        paidBy: 'Io',
        splitWith: ['Io'],
        splitShares: { 'Io': 5.75 }
      }
    ],
    participants: ['Io', 'Marco', 'Giulia'],
    budgetHome: 1500,
    budget: 1500, // 1500 EUR budget stimato
    savedPhrases: [],
    savedTranslations: []
  };
}


export const DEFAULT_SURVIVAL_PHRASES = [
  {
    "id": "ph_sal_1",
    "category": "Saluti & Cortesia",
    "it": "Buongiorno / Buon pomeriggio",
    "translations": {
      "en": "Good morning / Good afternoon",
      "zh": "早上好 / 下午好",
      "ja": "おはようございます / こんにちは",
      "es": "Buenos días / Buenas tardes",
      "fr": "Bonjour / Bon après-midi",
      "de": "Guten Morgen / Guten Tag",
      "pt": "Bom dia / Boa tarde",
      "th": "สวัสดีครับ/ค่ะ",
      "ko": "좋은 아침입니다 / 안녕하세요",
      "ar": "صباح الخير / مساء الخير",
      "vi": "Chào buổi sáng / Chào buổi chiều",
      "tr": "Günaydın / Tünaydın",
      "el": "Καλημέρα / Καλό απόγευμα"
    },
    "phonetics": {
      "zh": "Zǎoshang hǎo / Xiàwǔ hǎo",
      "ja": "Ohayō gozaimasu / Konnichiwa",
      "ko": "Joeun achimimnida / Annyeonghaseyo",
      "th": "Sawatdee khrap/kha",
      "ar": "Sabah al-khayr / Masa' al-khayr",
      "vi": "Chao buoi sang / Chao buoi chieu",
      "el": "Kaliméra / Kaló apóyevma"
    }
  },
  {
    "id": "ph_sal_2",
    "category": "Saluti & Cortesia",
    "it": "Buonasera / Buonanotte",
    "translations": {
      "en": "Good evening / Good night",
      "zh": "晚上好 / 晚安",
      "ja": "こんばんは / おやすみなさい",
      "es": "Buenas noches",
      "fr": "Bonsoir / Bonne nuit",
      "de": "Guten Abend / Gute Nacht",
      "pt": "Boa noite",
      "th": "สวัสดีตอนเย็น / ราตรีสวัสดิ์",
      "ko": "좋은 저녁입니다 / 안녕히 주무세요",
      "ar": "مساء الخير / تصبح على خير",
      "vi": "Chào buổi tối / Chúc ngủ ngon",
      "tr": "İyi akşamlar / İyi geceler",
      "el": "Καλησπέρα / Καληνύχτα"
    },
    "phonetics": {
      "zh": "Wǎnshang hǎo / Wǎn'ān",
      "ja": "Konbanwa / Oyasuminasai",
      "ko": "Joeun jeonyeogimnida / Annyeonghi jumuseyo",
      "th": "Sawatdee ton yen / Ratri sawat",
      "ar": "Masa' al-khayr / Tusbih 'ala khayr",
      "el": "Kalispera / Kalinikhta"
    }
  },
  {
    "id": "ph_sal_3",
    "category": "Saluti & Cortesia",
    "it": "Scusi, posso disturbarla?",
    "translations": {
      "en": "Excuse me, may I disturb you?",
      "zh": "打扰一下，请问可以吗？",
      "ja": "すみません、少しよろしいですか？",
      "es": "Disculpe, ¿puedo molestarle un momento?",
      "fr": "Excusez-moi, puis-je vous déranger ?",
      "de": "Entschuldigung, darf ich kurz stören?",
      "pt": "Com licença, posso incomodar um momento?",
      "th": "ขอโทษนะครับ/ค่ะ รบกวนสักครู่ได้ไหม?",
      "ko": "실례합니다, 잠시 말씀 좀 여쭤봐도 될까요?",
      "ar": "عفواً، هل يمكنني إزعاجك لحظة؟",
      "vi": "Xin lỗi, tôi có thể làm phiền một chút không?",
      "tr": "Afedersiniz, rahatsız edebilir miyim?",
      "el": "Με συγχωρείτε, μπορώ να σας ενοχλήσω;"
    },
    "phonetics": {
      "zh": "Dǎrǎo yīxià, qǐngwèn kěyǐ ma?",
      "ja": "Sumimasen, sukoshi yoroshii desu ka?",
      "ko": "Sillyehamnida, jamsi malsseum jom yeojjwobwado doelkkayo?",
      "th": "Kho thot na khrap/kha, rop kuan sak khru dai mai?",
      "ar": "Afwan, hal yumkinuni iz'ajuk lahzah?",
      "el": "Me synchoreíte, boro na sas enochlíso?"
    }
  },
  {
    "id": "ph_sal_4",
    "category": "Saluti & Cortesia",
    "it": "Non parlo bene la lingua locale",
    "translations": {
      "en": "I don't speak the local language well",
      "zh": "我不太会说当地语言",
      "ja": "現地の言葉があまり上手に話せません",
      "es": "No hablo bien el idioma local",
      "fr": "Je ne parle pas bien la langue locale",
      "de": "Ich spreche die Landessprache nicht gut",
      "pt": "Não falo bem o idioma local",
      "th": "ฉันพูดภาษาท้องถิ่นได้ไม่ค่อยดี",
      "ko": "현지어를 잘 못해요",
      "ar": "أنا لا أتحدث اللغة المحلية جيداً",
      "vi": "Tôi không nói giỏi tiếng địa phương",
      "tr": "Yerel dili iyi konuşamıyorum",
      "el": "Δεν μιλάω καλά την τοπική γλώσσα"
    },
    "phonetics": {
      "zh": "Wǒ bù tài huì shuō dāngdì yǔyán",
      "ja": "Genchi no kotoba ga amari jōzu ni hanasemasen",
      "ko": "Hyeonjieoreul jal mothaeyo",
      "th": "Chan phut phasa thongthin dai mai khoi di",
      "ar": "Ana la atahaddath al-lughah al-mahalliyyah jayyidan",
      "el": "Dhen milao kala tin topiki glossa"
    }
  },
  {
    "id": "ph_sal_5",
    "category": "Saluti & Cortesia",
    "it": "Può parlare più lentamente, per favore?",
    "translations": {
      "en": "Could you speak more slowly, please?",
      "zh": "请问可以说慢一点吗？",
      "ja": "もう少しゆっくり話していただけますか？",
      "es": "¿Puede hablar más despacio, por favor?",
      "fr": "Pouvez-vous parler plus lentement, s'il vous plaît ?",
      "de": "Können Sie bitte etwas langsamer sprechen?",
      "pt": "Pode falar mais devagar, por favor?",
      "th": "ช่วยพูดช้าลงหน่อยได้ไหมครับ/ค่ะ?",
      "ko": "조금만 천천히 말씀해 주시겠어요?",
      "ar": "هل يمكنك التحدث ببطء أكثر من فضلك؟",
      "vi": "Bạn có thể nói chậm hơn một chút được không?",
      "tr": "Lütfen biraz daha yavaş konuşabilir misiniz?",
      "el": "Μπορείτε να μιλάτε πιο αργά, παρακαλώ;"
    },
    "phonetics": {
      "zh": "Qǐngwèn kěyǐ shuō màn yīdiǎn ma?",
      "ja": "Mō sukoshi yukkuri hanashite itadakemasu ka?",
      "ko": "Jogeumman cheoncheonhi malsseumhae jusigesseoyo?",
      "th": "Chuai phut cha long noi dai mai khrap/kha?",
      "ar": "Hal yumkinuk at-tahadduth bibut' akthar min fadlik?",
      "el": "Boreite na milate pio arga, parakalo?"
    }
  },
  {
    "id": "ph_sal_6",
    "category": "Saluti & Cortesia",
    "it": "Può scriverlo qui?",
    "translations": {
      "en": "Could you write it down here?",
      "zh": "可以帮我写在这里吗？",
      "ja": "ここに書いていただけますか？",
      "es": "¿Puede escribirlo aquí, por favor?",
      "fr": "Pouvez-vous l'écrire ici ?",
      "de": "Können Sie das bitte hier aufschreiben?",
      "pt": "Pode escrever aqui, por favor?",
      "th": "ช่วยเขียนลงตรงนี้ให้หน่อยได้ไหม?",
      "ko": "여기에 적어주시겠어요?",
      "ar": "هل يمكنك كتابة ذلك هنا من فضلك؟",
      "vi": "Bạn có thể viết ra đây được không?",
      "tr": "Bunu buraya yazabilir misiniz?",
      "el": "Μπορείτε να το γράψετε εδώ;"
    },
    "phonetics": {
      "zh": "Kěyǐ bāng wǒ xiě zài zhèlǐ ma?",
      "ja": "Koko ni kaite itadakemasu ka?",
      "ko": "Yeogie jeogeojusigesseoyo?",
      "th": "Chuai khian long trong ni hai noi dai mai?",
      "ar": "Hal yumkinuk kitabat thalika huna min fadlik?",
      "el": "Boreite na to grapsete edo?"
    }
  },
  {
    "id": "ph_sal_7",
    "category": "Saluti & Cortesia",
    "it": "Grazie mille, è stato gentilissimo",
    "translations": {
      "en": "Thank you very much, you've been very kind",
      "zh": "非常感谢，您太热心了",
      "ja": "本当にありがとうございます、ご親切に感謝します",
      "es": "Muchas gracias, ha sido muy amable",
      "fr": "Merci beaucoup, vous avez été très aimable",
      "de": "Vielen Dank, Sie waren sehr freundlich",
      "pt": "Muito obrigado, foi muito gentil",
      "th": "ขอบคุณมากครับ/ค่ะ คุณใจดีมากเลย",
      "ko": "정말 감사합니다, 대단히 친절하시네요",
      "ar": "شكراً جزيلاً، لقد كنت لطيفاً جداً",
      "vi": "Cảm ơn bạn rất nhiều, bạn thật tốt bụng",
      "tr": "Çok teşekkür ederim, çok naziksiniz",
      "el": "Ευχαριστώ πολύ, είστε πολύ ευγενικός"
    },
    "phonetics": {
      "zh": "Fēicháng gǎnxiè, nín tài rèxīn le",
      "ja": "Hontō ni arigatō gozaimasu, goshinsetsu ni kansha shimasu",
      "ko": "Jeongmal gamsahamnida, daedanhi chinjeolhasineyo",
      "th": "Khop khun mak khrap/kha, khun chaidi mak loei",
      "ar": "Shukran jazilan, laqad kunta latifan jiddan",
      "el": "Efcharisto poli, eiste poli evyenikos"
    }
  },
  {
    "id": "ph_sal_8",
    "category": "Saluti & Cortesia",
    "it": "Nessun problema / Va benissimo così",
    "translations": {
      "en": "No problem / That's totally fine",
      "zh": "没问题 / 这样挺好的",
      "ja": "問題ありません / これで大丈夫です",
      "es": "No hay problema / Está perfecto así",
      "fr": "Pas de problème / C'est très bien comme ça",
      "de": "Kein Problem / Das passt so perfekt",
      "pt": "Sem problemas / Está ótimo assim",
      "th": "ไม่มีปัญหา / แบบนี้โอเคเลย",
      "ko": "문제없어요 / 이렇게 하면 완벽해요",
      "ar": "لا مشكلة / هذا رائع جداً",
      "vi": "Không vấn đề gì / Thế này là rất tốt rồi",
      "tr": "Sorun değil / Böyle çok iyi",
      "el": "Κανένα πρόβλημα / Μια χαρά έτσι"
    },
    "phonetics": {
      "zh": "Méi wèntí / Zhèyàng tǐng hǎo de",
      "ja": "Mondai arimasen / Kore de daijōbu desu",
      "ko": "Munjeeopseoyo / Iroke hamyeon wanbyeokhaeyo",
      "th": "Mai mi panha / Baep ni o-khe loei",
      "ar": "La mushkilah / Hadha ra'i' jiddan",
      "el": "Kanena provlima / Mia chara etsi"
    }
  },
  {
    "id": "ph_eme_1",
    "category": "Emergenze",
    "it": "Aiuto! È un'emergenza",
    "translations": {
      "en": "Help! It's an emergency",
      "zh": "救命！这是紧急情况！",
      "ja": "助けて！緊急事態です！",
      "es": "¡Ayuda! Es una emergencia",
      "fr": "Au secours ! C'est une urgence",
      "de": "Hilfe! Es ist ein Notfall",
      "pt": "Socorro! É uma emergência",
      "th": "ช่วยด้วย! นี่เป็นเรื่องฉุกเฉิน",
      "ko": "도와주세요! 응급 상황입니다",
      "ar": "النجدة! هذه حالة طارئة",
      "vi": "Cứu với! Đây là trường hợp khẩn cấp",
      "tr": "İmdat! Bu bir acil durum",
      "el": "Βοήθεια! Είναι επείγουσα ανάγκη"
    },
    "phonetics": {
      "zh": "Jiùmìng! Zhè shì jǐnjí qíngkuàng!",
      "ja": "Tasukete! Kinkyū jitai desu!",
      "ko": "Dowajuseyo! Eunggeup sanghwang-imnida",
      "th": "Chuai duai! Ni pen rueang chukchoen",
      "ar": "An-najdah! Hadhihi halat tari'ah",
      "el": "Voitheia! Einai epeigousa ananki"
    }
  },
  {
    "id": "ph_eme_2",
    "category": "Emergenze",
    "it": "Chiami la polizia, per favore",
    "translations": {
      "en": "Please call the police",
      "zh": "请报警 / 请叫警察",
      "ja": "警察を呼んでください",
      "es": "Llame a la policía, por favor",
      "fr": "Appelez la police, s'il vous plaît",
      "de": "Rufen Sie bitte die Polizei",
      "pt": "Chame a polícia, por favor",
      "th": "ช่วยโทรแจ้งตำรวจหน่อยครับ/ค่ะ",
      "ko": "경찰을 불러주세요",
      "ar": "اتصل بالشرطة من فضلك",
      "vi": "Làm ơn gọi cảnh sát giúp tôi",
      "tr": "Lütfen polisi arayın",
      "el": "Καλέστε την αστυνομία, παρακαλώ"
    },
    "phonetics": {
      "zh": "Qǐng bàojǐng / Qǐng jiào jǐngchá",
      "ja": "Keisatsu o yonde kudasai",
      "ko": "Gyeongchareul bulleojuseyo",
      "th": "Chuai tho chaeng tamruat noi khrap/kha",
      "ar": "Ittasil bish-shurtah min fadlik",
      "el": "Kaleste tin astynomia, parakalo"
    }
  },
  {
    "id": "ph_eme_3",
    "category": "Emergenze",
    "it": "Chiami un'ambulanza, per favore",
    "translations": {
      "en": "Please call an ambulance",
      "zh": "请叫救护车",
      "ja": "救急車を呼んでください",
      "es": "Llame a una ambulancia, por favor",
      "fr": "Appelez une ambulance, s'il vous plaît",
      "de": "Rufen Sie bitte einen Krankenwagen",
      "pt": "Chame uma ambulância, por favor",
      "th": "ช่วยเรียกรถพยาบาลหน่อยครับ/ค่ะ",
      "ko": "구급차를 불러주세요",
      "ar": "اتصل بالإسعاف من فضلك",
      "vi": "Làm ơn gọi xe cấp cứu",
      "tr": "Lütfen ambulans çağırın",
      "el": "Καλέστε ένα ασθενοφόρο, παρακαλώ"
    },
    "phonetics": {
      "zh": "Qǐng jiào jiùhùchē",
      "ja": "Kyūkyūsha o yonde kudasai",
      "ko": "Gugeupchareul bulleojuseyo",
      "th": "Chuai riak rot phayaban noi khrap/kha",
      "ar": "Ittasil bil-is'af min fadlik",
      "el": "Kaleste ena asthenoforo, parakalo"
    }
  },
  {
    "id": "ph_eme_4",
    "category": "Emergenze",
    "it": "Mi sono perso, può aiutarmi?",
    "translations": {
      "en": "I am lost, can you help me?",
      "zh": "我迷路了，您可以帮帮我吗？",
      "ja": "道に迷ってしまいました、助けていただけますか？",
      "es": "Me he perdido, ¿puede ayudarme?",
      "fr": "Je suis perdu, pouvez-vous m'aider ?",
      "de": "Ich habe mich verlaufen, können Sie mir helfen?",
      "pt": "Estou perdido, pode me ajudar?",
      "th": "ฉันหลงทาง ช่วยหน่อยได้ไหมครับ/ค่ะ?",
      "ko": "길을 잃었어요, 좀 도와주시겠어요?",
      "ar": "أنا تائه، هل يمكنك مساعدتي؟",
      "vi": "Tôi bị lạc đường, bạn có thể giúp tôi không?",
      "tr": "Kayboldum, bana yardım edebilir misiniz?",
      "el": "Έχω χαθεί, μπορείτε να με βοηθήσετε;"
    },
    "phonetics": {
      "zh": "Wǒ mílù le, nín kěyǐ bāng bāng wǒ ma?",
      "ja": "Michi ni mayotte shimaimashita, tasukete itadakemasu ka?",
      "ko": "Gireul ireosseoyo, jom dowajusigesseoyo?",
      "th": "Chan long thang, chuai noi dai mai khrap/kha?",
      "ar": "Ana ta'ih, hal yumkinuk musa'adati?",
      "el": "Echo chathei, boreite na me voithisete?"
    }
  },
  {
    "id": "ph_eme_5",
    "category": "Emergenze",
    "it": "Mi hanno rubato il portafoglio / il passaporto",
    "translations": {
      "en": "My wallet / passport was stolen",
      "zh": "我的钱包/护照被偷了",
      "ja": "財布 / パスポートを盗まれました",
      "es": "Me han robado la cartera / el pasaporte",
      "fr": "On m'a volé mon portefeuille / mon passeport",
      "de": "Meine Geldbörse / mein Reisepass wurde gestohlen",
      "pt": "Roubaram minha carteira / meu passaporte",
      "th": "กระเป๋าสตางค์/หนังสือเดินทางของฉันถูกขโมย",
      "ko": "지갑/여권을 도난당했습니다",
      "ar": "سرقت محفظتي / جواز سفري",
      "vi": "Tôi bị trộm ví / hộ chiếu rồi",
      "tr": "Cüzdanım / pasaportum çalındı",
      "el": "Μου έκλεψαν το πορτοφόλι / το διαβατήριο"
    },
    "phonetics": {
      "zh": "Wǒ de qiánbāo / hùzhào bèi tōu le",
      "ja": "Saifu / pasupōto o nusumaremashita",
      "ko": "Jigap / yeogwoneul donandanghaessseumnida",
      "th": "Krapao satang / nangsue doen thang khong chan thuk khamoi",
      "ar": "Suriqat mahfazati / jawaz safari",
      "el": "Mou eklepsan to portofoli / to diavatirio"
    }
  },
  {
    "id": "ph_eme_6",
    "category": "Emergenze",
    "it": "Ho bisogno di un medico",
    "translations": {
      "en": "I need a doctor",
      "zh": "我需要看医生",
      "ja": "医師の診察が必要です",
      "es": "Necesito un médico",
      "fr": "J'ai besoin d'un médecin",
      "de": "Ich brauche einen Arzt",
      "pt": "Preciso de um médico",
      "th": "ฉันต้องการพบแพทย์",
      "ko": "의사의 진료가 필요합니다",
      "ar": "أحتاج إلى طبيب",
      "vi": "Tôi cần gặp bác sĩ",
      "tr": "Bir doktora ihtiyacım var",
      "el": "Χρειάζομαι έναν γιατρό"
    },
    "phonetics": {
      "zh": "Wǒ xūyào kàn yīshēng",
      "ja": "Ishi no shinsatsu ga hitsuyō desu",
      "ko": "Uisaui jinryoga piryohamnida",
      "th": "Chan tongkan phop phaet",
      "ar": "Ahtaj ila tabib",
      "el": "Chreiazomai enan yiatro"
    }
  },
  {
    "id": "ph_eme_7",
    "category": "Emergenze",
    "it": "Dov'è l'ospedale più vicino?",
    "translations": {
      "en": "Where is the nearest hospital?",
      "zh": "最近的医院在哪里？",
      "ja": "一番近い病院はどこですか？",
      "es": "¿Dónde está el hospital más cercano?",
      "fr": "Où se trouve l'hôpital le plus proche ?",
      "de": "Wo ist das nächste Krankenhaus?",
      "pt": "Onde fica o hospital mais próximo?",
      "th": "โรงพยาบาลที่ใกล้ที่สุดอยู่ที่ไหน?",
      "ko": "가장 가까운 병원이 어디인가요?",
      "ar": "أين أقرب مستشفى؟",
      "vi": "Bệnh viện gần nhất ở đâu?",
      "tr": "En yakın hastane nerede?",
      "el": "Πού είναι το πλησιέστερο νοσοκομείο;"
    },
    "phonetics": {
      "zh": "Zuìjìn de yīyuàn zài nǎlǐ?",
      "ja": "Ichiban chikai byōin wa doko desu ka?",
      "ko": "Gajang gakkaun byeong-woni eodi-ingayo?",
      "th": "Rongphayaban thi klai thisut yu thi nai?",
      "ar": "Ayna aqrab mustashfa?",
      "el": "Pou einai to plisiestero nosokomeio?"
    }
  },
  {
    "id": "ph_eme_8",
    "category": "Emergenze",
    "it": "Dov'è una farmacia aperta?",
    "translations": {
      "en": "Where is an open pharmacy?",
      "zh": "请问哪里有开门的药店？",
      "ja": "営業している薬局はどこですか？",
      "es": "¿Dónde hay una farmacia abierta?",
      "fr": "Où y a-t-il une pharmacie ouverte ?",
      "de": "Wo gibt es eine geöffnete Apotheke?",
      "pt": "Onde tem uma farmácia aberta?",
      "th": "มีร้านขายยาเปิดอยู่ที่ไหนบ้าง?",
      "ko": "문 연 약국이 어디에 있나요?",
      "ar": "أين توجد صيدلية مفتوحة؟",
      "vi": "Hiệu thuốc nào đang mở cửa ở gần đây?",
      "tr": "Açık bir eczane nerede bulabilirim?",
      "el": "Πού υπάρχει ανοιχτό φαρμακείο;"
    },
    "phonetics": {
      "zh": "Qǐngwèn nǎlǐ yǒu kāimén de yàodiàn?",
      "ja": "Eigyō shite iru yakkyoku wa doko desu ka?",
      "ko": "Mun yeon yakgugi eodie innayo?",
      "th": "Mi ran khai ya poet yu thi nai bang?",
      "ar": "Ayna tujad saydaliyyah maftuhah?",
      "el": "Pou yparchei anoichto farmakeio?"
    }
  },
  {
    "id": "ph_eme_9",
    "category": "Emergenze",
    "it": "Ho la febbre / Ho molto dolore qui",
    "translations": {
      "en": "I have a fever / I have severe pain here",
      "zh": "我发烧了 / 我这里很疼",
      "ja": "熱があります / ここがとても痛いです",
      "es": "Tengo fiebre / Me duele mucho aquí",
      "fr": "J'ai de la fièvre / J'ai très mal ici",
      "de": "Ich habe Fieber / Ich habe hier starke Schmerzen",
      "pt": "Estou com febre / Sinto muita dor aqui",
      "th": "ฉันมีไข้ / ฉันปวดตรงนี้มาก",
      "ko": "열이 나요 / 여기가 너무 아파요",
      "ar": "عندي حمى / أشعر بألم شديد هنا",
      "vi": "Tôi bị sốt / Chỗ này đau dữ dội",
      "tr": "Ateşim var / Buram çok ağrıyor",
      "el": "Έχω πυρετό / Πονάω πολύ εδώ"
    },
    "phonetics": {
      "zh": "Wǒ fāshāo le / Wǒ zhèlǐ hěn téng",
      "ja": "Netsu ga arimasu / Koko ga totemo itai desu",
      "ko": "Yeori nayo / Yeogiga neomu apayo",
      "th": "Chan mi khai / Chan puat trong ni mak",
      "ar": "Indi humma / Ash'ur bi-alam shadid huna",
      "el": "Echo pyreto / Ponao poli edo"
    }
  },
  {
    "id": "ph_eme_10",
    "category": "Emergenze",
    "it": "Devo contattare il consolato italiano",
    "translations": {
      "en": "I need to contact the Italian consulate",
      "zh": "我需要联系意大利领事馆",
      "ja": "イタリア領事館に連絡する必要があります",
      "es": "Necesito contactar con el consulado italiano",
      "fr": "Je dois contacter le consulat italien",
      "de": "Ich muss das italienische Konsulat kontaktieren",
      "pt": "Preciso entrar em contato com o consulado italiano",
      "th": "ฉันต้องติดต่อสถานกงสุลอิตาลี",
      "ko": "이탈리아 영사관에 연락해야 합니다",
      "ar": "يجب أن أتصل بالقنصلية الإيطالية",
      "vi": "Tôi cần liên hệ với lãnh sự quán Ý",
      "tr": "İtalyan konsolosluğu ile iletişime geçmem gerek",
      "el": "Πρέπει να επικοινωνήσω με το ιταλικό προξενείο"
    },
    "phonetics": {
      "zh": "Wǒ xūyào liánxì Yìdàlì lǐngshìguǎn",
      "ja": "Itaria ryōjikan ni renraku suru hitsuyō ga arimasu",
      "ko": "Itallia yeongsagwane yeollakhaeya hamnida",
      "th": "Chan tong titto sathan kongsun Itali",
      "ar": "Yajib an attasil bil-qunsuliyyah al-Italiyyah",
      "el": "Prepei na epikoinoniso me to italiko proxeneio"
    }
  },
  {
    "id": "ph_tra_1",
    "category": "Trasporti",
    "it": "Mi porti a questo indirizzo, per favore",
    "translations": {
      "en": "Please take me to this address",
      "zh": "请带我到这个地址",
      "ja": "この住所まで連れて行ってください",
      "es": "Lléveme a esta dirección, por favor",
      "fr": "Emmenez-moi à cette adresse, s'il vous plaît",
      "de": "Bringen Sie mich bitte zu dieser Adresse",
      "pt": "Leve-me a este endereço, por favor",
      "th": "กรุณาพาฉันไปที่อยู่นี้ครับ/ค่ะ",
      "ko": "이 주소로 가주세요",
      "ar": "من فضلك خذني إلى هذا العنوان",
      "vi": "Làm ơn đưa tôi đến địa chỉ này",
      "tr": "Lütfen beni bu adrese götürün",
      "el": "Παρακαλώ πηγαίνετέ με σε αυτή τη διεύθυνση"
    },
    "phonetics": {
      "zh": "Qǐng dài wǒ dào zhège dìzhǐ",
      "ja": "Kono jūsho made tsurete itte kudasai",
      "ko": "I jusoro gajuseyo",
      "th": "Karuna pha chan pai thi yu ni",
      "ar": "Min fadlik khudhni ila hadha al-unwan",
      "el": "Parakalo pigainete me se afti ti diefthynsi"
    }
  },
  {
    "id": "ph_tra_2",
    "category": "Trasporti",
    "it": "Quanto costa arrivare fino a qui?",
    "translations": {
      "en": "How much to get here?",
      "zh": "到这里大概需要多少钱？",
      "ja": "ここまではいくらかかりますか？",
      "es": "¿Cuánto cuesta llegar hasta aquí?",
      "fr": "Combien ça coûte pour aller jusqu'ici ?",
      "de": "Wie viel kostet die Fahrt bis hierher?",
      "pt": "Quanto custa ir até aqui?",
      "th": "ไปถึงที่นี่ราคาเท่าไหร่?",
      "ko": "여기까지 가는데 얼마인가요?",
      "ar": "كم تكلفة الوصول إلى هنا؟",
      "vi": "Đến đây hết bao nhiêu tiền?",
      "tr": "Buraya gitmek ne kadar tutar?",
      "el": "Πόσο κοστίζει για να πάω μέχρι εδώ;"
    },
    "phonetics": {
      "zh": "Dào zhèlǐ dàgài xūyào duōshǎo qián?",
      "ja": "Koko made wa ikura kakarimasu ka?",
      "ko": "Yeogikkaji ganeunde eolma-ingayo?",
      "th": "Pai thueng thi ni rakha thao rai?",
      "ar": "Kam taklufat al-wusul ila huna?",
      "el": "Poso kostizei yia na pao mechri edo?"
    }
  },
  {
    "id": "ph_tra_3",
    "category": "Trasporti",
    "it": "Accenda il tassametro, per favore",
    "translations": {
      "en": "Please turn on the taximeter",
      "zh": "请打表计费，谢谢",
      "ja": "メーターを入れてもらえますか？",
      "es": "Encienda el taxímetro, por favor",
      "fr": "Mettez le compteur, s'il vous plaît",
      "de": "Schalten Sie bitte das Taxameter ein",
      "pt": "Ligue o taxímetro, por favor",
      "th": "ช่วยเปิดมิเตอร์ด้วยครับ/ค่ะ",
      "ko": "미터기 켜주세요",
      "ar": "شغّل العداد من فضلك",
      "vi": "Làm ơn bật đồng hồ tính cước giúp tôi",
      "tr": "Lütfen taksimetreyi açın",
      "el": "Ανοίξτε το ταξίμετρο, παρακαλώ"
    },
    "phonetics": {
      "zh": "Qǐng dǎbiǎo jìfèi, xièxiè",
      "ja": "Mētā o irete moraemasu ka?",
      "ko": "Miteogi kyeojuseyo",
      "th": "Chuai poet miteo duai khrap/kha",
      "ar": "Shagghil al-addad min fadlik",
      "el": "Anoixte to taximetro, parakalo"
    }
  },
  {
    "id": "ph_tra_4",
    "category": "Trasporti",
    "it": "Si fermi qui, grazie",
    "translations": {
      "en": "Stop here, thank you",
      "zh": "请靠边停在这里，谢谢",
      "ja": "ここで止めてください、ありがとう",
      "es": "Pare aquí, gracias",
      "fr": "Arrêtez-vous ici, merci",
      "de": "Halten Sie bitte hier an, danke",
      "pt": "Pare aqui, obrigado",
      "th": "จอดตรงนี้ได้เลย ขอบคุณครับ/ค่ะ",
      "ko": "여기서 세워주세요, 감사합니다",
      "ar": "توقف هنا، شكراً لك",
      "vi": "Dừng lại ở đây, cảm ơn",
      "tr": "Burada durun lütfen, teşekkürler",
      "el": "Σταματήστε εδώ, ευχαριστώ"
    },
    "phonetics": {
      "zh": "Qǐng kàobiān tíng zài zhèlǐ, xièxiè",
      "ja": "Koko de tomete kudasai, arigatō",
      "ko": "Yeogiseo sewojuseyo, gamsahamnida",
      "th": "Chot trong ni dai loei, khop khun khrap/kha",
      "ar": "Tawaqqaf huna, shukran lak",
      "el": "Stamatiste edo, efcharisto"
    }
  },
  {
    "id": "ph_tra_5",
    "category": "Trasporti",
    "it": "Dov'è la stazione della metro / dei treni?",
    "translations": {
      "en": "Where is the subway / train station?",
      "zh": "地铁站/火车站怎么走？",
      "ja": "地下鉄/電車の駅はどこですか？",
      "es": "¿Dónde está la estación de metro / tren?",
      "fr": "Où se trouve la station de métro / la gare ?",
      "de": "Wo ist die U-Bahn- / Bahnhofsstation?",
      "pt": "Onde fica a estação de metrô / trem?",
      "th": "สถานีรถไฟใต้ดิน/สถานีรถไฟอยู่ที่ไหน?",
      "ko": "지하철역 / 기차역이 어디인가요?",
      "ar": "أين تقع محطة المترو / القطار؟",
      "vi": "Ga tàu điện ngầm / ga tàu hoả ở đâu?",
      "tr": "Metro / tren istasyonu nerede?",
      "el": "Πού είναι ο σταθμός του μετρό / των τρένων;"
    },
    "phonetics": {
      "zh": "Dìtiě zhàn / Huǒchē zhàn zěnme zǒu?",
      "ja": "Chikatetsu / densha no eki wa doko desu ka?",
      "ko": "Jihacheolyeok / gichayeogi eodi-ingayo?",
      "th": "Sathani rotfai taidin / sathani rotfai yu thi nai?",
      "ar": "Ayna taqa' mahattat al-mitro / al-qitar?",
      "el": "Pou einai o stathmos tou metro / ton trenon?"
    }
  },
  {
    "id": "ph_tra_6",
    "category": "Trasporti",
    "it": "Quale binario / uscita devo prendere?",
    "translations": {
      "en": "Which platform / exit should I take?",
      "zh": "我应该走哪个站台/哪个出口？",
      "ja": "何番ホーム / どの出口に行けばいいですか？",
      "es": "¿Qué andén / salida debo tomar?",
      "fr": "Quel quai / quelle sortie dois-je prendre ?",
      "de": "Welches Gleis / welchen Ausgang muss ich nehmen?",
      "pt": "Qual plataforma / saída devo pegar?",
      "th": "ฉันต้องไปชานชาลา/ทางออกไหน?",
      "ko": "몇 번 승강장 / 출구로 가야 하나요?",
      "ar": "أي رصيف / مخرج يجب أن أسلكه؟",
      "vi": "Tôi nên đi ga số mấy / cửa ra nào?",
      "tr": "Hangi peron / çıkışı kullanmalıyım?",
      "el": "Ποια αποβάθρα / έξοδο πρέπει να πάρω;"
    },
    "phonetics": {
      "zh": "Wǒ yīnggāi zǒu nǎge zhàntái / nǎge chūkǒu?",
      "ja": "Nan-ban hōmu / dono deguchi ni ikeba ii desu ka?",
      "ko": "Myeot beon seunggangjang / chulguro gaya hanayo?",
      "th": "Chan tong pai chan chala / thang ok nai?",
      "ar": "Ayy rasif / makhraj yajib an aslukah?",
      "el": "Poia apovathra / exodo prepei na paro?"
    }
  },
  {
    "id": "ph_tra_7",
    "category": "Trasporti",
    "it": "A che ora parte l'ultimo treno / autobus?",
    "translations": {
      "en": "What time is the last train / bus?",
      "zh": "末班火车/公交车几点开？",
      "ja": "終電 / 最終バスは何時ですか？",
      "es": "¿A qué hora sale el último tren / autobús?",
      "fr": "À quelle heure part le dernier train / bus ?",
      "de": "Wann fährt der letzte Zug / Bus?",
      "pt": "A que horas sai o último trem / ônibus?",
      "th": "รถไฟ/รถบัสรอบสุดท้ายออกกี่โมง?",
      "ko": "막차(기차/버스)가 몇 시에 출발하나요?",
      "ar": "في أي وقت يغادر آخر قطار / حافلة؟",
      "vi": "Chuyến tàu / xe buýt cuối cùng khởi hành lúc mấy giờ?",
      "tr": "Son tren / otobüs saat kaçta kalkıyor?",
      "el": "Τι ώρα φεύγει το τελευταίο τρένο / λεωφορείο;"
    },
    "phonetics": {
      "zh": "Mòbān huǒchē / gōngjiāochē jǐ diǎn kāi?",
      "ja": "Shūden / saishū basu wa nan-ji desu ka?",
      "ko": "Makcha (gicha/beoseu)ga myeot sie chulbalhanayo?",
      "th": "Rotfai / rot bat rop sutthai ok ki mong?",
      "ar": "Fi ayy waqt yughadir akhir qitar / hafilah?",
      "el": "Ti ora fevgei to teleftaio treno / leoforeio?"
    }
  },
  {
    "id": "ph_tra_8",
    "category": "Trasporti",
    "it": "Vorrei un biglietto di andata e ritorno",
    "translations": {
      "en": "I'd like a round-trip ticket",
      "zh": "我想要一张往返票",
      "ja": "往復の切符を1枚お願いします",
      "es": "Quisiera un billete de ida y vuelta",
      "fr": "Je voudrais un billet aller-retour",
      "de": "Ich hätte gerne eine Hin- und Rückfahrkarte",
      "pt": "Queria um bilhete de ida e volta",
      "th": "ขอตั๋วไป-กลับหนึ่งใบครับ/ค่ะ",
      "ko": "왕복 티켓 한 장 주세요",
      "ar": "أريد تذكرة ذهاب وإياب",
      "vi": "Tôi muốn mua một vé khứ hồi",
      "tr": "Gidiş-dönüş bileti istiyorum",
      "el": "Θα ήθελα ένα εισιτήριο μετ' επιστροφής"
    },
    "phonetics": {
      "zh": "Wǒ xiǎng yào yī zhāng wǎngfǎn piào",
      "ja": "Ōfuku no kippu o ichi-mai onegai shimasu",
      "ko": "Wangbok tiket han jang juseyo",
      "th": "Kho tua pai-klap nueng bai khrap/kha",
      "ar": "Uridu tadhkirat dhahab wa-iyab",
      "el": "Tha ithela ena eisitirio met' epistrofis"
    }
  },
  {
    "id": "ph_tra_9",
    "category": "Trasporti",
    "it": "È lontano a piedi?",
    "translations": {
      "en": "Is it far on foot?",
      "zh": "走路过去远吗？",
      "ja": "歩いて行くと遠いですか？",
      "es": "¿Está lejos a pie?",
      "fr": "Est-ce loin à pied ?",
      "de": "Ist es zu Fuß weit?",
      "pt": "É longe a pé?",
      "th": "เดินไปไกลไหม?",
      "ko": "걸어가기에 멉니까?",
      "ar": "هل هو بعيد مشياً على الأقدام؟",
      "vi": "Đi bộ đến đó có xa không?",
      "tr": "Yürüyerek uzak mı?",
      "el": "Είναι μακριά με τα πόδια;"
    },
    "phonetics": {
      "zh": "Zǒulù guòqù yuǎn ma?",
      "ja": "Aruite iku to tōi desu ka?",
      "ko": "Georeogagie meomniga?",
      "th": "Doen pai klai mai?",
      "ar": "Hal huwa ba'id mashyan 'ala al-aqdam?",
      "el": "Einai makria me ta podia?"
    }
  },
  {
    "id": "ph_tra_10",
    "category": "Trasporti",
    "it": "Può indicarmelo sulla mappa?",
    "translations": {
      "en": "Can you point it out on the map?",
      "zh": "能在地图上给我指一下吗？",
      "ja": "地図で場所を教えていただけますか？",
      "es": "¿Puede señalármelo en el mapa?",
      "fr": "Pouvez-vous me le montrer sur la carte ?",
      "de": "Können Sie mir das auf der Karte zeigen?",
      "pt": "Pode me mostrar no mapa?",
      "th": "ช่วยชี้บนแผนที่ให้หน่อยได้ไหม?",
      "ko": "지도에서 위치를 가리켜 주시겠어요?",
      "ar": "هل يمكنك تحديد ذلك لي على الخريطة؟",
      "vi": "Bạn có thể chỉ cho tôi trên bản đồ được không?",
      "tr": "Bunu haritada gösterebilir misiniz?",
      "el": "Μπορείτε να μου το δείξετε στο χάρτη;"
    },
    "phonetics": {
      "zh": "Néng zài dìtú shàng gěi wǒ zhǐ yīxià ma?",
      "ja": "Chizu de basho o oshiete itadakemasu ka?",
      "ko": "Jidodoeseo wichireul garikyeo jusigesseoyo?",
      "th": "Chuai chi bon phaenthi hai noi dai mai?",
      "ar": "Hal yumkinuk tahdid dhalika li ala al-kharitah?",
      "el": "Boreite na mou to deixete sto charti?"
    }
  },
  {
    "id": "ph_hot_1",
    "category": "Hotel",
    "it": "Ho una prenotazione a questo nome",
    "translations": {
      "en": "I have a reservation under this name",
      "zh": "我有预订，是用这个名字订的",
      "ja": "この名前で予約しています",
      "es": "Tengo una reserva a este nombre",
      "fr": "J'ai une réservation à ce nom",
      "de": "Ich habe eine Reservierung auf diesen Namen",
      "pt": "Tenho uma reserva neste nome",
      "th": "ฉันมีการจองไว้ในชื่อนี้ครับ/ค่ะ",
      "ko": "이 이름으로 예약했습니다",
      "ar": "لدي حجز بهذا الاسم",
      "vi": "Tôi có đặt phòng dưới tên này",
      "tr": "Bu isim adına bir rezervasyonum var",
      "el": "Έχω κράτηση σε αυτό το όνομα"
    },
    "phonetics": {
      "zh": "Wǒ yǒu yùdìng, shì yòng zhège míngzì dìng de",
      "ja": "Kono namae de yoyaku shite imasu",
      "ko": "I ireumeuro yeyakhaessseumnida",
      "th": "Chan mi kan chong wai nai chue ni khrap/kha",
      "ar": "Ladayya hajz bi-hadha al-ism",
      "el": "Echo kratisi se afto to onoma"
    }
  },
  {
    "id": "ph_hot_2",
    "category": "Hotel",
    "it": "Posso fare il check-in / check-out?",
    "translations": {
      "en": "Can I check in / check out?",
      "zh": "请问可以办理入住/退房了吗？",
      "ja": "チェックイン / チェックアウトをお願いできますか？",
      "es": "¿Puedo hacer el check-in / check-out?",
      "fr": "Puis-je faire le check-in / check-out ?",
      "de": "Kann ich einchecken / auschecken?",
      "pt": "Posso fazer o check-in / check-out?",
      "th": "ขอเช็คอิน / เช็คเอาท์ได้ไหมครับ/ค่ะ?",
      "ko": "체크인 / 체크아웃 할 수 있나요?",
      "ar": "هل يمكنني تسجيل الوصول / المغادرة؟",
      "vi": "Tôi có thể nhận phòng / trả phòng được không?",
      "tr": "Giriş / çıkış işlemlerini yapabilir miyim?",
      "el": "Μπορώ να κάνω check-in / check-out;"
    },
    "phonetics": {
      "zh": "Qǐngwèn kěyǐ bànlǐ rùzhù / tuìfáng le ma?",
      "ja": "Chekku-in / chekku-auto o onegai dekimasu ka?",
      "ko": "Chekeu-in / chekeu-aut hal su innayo?",
      "th": "Kho chek-in / chek-ao dai mai khrap/kha?",
      "ar": "Hal yumkinuni tasjil al-wusul / al-mughadarah?",
      "el": "Boro na kano check-in / check-out?"
    }
  },
  {
    "id": "ph_hot_3",
    "category": "Hotel",
    "it": "Posso lasciare i bagagli qui per qualche ora?",
    "translations": {
      "en": "Can I leave my luggage here for a few hours?",
      "zh": "可以把行李寄存在这里几个小时吗？",
      "ja": "数時間荷物を預かっていただけますか？",
      "es": "¿Puedo dejar el equipaje aquí unas horas?",
      "fr": "Puis-je laisser mes bagages ici pour quelques heures ?",
      "de": "Kann ich mein Gepäck für ein paar Stunden hier lassen?",
      "pt": "Posso deixar a bagagem aqui por algumas horas?",
      "th": "ขอฝากกระเป๋าเดินทางไว้ที่นี่สักสองสามชั่วโมงได้ไหม?",
      "ko": "짐을 몇 시간 동안 여기에 보관할 수 있을까요?",
      "ar": "هل يمكنني ترك أمتعتي هنا لبضع ساعات؟",
      "vi": "Tôi có thể gửi hành lý ở đây vài tiếng được không?",
      "tr": "Bagajımı birkaç saatliğine buraya bırakabilir miyim?",
      "el": "Μπορώ να αφήσω τις αποσκευές μου εδώ για λίγες ώρες;"
    },
    "phonetics": {
      "zh": "Kěyǐ bǎ xínglǐ jìcún zài zhèlǐ jǐ gè xiǎoshí ma?",
      "ja": "Sū-jikan nimotsu o azukatte itadakemasu ka?",
      "ko": "Jimeul myeot sigan dongan yeogie bogwanhal su isseulkkayo?",
      "th": "Kho fak krapao doen thang wai thi ni sak song sam chua mong dai mai?",
      "ar": "Hal yumkinuni tark amti'ati huna li-bid'i sa'at?",
      "el": "Boro na afiso tis aposkeves mou edo yia liges ores?"
    }
  },
  {
    "id": "ph_hot_4",
    "category": "Hotel",
    "it": "Qual è la password del Wi-Fi?",
    "translations": {
      "en": "What is the Wi-Fi password?",
      "zh": "请问Wi-Fi密码是多少？",
      "ja": "Wi-Fiのパスワードは何ですか？",
      "es": "¿Cuál es la contraseña del Wi-Fi?",
      "fr": "Quel est le mot de passe du Wi-Fi ?",
      "de": "Wie lautet das WLAN-Passwort?",
      "pt": "Qual é a senha do Wi-Fi?",
      "th": "รหัส Wi-Fi คืออะไร?",
      "ko": "와이파이 비밀번호가 무엇인가요?",
      "ar": "ما هي كلمة سر الواي فاي؟",
      "vi": "Mật khẩu Wi-Fi là gì?",
      "tr": "Wi-Fi şifresi nedir?",
      "el": "Ποιος είναι ο κωδικός του Wi-Fi;"
    },
    "phonetics": {
      "zh": "Qǐngwèn Wi-Fi mìmǎ shì duōshǎo?",
      "ja": "Waifai no pasuwādo wa nan desu ka?",
      "ko": "Wa-i-pa-i bimilbeonhoga mueosingayo?",
      "th": "Rahat Wi-Fi khue arai?",
      "ar": "Ma hiya kalimat sirr al-way fay?",
      "el": "Poios einai o kodikos tou Wi-Fi?"
    }
  },
  {
    "id": "ph_hot_5",
    "category": "Hotel",
    "it": "A che ora è la colazione?",
    "translations": {
      "en": "What time is breakfast?",
      "zh": "早餐几点供应？",
      "ja": "朝食は何時からですか？",
      "es": "¿A qué hora es el desayuno?",
      "fr": "À quelle heure est servi le petit-déjeuner ?",
      "de": "Wann gibt es Frühstück?",
      "pt": "A que horas é o café da manhã?",
      "th": "อาหารเช้าเริ่มกี่โมง?",
      "ko": "아침 식사는 몇 시인가요?",
      "ar": "في أي وقت يُقدم الإفطار؟",
      "vi": "Bữa sáng phục vụ lúc mấy giờ?",
      "tr": "Kahvaltı saat kaçta?",
      "el": "Τι ώρα είναι το πρωινό;"
    },
    "phonetics": {
      "zh": "Zǎocān jǐ diǎn gōngyìng?",
      "ja": "Chōshoku wa nan-ji kara desu ka?",
      "ko": "Achim siksaneun myeot si-ingayo?",
      "th": "Ahan chao roem ki mong?",
      "ar": "Fi ayy waqt yuqaddam al-iftar?",
      "el": "Ti ora einai to proino?"
    }
  },
  {
    "id": "ph_hot_6",
    "category": "Hotel",
    "it": "La chiave / tessera della camera non funziona",
    "translations": {
      "en": "The room key / keycard is not working",
      "zh": "房间钥匙/房卡失灵了",
      "ja": "部屋の鍵 / カードキーが使えません",
      "es": "La llave / tarjeta de la habitación no funciona",
      "fr": "La clé / carte de la chambre ne fonctionne pas",
      "de": "Der Zimmerschlüssel / die Schlüsselkarte funktioniert nicht",
      "pt": "A chave / cartão do quarto não está funcionando",
      "th": "กุญแจห้อง/คีย์การ์ดเปิดไม่ได้",
      "ko": "방 열쇠 / 카드키가 작동하지 않아요",
      "ar": "مفتاح / بطاقة الغرفة لا تعمل",
      "vi": "Chìa khoá / thẻ phòng không mở được",
      "tr": "Oda anahtarı / kartı çalışmıyor",
      "el": "Το κλειδί / η κάρτα του δωματίου δεν λειτουργεί"
    },
    "phonetics": {
      "zh": "Fángjiān yàoshi / fángkǎ shīlíng le",
      "ja": "Heya no kagi / kādokī ga tsukaemasen",
      "ko": "Bang yeolsoe / kadeukiga jakdonghaji anhayo",
      "th": "Kunchae hong / khi kat poet mai dai",
      "ar": "Miftah / bitaqat al-ghurfah la ta'mal",
      "el": "To kleidi / i karta tou domatiou dhen leitourgei"
    }
  },
  {
    "id": "ph_hot_7",
    "category": "Hotel",
    "it": "Manca l'acqua calda / L'aria condizionata non va",
    "translations": {
      "en": "There's no hot water / Air conditioning isn't working",
      "zh": "没有热水 / 空调坏了",
      "ja": "お湯が出ません / エアコンが効きません",
      "es": "No hay agua caliente / El aire acondicionado no funciona",
      "fr": "Il n'y a pas d'eau chaude / La climatisation ne marche pas",
      "de": "Es gibt kein warmes Wasser / Die Klimaanlage geht nicht",
      "pt": "Não há água quente / O ar condicionado não funciona",
      "th": "ไม่มีน้ำอุ่น / แอร์ไม่เย็น",
      "ko": "온수가 안 나와요 / 에어컨이 작동하지 않아요",
      "ar": "لا يوجد ماء ساخن / تكييف الهواء لا يعمل",
      "vi": "Không có nước nóng / Máy lạnh bị hỏng",
      "tr": "Sıcak su akmıyor / Klima çalışmıyor",
      "el": "Δεν υπάρχει ζεστό νερό / Το κλιματιστικό δεν δουλεύει"
    },
    "phonetics": {
      "zh": "Méiyǒu rèshuǐ / Kōngtiáo huài le",
      "ja": "Oyu ga demasen / Eakon ga kikimasen",
      "ko": "Onsuga an nawayo / E-eokeoni jakdonghaji anhayo",
      "th": "Mai mi nam un / Ae mai yen",
      "ar": "La yujad ma' sakhin / Takyif al-hawa' la ya'mal",
      "el": "Dhen yparchei zesto nero / To klimatistiko dhen doulevei"
    }
  },
  {
    "id": "ph_hot_8",
    "category": "Hotel",
    "it": "Può chiamarmi un taxi per l'aeroporto?",
    "translations": {
      "en": "Could you call me a taxi to the airport?",
      "zh": "能帮我叫一辆去机场的出租车吗？",
      "ja": "空港までのタクシーを呼んでいただけますか？",
      "es": "¿Puede pedirme un taxi para el aeropuerto?",
      "fr": "Pouvez-vous m'appeler un taxi pour l'aéroport ?",
      "de": "Können Sie mir ein Taxi zum Flughafen rufen?",
      "pt": "Pode me chamar um táxi para o aeroporto?",
      "th": "ช่วยเรียกแท็กซี่ไปสนามบินให้หน่อยได้ไหมครับ/ค่ะ?",
      "ko": "공항 가는 택시를 불러주시겠어요?",
      "ar": "هل يمكنك طلب سيارة أجرة لي إلى المطار؟",
      "vi": "Bạn có thể gọi giúp tôi một chiếc taxi ra sân bay được không?",
      "tr": "Havalimanına gitmek için bir taksi çağırabilir misiniz?",
      "el": "Μπορείτε να μου καλέσετε ένα ταξί για το αεροδρόμιο;"
    },
    "phonetics": {
      "zh": "Néng bāng wǒ jiào yī liàng qù jīchǎng de chūzūchē ma?",
      "ja": "Kūkō made no takushī o yonde itadakemasu ka?",
      "ko": "Gonghang ganeun taeksireul bulleojusigesseoyo?",
      "th": "Chuai riak thaeksi pai sanambin hai noi dai mai khrap/kha?",
      "ar": "Hal yumkinuk talab sayyarat ujrah li ila al-matar?",
      "el": "Boreite na mou kalesete ena taxi yia to aerodromio?"
    }
  },
  {
    "id": "ph_ris_1",
    "category": "Ristorante",
    "it": "Un tavolo per una / due persone, per favore",
    "translations": {
      "en": "A table for one / two, please",
      "zh": "请问有一位/两位的位子吗？",
      "ja": "1名 / 2名用の席をお願いします",
      "es": "Una mesa para una / dos personas, por favor",
      "fr": "Une table pour une / deux personnes, s'il vous plaît",
      "de": "Einen Tisch für ein / zwei Personen, bitte",
      "pt": "Uma mesa para uma / duas pessoas, por favor",
      "th": "โต๊ะสำหรับ 1 / 2 คนครับ/ค่ะ",
      "ko": "한 명 / 두 명 자리 부탁드립니다",
      "ar": "طاولة لشخص واحد / شخصين من فضلك",
      "vi": "Một bàn cho một / hai người, làm ơn",
      "tr": "Bir / iki kişilik masa lütfen",
      "el": "Ένα τραπέζι για ένα / δύο άτομα, παρακαλώ"
    },
    "phonetics": {
      "zh": "Qǐngwèn yǒu yī wèi / liǎng wèi de wèizi ma?",
      "ja": "Ichi-mei / ni-mei yō no seki o onegai shimasu",
      "ko": "Han myeong / du myeong jari butakdeurimnida",
      "th": "To samrap nueng / song khon khrap/kha",
      "ar": "Tawilah li-shakhs wahid / shakhsayn min fadlik",
      "el": "Ena trapezi yia ena / dyo atoma, parakalo"
    }
  },
  {
    "id": "ph_ris_2",
    "category": "Ristorante",
    "it": "Posso vedere il menu (in inglese / con foto)?",
    "translations": {
      "en": "Can I see the menu (in English / with pictures)?",
      "zh": "请问有英文或带图片的菜单吗？",
      "ja": "メニュー（英語 / 写真付き）を見せてもらえますか？",
      "es": "¿Puedo ver el menú (en inglés / con fotos)?",
      "fr": "Puis-je voir le menu (en anglais / avec photos) ?",
      "de": "Kann ich die Speisekarte sehen (auf Englisch / mit Bildern)?",
      "pt": "Posso ver o menu (em inglês / com fotos)?",
      "th": "ขอดูเมนู (ภาษาอังกฤษ / มีรูปภาพ) ได้ไหม?",
      "ko": "메뉴판(영어 / 사진 있는 것) 좀 볼 수 있을까요?",
      "ar": "هل يمكنني رؤية قائمة الطعام (باللغة الإنجليزية / مع صور)؟",
      "vi": "Tôi có thể xem thực đơn (tiếng Anh / có hình ảnh) được không?",
      "tr": "Menüyü (İngilizce / resimli) görebilir miyim?",
      "el": "Μπορώ να δω το μενού (στα αγγλικά / με φωτογραφίες);"
    },
    "phonetics": {
      "zh": "Qǐngwèn yǒu Yīngwén huò dài túpiàn de càidān ma?",
      "ja": "Menyū (eigo / shashin-tsuki) o misete moraemasu ka?",
      "ko": "Menyupan (yeongeo / sajin inneun geot) jom bol su isseulkkayo?",
      "th": "Kho du menu (phasa angkrit / mi rup phap) dai mai?",
      "ar": "Hal yumkinuni ru'yat qa'imat at-ta'am (bil-ingliziyyah / ma' suwar)?",
      "el": "Boro na do to menou (sta anglika / me fotografies)?"
    }
  },
  {
    "id": "ph_ris_3",
    "category": "Ristorante",
    "it": "Cosa mi consiglia di tipico?",
    "translations": {
      "en": "What local dish do you recommend?",
      "zh": "有什么当地特色菜推荐吗？",
      "ja": "おすすめの郷土料理は何ですか？",
      "es": "¿Qué plato típico me recomienda?",
      "fr": "Que me conseillez-vous comme plat typique ?",
      "de": "Was empfehlen Sie als typisches Gericht?",
      "pt": "O que me recomenda de prato típico?",
      "th": "มีอาหารท้องถิ่นจานไหนแนะนำบ้าง?",
      "ko": "여기 대표 메뉴나 추천 요리가 무엇인가요?",
      "ar": "ما هو الطبق المحلي الذي تنصحني به؟",
      "vi": "Món ăn đặc sản nào ở đây bạn gợi ý cho tôi?",
      "tr": "Yöresel olarak ne tavsiye edersiniz?",
      "el": "Τι τοπικό πιάτο μου προτείνετε;"
    },
    "phonetics": {
      "zh": "Yǒu shénme dāngdì tèsè cài tuījiàn ma?",
      "ja": "Osusume no kyōdo ryōri wa nan desu ka?",
      "ko": "Yeogi daepyo menyuna chucheon yoriga mueosingayo?",
      "th": "Mi ahan thongthin chan nai naenam bang?",
      "ar": "Ma huwa at-tabaq al-mahalli alladhi tansahuni bih?",
      "el": "Ti topiko piato mou proteinete?"
    }
  },
  {
    "id": "ph_ris_4",
    "category": "Ristorante",
    "it": "Non piccante, per favore",
    "translations": {
      "en": "Not spicy, please",
      "zh": "请不要放辣，谢谢",
      "ja": "辛くしないでください",
      "es": "Sin picante, por favor",
      "fr": "Pas épicé, s'il vous plaît",
      "de": "Bitte nicht scharf",
      "pt": "Sem pimenta, por favor",
      "th": "ไม่เผ็ดเลยนะครับ/ค่ะ",
      "ko": "맵지 않게 해주세요",
      "ar": "غير حار من فضلك",
      "vi": "Xin đừng làm cay, làm ơn",
      "tr": "Acısız olsun lütfen",
      "el": "Όχι καυτερό, παρακαλώ"
    },
    "phonetics": {
      "zh": "Qǐng bùyào fàng là, xièxiè",
      "ja": "Karaku shinaide kudasai",
      "ko": "Maepji anhge haejuseyo",
      "th": "Mai phet loei na khrap/kha",
      "ar": "Ghayr harr min fadlik",
      "el": "Ochi kaftero, parakalo"
    }
  },
  {
    "id": "ph_ris_5",
    "category": "Ristorante",
    "it": "Sono allergico a... (frutta secca / crostacei / glutine / lattosio)",
    "translations": {
      "en": "I am allergic to... (nuts / shellfish / gluten / lactose)",
      "zh": "我对（坚果 / 海鲜虾蟹 / 麸质 / 乳糖）过敏",
      "ja": "私は（ナッツ / 甲殻類 / グルテン / 乳糖）アレルギーがあります",
      "es": "Soy alérgico a... (frutos secos / mariscos / gluten / lactosa)",
      "fr": "Je suis allergique aux... (fruits à coque / crustacés / gluten / lactose)",
      "de": "Ich bin allergisch gegen... (Nüsse / Schalentiere / Gluten / Laktose)",
      "pt": "Sou alérgico a... (frutos secos / mariscos / glúten / lactose)",
      "th": "ฉันแพ้... (ถั่ว / อาหารทะเล กุ้ง ปู / กลูเตน / นม แลคโตส)",
      "ko": "저는 (견과류 / 갑각류 / 글루텐 / 유당) 알레르기가 있습니다",
      "ar": "عندي حساسية من... (المكسرات / القشريات / الغلوتين / اللاكتوز)",
      "vi": "Tôi bị dị ứng với... (hạt dẻ đậu phộng / hải sản tôm cua / gluten / sữa)",
      "tr": "Şunlara alerjim var: (fındık-fıstık / deniz ürünleri / glüten / laktoz)",
      "el": "Είμαι αλλεργικός σε... (ξηρούς καρπούς / οστρακοειδή / γλουτένη / λακτόζη)"
    },
    "phonetics": {
      "zh": "Wǒ duì (jiānguǒ / hǎixiān xiā xiè / fūzhì / rǔtáng) guòmǐn",
      "ja": "Watashi wa (nattsu / kōkakurui / guruten / nyūtō) arerugī ga arimasu",
      "ko": "Jeoneun (gyeongwaryu / gapgakryu / geulluten / yudang) allereugiga issseumnida",
      "th": "Chan phae... (thua / ahan thale kung pu / kluten / nom laekto)",
      "ar": "Indi hasasiyyah min... (al-mukassarat / al-qushriyyat / al-ghulutin / al-laktuz)",
      "el": "Eimai allergikos se... (xirous karpous / ostrakoeidi / glouteni / laktozi)"
    }
  },
  {
    "id": "ph_ris_6",
    "category": "Ristorante",
    "it": "Sono vegetariano, niente carne né pesce",
    "translations": {
      "en": "I am vegetarian, no meat or fish",
      "zh": "我是素食者，不吃任何肉类和鱼类",
      "ja": "ベジタリアンです。肉も魚も食べられません",
      "es": "Soy vegetariano, nada de carne ni pescado",
      "fr": "Je suis végétarien, ni viande ni poisson",
      "de": "Ich bin Vegetarier, kein Fleisch und kein Fisch",
      "pt": "Sou vegetariano, sem carne nem peixe",
      "th": "ฉันทานมังสวิรัติ ไม่ใส่เนื้อสัตว์และปลา",
      "ko": "저는 채식주의자입니다. 육류와 생선은 안 먹습니다",
      "ar": "أنا نباتي، لا لحوم ولا أسماك",
      "vi": "Tôi ăn chay, không ăn thịt và cá",
      "tr": "Vejetaryenim, et veya balık yemiyorum",
      "el": "Είμαι χορτοφάγος, καθόλου κρέας ούτε ψάρι"
    },
    "phonetics": {
      "zh": "Wǒ shì sùshí zhě, bù chī rènhé ròulèi hé yúlèi",
      "ja": "Bejitarian desu. Niku mo sakana mo taberaremasen",
      "ko": "Jeoneun chaesikjuuija-imnida. Yungnyuwa saengseoneun an meokseumnida",
      "th": "Chan than mangsawirat, mai sai nuea sat lae pla",
      "ar": "Ana nabati, la luhum wa-la asmak",
      "el": "Eimai chortofagos, katholou kreas oute psari"
    }
  },
  {
    "id": "ph_ris_7",
    "category": "Ristorante",
    "it": "Acqua naturale / frizzante, per favore",
    "translations": {
      "en": "Still water / sparkling water, please",
      "zh": "请给我常温纯净水 / 气泡水",
      "ja": "ミネラルウォーター（ガスなし / 炭酸水）をお願いします",
      "es": "Agua sin gas / con gas, por favor",
      "fr": "De l'eau plate / gazeuse, s'il vous plaît",
      "de": "Stilles Wasser / Sprudelwasser, bitte",
      "pt": "Água sem gás / com gás, por favor",
      "th": "ขอน้ำเปล่าธรรมดา / น้ำแร่มีแก๊สครับ/ค่ะ",
      "ko": "생수(일반 물) / 탄산수 주세요",
      "ar": "ماء عادي / ماء غازي من فضلك",
      "vi": "Cho tôi xin nước lọc không ga / nước có ga",
      "tr": "Durgun su / maden suyu lütfen",
      "el": "Φυσικό νερό / ανθρακούχο νερό, παρακαλώ"
    },
    "phonetics": {
      "zh": "Qǐng gěi wǒ chángwēn chúnjìng shuǐ / qìpào shuǐ",
      "ja": "Mineraru wōtā (gasu nashi / tansansui) o onegai shimasu",
      "ko": "Saengsu (ilban mul) / tansansu juseyo",
      "th": "Kho nam plao thammada / nam rae mi kaet khrap/kha",
      "ar": "Ma' adi / ma' ghazi min fadlik",
      "el": "Fysiko nero / anthrakoucho nero, parakalo"
    }
  },
  {
    "id": "ph_ris_8",
    "category": "Ristorante",
    "it": "Senza ghiaccio, grazie",
    "translations": {
      "en": "No ice, thank you",
      "zh": "请不要加冰块，谢谢",
      "ja": "氷なしでお願いします",
      "es": "Sin hielo, gracias",
      "fr": "Sans glaçons, merci",
      "de": "Ohne Eis, bitte",
      "pt": "Sem gelo, obrigado",
      "th": "ไม่ใส่น้ำแข็ง ขอบคุณครับ/ค่ะ",
      "ko": "얼음 빼주세요, 감사합니다",
      "ar": "بدون ثلج، شكراً لك",
      "vi": "Không đá, cảm ơn",
      "tr": "Buzsuz olsun, teşekkürler",
      "el": "Χωρίς πάγο, ευχαριστώ"
    },
    "phonetics": {
      "zh": "Qǐng bùyào jiā bīngkuài, xièxiè",
      "ja": "Kōri nashi de onegai shimasu",
      "ko": "Eoreum bpaejuseyo, gamsahamnida",
      "th": "Mai sai nam khaeng, khop khun khrap/kha",
      "ar": "Bidun thalj, shukran lak",
      "el": "Choris pago, efcharisto"
    }
  },
  {
    "id": "ph_ris_9",
    "category": "Ristorante",
    "it": "Dov'è il bagno?",
    "translations": {
      "en": "Where is the restroom / bathroom?",
      "zh": "请问洗手间在哪里？",
      "ja": "トイレはどこにありますか？",
      "es": "¿Dónde está el baño?",
      "fr": "Où sont les toilettes ?",
      "de": "Wo ist die Toilette?",
      "pt": "Onde fica o banheiro?",
      "th": "ห้องน้ำอยู่ที่ไหนครับ/ค่ะ?",
      "ko": "화장실이 어디에 있나요?",
      "ar": "أين يوجد الحمام؟",
      "vi": "Nhà vệ sinh ở đâu?",
      "tr": "Tuvalet nerede?",
      "el": "Πού είναι η τουαλέτα;"
    },
    "phonetics": {
      "zh": "Qǐngwèn xǐshǒujiān zài nǎlǐ?",
      "ja": "Toire wa doko ni arimasu ka?",
      "ko": "Hwajangsiri eodie innayo?",
      "th": "Hongnam yu thi nai khrap/kha?",
      "ar": "Ayna yujad al-hammam?",
      "el": "Pou einai i toualeta?"
    }
  },
  {
    "id": "ph_ris_10",
    "category": "Ristorante",
    "it": "Il conto, per favore",
    "translations": {
      "en": "The bill / check, please",
      "zh": "请结账 / 买单",
      "ja": "お会計をお願いします",
      "es": "La cuenta, por favor",
      "fr": "L'addition, s'il vous plaît",
      "de": "Die Rechnung, bitte",
      "pt": "A conta, por favor",
      "th": "เช็คบิลด้วยครับ/ค่ะ",
      "ko": "계산서 부탁드립니다",
      "ar": "الحساب من فضلك",
      "vi": "Làm ơn tính tiền",
      "tr": "Hesap lütfen",
      "el": "Το λογαριασμό, παρακαλώ"
    },
    "phonetics": {
      "zh": "Qǐng jiézhàng / Mǎidān",
      "ja": "O-kaikei o onegai shimasu",
      "ko": "Gyesanseo butakdeurimnida",
      "th": "Chek bin duai khrap/kha",
      "ar": "Al-hisab min fadlik",
      "el": "To logariasmo, parakalo"
    }
  },
  {
    "id": "ph_sho_1",
    "category": "Shopping",
    "it": "Sto solo dando un'occhiata, grazie",
    "translations": {
      "en": "I'm just looking, thank you",
      "zh": "我只是随便看看，谢谢",
      "ja": "見ているだけです、ありがとうございます",
      "es": "Solo estoy mirando, gracias",
      "fr": "Je regarde juste, merci",
      "de": "Ich schaue mich nur um, danke",
      "pt": "Só estou dando uma olhadinha, obrigado",
      "th": "แค่เดินดูเฉยๆ ขอบคุณครับ/ค่ะ",
      "ko": "그냥 구경하는 중이에요, 감사합니다",
      "ar": "أنا فقط ألقي نظرة، شكراً لك",
      "vi": "Tôi chỉ đang xem thôi, cảm ơn",
      "tr": "Sadece bakıyorum, teşekkürler",
      "el": "Απλώς κοιτάζω, ευχαριστώ"
    },
    "phonetics": {
      "zh": "Wǒ zhǐshì suíbiàn kànkàn, xièxiè",
      "ja": "Mite iru dake desu, arigatō gozaimasu",
      "ko": "Geunyang gugyeonghaneun jung-ieyo, gamsahamnida",
      "th": "Khae doen du choei choei, khop khun khrap/kha",
      "ar": "Ana faqat ulqi nazrah, shukran lak",
      "el": "Aplos koitazo, efcharisto"
    }
  },
  {
    "id": "ph_sho_2",
    "category": "Shopping",
    "it": "Avete un'altra taglia / un altro colore?",
    "translations": {
      "en": "Do you have another size / color?",
      "zh": "有别的尺码或别的颜色吗？",
      "ja": "別のサイズや色違いはありますか？",
      "es": "¿Tiene otra talla / otro color?",
      "fr": "Avez-vous une autre taille / une autre couleur ?",
      "de": "Haben Sie eine andere Größe / Farbe?",
      "pt": "Tem outro tamanho / outra cor?",
      "th": "มีไซส์อื่นหรือสีอื่นไหม?",
      "ko": "다른 사이즈나 다른 색상이 있나요?",
      "ar": "هل لديك مقاس آخر / لون آخر؟",
      "vi": "Bạn có cỡ khác hoặc màu khác không?",
      "tr": "Başka bir beden veya renk var mı?",
      "el": "Έχετε άλλο μέγεθος / άλλο χρώμα;"
    },
    "phonetics": {
      "zh": "Yǒu bié de chǐmǎ huò bié de yánsè ma?",
      "ja": "Betsu no saizu ya irochigai wa arimasu ka?",
      "ko": "Dareun saijeuna dareun saeksangi innayo?",
      "th": "Mi sai uen rue si uen mai?",
      "ar": "Hal ladayka maqas akhar / lawn akhar?",
      "el": "Echete allo megethos / allo chroma?"
    }
  },
  {
    "id": "ph_sho_3",
    "category": "Shopping",
    "it": "Posso provarlo?",
    "translations": {
      "en": "Can I try this on?",
      "zh": "我可以试穿/试用一下吗？",
      "ja": "試着してもよろしいですか？",
      "es": "¿Puedo probármelo?",
      "fr": "Puis-je l'essayer ?",
      "de": "Kann ich das anprobieren?",
      "pt": "Posso experimentar?",
      "th": "ขอลองใส่ดูได้ไหม?",
      "ko": "이거 입어봐도(써봐도) 될까요?",
      "ar": "هل يمكنني تجربة هذا؟",
      "vi": "Tôi có thể thử món này được không?",
      "tr": "Bunu deneyebilir miyim?",
      "el": "Μπορώ να το δοκιμάσω;"
    },
    "phonetics": {
      "zh": "Wǒ kěyǐ shìchuān / shìyòng yīxià ma?",
      "ja": "Chakuyō shitemo yoroshii desu ka?",
      "ko": "Igeo ibeobwado doelkkayo?",
      "th": "Kho long sai du dai mai?",
      "ar": "Hal yumkinuni tajribat hadha?",
      "el": "Boro na to dokimaso?"
    }
  },
  {
    "id": "ph_sho_4",
    "category": "Shopping",
    "it": "Qual è il prezzo migliore se ne prendo di più?",
    "translations": {
      "en": "What's the best price if I buy more?",
      "zh": "如果我多买几个，最优惠的价格是多少？",
      "ja": "まとめて買ったらお安くなりますか？",
      "es": "¿Cuál es el mejor precio si compro varios?",
      "fr": "Quel est le meilleur prix si j'en prends plusieurs ?",
      "de": "Was ist der beste Preis, wenn ich mehr nehme?",
      "pt": "Qual é o melhor preço se eu levar mais?",
      "th": "ถ้าซื้อหลายชิ้น ลดราคาให้สุดๆ เท่าไหร่?",
      "ko": "여러 개 사면 얼마나 더 깎아주실 수 있나요?",
      "ar": "ما هو أفضل سعر إذا اشتريت أكثر من قطعة؟",
      "vi": "Nếu tôi mua nhiều cái thì giá tốt nhất là bao nhiêu?",
      "tr": "Birden fazla alırsam en iyi fiyat ne olur?",
      "el": "Ποια είναι η καλύτερη τιμή αν πάρω περισσότερα;"
    },
    "phonetics": {
      "zh": "Rúguǒ wǒ duō mǎi jǐ gè, zuì yōuhuì de jiàgé shì duōshǎo?",
      "ja": "Matomete kattara oyasuku narimasu ka?",
      "ko": "Yeoreo gae samyeon eolmana deo kkakka jusil su innayo?",
      "th": "Tha sue lai chin lot rakha hai sut-sut thao rai?",
      "ar": "Ma huwa afdal si'r idha ishtaraytu akthar min qit'ah?",
      "el": "Poia einai i kalyteri timi an paro perissotera?"
    }
  },
  {
    "id": "ph_sho_5",
    "category": "Shopping",
    "it": "È troppo caro, posso offrire...",
    "translations": {
      "en": "It's too expensive, can I offer...",
      "zh": "太贵了，我出...可以吗？",
      "ja": "高すぎます、…なら買えますがどうですか？",
      "es": "Es demasiado caro, puedo ofrecer...",
      "fr": "C'est trop cher, je peux vous proposer...",
      "de": "Das ist zu teuer, ich biete...",
      "pt": "Está muito caro, posso oferecer...",
      "th": "แพงเกินไป ขอเสนอราคาที่... ได้ไหม?",
      "ko": "너무 비싸요, ...가격에 맞춰주실 수 있나요?",
      "ar": "إنه مكلف جداً، هل تقبل بـ ...؟",
      "vi": "Đắt quá, tôi có thể trả giá... được không?",
      "tr": "Çok pahalı, ... kadar verebilirim?",
      "el": "Είναι πολύ ακριβό, μπορώ να προσφέρω..."
    },
    "phonetics": {
      "zh": "Tài guì le, wǒ chū... kěyǐ ma?",
      "ja": "Takasugimasu, ... nara kaemasu ga dō desu ka?",
      "ko": "Neomu bissayo, ... gagyeoge matchwo jusil su innayo?",
      "th": "Phaeng koen pai, kho sanoe rakha thi... dai mai?",
      "ar": "Innahu mukallif jiddan, hal taqbal bi...?",
      "el": "Einai poli akrivo, boro na prosfero..."
    }
  },
  {
    "id": "ph_sho_6",
    "category": "Shopping",
    "it": "Accettate carte di credito / Alipay / WeChat Pay?",
    "translations": {
      "en": "Do you accept credit cards / Alipay / WeChat Pay?",
      "zh": "可以刷信用卡/支付宝/微信支付吗？",
      "ja": "クレジットカード / Alipay / WeChat Payは使えますか？",
      "es": "¿Aceptan tarjeta de crédito / Alipay / WeChat Pay?",
      "fr": "Acceptez-vous les cartes de crédit / Alipay / WeChat Pay ?",
      "de": "Akzeptieren Sie Kreditkarten / Alipay / WeChat Pay?",
      "pt": "Aceitam cartão de crédito / Alipay / WeChat Pay?",
      "th": "รับบัตรเครดิต / Alipay / WeChat Pay ไหม?",
      "ko": "신용카드 / 알리페이 / 위챗페이 되나요?",
      "ar": "هل تقبلون بطاقات الائتمان / Alipay / WeChat Pay؟",
      "vi": "Ở đây có nhận thẻ tín dụng / Alipay / WeChat Pay không?",
      "tr": "Kredi kartı / Alipay / WeChat Pay kabul ediyor musunuz?",
      "el": "Δέχεστε πιστωτικές κάρτες / Alipay / WeChat Pay;"
    },
    "phonetics": {
      "zh": "Kěyǐ shuā xìnyòngkǎ / Zhīfùbǎo / Wēixìn zhīfù ma?",
      "ja": "Kurejitto kādo / Aripei / Wīchatto pei wa tsukaemasu ka?",
      "ko": "Sinyongkadeu / Allipe-i / Wichaetpe-i doenayo?",
      "th": "Rap bat khredit / Alipay / WeChat Pay mai?",
      "ar": "Hal taqbalun bitaqat al-i'timan / Alipay / WeChat Pay?",
      "el": "Dhecheste pistotikes kartes / Alipay / WeChat Pay?"
    }
  },
  {
    "id": "ph_sho_7",
    "category": "Shopping",
    "it": "Pago in contanti",
    "translations": {
      "en": "I'll pay in cash",
      "zh": "我用现金支付",
      "ja": "現金で支払います",
      "es": "Pago en efectivo",
      "fr": "Je paie en espèces",
      "de": "Ich zahle bar",
      "pt": "Pago em dinheiro vivo",
      "th": "จ่ายด้วยเงินสดครับ/ค่ะ",
      "ko": "현금으로 낼게요",
      "ar": "سأدفع نقداً",
      "vi": "Tôi trả bằng tiền mặt",
      "tr": "Nakit ödeyeceğim",
      "el": "Πληρώνω με μετρητά"
    },
    "phonetics": {
      "zh": "Wǒ yòng xiànjīn zhīfù",
      "ja": "Genkin de shiharaimasu",
      "ko": "Hyeongeumeuro naelgeyo",
      "th": "Chai duai ngoen sot khrap/kha",
      "ar": "Sa'adfa' naqdan",
      "el": "Plirono me metrita"
    }
  },
  {
    "id": "ph_sho_8",
    "category": "Shopping",
    "it": "Può farmi la ricevuta / fattura?",
    "translations": {
      "en": "Could you give me a receipt / invoice?",
      "zh": "可以给我开一张收据/发票吗？",
      "ja": "レシート / 領収書をいただけますか？",
      "es": "¿Puede darme un recibo / factura?",
      "fr": "Pouvez-vous me donner un reçu / une facture ?",
      "de": "Können Sie mir eine Quittung / Rechnung geben?",
      "pt": "Pode me dar o recibo / nota fiscal?",
      "th": "ช่วยออกใบเสร็จรับเงินให้หน่อยได้ไหม?",
      "ko": "영수증 한 장 발급해 주시겠어요?",
      "ar": "هل يمكنك إعطائي إيصالاً / فاتورة؟",
      "vi": "Bạn có thể xuất biên lai / hóa đơn cho tôi được không?",
      "tr": "Makbuz / fatura verebilir misiniz?",
      "el": "Μπορείτε να μου δώσετε μια απόδειξη / τιμολόγιο;"
    },
    "phonetics": {
      "zh": "Kěyǐ gěi wǒ kāi yī zhāng shōujù / fāpiào ma?",
      "ja": "Reshīto / ryōshūsho o itadakemasu ka?",
      "ko": "Yeongsujeung han jang balgeuphae jusigesseoyo?",
      "th": "Chuai ok baiset rap ngoen hai noi dai mai?",
      "ar": "Hal yumkinuk i'ta'i isalan / faturah?",
      "el": "Boreite na mou dosete mia apodeixi / timologio?"
    }
  },
  {
    "id": "ph_sho_9",
    "category": "Shopping",
    "it": "Dov'è un bancomat (ATM) qui vicino?",
    "translations": {
      "en": "Where is a nearby ATM?",
      "zh": "这附近哪里有自动取款机（ATM）？",
      "ja": "この近くにATMはありますか？",
      "es": "¿Dónde hay un cajero automático (ATM) cerca de aquí?",
      "fr": "Où y a-t-il un distributeur automatique (ATM) près d'ici ?",
      "de": "Wo ist hier in der Nähe ein Geldautomat (ATM)?",
      "pt": "Onde tem um caixa eletrônico (ATM) aqui perto?",
      "th": "ตู้ ATM แถวนี้อยู่ที่ไหน?",
      "ko": "이 근처에 현금인출기(ATM)가 어디에 있나요?",
      "ar": "أين توجد أقرب ماكينة صراف آلي (ATM) هنا؟",
      "vi": "Gần đây có cây rút tiền (ATM) nào không?",
      "tr": "Yakınlarda bir bankamatik (ATM) nerede var?",
      "el": "Πού υπάρχει ένα ΑΤΜ εδώ κοντά;"
    },
    "phonetics": {
      "zh": "Zhè fùjìn nǎlǐ yǒu zìdòng qǔkuǎnjī (ATM)?",
      "ja": "Kono chikaku ni ētīemu wa arimasu ka?",
      "ko": "I geuncheoe hyeongeum-inchulgi(ATM)ga eodie innayo?",
      "th": "Tu ATM thaeo ni yu thi nai?",
      "ar": "Ayna tujad aqrab makinah sarraf ali huna?",
      "el": "Pou yparchei ena ATM edo konta?"
    }
  },
  {
    "id": "ph_sho_10",
    "category": "Shopping",
    "it": "A che ora chiudete?",
    "translations": {
      "en": "What time do you close?",
      "zh": "请问你们几点打烊/关门？",
      "ja": "何時に閉店しますか？",
      "es": "¿A qué hora cierran?",
      "fr": "À quelle heure fermez-vous ?",
      "de": "Wann schließen Sie?",
      "pt": "A que horas vocês fecham?",
      "th": "ร้านปิดกี่โมงครับ/ค่ะ?",
      "ko": "몇 시에 문을 닫나요?",
      "ar": "في أي وقت تغلقون؟",
      "vi": "Mấy giờ cửa hàng đóng cửa?",
      "tr": "Saat kaçta kapatıyorsunuz?",
      "el": "Τι ώρα κλείνετε;"
    },
    "phonetics": {
      "zh": "Qǐngwèn nǐmen jǐ diǎn dǎyàng / guānmén?",
      "ja": "Nan-ji ni heiten shimasu ka?",
      "ko": "Myeot sie muneul dannayo?",
      "th": "Ran pit ki mong khrap/kha?",
      "ar": "Fi ayy waqt tughliqun?",
      "el": "Ti ora kleinete?"
    }
  },
  {
    "id": "ph_num_1",
    "category": "Numeri & Contrattazione",
    "it": "1, 2, 3, 4, 5 (Numeri base)",
    "translations": {
      "en": "One, Two, Three, Four, Five",
      "zh": "一、二、三、四、五",
      "ja": "一、二、三、四、五 (いち、に、さん、よん、ご)",
      "es": "Uno, Dos, Tres, Cuatro, Cinco",
      "fr": "Un, Deux, Trois, Quatre, Cinq",
      "de": "Eins, Zwei, Drei, Vier, Fünf",
      "pt": "Um, Dois, Três, Quatro, Cinco",
      "th": "หนึ่ง, สอง, สาม, สี่, ห้า",
      "ko": "일, 이, 삼, 사, 오",
      "ar": "واحد، اثنان، ثلاثة، أربعة، خمسة",
      "vi": "Một, Hai, Ba, Bốn, Năm",
      "tr": "Bir, İki, Üç, Dört, Beş",
      "el": "Ένα, Δύο, Τρία, Τέσσερα, Πέντε"
    },
    "phonetics": {
      "zh": "Yī, Èr, Sān, Sì, Wǔ",
      "ja": "Ichi, Ni, San, Yon, Go",
      "ko": "Il, I, Sam, Sa, O",
      "th": "Nueng, Song, Sam, Si, Ha",
      "ar": "Wahid, Ithnan, Thalathah, Arba'ah, Khamsah",
      "el": "Ena, Dyo, Tria, Tessera, Pente"
    }
  },
  {
    "id": "ph_num_2",
    "category": "Numeri & Contrattazione",
    "it": "10, 20, 50, 100",
    "translations": {
      "en": "Ten, Twenty, Fifty, One Hundred",
      "zh": "十、二十、五十、一百",
      "ja": "十、二十、五十、百 (じゅう、にじゅう、ごじゅう、ひゃく)",
      "es": "Diez, Veinte, Cincuenta, Cien",
      "fr": "Dix, Vingt, Cinquante, Cent",
      "de": "Zehn, Zwanzig, Fünfzig, Einhundert",
      "pt": "Dez, Vinte, Cinquenta, Cem",
      "th": "สิบ, ยี่สิบ, ห้าสิบ, หนึ่งร้อย",
      "ko": "십, 이십, 오십, 백",
      "ar": "عشرة، عشرون، خمسون، مائة",
      "vi": "Mười, Hai mươi, Năm mươi, Một trăm",
      "tr": "On, Yirmi, Elli, Yüz",
      "el": "Δέκα, Είκοσι, Πενήντα, Εκατό"
    },
    "phonetics": {
      "zh": "Shí, Èrshí, Wǔshí, Yībǎi",
      "ja": "Jū, Ni-jū, Go-jū, Hyaku",
      "ko": "Sip, Isip, Osip, Baek",
      "th": "Sip, Yisip, Hasip, Nueng-roi",
      "ar": "'Ashrah, 'Ishrun, Khamsun, Mi'ah",
      "el": "Deka, Eikosi, Peninta, Ekato"
    }
  },
  {
    "id": "ph_num_3",
    "category": "Numeri & Contrattazione",
    "it": "500, 1000",
    "translations": {
      "en": "Five Hundred, One Thousand",
      "zh": "五百、一千",
      "ja": "五百、千 (ごひゃく、せん)",
      "es": "Quinientos, Mil",
      "fr": "Cinq Cents, Mille",
      "de": "Fünfhundert, Eintausend",
      "pt": "Quinhentos, Mil",
      "th": "ห้าร้อย, หนึ่งพัน",
      "ko": "오백, 천",
      "ar": "خمسمائة، ألف",
      "vi": "Năm trăm, Một nghìn",
      "tr": "Beş yüz, Bin",
      "el": "Πεντακόσια, Χίλια"
    },
    "phonetics": {
      "zh": "Wǔbǎi, Yīqiān",
      "ja": "Go-hyaku, Sen",
      "ko": "Obaek, Cheon",
      "th": "Ha-roi, Nueng-phan",
      "ar": "Khamsumi'ah, Alf",
      "el": "Pentakosia, Chilia"
    }
  },
  {
    "id": "ph_num_4",
    "category": "Numeri & Contrattazione",
    "it": "Quanto costa questo? È troppo caro",
    "translations": {
      "en": "How much is this? It is too expensive",
      "zh": "这个多少钱？太贵了",
      "ja": "これはいくらですか？高すぎます",
      "es": "¿Cuánto cuesta esto? Es demasiado caro",
      "fr": "Combien ça coûte ? C'est trop cher",
      "de": "Wie viel kostet das? Das ist zu teuer",
      "pt": "Quanto custa isso? Está muito caro",
      "th": "อันนี้เท่าไหร่? แพงเกินไปแล้ว",
      "ko": "이거 얼마예요? 너무 비싸요",
      "ar": "كم سعر هذا؟ إنه مكلف جداً",
      "vi": "Cái này bao nhiêu tiền? Đắt quá",
      "tr": "Bu ne kadar? Çok pahalı",
      "el": "Πόσο κάνει αυτό; Είναι πολύ ακριβό"
    },
    "phonetics": {
      "zh": "Zhège duōshǎo qián? Tài guì le",
      "ja": "Kore wa ikura desu ka? Takasugimasu",
      "ko": "Igeo eolmayeyo? Neomu bissayo",
      "th": "An ni thao rai? Phaeng koen pai laeo",
      "ar": "Kam si'r hadha? Innahu mukallif jiddan",
      "el": "Poso kanei afto? Einai poli akrivo"
    }
  },
  {
    "id": "ph_num_5",
    "category": "Numeri & Contrattazione",
    "it": "Può farmi uno sconto se pago in contanti?",
    "translations": {
      "en": "Can you give me a discount if I pay in cash?",
      "zh": "如果付现金可以给我打折吗？",
      "ja": "現金で払うと割引してもらえますか？",
      "es": "¿Puede hacerme un descuento si pago en efectivo?",
      "fr": "Pouvez-vous me faire une réduction si je paie en espèces ?",
      "de": "Gibt es einen Rabatt bei Barzahlung?",
      "pt": "Pode me dar um desconto se eu pagar em dinheiro?",
      "th": "ถ้าจ่ายเงินสด ลดราคาให้หน่อยได้ไหม?",
      "ko": "현금으로 내면 할인해 주실 수 있나요?",
      "ar": "هل يمكنك تقديم خصم إذا دفعت نقداً؟",
      "vi": "Nếu tôi trả tiền mặt có được giảm giá không?",
      "tr": "Nakit ödersem indirim yapar mısınız?",
      "el": "Μπορείτε να μου κάνετε έκπτωση αν πληρώσω με μετρητά;"
    },
    "phonetics": {
      "zh": "Rúguǒ fù xiànjīn kěyǐ gěi wǒ dǎzhé ma?",
      "ja": "Genkin de harau to waribiki shite moraemasu ka?",
      "ko": "Hyeongeumeuro naemyeon harinhae jusil su innayo?",
      "th": "Tha chai ngoen sot lot rakha hai noi dai mai?",
      "ar": "Hal yumkinuk taqdim khasm idha dafa'tu naqdan?",
      "el": "Boreite na mou kanete ekptosi an pliroso me metrita?"
    }
  }
];
