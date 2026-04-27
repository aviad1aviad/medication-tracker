import React, { useState, useEffect } from 'react';
import './App.css';

const TIMES = { morning: 'בוקר', noon: 'צהריים', evening: 'ערב' };
const TIME_KEYS = ['morning', 'noon', 'evening'];
const DEFAULT_NOTIF_TIMES = { morning: '08:00', noon: '13:00', evening: '20:00' };

const emptyForm = {
  name: '', unit: 'כדור', strengthUnit: 'מ"ג', times: [],
  slots: {
    morning: { quantity: '', strength: '' },
    noon:    { quantity: '', strength: '' },
    evening: { quantity: '', strength: '' },
  },
  stock: '', alertAt: '7'
};

const unitPlural = (unit) => {
  if (unit === 'כדור') return 'כדורים';
  if (unit === 'כמוסה') return 'כמוסות';
  return unit;
};

const showNotification = async (title, body) => {
  if (Notification.permission !== 'granted') return false;

  // Try Service Worker (required for background/PWA notifications)
  if ('serviceWorker' in navigator) {
    try {
      const swReady = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 3000)),
      ]);
      await swReady.showNotification(title, {
        body,
        icon: '/logo192.png',
        badge: '/logo192.png',
        vibrate: [200, 100, 200],
        requireInteraction: false,
      });
      return true;
    } catch (e) {
      console.warn('SW notification failed, fallback:', e.message);
    }
  }

  // Fallback: direct Notification API (works only when page is open)
  try {
    new Notification(title, { body, icon: '/logo192.png' });
    return true;
  } catch (e) {
    console.error('Notification failed:', e);
    return false;
  }
};

// Schedule notifications using setTimeout
const scheduleNotifications = (notifTimes, meds) => {
  if (window._notifTimers) window._notifTimers.forEach(clearTimeout);
  window._notifTimers = [];
  if (Notification.permission !== 'granted') return;
  if (!meds || meds.length === 0) return;

  TIME_KEYS.forEach(slot => {
    const timeStr = notifTimes[slot];
    if (!timeStr) return;
    const [hours, minutes] = timeStr.split(':').map(Number);
    const now = new Date();
    const target = new Date();
    target.setHours(hours, minutes, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);
    const delay = target - now;
    const slotMeds = meds.filter(m => m.times.includes(slot));
    if (slotMeds.length === 0) return;

    const timer = setTimeout(() => {
      const names = slotMeds.map(m => m.name).join(', ');
      showNotification('💊 זמן לקחת תרופות', `${TIMES[slot]}: ${names}`);
      scheduleNotifications(notifTimes, meds);
    }, delay);

    window._notifTimers.push(timer);
  });
};

function App() {
  const [tab, setTab] = useState('today');
  const [meds, setMeds] = useState(() => {
    const saved = localStorage.getItem('meds');
    return saved ? JSON.parse(saved) : [];
  });
  const [checked, setChecked] = useState(() => {
    const today = new Date().toDateString();
    const saved = localStorage.getItem('checked_' + today);
    return saved ? JSON.parse(saved) : {};
  });
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [notifTimes, setNotifTimes] = useState(() => {
    const saved = localStorage.getItem('notifTimes');
    return saved ? JSON.parse(saved) : DEFAULT_NOTIF_TIMES;
  });
  const [notifEnabled, setNotifEnabled] = useState(() => {
    return localStorage.getItem('notifEnabled') === 'true';
  });
  const [notifStatus, setNotifStatus] = useState('');

  useEffect(() => { localStorage.setItem('meds', JSON.stringify(meds)); }, [meds]);
  useEffect(() => {
    const today = new Date().toDateString();
    localStorage.setItem('checked_' + today, JSON.stringify(checked));
  }, [checked]);
  useEffect(() => { localStorage.setItem('notifTimes', JSON.stringify(notifTimes)); }, [notifTimes]);
  useEffect(() => { localStorage.setItem('notifEnabled', notifEnabled); }, [notifEnabled]);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(e => console.log('SW error', e));
    }
    if (notifEnabled && Notification.permission === 'granted') {
      scheduleNotifications(notifTimes, meds);
    }
  // eslint-disable-next-line
  }, []);

  const handleEnableNotif = async () => {
    if (!('Notification' in window)) {
      setNotifStatus('❌ הדפדפן לא תומך בהתראות');
      return;
    }
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      setNotifEnabled(true);
      scheduleNotifications(notifTimes, meds);
      setNotifStatus('✅ התראות פעילות!');
    } else {
      setNotifStatus('❌ ההרשאה נדחתה. נא לאשר בהגדרות הטלפון.');
    }
  };

  const handleSaveNotifTimes = () => {
    if (notifEnabled && Notification.permission === 'granted') {
      scheduleNotifications(notifTimes, meds);
    }
    setNotifStatus('✅ השעות נשמרו!');
    setTimeout(() => setNotifStatus(''), 3000);
  };

  const handleTestNotif = async () => {
    if (Notification.permission !== 'granted') {
      setNotifStatus('❌ אין הרשאה להתראות');
      return;
    }
    const ok = await showNotification('💊 התראת בדיקה', 'האפליקציה עובדת!');
    setNotifStatus(ok ? '✅ ההתראה נשלחה! (בדוק את שורת ההתראות)' : '❌ ההתראה נכשלה — בדוק הגדרות מערכת');
    setTimeout(() => setNotifStatus(''), 4000);
  };

  const dailyDoses = (m) => m.times.reduce((sum, t) => sum + parseFloat(m.slots?.[t]?.quantity || 1), 0);
  const daysLeft = (m) => m.stock > 0 ? Math.floor(m.stock / dailyDoses(m)) : 0;

  const slotDisplay = (m, slot) => {
    const qty = parseFloat(m.slots?.[slot]?.quantity || 1);
    const str = m.slots?.[slot]?.strength;
    const unit = qty === 1 ? m.unit : unitPlural(m.unit);
    const strengthPart = str ? ` של ${str} ${m.strengthUnit}` : '';
    return `${qty} ${unit}${strengthPart}`;
  };

  const toggleCheck = (key, medId, slot) => {
    const newChecked = { ...checked, [key]: !checked[key] };
    setChecked(newChecked);
    const med = meds.find(m => m.id === medId);
    if (!med) return;
    const delta = parseFloat(med.slots?.[slot]?.quantity || 1);
    setMeds(meds.map(m => m.id !== medId ? m : { ...m, stock: Math.max(0, m.stock + (checked[key] ? delta : -delta)) }));
  };

  const toggleTime = (slot) => {
    const isSelected = form.times.includes(slot);
    const times = isSelected ? form.times.filter(t => t !== slot) : [...form.times, slot];
    const slots = { ...form.slots, [slot]: isSelected ? { quantity: '', strength: '' } : { quantity: form.slots[slot].quantity || '1', strength: form.slots[slot].strength || '' } };
    setForm({ ...form, times, slots });
  };

  const setSlotField = (slot, field, value) => {
    setForm({ ...form, slots: { ...form.slots, [slot]: { ...form.slots[slot], [field]: value } } });
  };

  const saveMed = () => {
    if (!form.name.trim()) return alert('נא להזין שם תרופה');
    if (form.times.length === 0) return alert('נא לבחור לפחות זמן אחד');
    const med = { ...form, id: editingId || Date.now(), stock: parseFloat(form.stock) || 30, alertAt: parseInt(form.alertAt) || 7 };
    if (editingId) {
      setMeds(meds.map(m => m.id === editingId ? med : m));
    } else {
      setMeds([...meds, med]);
    }
    setForm(emptyForm);
    setEditingId(null);
    setTab('meds');
  };

  const startEdit = (m) => {
    const slots = m.slots || {
      morning: { quantity: m.timeQuantities?.morning || '1', strength: m.strength || '' },
      noon:    { quantity: m.timeQuantities?.noon    || '',  strength: m.strength || '' },
      evening: { quantity: m.timeQuantities?.evening || '',  strength: m.strength || '' },
    };
    setForm({ ...emptyForm, ...m, slots, stock: String(m.stock), alertAt: String(m.alertAt) });
    setEditingId(m.id);
    setTab('add');
  };

  const cancelEdit = () => { setForm(emptyForm); setEditingId(null); setTab('meds'); };
  const deleteMed = (id) => { if (window.confirm('למחוק תרופה זו?')) setMeds(meds.filter(m => m.id !== id)); };
  const updateStock = (id, val) => setMeds(meds.map(m => m.id === id ? { ...m, stock: parseFloat(val) || 0 } : m));

  const totalToday = meds.reduce((sum, m) => sum + m.times.length, 0);
  const doneToday = Object.values(checked).filter(Boolean).length;
  const progressPct = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;
  const dateStr = new Date().toLocaleDateString('he-IL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const lowMeds = meds.filter(m => daysLeft(m) <= m.alertAt);

  return (
    <div className="app" dir="rtl">
      <div className="header">
        <div className="header-top">
          <div className="header-icon">💊</div>
          <h1>מעקב תרופות</h1>
        </div>
        <p className="date">{dateStr}</p>
        {meds.length > 0 && (
          <div className="daily-progress">
            <div className="progress-label">
              <span>התקדמות היום</span>
              <span>{doneToday} / {totalToday} מנות</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${progressPct}%` }}></div>
            </div>
          </div>
        )}
      </div>

      <div className="tab-bar">
        {[['today','היום'],['meds','תרופות'],['stock','מלאי'],['add', editingId ? '✏️' : '+ הוסף'],['settings','⚙️']].map(([id, label]) => (
          <button key={id} className={`tab ${tab === id ? 'active' : ''}`}
            onClick={() => { if (id !== 'add' && editingId) cancelEdit(); setTab(id); }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'today' && (
        <div className="section">
          {lowMeds.length > 0 && <div className="alert-banner">⚠️ {lowMeds.map(m => m.name).join(', ')} — המלאי אוזל בקרוב</div>}
          {meds.length === 0 && <div className="empty"><div>💊</div>אין תרופות עדיין<br />לחץ על + הוסף</div>}
          {Object.entries(TIMES).map(([slot, label]) => {
            const slotMeds = meds.filter(m => m.times.includes(slot));
            if (!slotMeds.length) return null;
            return (
              <div key={slot} className="time-slot">
                <div className={`time-label time-${slot}`}>{label}</div>
                {slotMeds.map(m => {
                  const key = `${slot}_${m.id}`;
                  const done = !!checked[key];
                  return (
                    <div key={key} className={`med-pill ${done ? 'done' : ''}`} onClick={() => toggleCheck(key, m.id, slot)}>
                      <div className={`check-circle ${done ? 'checked' : ''}`}>{done && '✓'}</div>
                      <div className="pill-info">
                        <span className="pill-name">{m.name}</span>
                        <span className="pill-dose">{slotDisplay(m, slot)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {tab === 'meds' && (
        <div className="section">
          {meds.length === 0 && <div className="empty"><div>📋</div>אין תרופות עדיין</div>}
          {meds.map(m => (
            <div key={m.id} className="card">
              <div className="card-header">
                <span className="med-name">{m.name}</span>
                <div className="card-actions">
                  <button className="edit-btn" onClick={() => startEdit(m)}>✏️</button>
                  <button className="del-btn" onClick={() => deleteMed(m.id)}>✕</button>
                </div>
              </div>
              <div className="slot-details">
                {m.times.map(t => (
                  <div key={t} className={`slot-row slot-${t}`}>
                    <span className="slot-time">{TIMES[t]}</span>
                    <span className="slot-info">{slotDisplay(m, t)}</span>
                  </div>
                ))}
              </div>
              <div className="days-info">נשארו {daysLeft(m)} ימים ({m.stock} {unitPlural(m.unit)})</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'stock' && (
        <div className="section">
          {lowMeds.map(m => (
            <div key={m.id} className="alert-card">
              <strong>{m.name}</strong> — קני בעוד {daysLeft(m)} ימים ({m.stock} {unitPlural(m.unit)} נשארו)
            </div>
          ))}
          {meds.length === 0 && <div className="empty"><div>📦</div>אין תרופות עדיין</div>}
          {meds.map(m => {
            const dl = daysLeft(m);
            const pct = Math.min(100, Math.round((dl / 30) * 100));
            const barClass = dl <= 3 ? 'bar-red' : dl <= m.alertAt ? 'bar-orange' : 'bar-green';
            return (
              <div key={m.id} className="card">
                <div className="card-header">
                  <span className="med-name">{m.name}</span>
                  <span className="days-badge">{dl} ימים</span>
                </div>
                <div className="stock-bar-bg">
                  <div className={`stock-bar ${barClass}`} style={{ width: `${pct}%` }}></div>
                </div>
                <div className="stock-edit">
                  <label>עדכן מלאי:</label>
                  <input type="number" value={m.stock} min="0" onChange={e => updateStock(m.id, e.target.value)} />
                  <span>{unitPlural(m.unit)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'add' && (
        <div className="section">
          <div className="card">
            <h2>{editingId ? 'עריכת תרופה' : 'הוספת תרופה חדשה'}</h2>
            <div className="form-group">
              <label>שם התרופה</label>
              <input type="text" placeholder="לדוגמה: פרדניזון" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>יחידה</label>
                <select value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                  <option>כדור</option>
                  <option>כמוסה</option>
                  <option>טיפות</option>
                </select>
              </div>
              <div className="form-group">
                <label>יחידת מינון</label>
                <select value={form.strengthUnit} onChange={e => setForm({ ...form, strengthUnit: e.target.value })}>
                  <option>מ"ג</option>
                  <option>מ"ל</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>זמני נטילה — כמות ומינון לכל זמן</label>
              <div className="slot-form-grid">
                {Object.entries(TIMES).map(([slot, label]) => {
                  const selected = form.times.includes(slot);
                  return (
                    <div key={slot} className="slot-form-row">
                      <button className={`time-btn ${selected ? 'active' : ''}`} onClick={() => toggleTime(slot)}>{label}</button>
                      {selected && (
                        <div className="slot-inputs">
                          <div className="slot-input-wrap">
                            <label className="slot-sublabel">כמות</label>
                            <input type="number" className="slot-input" min="0.5" step="0.5" placeholder="1"
                              value={form.slots[slot].quantity} onChange={e => setSlotField(slot, 'quantity', e.target.value)} />
                          </div>
                          <div className="slot-input-wrap">
                            <label className="slot-sublabel">מינון ({form.strengthUnit})</label>
                            <input type="number" className="slot-input" min="0" placeholder="---"
                              value={form.slots[slot].strength} onChange={e => setSlotField(slot, 'strength', e.target.value)} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>מלאי נוכחי</label>
                <input type="number" placeholder="30" min="0" value={form.stock} onChange={e => setForm({ ...form, stock: e.target.value })} />
              </div>
              <div className="form-group">
                <label>התראה כשנשאר (ימים)</label>
                <input type="number" placeholder="7" min="1" value={form.alertAt} onChange={e => setForm({ ...form, alertAt: e.target.value })} />
              </div>
            </div>
            <button className="btn-primary" onClick={saveMed}>{editingId ? 'שמור שינויים' : 'הוסף תרופה'}</button>
            {editingId && <button className="btn-cancel" onClick={cancelEdit}>ביטול</button>}
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <div className="section">
          <div className="card">
            <h2>🔔 הגדרות התראות</h2>
            {!notifEnabled ? (
              <div>
                <p className="settings-desc">קבלי התראה בכל פעם שמגיע הזמן לקחת תרופה.</p>
                <button className="btn-primary" onClick={handleEnableNotif}>הפעל התראות</button>
              </div>
            ) : (
              <div className="notif-active-badge">✅ התראות פעילות</div>
            )}
            {notifStatus && <div className="notif-status">{notifStatus}</div>}
            <div className="settings-divider" />
            <div className="form-group">
              <label>שעת התראה — בוקר</label>
              <input type="time" value={notifTimes.morning} onChange={e => setNotifTimes({ ...notifTimes, morning: e.target.value })} />
            </div>
            <div className="form-group">
              <label>שעת התראה — צהריים</label>
              <input type="time" value={notifTimes.noon} onChange={e => setNotifTimes({ ...notifTimes, noon: e.target.value })} />
            </div>
            <div className="form-group">
              <label>שעת התראה — ערב</label>
              <input type="time" value={notifTimes.evening} onChange={e => setNotifTimes({ ...notifTimes, evening: e.target.value })} />
            </div>
            <button className="btn-primary" onClick={handleSaveNotifTimes}>שמור שעות</button>
            {notifEnabled && (
              <button className="btn-cancel" onClick={handleTestNotif}>שלח התראת בדיקה</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;