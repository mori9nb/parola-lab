import React, { useEffect, useState } from 'react';
import { getCurrentUser, signIn } from './services/accountServices';

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getCurrentUser().then(value => { if (active) setUser(value); }).catch(exc => {
      if (active && exc.status !== 401) setError(exc.message);
    }).finally(() => { if (active) setLoading(false); });
    const expired = () => { if (active) { setUser(null); setError('نشست پایان یافت؛ دوباره وارد شو.'); } };
    window.addEventListener('parola:unauthorized', expired);
    return () => { active = false; window.removeEventListener('parola:unauthorized', expired); };
  }, [retry]);
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      const account = await signIn({ email, password, ...(register ? { display_name: name } : {}) }, register);
      setPassword(''); setUser(account);
    } catch (exc) { setError(exc.message); }
    finally { setBusy(false); }
  }
  if (loading) return <div className="auth-shell" role="status">در حال بررسی حساب…</div>;
  if (user) return children(user, () => { setUser(null); setPassword(''); setError(''); });
  return <main className="auth-shell" dir="rtl">
    <form className="auth-card" onSubmit={submit}>
      <div className="eyebrow" dir="ltr">PAROLA</div>
      <h1>{register ? 'ساخت حساب' : 'خوش برگشتی'}</h1>
      <p>دفترچه و پیشرفتت روی همهٔ دستگاه‌ها همراهته.</p>
      {register && <label>نام نمایشی<input required maxLength={100} autoComplete="name" value={name} onChange={e => setName(e.target.value)} disabled={busy} /></label>}
      <label>ایمیل<input type="email" required maxLength={254} dir="ltr" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} disabled={busy} /></label>
      <label>رمز عبور<input type="password" required minLength={register ? 12 : 1} maxLength={128} dir="ltr" autoComplete={register ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} disabled={busy} /></label>
      {register && <small>رمز عبور حداقل ۱۲ کاراکتر باشد.</small>}
      {error && <p role="alert" className="auth-error">{error}</p>}
      <button className="button primary" disabled={busy}>{busy ? 'کمی صبر کن…' : register ? 'ساخت حساب' : 'ورود'}</button>
      <button className="text-button" type="button" disabled={busy} onClick={() => { setRegister(value => !value); setError(''); setPassword(''); }}>{register ? 'حساب دارم؛ ورود' : 'حساب ندارم؛ ثبت‌نام'}</button>
      {error && <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>بررسی دوبارهٔ ارتباط</button>}
    </form>
  </main>;
}
