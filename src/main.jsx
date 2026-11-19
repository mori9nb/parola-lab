import React, { useState, useRef, useEffect } from "react";
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
  Mic,
  RotateCcw,
  GraduationCap,
  Globe,
  MoreHorizontal,
} from "lucide-react";
import { makeQuestion, shuffle } from "./learning";
import "./style.css";
import { notebookSources, wordSession, generateFreshSession } from "./practicePolicy";
import ChatPanel from "./ChatPanel";
import AuthGate from "./AuthGate";
import { readAccount, saveAccountPatch, recoverOwnerLegacy, signOut, changePassword } from "./services/accountServices";
import {
  analyzeInput,
} from "./services/languageServices";
import {
  persistNotebookItems,
  deleteNotebookItem, submitNotebookReview,
} from "./services/notebookRepository";
import {
  persistGrammarEntries,
  submitGrammarReview,
} from "./services/grammarRepository";
import { readExistingLearning, createClientId } from "./services/serverConnection";
const labels = {
  word: "کلمه",
  phrase: "اصطلاح",
  sentence: "جمله",
  pending: "در انتظار تحلیل",
};
function App({ accountUser, onSignedOut }) {
  const [page, setPage] = useState("home");
  const [serverReady, setServerReady] = useState(false);
  const [grammarReady, setGrammarReady] = useState(false);
  const [serverBusy, setServerBusy] = useState(true);
  const [loadError, setLoadError] = useState("");
  const serverLock = useRef(false);
  const reviewLock = useRef(false);
  const [savingReview, setSavingReview] = useState(false);
  const [items, setItems] = useState([]);
  const [progress, setProgress] = useState({});
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState({ attempts: 0, correct: 0, practiced_days: 0, today: 0 });
  const accountRef = useRef({ revision: 0, user: accountUser });
  const accountWriteLock = useRef(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [settings, setSettings] = useState({
    level: "A2",
    daily: 10,
    base: "fa",
    target: "it",
  });
  const [profile, setProfile] = useState({
    displayName: accountUser.display_name,
  });
  const [grammarBank, setGrammarBank] = useState([]);
  const [onboarded, setOnboarded] = useState(true);
  const displayName = profile.displayName.trim() || "زبان‌آموز";
  const [modal, setModal] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [session, setSession] = useState(null);
  const [answer, setAnswer] = useState(null);
  const [notice, setNotice] = useState("");
  const todayCount = stats.today;
  const practiced = stats.practiced_days;
  const mastered = Object.values(progress).filter((x) => x.streak >= 3).length;
  const due = items.filter(
    (x) => !progress[x.id] || progress[x.id].due <= Date.now(),
  ).length;
  const [preparing, setPreparing] = useState(false);
  const [preparingText, setPreparingText] = useState("");
  const preparingLock = useRef(false);

  const accuracy = stats.attempts ? Math.round(stats.correct / stats.attempts * 100) : 0;
  function toast(s) {
    setNotice(s);
    setTimeout(() => setNotice(""), 4000);
  }
  function applyAccount(account) {
    accountRef.current = account;
    setSettings(account.settings);
    setProfile({ displayName: account.user.display_name });
    setOnboarded(account.onboarded);
    setHistory(account.history);
    setStats(account.stats);
  }
  async function updateAccount(patch, silent = false) {
    if (accountWriteLock.current) throw new Error("ذخیرهٔ تنظیمات قبلی هنوز تمام نشده است.");
    accountWriteLock.current = true;
    setSavingAccount(true);
    try {
      const account = await saveAccountPatch(patch, accountRef.current.revision);
      applyAccount(account);
      if (!silent) toast("تغییرات ذخیره شد.");
      return account;
    } catch (error) {
      if (error.status === 409) applyAccount(await readAccount());
      if (!silent) toast(error.message);
      throw error;
    } finally { accountWriteLock.current = false; setSavingAccount(false); }
  }
  function updatePreference(patch) { updateAccount(patch).catch(() => {}); }
  async function logout() {
    if (serverLock.current || reviewLock.current || preparingLock.current || accountWriteLock.current) return;
    setServerBusy(true);
    try { await signOut(); onSignedOut(); }
    catch (error) { setServerBusy(false); toast(error.message); }
  }
  async function refreshLearning(isCancelled = () => false) {
    if (serverLock.current || reviewLock.current || preparingLock.current || accountWriteLock.current) return;
    serverLock.current = true;
    setServerBusy(true);
    setLoadError("");
    try {
      let account = await readAccount();
      try { account = await recoverOwnerLegacy(account); }
      catch (error) {
        if (error.status === 401) throw error;
        toast("بعضی داده‌های قدیمی مرورگر منتقل نشدند؛ نسخهٔ قبلی حفظ شده است.");
      }
      const decoded = await readExistingLearning({ items, bank: grammarBank, progress });
      if (isCancelled()) return;
      applyAccount(account);
      setItems(decoded.items);
      setGrammarBank(decoded.bank);
      setProgress(decoded.progress);
      setServerReady(true);
      setGrammarReady(true);
      setSession(null);
      setAnswer(null);
    } catch (error) {
      if (isCancelled()) return;
      setServerReady(false);
      setGrammarReady(false);
      setLoadError(error.message || "دریافت اطلاعات انجام نشد.");
    } finally {
      if (!isCancelled()) {
        serverLock.current = false;
        setServerBusy(false);
      }
    }
  }
  useEffect(() => {
    let cancelled = false;
    refreshLearning(() => cancelled);
    return () => { cancelled = true; serverLock.current = false; };
  }, []);
  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "hidden" || session || modal || profile.displayName !== accountRef.current.user.display_name) return;
      refreshLearning();
    }
    window.addEventListener?.("focus", refreshWhenVisible);
    document.addEventListener?.("visibilitychange", refreshWhenVisible);
    return () => {
      window.removeEventListener?.("focus", refreshWhenVisible);
      document.removeEventListener?.("visibilitychange", refreshWhenVisible);
    };
  }, [session, modal, items, grammarBank, progress, profile.displayName]);
  async function saveNotebookItem(item) {
    if (!serverReady || !grammarReady || serverLock.current || preparingLock.current) throw new Error("ارتباط با سرور برقرار نیست؛ دوباره تلاش کن.");
    const candidate = { ...item, id: createClientId(), origin: item.origin ?? "user", createdAt: new Date().toISOString() };
    serverLock.current = true;
    setServerBusy(true);
    try {
      const saved = await persistNotebookItems([candidate]);
      setItems(current => [...current, ...saved.filter(x => !current.some(y => y.id === x.id))]);
      setModal(false);
      toast("به دفترچه اضافه شد.");
    } catch (error) {
      setServerReady(false);
      setLoadError(error.message || "ثبت در سرور تأیید نشد.");
      throw error;
    } finally { serverLock.current = false; setServerBusy(false); }
  }
  async function removeNotebookItem(item) {
    if (!serverReady || serverLock.current || preparingLock.current) return;
    if (!confirm("این مورد از دفترچه حذف شود؟")) return;
    serverLock.current = true;
    setServerBusy(true);
    try {
      await deleteNotebookItem(item.serverId);
      setItems(current => current.filter(x => x.id !== item.id));
      setProgress(current => { const next = { ...current }; delete next[item.id]; return next; });
    } catch (error) {
      setServerReady(false);
      setLoadError(error.message || "حذف تأیید نشد.");
      toast(error.message);
    } finally { serverLock.current = false; setServerBusy(false); }
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
  async function start(mode = "word") {
    if (preparingLock.current || serverLock.current || reviewLock.current || accountWriteLock.current) return;
    if (!serverReady || !grammarReady) return toast("ارتباط با سرور برقرار نیست؛ دوباره تلاش کن.");
    preparingLock.current = true;
    setPreparing(true);
    setPreparingText("مرور تصادفی کلمات دفترچه…");
    try {
      const personal = notebookSources(items);
      const limit = Number(settings.daily);
      let questions;
      if (mode === "grammar" || mode === "sentence") {
        if (!personal.length) throw new Error("اول چند کلمه، اصطلاح یا جمله به دفترچه اضافه کن.");
        const seeds = [...new Set(shuffle(personal).slice(0, 10).map(x => x.text.trim()))];
        const previous = mode === "grammar" ? grammarBank : items.filter(x => x.origin === "ai");
        const exclude = [...previous].sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || ""))).slice(-100).map(x => x.text);
        const generated = await generateFreshSession(mode, seeds, settings.level, limit, exclude, (done, total) => setPreparingText(`تولید سؤال‌های تازه: ${done} از ${total} آماده است…`));
        if (mode === "sentence" && new Set(generated.map(x => x.meaning.trim())).size < 4) throw new Error("مدل معنی‌های متمایز کافی نساخت؛ دوباره تلاش کن.");
        const additions = generated.map(x => ({ ...x, id: createClientId(), origin: "ai", analysisStatus: "completed", createdAt: new Date().toISOString() }));
        if (mode === "grammar") {
          const saved = await persistGrammarEntries(additions);
          setGrammarBank(current => [...current, ...saved]);
          questions = saved.map(x => ({ ...x, prompt: x.text, grammar: true, options: shuffle(x.options) }));
        } else {
          const saved = await persistNotebookItems(additions);
          setItems(current => [...current, ...saved]);
          questions = saved.map(x => makeQuestion(x, saved));
          if (questions.some(x => !x)) throw new Error("معنی‌های تولیدشده برای سؤال چهارگزینه‌ای کافی نیست؛ دوباره تلاش کن.");
        }
      } else {
        questions = wordSession(items, limit, mode === "reverse");
        if (!questions.length) throw new Error("برای تمرین چهارگزینه‌ای، حداقل چهار کلمه یا اصطلاح با معنی متفاوت به دفترچه اضافه کن.");
      }
      setSession({ questions, index: 0, score: 0, mode });
      setAnswer(null);
      setPage("practice");
    } catch (error) {
      toast(error.message || "تمرین تازه آماده نشد؛ دوباره تلاش کن.");
    } finally {
      preparingLock.current = false;
      setPreparing(false);
    }
  }
  async function submit(value) {
    if (answer !== null || reviewLock.current || serverLock.current || preparingLock.current || accountWriteLock.current || !session) return;
    const q = session.questions[session.index];
    const correct = value === q.answer;
    reviewLock.current = true;
    setSavingReview(true);
    try {
      let updated;
      if (q.grammar) {
        if (!grammarReady) throw new Error("ارتباط با سرور برقرار نیست؛ دوباره تلاش کن.");
        updated = await submitGrammarReview(q.serverId, correct, createClientId());
      } else {
        if (!serverReady) throw new Error("ارتباط با سرور برقرار نیست؛ دوباره تلاش کن.");
        updated = await submitNotebookReview(q.item.serverId, correct, createClientId());
      }
      setProgress(current => ({ ...current, [q.id]: updated }));
      applyAccount(await readAccount());
      setSession(current => current ? { ...current, score: current.score + Number(correct) } : current);
      setAnswer(value);
    } catch (error) {
      // Do not repeat an attempt whose response may have been lost.
      if (q.grammar) setGrammarReady(false);
      else setServerReady(false);
      setSession(null);
      setAnswer(null);
      setLoadError(error.message || "ثبت پاسخ تأیید نشد.");
      toast("ثبت پاسخ تأیید نشد؛ ارتباط را دوباره بررسی کن.");
    } finally { reviewLock.current = false; setSavingReview(false); }
  }
  function next() {
    if (reviewLock.current) return;
    setSession((s) => ({ ...s, index: s.index + 1 }));
    setAnswer(null);
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
                if (reviewLock.current) return;
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
              <span /> {serverBusy ? "در حال دریافت اطلاعات…" : serverReady && grammarReady ? "ذخیرهٔ خودکار" : "ارتباط برقرار نیست"}
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
          {loadError && !serverBusy && (
            <div role="alert" className="connection-note">
              <p>{loadError}</p>
              <button className="button outline" onClick={() => refreshLearning()}>تلاش دوباره</button>
            </div>
          )}
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
                  disabled={!serverReady || !grammarReady || serverBusy}
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
                      مرور کلمات دفترچه <ArrowUpLeft size={19} />
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
                      "--p": `${Math.min(100, (todayCount / Number(settings.daily)) * 100)}%`,
                    }}
                  >
                    <div>
                      <strong>
                        {todayCount}
                        <span> / {settings.daily}</span>
                      </strong>
                      <small>تمرین انجام‌شده</small>
                    </div>
                  </div>
                  <p>
                    {todayCount
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
                  desc="مرور تصادفی کلمات و اصطلاحات دفترچه؛ بدون تولید جدید"
                  badge="چهارگزینه‌ای"
                  onClick={() => start("word")}
                />
                <Mode
                  icon="“ ”"
                  color="peach"
                  title="جمله‌های کاربردی"
                  desc="هر جلسه جمله‌های تازه از محتوای دفترچه"
                  badge="چهارگزینه‌ای"
                  onClick={() => start("sentence")}
                />
                <Mode
                  icon="___"
                  color="lilac"
                  title="یک جای خالی کوچک"
                  desc="هر جلسه جای خالی تازه از محتوای دفترچه"
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
                    disabled={!serverReady || !grammarReady || serverBusy}
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
                      remove={() => removeNotebookItem(x)}
                    />
                  ))}
              </div>
              {!items.length && (
                <div className="empty">اولین کلمه‌ات رو اضافه کن.</div>
              )}
              <div className="storage-note">
                دفترچه، گرامر و پیشرفت مرور به‌صورت خودکار ذخیره می‌شوند.
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
                    desc="مرور تصادفی دفترچه؛ ایتالیایی به فارسی"
                    badge="شروع تمرین"
                    onClick={() => start("word")}
                  />
                  <Mode
                    icon="↔"
                    color="blue"
                    title="مرور برعکس"
                    desc="مرور تصادفی کلمات دفترچه؛ فارسی به ایتالیایی"
                    badge="شروع تمرین"
                    onClick={() => start("reverse")}
                  />
                  <Mode
                    icon="“ ”"
                    color="peach"
                    title="جمله‌ها"
                    desc="هر جلسه جملهٔ تازه؛ متناسب با سطح تو"
                    badge="شروع تمرین"
                    onClick={() => start("sentence")}
                  />
                  <Mode
                    icon="___"
                    color="lilac"
                    title="گرامر"
                    desc="هر جلسه گرامر تازه؛ متناسب با سطح تو"
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
                  saving={savingReview}
                  submit={submit}
                  next={next}
                  speak={speak}
                />
              )}
            </>
          )}
          {(page === "chat" || page === "speech") && (
            <ChatPanel key={page} channel={page === "speech" ? "conversation" : "tutor"} level={settings.level} />
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
                  <h3>حساب من</h3>
                  <label>
                    نام نمایشی
                    <input
                      placeholder="نام نمایشی"
                      maxLength={100}
                      disabled={savingAccount}
                      value={profile.displayName}
                      onChange={(e) =>
                        setProfile({ displayName: e.target.value })
                      }
                    />
                  </label>
                  <p dir="ltr">{accountUser.email}</p>
                  <button className="button outline" disabled={savingAccount || !profile.displayName.trim()} onClick={() => updatePreference({ display_name: profile.displayName })}>ذخیرهٔ نام</button>
                  <button className="text-button" disabled={savingAccount || savingReview || preparing} onClick={logout}>خروج از حساب</button>
                  <PasswordForm />
                </section>
                <section className="settings-card">
                  <h3>
                    <GraduationCap size={20} /> برنامهٔ یادگیری
                  </h3>
                  <label>
                    سطح تولید محتوای جدید
                    <select
                      value={settings.level}
                      disabled={savingAccount}
                      onChange={(e) =>
                        updatePreference({ settings: { level: e.target.value } })
                      }
                    >
                      {["A1", "A2", "B1", "B2", "C1", "C2"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    تعداد سؤال هر جلسه
                    <select
                      value={settings.daily}
                      disabled={savingAccount}
                      onChange={(e) =>
                        updatePreference({ settings: { daily: Number(e.target.value) } })
                      }
                    >
                      {[5, 10, 15, 20].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>منطقهٔ زمانی
                    <select value={settings.timezone ?? "Europe/Rome"} disabled={savingAccount} onChange={e => updatePreference({ settings: { timezone: e.target.value } })}>
                      <option value="Europe/Rome">ایتالیا</option>
                      <option value="Asia/Tehran">ایران</option>
                      <option value="UTC">UTC</option>
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
                    دفترچه، گرامر و پیشرفت مرور خودکار ذخیره می‌شوند. حساب و تاریخچهٔ هر زبان‌آموز جداست.
                  </p>
                  <span className="badge">اولین برش قابل‌اجرا</span>
                </section>
              </div>
            </>
          )}
        </div>
      </main>
      {serverReady && !onboarded && (
        <LevelSetup
          busy={savingAccount}
          level={settings.level}
          change={(level) => updatePreference({ settings: { level } })}
          finish={() => updatePreference({ onboarded: true })}
        />
      )}
      {(preparing || serverBusy || savingReview) && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preparing-title"
        >
          <section className="modal">
            <h2 id="preparing-title">{savingReview ? "در حال ثبت پاسخ" : serverBusy ? "در حال ارتباط با دفترچه" : "داریم تمرینت رو آماده می‌کنیم"}</h2>
            <p role="status">
             {serverBusy || savingReview ? "منتظر تأیید ثبت هستیم…" : preparingText}
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
          save={saveNotebookItem}
        />
      )}
    </div>
  );
}
function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      await changePassword({ current_password: current, new_password: next });
      setCurrent(""); setNext(""); setMessage("رمز تغییر کرد؛ نشست‌های دستگاه‌های دیگر بسته شدند.");
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  }
  return <details className="password-settings"><summary>تغییر رمز عبور</summary>
    <form onSubmit={submit}>
      <label>رمز فعلی<input type="password" autoComplete="current-password" required maxLength={128} value={current} onChange={e => setCurrent(e.target.value)} /></label>
      <label>رمز جدید<input type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={next} onChange={e => setNext(e.target.value)} /></label>
      <button className="button outline" disabled={busy}>ذخیرهٔ رمز جدید</button>
      {message && <p role="status">{message}</p>}
    </form>
  </details>;
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
function Quiz({ session, answer, saving, submit, next, speak }) {
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
      {saving && <p role="status">در حال ثبت پاسخ…</p>}
      <div className="options">
        {q.options.map((v, i) => (
          <button
            key={v}
            disabled={answer !== null || saving}
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
function LevelSetup({ level, change, finish, busy }) {
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
          <select value={level} disabled={busy} onChange={(e) => change(e.target.value)}>
            {["A1", "A2", "B1", "B2", "C1", "C2"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <p className="muted">هر وقت خواستی از تنظیمات تغییرش بده.</p>
        <button className="button primary full" disabled={busy} onClick={finish}>
          شروع یادگیری
        </button>
      </section>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <AuthGate>{(user, onSignedOut) => <App key={user.id} accountUser={user} onSignedOut={onSignedOut} />}</AuthGate>
);
if ("serviceWorker" in navigator)
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
