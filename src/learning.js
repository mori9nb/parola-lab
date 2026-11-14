export const seed = [
  {
    id: "1",
    text: "Avere bisogno di",
    meaning: "نیاز داشتن به",
    example: "Ho bisogno di riposarmi.",
    translation: "نیاز دارم استراحت کنم.",
    kind: "phrase",
    level: "A2",
    tag: "زندگی روزمره",
  },
  {
    id: "2",
    text: "Riuscire a",
    meaning: "موفق شدن به انجام کاری",
    example: "Non riesco a concentrarmi.",
    translation: "نمی‌توانم تمرکز کنم.",
    kind: "phrase",
    level: "A2",
    tag: "زندگی روزمره",
  },
  {
    id: "3",
    text: "Prendersi cura di",
    meaning: "مراقبت کردن از",
    example: "Mi prendo cura del mio cane.",
    translation: "از سگم مراقبت می‌کنم.",
    kind: "phrase",
    level: "A2",
    tag: "زندگی روزمره",
  },
  {
    id: "4",
    text: "Appuntamento",
    meaning: "قرار ملاقات",
    example: "Ho un appuntamento alle tre.",
    translation: "ساعت سه قرار دارم.",
    kind: "word",
    level: "A1",
    tag: "شهر و ارتباطات",
  },
  {
    id: "5",
    text: "Magari",
    meaning: "کاش / شاید؛ بسته به موقعیت",
    example: "Magari potessi venire!",
    translation: "کاش می‌توانستم بیایم!",
    kind: "word",
    level: "A2",
    tag: "مکالمه",
  },
  {
    id: "6",
    text: "Ho perso il treno.",
    meaning: "قطار را از دست دادم.",
    example: "Ho perso il treno questa mattina.",
    translation: "امروز صبح قطار را از دست دادم.",
    kind: "sentence",
    level: "A2",
    tag: "سفر",
  },
  {
    id: "7",
    text: "Potrebbe aiutarmi?",
    meaning: "ممکن است به من کمک کنید؟",
    example: "Scusi, potrebbe aiutarmi?",
    translation: "ببخشید، ممکن است به من کمک کنید؟",
    kind: "sentence",
    level: "A2",
    tag: "مکالمه",
  },
  {
    id: "8",
    text: "Comunque",
    meaning: "به‌هرحال",
    example: "Comunque, grazie per il tuo aiuto.",
    translation: "به‌هرحال، ممنون بابت کمکت.",
    kind: "word",
    level: "A2",
    tag: "مکالمه",
  },
  {
    id: "9",
    text: "Fare una passeggiata",
    meaning: "قدم زدن",
    example: "Facciamo una passeggiata al parco.",
    translation: "بیا در پارک قدم بزنیم.",
    kind: "phrase",
    level: "A1",
    tag: "زندگی روزمره",
  },
  {
    id: "10",
    text: "Vorrei un caffè.",
    meaning: "یک قهوه می‌خواهم.",
    example: "Vorrei un caffè, per favore.",
    translation: "لطفاً یک قهوه می‌خواهم.",
    kind: "sentence",
    level: "A1",
    tag: "کافه",
  },
  {
    id: "11",
    text: "Imparare",
    meaning: "یاد گرفتن",
    example: "Voglio imparare l’italiano.",
    translation: "می‌خواهم ایتالیایی یاد بگیرم.",
    kind: "word",
    level: "A1",
    tag: "دانشگاه",
  },
  {
    id: "12",
    text: "Dimenticare",
    meaning: "فراموش کردن",
    example: "Non dimenticare le chiavi.",
    translation: "کلیدها را فراموش نکن.",
    kind: "word",
    level: "A1",
    tag: "زندگی روزمره",
  },
];
export const grammar = [
  {
    id: "g1",
    text: "Ho bisogno di ___ .",
    answer: "riposarmi",
    options: ["riposarmi", "mi riposo", "riposato", "riposo"],
    meaning: "نیاز دارم استراحت کنم.",
    explanation:
      "بعد از avere bisogno di، فعل به شکل مصدر می‌آید. ضمیر بازتابی mi به انتهای riposare می‌چسبد: riposarmi.",
  },
  {
    id: "g2",
    text: "Non ___ a concentrarci.",
    answer: "riusciamo",
    options: ["riusciamo", "riesco", "riuscite", "riesce"],
    meaning: "نمی‌توانیم تمرکز کنیم.",
    explanation:
      "ضمیر ci در concentrarci به noi اشاره دارد؛ پس riuscire باید برای noi صرف شود: riusciamo.",
  },
  {
    id: "g3",
    text: "Ieri Maria ___ al mercato.",
    answer: "è andata",
    options: ["è andata", "ha andato", "è andato", "sono andata"],
    meaning: "دیروز ماریا به بازار رفت.",
    explanation:
      "andare در passato prossimo با essere می‌آید. اسم مفعول برای Maria مؤنث و مفرد است: andata.",
  },
  {
    id: "g4",
    text: "___ un caffè, per favore.",
    answer: "Vorrei",
    options: ["Vorrei", "Volete", "Vorresti", "Vorrebbero"],
    meaning: "لطفاً یک قهوه می‌خواهم.",
    explanation:
      "برای درخواست مؤدبانه از condizionale استفاده می‌کنیم. صرف volere برای io برابر vorrei است.",
  },
];
export function shuffle(a, rng = Math.random) {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}
export function makeQuestion(item, all, reverse = false, rng = Math.random) {
  const field = reverse ? "text" : "meaning";
  const wrong = shuffle(
    [
      ...new Set(all.filter((x) => x.id !== item.id).map((x) => x[field])),
    ].filter((x) => x !== item[field]),
    rng,
  ).slice(0, 3);
  if (wrong.length < 3) return null;
  return {
    id: item.id,
    prompt: reverse ? item.meaning : item.text,
    answer: item[field],
    options: shuffle([item[field], ...wrong], rng),
    item,
    reverse,
  };
}
export function schedule(previous, correct, now = Date.now()) {
  const streak = correct ? (previous?.streak || 0) + 1 : 0;
  const days = correct ? Math.min(30, 2 ** (streak - 1)) : 0;
  return {
    streak,
    attempts: (previous?.attempts || 0) + 1,
    correct: (previous?.correct || 0) + (correct ? 1 : 0),
    due: now + (correct ? days * 86400000 : 600000),
  };
}
export function chooseItems(items, progress, limit = 10) {
  return shuffle(items)
    .sort((a, b) => (progress[a.id]?.due || 0) - (progress[b.id]?.due || 0))
    .slice(0, limit);
}
