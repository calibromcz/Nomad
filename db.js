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
    finalBlob = await compressImage(file, 1800, 0.82);
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
    isPinned: Boolean(metadata.isPinned || false),
    blob: finalBlob
  };

  await putToStore('files_store', fileRecord);
  return fileRecord;
}

function compressImage(file, maxSide = 1800, quality = 0.82) {
  return new Promise((resolve, reject) => {
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
      const mimeType = 'image/webp';
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            // Fallback JPEG
            canvas.toBlob((jpegBlob) => resolve(jpegBlob || file), 'image/jpeg', quality);
          }
        },
        mimeType,
        quality
      );
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
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
    id: 'ph_1',
    category: 'Trasporti',
    it: "Portami a questo indirizzo, per favore.",
    translations: {
      en: "Please take me to this address.",
      zh: '请带我到这个地址。',
      ja: 'この住所まで連れて行ってください。',
      es: "Lléveme a esta dirección, por favor.",
      fr: "Emmenez-moi à cette adresse, s'il vous plaît.",
      de: 'Bitte bringen Sie mich zu dieser Adresse.',
      th: 'กรุณาพาฉันไปที่อยู่นี้',
      ko: '이 주소로 가주세요.'
    },
    phonetics: {
      zh: 'Qǐng dài wǒ dào zhège dìzhǐ.',
      ja: 'Kono jūsho made tsurete itte kudasai.',
      ko: 'I jusoro gajuseyo.',
      th: 'Karuna pha chan pai thi yu ni'
    }
  },
  {
    id: 'ph_2',
    category: 'Trasporti',
    it: "Quanto costa fino all'aeroporto / stazione?",
    translations: {
      en: "How much to the airport / train station?",
      zh: '去机场/火车站多少钱？',
      ja: '空港/駅までいくらですか？',
      es: "¿Cuánto cuesta ir al aeropuerto / estación?",
      fr: "Combien pour aller à l'aéroport / la gare ?",
      de: 'Wie viel kostet es zum Flughafen / Bahnhof?',
      th: 'ไปสนามบิน/สถานีรถไฟเท่าไหร่?',
      ko: '공항/기차역까지 얼마인가요?'
    },
    phonetics: {
      zh: 'Qù jīchǎng / huǒchēzhàn duōshǎo qián?',
      ja: 'Kūkō / eki made ikura desu ka?',
      ko: 'Gonghang / gichayeokkkaji eolma-ingayo?',
      th: 'Pai sanambin / sathani rotfai thao rai?'
    }
  },
  {
    id: 'ph_3',
    category: 'Ristorante',
    it: "Non mangio carne / Sono vegetariano.",
    translations: {
      en: "I do not eat meat / I am vegetarian.",
      zh: '我不吃肉 / 我是素食主义者。',
      ja: '肉を食べません / ベジタリアンです。',
      es: "No como carne / Soy vegetariano.",
      fr: "Je ne mange pas de viande / Je suis végétarien.",
      de: 'Ich esse kein Fleisch / Ich bin Vegetarier.',
      th: 'ฉันไม่กินเนื้อสัตว์ / ฉันเป็นมังสวิรัติ',
      ko: '고기를 안 먹어요 / 채식주의자예요.'
    },
    phonetics: {
      zh: 'Wǒ bù chī ròu / wǒ shì sùshí zhǔyì zhě.',
      ja: 'Niku o tabemasen / bejitarian desu.',
      ko: 'Gogireul an meogeoyo / chaesikjuuijayeyo.',
      th: 'Chan mai kin nuea sat / chan pen mangsawirat'
    }
  },
  {
    id: 'ph_4',
    category: 'Ristorante',
    it: "Il conto, per favore. Posso pagare con carta?",
    translations: {
      en: "The bill, please. Can I pay with card?",
      zh: '请结账。可以刷卡吗？',
      ja: 'お会計をお願いします。カードは使えますか？',
      es: "La cuenta, por favor. ¿Puedo pagar con tarjeta?",
      fr: "L'addition, s'il vous plaît. Puis-je payer par carte ?",
      de: 'Die Rechnung, bitte. Kann ich mit Karte bezahlen?',
      th: 'เช็คบิลด้วย จ่ายด้วยบัตรได้ไหม?',
      ko: '계산서 주세요. 카드로 결제할 수 있나요?'
    },
    phonetics: {
      zh: 'Qǐng jiézhàng. Kěyǐ shuākǎ ma?',
      ja: 'O-kaikei o onegai shimasu. Kādo wa tsukaemasu ka?',
      ko: 'Gyesanseo juseyo. Kadeuro gyeoljehal su innayo?',
      th: 'Chek bin duai. Chai duai bat dai mai?'
    }
  },
  {
    id: 'ph_5',
    category: 'Ristorante',
    it: "Poco piccante, per favore!",
    translations: {
      en: "Not too spicy, please!",
      zh: '请少放辣 / 不要太辣！',
      ja: '辛くしないでください！',
      es: "¡Poco picante, por favor!",
      fr: "Pas trop épicé, s'il vous plaît !",
      de: 'Bitte nicht zu scharf!',
      th: 'เผ็ดน้อยนะครับ/ค่ะ!',
      ko: '덜 맵게 해주세요!'
    },
    phonetics: {
      zh: 'Qǐng shǎo fàng là / bùyào tài là!',
      ja: 'Karaku shinaide kudasai!',
      ko: 'Deol maepge haejuseyo!',
      th: 'Phet noi na khrap/kha!'
    }
  },
  {
    id: 'ph_6',
    category: 'Emergenze',
    it: "Ho bisogno di aiuto / Chiamate un medico.",
    translations: {
      en: "I need help / Call a doctor.",
      zh: '我需要帮助 / 请叫医生。',
      ja: '助けが必要です / 医者を呼んでください。',
      es: "Necesito ayuda / Llamen a un médico.",
      fr: "J'ai besoin d'aide / Appelez un médecin.",
      de: 'Ich brauche Hilfe / Rufen Sie einen Arzt.',
      th: 'ฉันต้องการความช่วยเหลือ / ช่วยเรียกหมอหน่อย',
      ko: '도움이 필요해요 / 의사를 불러주세요.'
    },
    phonetics: {
      zh: 'Wǒ xūyào bāngzhù / qǐng jiào yīshēng.',
      ja: 'Tasuke ga hitsuyō desu / isha o yonde kudasai.',
      ko: 'Doumi piryohaeyo / uisareul bulleojuseyo.',
      th: 'Chan tongkan khwam chuailuea / chuai riak mo noi'
    }
  },
  {
    id: 'ph_7',
    category: 'Emergenze',
    it: "Ho smarrito il passaporto / portafoglio.",
    translations: {
      en: "I lost my passport / wallet.",
      zh: '我护照/钱包丢了。',
      ja: 'パスポート/財布を紛失しました。',
      es: "He perdido mi pasaporte / cartera.",
      fr: "J'ai perdu mon passeport / portefeuille.",
      de: 'Ich habe meinen Reisepass / Geldbeutel verloren.',
      th: 'ฉันทำหนังสือเดินทาง/กระเป๋าสตางค์หาย',
      ko: '여권/지갑을 잃어버렸어요.'
    },
    phonetics: {
      zh: 'Wǒ hùzhào / qiánbāo diū le.',
      ja: 'Pasupōto / saifu o funshitsu shimashita.',
      ko: 'Yeogwon / jigabeul ireobeoryeosseoyo.',
      th: 'Chan tham nangsue doen thang / krapao satang hai'
    }
  },
  {
    id: 'ph_8',
    category: 'Shopping',
    it: "Quanto costa questo? C'è uno sconto?",
    translations: {
      en: "How much is this? Is there a discount?",
      zh: '这个多少钱？能便宜点吗？',
      ja: 'これはいくらですか？割引はありますか？',
      es: "¿Cuánto cuesta esto? ¿Hay algún descuento?",
      fr: "Combien coûte ceci ? Y a-t-il une réduction ?",
      de: 'Wie viel kostet das? Gibt es einen Rabatt?',
      th: 'อันนี้เท่าไหร่? มีส่วนลดไหม?',
      ko: '이거 얼마예요? 할인 되나요?'
    },
    phonetics: {
      zh: 'Zhège duōshǎo qián? Néng piányi diǎn ma?',
      ja: 'Kore wa ikura desu ka? Waribiki wa arimasu ka?',
      ko: 'Igeo eolmayeyo? Harin doenayo?',
      th: 'An ni thao rai? Mi suan lot mai?'
    }
  },
  {
    id: 'ph_9',
    category: 'Shopping',
    it: "Posso provarlo?",
    translations: {
      en: "Can I try this on?",
      zh: '我可以试穿/试用一下吗？',
      ja: '試着してもいいですか？',
      es: "¿Puedo probármelo?",
      fr: "Puis-je l'essayer ?",
      de: 'Kann ich das anprobieren?',
      th: 'ขอลองดูได้ไหม?',
      ko: '입어봐도/써봐도 될까요?'
    },
    phonetics: {
      zh: 'Wǒ kěyǐ shìchuān / shìyòng yīxià ma?',
      ja: 'Chakuyō shitemo ii desu ka?',
      ko: 'Ibeobwado / sseobwado doelkkayo?',
      th: 'Kho long du dai mai?'
    }
  },
  {
    id: 'ph_10',
    category: 'Emergenze',
    it: "Dov'è la farmacia / ospedale più vicino?",
    translations: {
      en: "Where is the nearest pharmacy / hospital?",
      zh: '最近的药店/医院在哪里？',
      ja: '一番近い薬局/病院はどこですか？',
      es: "¿Dónde está la farmacia / hospital más cercano?",
      fr: "Où se trouve la pharmacie / l'hôpital le plus proche ?",
      de: 'Wo ist die nächste Apotheke / das nächste Krankenhaus?',
      th: 'ร้านขายยา/โรงพยาบาลที่ใกล้ที่สุดอยู่ที่ไหน?',
      ko: '가장 가까운 약국/병원이 어디에 있나요?'
    },
    phonetics: {
      zh: 'Zuìjìn de yàodiàn / yīyuàn zài nǎlǐ?',
      ja: 'Ichiban chikai yakkyoku / byōin wa doko desu ka?',
      ko: 'Gajang gakkaun yakguk / byeong-woni eodie innayo?',
      th: 'Ran khai ya / rongphayaban thi klai thisut yu thi nai?'
    }
  }
,
  // CATEGORIA NUMERI & PREZZI / CONTRATTAZIONE
  {
    id: 'ph_num_1',
    category: 'Numeri & Contrattazione',
    it: "1, 2, 3, 4, 5 (Numeri base)",
    translations: {
      en: "One, Two, Three, Four, Five",
      zh: '一、二、三、四、五',
      ja: '一、二、三、四、五 (いち、に、さん、よん、ご)',
      es: "Uno, Dos, Tres, Cuatro, Cinco",
      fr: "Un, Deux, Trois, Quatre, Cinq",
      de: 'Eins, Zwei, Drei, Vier, Fünf',
      th: 'หนึ่ง, สอง, สาม, สี่, ห้า',
      ko: '일, 이, 삼, 사, 오'
    },
    phonetics: {
      zh: 'Yī, Èr, Sān, Sì, Wǔ',
      ja: 'Ichi, Ni, San, Yon, Go',
      ko: 'Il, I, Sam, Sa, O',
      th: 'Nueng, Song, Sam, Si, Ha'
    }
  },
  {
    id: 'ph_num_2',
    category: 'Numeri & Contrattazione',
    it: "10, 20, 50, 100",
    translations: {
      en: "Ten, Twenty, Fifty, One Hundred",
      zh: '十、二十、五十、一百',
      ja: '十、二十、五十、百 (じゅう、にじゅう、ごじゅう、ひゃく)',
      es: "Diez, Veinte, Cincuenta, Cien",
      fr: "Dix, Vingt, Cinquante, Cent",
      de: 'Zehn, Zwanzig, Fünfzig, Einhundert',
      th: 'สิบ, ยี่สิบ, ห้าสิบ, หนึ่งร้อย',
      ko: '십, 이십, 오십, 백'
    },
    phonetics: {
      zh: 'Shí, Èrshí, Wǔshí, Yībǎi',
      ja: 'Jū, Ni-jū, Go-jū, Hyaku',
      ko: 'Sip, Isip, Osip, Baek',
      th: 'Sip, Yisip, Hasip, Nueng-roi'
    }
  },
  {
    id: 'ph_num_3',
    category: 'Numeri & Contrattazione',
    it: "500, 1000",
    translations: {
      en: "Five Hundred, One Thousand",
      zh: '五百、一千',
      ja: '五百、千 (ごひゃく、せん)',
      es: "Quinientos, Mil",
      fr: "Cinq Cents, Mille",
      de: 'Fünfhundert, Eintausend',
      th: 'ห้าร้อย, หนึ่งพัน',
      ko: '오백, 천'
    },
    phonetics: {
      zh: 'Wǔbǎi, Yīqiān',
      ja: 'Go-hyaku, Sen',
      ko: 'Obaek, Cheon',
      th: 'Ha-roi, Nueng-phan'
    }
  },
  {
    id: 'ph_num_4',
    category: 'Numeri & Contrattazione',
    it: "Quanto costa questo?",
    translations: {
      en: "How much is this?",
      zh: '这个多少钱？',
      ja: 'これはいくらですか？',
      es: "¿Cuánto cuesta esto?",
      fr: "Combien ça coûte ?",
      de: 'Wie viel kostet das?',
      th: 'อันนี้ราคาเท่าไหร่?',
      ko: '이거 얼마예요?'
    },
    phonetics: {
      zh: 'Zhège duōshǎo qián?',
      ja: 'Kore wa ikura desu ka?',
      ko: 'Igeo eolmayeyo?',
      th: 'An ni rakha thao rai?'
    }
  },
  {
    id: 'ph_num_5',
    category: 'Numeri & Contrattazione',
    it: "È troppo caro!",
    translations: {
      en: "It is too expensive!",
      zh: '太贵了！',
      ja: '高すぎます！',
      es: "¡Es demasiado caro!",
      fr: "C'est trop cher !",
      de: 'Das ist zu teuer!',
      th: 'แพงเกินไปแล้ว!',
      ko: '너무 비싸요!'
    },
    phonetics: {
      zh: 'Tài guì le!',
      ja: 'Takasugimasu!',
      ko: 'Neomu bissayo!',
      th: 'Phaeng koen pai laeo!'
    }
  },
  {
    id: 'ph_num_6',
    category: 'Numeri & Contrattazione',
    it: "Puoi farmi uno sconto?",
    translations: {
      en: "Can you give me a discount?",
      zh: '能便宜一点吗？/ 可以打折吗？',
      ja: 'まけてもらえますか？/ 割引できますか？',
      es: "¿Me puedes hacer un descuento?",
      fr: "Pouvez-vous me faire une réduction ?",
      de: 'Können Sie mir einen Rabatt geben?',
      th: 'ลดราคาให้หน่อยได้ไหม?',
      ko: '할인 좀 해주시겠어요?'
    },
    phonetics: {
      zh: 'Néng piányi yīdiǎn ma? / Kěyǐ dǎzhé ma?',
      ja: 'Makete moraemasu ka? / Waribiki dekimasu ka?',
      ko: 'Harin jom haejusigesseoyo?',
      th: 'Lot rakha hai noi dai mai?'
    }
  },
  {
    id: 'ph_num_7',
    category: 'Numeri & Contrattazione',
    it: "Va bene, lo prendo!",
    translations: {
      en: "Okay, I will take it!",
      zh: '好的，我要了！',
      ja: 'わかりました、これにします！',
      es: "¡De acuerdo, me lo llevo!",
      fr: "D'accord, je le prends !",
      de: 'Gut, ich nehme es!',
      th: 'ตกลง ฉันเอาอันนี้!',
      ko: '좋아요, 이걸로 할게요!'
    },
    phonetics: {
      zh: 'Hǎo de, wǒ yào le!',
      ja: 'Wakarimashita, kore ni shimasu!',
      ko: 'Joayo, igeollo halgeyo!',
      th: 'Toklong, chan ao an ni!'
    }
  },
  {
    id: 'ph_num_8',
    category: 'Numeri & Contrattazione',
    it: "Posso pagare con carta?",
    translations: {
      en: "Can I pay with card?",
      zh: '可以刷卡吗？',
      ja: 'カードで支払えますか？',
      es: "¿Puedo pagar con tarjeta?",
      fr: "Puis-je payer par carte ?",
      de: 'Kann ich mit Karte zahlen?',
      th: 'จ่ายด้วยบัตรได้ไหม?',
      ko: '카드로 계산해도 되나요?'
    },
    phonetics: {
      zh: 'Kěyǐ shuākǎ ma?',
      ja: 'Kādo de shiharaemasu ka?',
      ko: 'Kadeuro gyesanhaedo doenayo?',
      th: 'Chai duai bat dai mai?'
    }
  }
];
