import React, { useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  LayoutDashboard,
  Layers,
  MessageCircle,
  Settings,
  Plus,
  ArrowUpLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  X,
  Search,
  Volume2,
  Flame,
  Target,
  Clock3,
  Sparkles,
  ChevronLeft,
  Leaf,
  Download,
  Upload,
  Mic,
  RotateCcw,
  GraduationCap,
  Globe,
  MoreHorizontal,
} from "lucide-react";
import { seed, grammar, makeQuestion, chooseItems, schedule,shuffle } from "./learning";
import "./style.css";
import {
  analyzeInput,
  generateContent,
  generateGrammar,
} from "./services/languageServices";
import { importNotebook } from "./services/notebookServices";
function read(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
function useStored(key, initial) {
  const [v, set] = useState(() => read(key, initial));
  return [
    v,
    (x) => {
      set((old) => {
        const next = typeof x === "function" ? x(old) : x;
        localStorage.setItem(key, JSON.stringify(next));
        return next;
      });
    },
  ];
}
const labels = {
  word: "کلمه",
  phrase: "اصطلاح",
  sentence: "جمله",
  pending: "در انتظار تحلیل",
};
function App() {
  const [page, setPage] = useState("home");
  const [items, setItems] = useStored("parola.items.v1", seed);
  const [progress, setProgress] = useStored("parola.progress.v1", {});
  const [history, setHistory] = useStored("parola.history.v1", []);
  const [settings, setSettings] = useStored("parola.settings.v1", {
    level: "A2",
    daily: 10,
    base: "fa",
    target: "it",
  });
  const [profile, setProfile] = useStored("parola.profile.v1", {
    displayName: "",
  });
  const [grammarBank, setGrammarBank] = useStored(
  "parola.grammarBank.v1",
  grammar.map((question) => ({
    ...question,
    origin: "starter",
  })),
);
  const [onboarded, setOnboarded] = useStored("parola.onboarding.v1", false);
  const displayName = profile.displayName.trim() || "زبان‌آموز";
  const [modal, setModal] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [session, setSession] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [notice, setNotice] = useState("");
  const [chat, setChat] = useState("");
  const [messages, setMessages] = useState([]);
  const today = new Date().toLocaleDateString("en-CA");
  const todayHistory = history.filter((x) => x.date === today);
  const practiced = new Set(history.map((x) => x.date)).size;
  const [transferring, setTransferring] = useState(false);
  const transferLock = useRef(false);
  const mastered = Object.values(progress).filter((x) => x.streak >= 3).length;
  const due = items.filter(
    (x) => !progress[x.id] || progress[x.id].due <= Date.now(),
  ).length;
  const [preparing, setPreparing] = useState(false);
  const preparingLock = useRef(false);

  const [generationDays, setGenerationDays] = useStored(
    "parola.generationDays.v1",
    {},
  );
  const accuracy = history.length
    ? Math.round(
        (history.filter((x) => x.correct).length / history.length) * 100,
      )
    : 0;
  function toast(s) {
    setNotice(s);
    setTimeout(() => setNotice(""), 4000);
  }
  function speak(text) {
    if (!("speechSynthesis" in window))
      return toast("مرورگر شما پخش گفتار را پشتیبانی نمی‌کند.");
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "it-IT";
    u.rate = 0.85;
    speechSynthesis.speak(u);
  }
  async function prepareGrammarSession() {
  const level = settings.level;
  const limit = Number(settings.daily);
  const freshLimit = Math.min(3, Math.floor(limit / 3));

  const now = new Date();
  const dayKey = [
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
  ].join("-");

  const generationKey = `grammar:${level}`;

  const normalize = (text) =>
    text.trim().toLocaleLowerCase("it");

  let bank = [...grammarBank];

  const unused = bank.filter(
    (question) =>
      question.origin === "ai" &&
      question.level === level &&
      !progress[question.id]?.attempts,
  );

  const needsGeneration =
    unused.length < freshLimit &&
    generationDays[generationKey] !== dayKey;

  if (needsGeneration) {
    const personalItems = items.filter(
      (item) =>
        item.kind !== "pending" &&
        item.origin !== "ai" &&
        item.text?.trim() &&
        item.meaning?.trim(),
    );

    const seeds = [
      ...new Set(
        chooseItems(personalItems, progress, 10).map(
          (item) => item.text.trim(),
        ),
      ),
    ];

    if (seeds.length) {
      try {
        const generated = await generateGrammar(seeds, level);

        const seen = new Set(
          bank.map((question) => normalize(question.text)),
        );

        const additions = generated
          .filter((question) => {
            const key = normalize(question.text);

            if (seen.has(key)) return false;

            seen.add(key);
            return true;
          })
          .map((question) => ({
            ...question,
            id: crypto.randomUUID(),
            origin: "ai",
            createdAt: new Date().toISOString(),
          }));

        if (additions.length) {
          setGrammarBank((current) => {
            const existing = new Set(
              current.map((question) =>
                normalize(question.text),
              ),
            );

            return [
              ...current,
              ...additions.filter(
                (question) =>
                  !existing.has(normalize(question.text)),
              ),
            ];
          });

          bank = [...bank, ...additions];
        }

        setGenerationDays((current) => ({
          ...current,
          [generationKey]: dayKey,
        }));
      } catch {
        toast(
          "گرامر تازه آماده نشد؛ از سؤال‌های ذخیره‌شده استفاده می‌کنیم.",
        );
      }
    }
  }

  const eligible = bank.filter(
    (question) =>
      question.origin === "starter" ||
      question.level === level ||
      progress[question.id]?.attempts > 0,
  );

  const fresh = chooseItems(
    eligible.filter(
      (question) =>
        question.origin === "ai" &&
        question.level === level &&
        !progress[question.id]?.attempts,
    ),
    progress,
    freshLimit,
  );

  const freshIds = new Set(
    fresh.map((question) => question.id),
  );

  const review = chooseItems(
    eligible.filter(
      (question) => !freshIds.has(question.id),
    ),
    progress,
    limit - fresh.length,
  );

  return [...fresh, ...review].map((question) => ({
    ...question,
    prompt: question.text,
    grammar: true,
    options: shuffle(question.options),
  }));
}
  async function start(mode = "mix") {
    if (preparingLock.current) return;

    preparingLock.current = true;
    setPreparing(true);

    try {
      // گرامر فعلاً از مجموعهٔ فعلی استفاده می‌کند.
      if (mode === "grammar") {
        const questions = await prepareGrammarSession();

        if (!questions.length) {
          toast("هنوز تمرین گرامری موجود نیست.");
          return;
        }

        setSession({
          questions,
          index: 0,
          score: 0,
          mode,
        });
        setAnswer(null);
        setPage("practice");
        return;
      }

      const level = settings.level;
      const limit = Number(settings.daily);
      const freshLimit = Math.min(3, Math.floor(limit / 3));

      const now = new Date();
      const dayKey = [
        now.getFullYear(),
        now.getMonth() + 1,
        now.getDate(),
      ].join("-");

      const normalize = (text) =>
        text.trim().toLocaleLowerCase("it");

      const isReady = (item) =>
        item.kind !== "pending" &&
        typeof item.meaning === "string" &&
        item.meaning.trim().length > 0;

      const matchesMode = (item) =>
        mode === "sentence"
          ? item.kind === "sentence"
          : mode === "word"
            ? item.kind !== "sentence"
            : true;

      let ready = items.filter(isReady);

      const unusedGenerated = ready.filter(
        (item) =>
          item.origin === "ai" &&
          item.level === level &&
          !progress[item.id]?.attempts &&
          matchesMode(item),
      );

      const needsGeneration =
        unusedGenerated.length < freshLimit &&
        generationDays[level] !== dayKey;

      if (needsGeneration) {
        // تنوع مبنا: ورودی‌های کمتر تمرین‌شده اولویت دارند.
        const personalItems = ready.filter(
          (item) => item.origin !== "ai",
        );

        const candidateSeeds = chooseItems(
          personalItems,
          progress,
          10,
        );

        const seeds = [
          ...new Set(candidateSeeds.map((item) => item.text.trim())),
        ];

        if (seeds.length) {
          try {
            const generated = await generateContent(seeds, level);

            const seen = new Set(
              items.map((item) => normalize(item.text)),
            );

            const additions = generated
              .filter((item) => {
                const key = normalize(item.text);

                if (seen.has(key)) return false;

                seen.add(key);
                return true;
              })
              .map((item) => ({
                ...item,
                id: crypto.randomUUID(),
                origin: "ai",
                analysisStatus: "completed",
                tag: "پیشنهاد مدل",
                createdAt: new Date().toISOString(),
              }));

            if (additions.length) {
              setItems((current) => {
                const existing = new Set(
                  current.map((item) => normalize(item.text)),
                );

                return [
                  ...current,
                  ...additions.filter(
                    (item) => !existing.has(normalize(item.text)),
                  ),
                ];
              });

              // از نتیجهٔ همین درخواست استفاده می‌کنیم؛
              // منتظر به‌روزرسانی state نمی‌مانیم.
              ready = [...ready, ...additions];
            }

            setGenerationDays((current) => ({
              ...current,
              [level]: dayKey,
            }));
          } catch {
            toast(
              "محتوای تازه آماده نشد؛ تمرین با مطالب موجود ادامه دارد.",
            );
          }
        }
      }

      const pool = ready.filter(matchesMode);
      const reverse = mode === "reverse";

      // اول سؤال‌های قابل‌ساخت را مشخص می‌کنیم.
      const questionsById = new Map();

      for (const item of pool) {
        const question = makeQuestion(item, ready, reverse);

        if (question) {
          questionsById.set(item.id, question);
        }
      }

      const eligible = pool.filter((item) =>
        questionsById.has(item.id),
      );

      const fresh = chooseItems(
        eligible.filter(
          (item) =>
            item.origin === "ai" &&
            item.level === level &&
            !progress[item.id]?.attempts,
        ),
        progress,
        freshLimit,
      );

      const freshIds = new Set(fresh.map((item) => item.id));

      const review = chooseItems(
        eligible.filter((item) => !freshIds.has(item.id)),
        progress,
        limit - fresh.length,
      );

      const questions = [...fresh, ...review].map((item) =>
        questionsById.get(item.id),
      );

      if (!questions.length) {
        toast(
          "هنوز محتوای کافی برای ساخت سؤال چهارگزینه‌ای نداریم.",
        );
        return;
      }

      setSession({
        questions,
        index: 0,
        score: 0,
        mode,
      });
      setAnswer(null);
      setPage("practice");
    } finally {
      preparingLock.current = false;
      setPreparing(false);
    }
  }
  function submit(value) {
    if (answer !== null) return;
    const q = session.questions[session.index],
      correct = value === q.answer;
    setAnswer(value);
    setSession((s) => ({ ...s, score: s.score + (correct ? 1 : 0) }));
    setProgress((p) => ({ ...p, [q.id]: schedule(p[q.id], correct) }));
    setHistory((h) => [
      ...h,
      { id: q.id, correct, date: today, at: Date.now() },
    ]);
  }
  function next() {
    setSession((s) => ({ ...s, index: s.index + 1 }));
    setAnswer(null);
  }
  async function transferNotebook() {
  if (transferLock.current) return;

  transferLock.current = true;
  setTransferring(true);

  try {
    const result = await importNotebook(items, progress);

    toast(
      `${result.created} مورد جدید، ` +
      `${result.existing} مورد از قبل موجود و ` +
      `${result.reviews_created} سابقهٔ مرور ذخیره شد.`,
    );
  } catch (error) {
    toast(error.message || "انتقال انجام نشد.");
  } finally {
    transferLock.current = false;
    setTransferring(false);
  }
}
  function exportData() {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
  version: 2,
  items,
  grammarBank,
  progress,
  history,
  settings,
  profile,
  generationDays,
},
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "parola-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  function importData(e) {
    const f = e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (
          !Array.isArray(d.items) ||
          !d.items.every(
            (x) =>
              typeof x.id === "string" &&
              typeof x.text === "string" &&
              typeof x.meaning === "string" &&
              labels[x.kind] &&
              (x.level === null ||
                ["A1", "A2", "B1", "B2", "C1", "C2"].includes(x.level)),
          )
        )
          throw Error();
        setItems(d.items);
        if (Array.isArray(d.grammarBank)) {
          setGrammarBank(d.grammarBank);
        }
        setProgress(d.progress || {});
        setHistory(Array.isArray(d.history) ? d.history : []);
        toast("دفترچه با موفقیت بازیابی شد.");
      } catch {
        toast("فایل پشتیبان معتبر نیست.");
      }
    };
    reader.readAsText(f);
    e.target.value = "";
  }
  const nav = [
    ["home", LayoutDashboard, "خانه"],
    ["notebook", BookOpen, "دفترچهٔ من"],
    ["practice", Layers, "تمرین‌ها"],
    ["chat", MessageCircle, "دستیار زبان"],
    ["settings", Settings, "تنظیمات"],
  ];
  return (
    <div className="shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("home");
          }}
        >
          <span className="brand-icon">
            <Leaf size={26} />
          </span>
          <span dir="ltr">
            parola<span className="brand-dot">.</span>
            <small>YOUR LITTLE LANGUAGE LAB</small>
          </span>
        </a>
        <div className="workspace">
          <span className="flag">🇮🇹</span>
          <div>
            مسیر ایتالیایی من<small>فارسی به ایتالیایی</small>
          </div>
          <span className="level">{settings.level}</span>
        </div>
        <div className="nav-label">فضای یادگیری</div>
        <nav>
          {nav.map(([id, Icon, label]) => (
            <button
              className={page === id ? "nav-item active" : "nav-item"}
              key={id}
              onClick={() => {
                setPage(id);
                if (id === "practice") setSession(null);
              }}
            >
              <Icon size={20} />
              <span>{label}</span>
              {id === "notebook" && <em>{items.length}</em>}
              {id === "chat" && <span className="tiny-tag">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="little-note">
            <Sparkles size={20} />
            <p>
              کم، ولی هر روز.
              <small>یادگیری از همین قدم‌های کوچیک شروع می‌شه.</small>
            </p>
          </div>
          <div className="profile">
            <div className="avatar">{displayName.slice(0, 1)}</div>
            <div>
              {displayName}
              <small>زبان‌آموز کنجکاو</small>
            </div>
            <MoreHorizontal size={20} />
          </div>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            فضای یادگیری <ChevronLeft size={14} />
            <strong>{nav.find((n) => n[0] === page)?.[2]}</strong>
          </div>
          <div className="top-actions">
            <span className="local-status">
              <span /> ذخیره روی این دستگاه
            </span>
            <span className="date">
              {new Date().toLocaleDateString("fa-IR", {
                day: "numeric",
                month: "long",
              })}
            </span>
          </div>
        </header>
        <div className="content">
          {page === "home" && (
            <>
              <div className="page-heading">
                <div>
                  <div className="eyebrow">UN PO’ OGNI GIORNO</div>
                  <h1>
                    چاو {displayName}، آماده‌ای؟{" "}
                    <span className="wave">✳</span>
                  </h1>
                  <p>امروز هم یک قدم به ایتالیایی فکر کردن نزدیک‌تر شو.</p>
                </div>
                <button
                  className="button outline"
                  onClick={() => setModal(true)}
                >
                  <Plus size={18} /> افزودن به دفترچه
                </button>
              </div>
              <div className="dashboard-grid">
                <section className="hero">
                  <div className="hero-text">
                    <span className="pill">
                      <span /> وقت یک تمرین کوچیکه
                    </span>
                    <h2>
                      یک قهوه،
                      <br />
                      چند کلمهٔ تازه.
                    </h2>
                    <p>
                      از کلمه‌هایی که خودت جمع کردی،
                      <br />
                      تا جمله‌هایی که واقعاً به کارت میان.
                    </p>
                    <button className="button cream" onClick={() => start()}>
                      شروع تمرین امروز <ArrowUpLeft size={19} />
                    </button>
                    <div className="hero-meta">
                      <Clock3 size={14} /> حدود ۵ دقیقه <span>•</span> تا{" "}
                      {settings.daily} سؤال
                    </div>
                  </div>
                  <div className="hero-art" aria-hidden="true">
                    <div className="orbit orbit-one" />
                    <div className="orbit orbit-two" />
                    <div className="art-star">✳</div>
                    <div className="floating-label" dir="ltr">
                      un passo alla volta
                    </div>
                    <div className="flashcard back-card" />
                    <div className="flashcard front-card">
                      <span className="card-overline">LA PAROLA DI OGGI</span>
                      <div className="card-flower">✺</div>
                      <strong>Imparare</strong>
                      <span className="pronunciation">/im·pa·rà·re/</span>
                      <div className="card-divider" />
                      <b>یاد گرفتن</b>
                      <small>هر روز، یه چیز تازه.</small>
                      <span className="card-corner">🇮🇹</span>
                    </div>
                    <div className="art-dot" />
                  </div>
                </section>
                <section className="daily-card">
                  <div className="section-title">
                    <h3>قدم‌های امروز</h3>
                    <Target size={20} />
                  </div>
                  <div
                    className="progress-ring"
                    style={{
                      "--p": `${Math.min(100, (todayHistory.length / Number(settings.daily)) * 100)}%`,
                    }}
                  >
                    <div>
                      <strong>
                        {todayHistory.length}
                        <span> / {settings.daily}</span>
                      </strong>
                      <small>تمرین انجام‌شده</small>
                    </div>
                  </div>
                  <p>
                    {todayHistory.length
                      ? "آفرین، همین‌طور ادامه بده!"
                      : "هنوز اول راه امروزیم!"}
                  </p>
                  <div className="daily-foot">
                    <Flame size={17} />
                    <strong>{practiced} روز</strong>
                    <span>فعالیت ثبت‌شده</span>
                  </div>
                </section>
              </div>
              <div className="stats">
                <Stat
                  Icon={BookOpen}
                  value={items.length}
                  text="در دفترچهٔ شخصی"
                  tint="sage"
                />
                <Stat
                  Icon={RotateCcw}
                  value={due}
                  text="آمادهٔ مرور"
                  tint="peach"
                />
                <Stat
                  Icon={CheckCircle2}
                  value={mastered}
                  text="یادگرفته‌شده"
                  tint="blue"
                />
                <Stat
                  Icon={Target}
                  value={history.length ? `${accuracy}٪` : "—"}
                  text="دقت پاسخ‌ها"
                  tint="lilac"
                />
              </div>
              <div className="section-heading">
                <div>
                  <h2>امروز چطور تمرین کنیم؟</h2>
                  <p>هر مهارت، یک راه تازه برای یاد گرفتن.</p>
                </div>
                <span className="muted">با کلمه‌های دفترچهٔ خودت</span>
              </div>
              <div className="mode-grid">
                <Mode
                  icon="Aa"
                  color="sage"
                  title="کلمه و اصطلاح"
                  desc="معنی رو پیدا کن، توی ذهنت نگه دار."
                  badge="چهارگزینه‌ای"
                  onClick={() => start("word")}
                />
                <Mode
                  icon="“ ”"
                  color="peach"
                  title="جمله‌های کاربردی"
                  desc="از معنی جمله تا گفت‌وگوی واقعی."
                  badge="چهارگزینه‌ای"
                  onClick={() => start("sentence")}
                />
                <Mode
                  icon="___"
                  color="lilac"
                  title="یک جای خالی کوچک"
                  desc="ساختار درست رو بذار سر جاش."
                  badge="گرامر"
                  onClick={() => start("grammar")}
                />
                <Mode
                  icon={<Mic size={23} />}
                  color="blue"
                  title="بلند بگو، یاد بگیر"
                  desc="فارسی ببین، ایتالیایی جواب بده."
                  badge="نیاز به اتصال مدل"
                  onClick={() => setPage("speech")}
                />
              </div>
              <div className="section-heading bottom-heading">
                <div>
                  <h2>از دفترچهٔ تو</h2>
                  <p>کلمه‌های کوچک، دنیای بزرگ‌تر.</p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setPage("notebook")}
                >
                  دیدن همه <ChevronLeft size={16} />
                </button>
              </div>
              <div className="recent-grid">
                {items
                  .slice(-3)
                  .reverse()
                  .map((x) => (
                    <ItemCard key={x.id} item={x} speak={speak} />
                  ))}
              </div>
              <div className="footer-quote">
                <Leaf size={17} />
                <span dir="ltr">« Una parola alla volta. »</span>
                <span>هر بار، یک کلمه.</span>
              </div>
            </>
          )}
          {page === "notebook" && (
            <>
              <PageTitle
                eyebrow="IL MIO QUADERNO"
                title="دفترچهٔ من"
                desc="هر چیزی که دوست داری یاد بگیری، اینجا جمع کن."
                action={
                  <button
                    className="button primary"
                    onClick={() => setModal(true)}
                  >
                    <Plus size={18} /> مورد جدید
                  </button>
                }
              />
              <div className="notebook-tools">
                <div className="search">
                  <Search size={18} />
                  <input
                    placeholder="جست‌وجوی کلمه یا معنی…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="tabs">
                  {[
                    ["all", "همه"],
                    ["word", "کلمات"],
                    ["phrase", "اصطلاحات"],
                    ["sentence", "جمله‌ها"],
                  ].map(([v, t]) => (
                    <button
                      key={v}
                      className={filter === v ? "selected" : ""}
                      onClick={() => setFilter(v)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="notebook-grid">
                {items
                  .filter(
                    (x) =>
                      (filter === "all" || x.kind === filter) &&
                      `${x.text} ${x.meaning}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((x) => (
                    <ItemCard
                      key={x.id}
                      item={x}
                      speak={speak}
                      remove={() => {
                        if (confirm("این مورد از دفترچه حذف شود؟"))
                          setItems((a) => a.filter((i) => i.id !== x.id));
                      }}
                    />
                  ))}
              </div>
              {!items.length && (
                <div className="empty">اولین کلمه‌ات رو اضافه کن.</div>
              )}
              <div className="storage-note">
                اطلاعات این نسخه در مرورگر همین دستگاه ذخیره می‌شود. از تنظیمات
                پشتیبان بگیر.
              </div>
            </>
          )}
          {page === "practice" && (
            <>
              <PageTitle
                eyebrow="FACCIAMO PRATICA"
                title="وقت تمرینه"
                desc="با هر اشتباه، یک چیز تازه یاد می‌گیری."
              />
              {!session ? (
                <div className="mode-grid practice-modes">
                  <Mode
                    icon="Aa"
                    color="sage"
                    title="کلمه و اصطلاح"
                    desc="ایتالیایی به فارسی"
                    badge="شروع تمرین"
                    onClick={() => start("word")}
                  />
                  <Mode
                    icon="↔"
                    color="blue"
                    title="مرور برعکس"
                    desc="فارسی به ایتالیایی"
                    badge="شروع تمرین"
                    onClick={() => start("reverse")}
                  />
                  <Mode
                    icon="“ ”"
                    color="peach"
                    title="جمله‌ها"
                    desc="معنی جمله را پیدا کن"
                    badge="شروع تمرین"
                    onClick={() => start("sentence")}
                  />
                  <Mode
                    icon="___"
                    color="lilac"
                    title="گرامر"
                    desc="جای خالی را کامل کن"
                    badge="شروع تمرین"
                    onClick={() => start("grammar")}
                  />
                </div>
              ) : session.index >= session.questions.length ? (
                <div className="quiz-card complete">
                  <div className="complete-icon">
                    <CheckCircle2 size={42} />
                  </div>
                  <h2>یک قدم جلوتر رفتی!</h2>
                  <p>
                    {session.score} پاسخ درست از {session.questions.length} سؤال
                  </p>
                  <p className="muted">
                    نتیجه‌ها ثبت شد. موردهای سخت‌تر زودتر برای مرور برمی‌گردن.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => start(session.mode)}
                  >
                    یک دور دیگر <RotateCcw size={17} />
                  </button>
                  <button
                    className="text-button"
                    onClick={() => {
                      setSession(null);
                      setPage("home");
                    }}
                  >
                    بازگشت به خانه
                  </button>
                </div>
              ) : (
                <Quiz
                  session={session}
                  answer={answer}
                  submit={submit}
                  next={next}
                  speak={speak}
                />
              )}
            </>
          )}
          {page === "chat" && (
            <>
              <PageTitle
                eyebrow="IL TUO COMPAGNO"
                title="دستیار زبان"
                desc="معنی، گرامر و مثال؛ کنار دفترچهٔ شخصی تو."
              />
              <div className="connection-note">
                <Sparkles size={19} />
                <div>
                  <strong>اتصال مدل هنوز تنظیم نشده</strong>
                  <p>
                    در این نسخه می‌توانی در دفترچه جست‌وجو کنی. چت آزاد و تولید
                    محتوا بعد از تنظیم API در بک‌اند فعال می‌شوند.
                  </p>
                </div>
              </div>
              <div className="chat-box">
                <div className="chat-welcome">
                  <MessageCircle size={32} />
                  <h3>کدوم عبارت رو با هم مرور کنیم؟</h3>
                  <p>یک کلمه مثل «bisogno» یا یک معنی مثل «مراقبت» بنویس.</p>
                </div>
                {messages.map((m, i) => (
                  <div key={i} className={`message ${m.role}`}>
                    <p dir="auto">{m.text}</p>
                  </div>
                ))}
                <form
                  className="chat-input"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!chat.trim()) return;
                    const q = chat.trim();
                    const found = items.filter((x) =>
                      `${x.text} ${x.meaning}`
                        .toLowerCase()
                        .includes(q.toLowerCase()),
                    );
                    setMessages((m) => [
                      ...m,
                      { role: "user", text: q },
                      {
                        role: "assistant",
                        text: found.length
                          ? found
                              .map(
                                (x) =>
                                  `${x.text}\n${x.meaning}\n${x.example || ""}\n${x.translation || ""}`,
                              )
                              .join("\n\n")
                          : "این مورد در دفترچه نیست. می‌تونی با دکمهٔ «مورد جدید» اضافه‌اش کنی. پاسخ هوشمند به اتصال مدل نیاز دارد.",
                      },
                    ]);
                    setChat("");
                  }}
                >
                  <input
                    value={chat}
                    onChange={(e) => setChat(e.target.value)}
                    placeholder="در دفترچه‌ات جست‌وجو کن…"
                  />
                  <button className="button primary" aria-label="ارسال">
                    <ArrowUpLeft size={20} />
                  </button>
                </form>
              </div>
            </>
          )}
          {page === "speech" && (
            <>
              <PageTitle
                eyebrow="PARLIAMO ITALIANO"
                title="بلند بگو، یاد بگیر"
                desc="از جمله‌های ساده شروع کن."
              />
              <div className="quiz-card">
                <span className="pill light">تمرین گفتاری</span>
                <h2>نیاز دارم استراحت کنم.</h2>
                <p>جمله را به ایتالیایی بگو.</p>
                <div className="connection-note">
                  <Mic size={24} />
                  <p>
                    ضبط و تصحیح صوتی در این نسخه فعال نیست. ابتدا باید سرویس
                    تبدیل گفتار و مدل تصحیح به بک‌اند متصل شود.
                  </p>
                </div>
                <button
                  className="button outline"
                  onClick={() => speak("Ho bisogno di riposarmi.")}
                >
                  شنیدن پاسخ نمونه <Volume2 size={18} />
                </button>
              </div>
            </>
          )}
          {page === "settings" && (
            <>
              <PageTitle
                eyebrow="A MODO TUO"
                title="به روش خودت"
                desc="مسیر یادگیری‌ات را شخصی کن."
              />
              <div className="settings-grid">
                <section className="settings-card">
                  <h3>پروفایل موقت</h3>
                  <label>
                    نام نمایشی
                    <input
                      placeholder="نام شما؛ بعداً از حساب کاربری"
                      value={profile.displayName}
                      onChange={(e) =>
                        setProfile({ displayName: e.target.value })
                      }
                    />
                  </label>
                  <p>این فیلد موقت است و ورود یا ثبت‌نام انجام نمی‌دهد.</p>
                </section>
                <section className="settings-card">
                  <h3>
                    <GraduationCap size={20} /> برنامهٔ یادگیری
                  </h3>
                  <label>
                    سطح تولید محتوای جدید
                    <select
                      value={settings.level}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, level: e.target.value }))
                      }
                    >
                      {["A1", "A2", "B1", "B2", "C1", "C2"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    تعداد سؤال روزانه
                    <select
                      value={settings.daily}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          daily: Number(e.target.value),
                        }))
                      }
                    >
                      {[5, 10, 15, 20].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <p className="muted">
                    سطح انتخابی فقط برای تولید محتوای جدید است؛ ذخیره و مرور
                    محتوا در هر سطحی آزاد است. زبان فعلی: فارسی ← ایتالیایی.
                    زبان‌های دیگر در نسخه‌های بعدی اضافه می‌شوند.
                  </p>
                </section>
                <section className="settings-card">
                  <h3>
                    <Download size={20} /> اطلاعات من
                  </h3>
                  <p>
                    با خروجی JSON از دفترچه و پیشرفتت پشتیبان بگیر یا آن را روی
                    دستگاه دیگری وارد کن.
                  </p>
                  <button className="button outline" onClick={exportData}>
                    <Download size={17} /> دریافت پشتیبان
                  </button>
                  <button
                      className="button outline"
                      onClick={transferNotebook}
                      disabled={transferring || preparing || Boolean(session)}
                  >
                    <Upload size={17} />
                    {transferring
                      ? "در حال انتقال…"
                      : "کپی دفترچه به سرور"}
                  </button>

                  <p className="muted">
                    کپی شامل دفترچه و پیشرفت مرور آن است.
                    انتقال دوباره، داده‌های موجود سرور را بازنویسی نمی‌کند.
                    گرامر و تاریخچه فعلاً محلی باقی می‌مانند.
                  </p>
                  <label className="button outline import-button">
                    <Upload size={17} /> ورود پشتیبان
                    <input
                      type="file"
                      accept="application/json"
                      onChange={importData}
                      hidden
                    />
                  </label>
                </section>
                <section className="settings-card">
                  <h3>
                    <Clock3 size={20} /> یادآوری روزانه
                  </h3>
                  <p>
                    ارسال اعلان زمان‌بندی‌شده هنوز فعال نشده. به Web Push،
                    اجازهٔ کاربر و scheduler سمت سرور نیاز دارد.
                  </p>
                  <span className="badge">در مرحلهٔ بعد</span>
                </section>
                <section className="settings-card">
                  <h3>
                    <Globe size={20} /> دربارهٔ این نسخه
                  </h3>
                  <p>Parola Lab · v0.1.0</p>
                  <p>
                    دفترچه، تمرین، مرور و خروجی پشتیبان فعال‌اند. ذخیره‌سازی این
                    پیش‌نمایش محلی است؛ اتصال سرور و AI هنوز فعال نیست.
                  </p>
                  <span className="badge">اولین برش قابل‌اجرا</span>
                </section>
              </div>
            </>
          )}
        </div>
      </main>
      {!onboarded && (
        <LevelSetup
          level={settings.level}
          change={(level) => setSettings((s) => ({ ...s, level }))}
          finish={() => setOnboarded(true)}
        />
      )}
      {preparing && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preparing-title"
        >
          <section className="modal">
            <h2 id="preparing-title">داریم تمرینت رو آماده می‌کنیم</h2>
            <p role="status">
             مرور دفترچه و آماده‌کردن مطالب تازه…
            </p>
          </section>
        </div>
      )}
      {notice && (
        <div role="status" className="toast">
          {notice}
        </div>
      )}
      {modal && (
        <AddModal
          close={() => setModal(false)}
          save={(item) => {
            setItems((a) => [...a, { ...item, id: crypto.randomUUID() }]);
            setModal(false);
            toast("به دفترچه اضافه شد.");
          }}
        />
      )}
    </div>
  );
}
function Stat({ Icon, value, text, tint }) {
  return (
    <div className="stat">
      <div className={`stat-icon ${tint}`}>
        <Icon size={22} />
      </div>
      <div>
        <strong>{value}</strong>
        <span>{text}</span>
      </div>
    </div>
  );
}
function Mode({ icon, color, title, desc, badge, onClick }) {
  return (
    <button className="mode" onClick={onClick}>
      <div className={`mode-icon ${color}`} dir="ltr">
        {icon}
      </div>
      <h3>{title}</h3>
      <p>{desc}</p>
      <div className="mode-foot">
        <span>{badge}</span>
        <span className="round-arrow">
          <ArrowUpLeft size={17} />
        </span>
      </div>
    </button>
  );
}
function PageTitle({ eyebrow, title, desc, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      {action}
    </div>
  );
}
function ItemCard({ item, speak, remove }) {
  return (
    <article className="item-card">
      <div className="item-top">
        <span className="badge">{labels[item.kind]}</span>
        <div>
          <span className="item-level">{item.level || "—"}</span>
          {remove && (
            <button
              className="icon-button delete"
              onClick={remove}
              aria-label="حذف مورد"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>
      <div className="item-word">
        <h3 dir="ltr">{item.text}</h3>
        <button
          className="icon-button"
          onClick={() => speak(item.text)}
          aria-label="شنیدن تلفظ"
        >
          <Volume2 size={18} />
        </button>
      </div>
      <p>{item.meaning || "معنی: در انتظار تحلیل مدل"}</p>
      {item.example && (
        <div className="item-example" dir="ltr">
          {item.example}
        </div>
      )}
      <div className="item-tag">
        <span /> {item.tag || "دفترچهٔ شخصی"}
      </div>
    </article>
  );
}
function Quiz({ session, answer, submit, next, speak }) {
  const q = session.questions[session.index];
  return (
    <div className="quiz-card">
      <div className="quiz-top">
        <span>
          سؤال {session.index + 1} از {session.questions.length}
        </span>
        <span>{session.score} پاسخ درست</span>
      </div>
      <div className="quiz-progress">
        <i
          style={{
            width: `${(session.index / session.questions.length) * 100}%`,
          }}
        />
      </div>
      <p className="quiz-instruction">
        {q.grammar
          ? "جای خالی را با ساختار درست کامل کن."
          : q.reverse
            ? "معادل ایتالیایی را انتخاب کن."
            : "معنی درست را انتخاب کن."}
      </p>
      <h2 className="question" dir={q.reverse ? "rtl" : "ltr"}>
        {q.prompt}
      </h2>
      {!q.reverse && (
        <button
          className="icon-button"
          aria-label="شنیدن سؤال"
          onClick={() => speak(q.prompt.replace("___", ""))}
        >
          <Volume2 size={22} />
        </button>
      )}
      <div className="options">
        {q.options.map((v, i) => (
          <button
            key={v}
            disabled={answer !== null}
            onClick={() => submit(v)}
            className={`option ${answer !== null && v === q.answer ? "correct" : ""} ${answer === v && v !== q.answer ? "incorrect" : ""}`}
          >
            <span className="option-number">{i + 1}</span>
            <span dir="auto">{v}</span>
            {answer !== null && v === q.answer && <Check size={20} />}
          </button>
        ))}
      </div>
      {answer !== null && (
        <div className={`feedback ${answer === q.answer ? "good" : "bad"}`}>
          <strong>
            {answer === q.answer
              ? "آفرین، درست بود!"
              : "این بار یادش می‌گیریم."}
          </strong>
          <p dir="auto">
            {q.grammar
              ? q.explanation
              : `${q.item.example || q.item.text} — ${q.item.translation || q.item.meaning}`}
          </p>
          <button className="button primary" onClick={next}>
            {session.index === session.questions.length - 1
              ? "دیدن نتیجه"
              : "سؤال بعد"}
            <ChevronLeft size={17} />
          </button>
        </div>
      )}
    </div>
  );
}
function AddModal({ close, save }) {
  const [text, setText] = useState("");
  const [meaning, setMeaning] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading || !text.trim()) return;

    setLoading(true);
    setError("");

    try {
      const analysis = await analyzeInput(text);

      await save({
        ...analysis,
        text: text.trim(),
        note: meaning.trim(),
        tag: "",
        analysisStatus: "completed",
      });
    } catch (error) {
      setError(error.message || "تحلیل انجام نشد.");
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (!loading) close();
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-title"
        aria-busy={loading}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="section-title">
          <h2 id="add-title">فقط بنویس، ذخیره کن</h2>

          <button
            className="icon-button"
            onClick={handleClose}
            aria-label="بستن"
            disabled={loading}
          >
            <X />
          </button>
        </div>

        <p className="muted">
          نوع، معنی، سطح و مثال را مدل پیشنهاد می‌دهد.
        </p>

        <form onSubmit={handleSubmit}>
          <label>
            متن ایتالیایی
            <input
              autoFocus
              required
              maxLength={2000}
              dir="ltr"
              value={text}
              disabled={loading}
              onChange={(event) => setText(event.target.value)}
              placeholder="هر چیزی که می‌خواهی یاد بگیری…"
            />
          </label>

          <details>
            <summary>یادداشت شخصی (اختیاری)</summary>

            <label>
              یادداشت تو
              <input
                value={meaning}
                disabled={loading}
                onChange={(event) => setMeaning(event.target.value)}
              />
            </label>
          </details>

          <p className="muted">
            متن برای تحلیل به Gemini ارسال می‌شود.
            سطح یادگیری تو، ذخیرهٔ این مورد را محدود نمی‌کند.
          </p>

          {error && (
            <p role="alert" style={{ color: "#a34432" }}>
              {error}
            </p>
          )}

          {loading && (
            <p role="status">
              در حال تشخیص معنی و ساختن مثال…
            </p>
          )}

          <button
            className="button primary full"
            type="submit"
            disabled={loading || !text.trim()}
          >
            <Plus size={18} />
            {loading ? "در حال تحلیل…" : "تحلیل و ذخیره"}
          </button>
        </form>
      </section>
    </div>
  );
}
function LevelSetup({ level, change, finish }) {
  return (
    <div className="modal-backdrop">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="level-title"
      >
        <h2 id="level-title">از چه سطحی شروع کنیم؟</h2>
        <p className="muted">
          این سطح برای جمله‌ها، گرامر و کلمه‌هایی است که مدل تولید خواهد کرد. هر
          عبارت سخت‌تری را هم می‌توانی ذخیره کنی.
        </p>
        <label>
          سطح یادگیری
          <select value={level} onChange={(e) => change(e.target.value)}>
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <p className="muted">هر وقت خواستی از تنظیمات تغییرش بده.</p>
        <button className="button primary full" onClick={finish}>
          شروع یادگیری
        </button>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
