# אפשרויות לפתרון בעיית הכניסה — מערכת באוויר מחר

## תסמין
הדיפלוי הצליח, המערכת טוענת יותר מהרגיל, "כמעט נכנסת" — ואז חוזרת למסך הלוגין.

---

## סיבות אפשריות (מבלוגים, מחקרים ו־Supabase)

1. **`window.opener` מתאפס אחרי OAuth**  
   אחרי redirect ל־Google וחזרה, דפדפנים (בגלל COOP) עלולים לאפס את `window.opener`. אז ה־popup לא יכול לשלוח `postMessage` לחלון הראשי, והחלון הראשי לא יודע שההתחברות הצליחה.

2. **פרופיל לא נוצר בזמן**  
   `ensure_user_profile` רץ אחרי ההתחברות. אם הוא נכשל, איטי (timeout), או שהמשתמש לא ב־`pending_invites` — אין שורה ב־`public.users`, והאפליקציה מנתקת ומפנה ללוגין (לעיתים עם `?unauthorized=1`).

3. **ניווט ל־dashboard לפני שיש `user`**  
   אחרי סגירת ה־popup קוראים ל־`refreshUser()` ואז `navigate('/dashboard')`. אם `refreshUser()` עדיין לא השלים טעינת הפרופיל, `user` נשאר `null` וה־PrivateRoute מחזיר ללוגין.

4. **Session נכתב ב־popup ולא "נראה" מיד בחלון הראשי**  
   באותו origin ה־localStorage משותף, אבל אם סוגרים את ה־popup מהר מדי ייתכן race: החלון הראשי קורא ל־`getSession()` לפני שהסשן נשמר.

5. **משתמש לא מאושר (invite-only)**  
   אם המייל לא ב־`pending_invites` ולא המשתמש הראשון במערכת — `ensure_user_profile` זורק "User not authorized" ולא יוצר פרופיל, ואז מתנתקים ומוחזרים ללוגין.

---

## אפשרויות פעולה (לבחור לפי עדיפות)

### אופציה 1 — תקשורת Popup ↔ חלון ראשי: BroadcastChannel (מומלץ)
**בעיה:** `window.opener` עלול להיות `null` אחרי OAuth.  
**פתרון:** להעביר תקשורת ל־**BroadcastChannel** (אותו origin, עובד גם בלי `opener`).

- **פעולה:** בקוד — ב־popup אחרי התחברות מוצלחת לשלוח הודעה ב־BroadcastChannel; בחלון הראשי להאזין לאותו ערוץ ורק אז לעדכן סשן ולנווט ל־dashboard.
- **זמן:** כ־30 דקות.
- **סיכון:** נמוך.

---

### אופציה 2 — לא לנווט ל־dashboard עד שיש `user`
**בעיה:** ניווט ל־dashboard לפני ש־`refreshUser()` סיים לטעון פרופיל.  
**פתרון:** אחרי סגירת ה־popup לא לנווט מיד; לחכות (למשל עם polling קצר) עד ש־`user` מה־context לא־null, ורק אז `navigate('/dashboard')`. אם אחרי X שניות עדיין אין user — להציג הודעה ("בודק הרשאות..." / "נסה שוב").

- **פעולה:** ב־LoginPage אחרי `refreshUser()` — לולאה/אינטרוול שמחכה ל־`user` (למשל עד 10 שניות), ורק אז `navigate`.
- **זמן:** כ־20 דקות.
- **סיכון:** נמוך.

---

### אופציה 3 — ברירת מחדל: Redirect במקום Popup
**בעיה:** זרימת popup מורכבת (opener, timing, storage).  
**פתרון:** להפוך את **redirect** (דף מלא) לברירת מחדל, ו־popup לאופציה משנית ("התחברות בחלון" אם רוצים).

- **פעולה:** ב־`signInWithGoogle` להגדיר `usePopup: false` כברירת מחדל; להשאיר כפתור "התחברות בחלון" למי שצריך.
- **זמן:** כ־5 דקות.
- **סיכון:** נמוך; יש לוודא ש־Redirect URLs ב־Supabase כוללים בדיוק את הכתובת הנכונה.

---

### אופציה 4 — הארכת זמן והמתנה ל־code exchange ב־callback
**בעיה:** Supabase מחליף את ה־code ל־session אחרי ה־redirect; אם קוראים ל־`getSession()` מוקדם מדי מקבלים null.  
**פתרון:** בהטמעת ה־callback (בדף אליו redirect או ב־popup) — להמתין 2–3 שניות אחרי טעינת הדף עם `?code=`, ורק אז לקרוא ל־`getSession()` / `getUser()`.

- **פעולה:** ב־AuthContext / AuthCallbackPage — אם יש `code=` ב־URL, להמתין 2.5–3s לפני שליפת סשן (כבר קיים דיליי; לוודא שהוא מספיק).
- **זמן:** כ־10 דקות.
- **סיכון:** נמוך.

---

### אופציה 5 — וידוא שהמשתמש מאושר (invite / משתמש ראשון)
**בעיה:** משתמש לא ב־`pending_invites` ולא משתמש ראשון → `ensure_user_profile` לא יוצר פרופיל → ניתוק וחזרה ללוגין.  
**פתרון:** וידוא תפעולי + הודעה ברורה.

- **פעולה:**
  1. ב־Supabase: לוודא שהמייל של המשתמש ב־`pending_invites` (או שהוא אכן המשתמש הראשון — אז `ensure_user_profile` יוצר owner).
  2. באפליקציה: כשמפנים ל־`/login?unauthorized=1`, להציג הודעה ברורה: "הדוא״ל לא מאושר. יש להוסיף אותך מהגדרות → משתמשים."
- **זמן:** כ־15 דקות (כולל בדיקה ב־DB).
- **סיכון:** נמוך.

---

### אופציה 6 — לוגים ו־monitoring
**בעיה:** קשה לדבג בלי לראות אם הכשל הוא ב־session, פרופיל, או הרשאות.  
**פתרון:** לוגים קצרים (רק ב־development או דגל) ב־callback וב־AuthContext: "session received", "profile fetch start/end", "ensure_user_profile result".

- **פעולה:** להוסיף `console.log` / שליחת אירוע ל־Vercel (אם יש) בנקודות: אחרי code exchange, אחרי `ensure_user_profile`, לפני redirect ל־dashboard/לוגין.
- **זמן:** כ־20 דקות.
- **סיכון:** נמוך (אפשר לכבות אחרי ייצוב).

---

### אופציה 7 — Retry ל־ensure_user_profile ו־profile fetch
**בעיה:** רשת איטית או עומס ב־Supabase — `ensure_user_profile` או ה־select נכשלים/מתעכבים.  
**פתרון:** אחרי כישלון ראשון — לנסות שוב 1–2 פעמים עם השהייה קצרה (למשל 2s בין ניסיונות).

- **פעולה:** ב־AuthContext ב־`fetchUserProfile` — אם `ensure_user_profile` או ה־select נכשלו, retry עם `setTimeout` לפני הניסיון הבא.
- **זמן:** כ־15 דקות.
- **סיכון:** נמוך.

---

## המלצה למימוש עד מחר

1. **מיד (הכרחי):** אופציה 3 — **Redirect כברירת מחדל** כדי להבטיח כניסה יציבה בלי תלות ב־popup.
2. **במקביל/מיד אחרי:** אופציה 1 — **BroadcastChannel** אם רוצים להשאיר popup כאופציה; או לדלג אם נשארים רק עם redirect.
3. **חובה תפעולי:** אופציה 5 — **וידוא pending_invites / משתמש ראשון** + הודעת "לא מאושר" ברורה.
4. **אם עדיין יש נפילות:** אופציה 2 (המתנה ל־user לפני ניווט) + אופציה 7 (retry ל־ensure_user_profile).

---

## Checklist לפני עלייה לאוויר

- [ ] Supabase → Authentication → URL Configuration: **Redirect URLs** כולל בדיוק `https://npc-am.com/auth/callback` (ו־`https://npc-am.com` אם רלוונטי).
- [ ] Supabase → SQL: הפונקציה **`ensure_user_profile`** קיימת (מריצים את המיגרציה/הסקריפט הרלוונטי אם צריך).
- [ ] **RLS על `public.users` ו־`public.agencies`:** אם יש redirect ללוגין למרות שמשתמשים ב־public.users עם agency_id תקין — הרץ את המיגרציה `supabase/migrations/20260309100000_users_and_agencies_rls_login_fix.sql` ב־Supabase SQL Editor. היא מוסיפה/מתקנת: `Users can read own profile` על users, `Users can read own agency` על agencies.
- [ ] למשתמש הראשון: אין צורך ב־pending_invites; למשתמשים נוספים — המייל מופיע ב־**pending_invites** לפני ניסיון הכניסה.
- [ ] Vercel: משתני הסביבה **VITE_SUPABASE_URL**, **VITE_SUPABASE_ANON_KEY**, **VITE_APP_URL** מוגדרים ועדכניים.
