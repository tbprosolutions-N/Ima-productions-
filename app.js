/**
 * Property of MODU. Unauthorized copying or distribution is prohibited.
 */
// TERMS_URL: Link your SLA/Terms document here (set in index.html).
/**
 * אמא הפקות – iOS-inspired Dashboard (Glassmorphism, logo-only brand, RBAC)
 * Logo: fetched from Drive file LOGO via API ?action=logo, injected into header.
 * Admin: Revenue/Fee + billing button. Staff: schedules only.
 * modu.general@gmail.com – Production.
 */
(function () {
  'use strict';

  var API_URL = (typeof window !== 'undefined' && window.DASHBOARD_API_URL) || '';
  var PENDING_KEY = 'ema_pending_bookings';
  var TERMS_ACCEPTED_KEY = 'ema_terms_accepted';

  function hapticFeedback() {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(10); } catch (e) {}
    }
  }

  var els = {
    headerLogo: document.getElementById('headerLogo'),
    brandFallbackText: document.getElementById('brandFallbackText'),
    themeToggle: document.getElementById('themeToggle'),
    statsGrid: document.getElementById('statsGrid'),
    statCardRevenue: document.getElementById('statCardRevenue'),
    statCardTotal: document.getElementById('statCardTotal'),
    statCount: document.getElementById('statCount'),
    statFee: document.getElementById('statFee'),
    statPending: document.getElementById('statPending'),
    statConfirmed: document.getElementById('statConfirmed'),
    statNeedsReview: document.getElementById('statNeedsReview'),
    bookingsBody: document.getElementById('bookingsBody'),
    lastUpdate: document.getElementById('lastUpdate'),
    refreshBtn: document.getElementById('refreshBtn'),
    newBookingBtn: document.getElementById('newBookingBtn'),
    apiStatus: document.getElementById('apiStatus'),
    modalOverlay: document.getElementById('modalOverlay'),
    modalCancel: document.getElementById('modalCancel'),
    formNewBooking: document.getElementById('formNewBooking'),
    formArtist: document.getElementById('formArtist'),
    formDate: document.getElementById('formDate'),
    formVenue: document.getElementById('formVenue'),
    formFee: document.getElementById('formFee'),
    formNotes: document.getElementById('formNotes'),
    pendingIndicator: document.getElementById('pendingIndicator'),
    termsOverlay: document.getElementById('termsOverlay'),
    termsAgreeBtn: document.getElementById('termsAgreeBtn'),
    termsLink: document.getElementById('termsLink'),
    tableFilter: document.getElementById('tableFilter'),
    successToast: document.getElementById('successToast')
  };

  var state = { role: 'Staff', artists: [], bookings: [] };

  function urlAction(action) {
    if (!API_URL) return '';
    var sep = API_URL.indexOf('?') >= 0 ? '&' : '?';
    return API_URL + sep + 'action=' + encodeURIComponent(action);
  }

  function formatFee(n) {
    if (n == null || isNaN(n)) return '–';
    return Number(n).toLocaleString('he-IL');
  }

  function statusClass(s) {
    if (!s) return 'status-default';
    var lower = String(s).toLowerCase();
    if (lower === 'pending') return 'status-pending';
    if (lower === 'confirmed') return 'status-confirmed';
    if (lower === 'completed') return 'status-completed';
    if (lower === 'needs review') return 'status-needs-review';
    if (lower === 'cancelled') return 'status-cancelled';
    if (lower === 'payment sent') return 'status-payment-sent';
    return 'status-default';
  }

  function statusLabel(s) {
    if (!s) return '–';
    var lower = String(s).toLowerCase();
    if (lower === 'pending') return 'ממתין';
    if (lower === 'confirmed') return 'אושר';
    if (lower === 'completed') return 'הושלם';
    if (lower === 'needs review') return 'נדרש סקירה';
    if (lower === 'cancelled') return 'בוטל';
    if (lower === 'payment sent') return 'דרישת תשלום נשלחה';
    return s;
  }

  function showSuccessToast() {
    if (!els.successToast) return;
    els.successToast.removeAttribute('hidden');
    hapticFeedback();
    setTimeout(function () {
      if (els.successToast) els.successToast.setAttribute('hidden', '');
    }, 2200);
  }

  function applyRoleView(role) {
    state.role = role || 'Staff';
    var isStaff = state.role === 'Staff';
    if (els.statCardRevenue) els.statCardRevenue.classList.toggle('hidden-for-staff', isStaff);
    if (els.statCardTotal) els.statCardTotal.classList.toggle('hidden-for-staff', isStaff);
    var thFee = document.querySelector('.col-fee');
    if (thFee) thFee.classList.toggle('hidden-for-staff', isStaff);
    var thAction = document.querySelector('.col-action');
    if (thAction) thAction.classList.toggle('hidden-for-staff', isStaff);
  }

  function renderStats(data) {
    var stats = (data && data.stats) || {};
    var byStatus = stats.byStatus || {};
    if (els.statCount) els.statCount.textContent = stats.count != null ? stats.count : '–';
    if (els.statFee) els.statFee.textContent = stats.totalFee != null ? formatFee(stats.totalFee) : '–';
    if (els.statPending) els.statPending.textContent = byStatus.Pending != null ? byStatus.Pending : '0';
    if (els.statConfirmed) els.statConfirmed.textContent = [byStatus.Confirmed, byStatus.Completed].filter(Boolean).reduce(function (a, b) { return a + b; }, 0) || '0';
    if (els.statNeedsReview) els.statNeedsReview.textContent = byStatus['Needs Review'] != null ? byStatus['Needs Review'] : '0';
  }

  function rowDate(row) {
    return row.Date != null ? row.Date : (row['תאריך'] != null ? row['תאריך'] : '');
  }
  function rowArtist(row) {
    return row.Artist != null ? row.Artist : (row['אמן'] != null ? row['אמן'] : '');
  }
  function rowVenue(row) {
    return row.Venue != null ? row.Venue : (row['מקום'] != null ? row['מקום'] : '');
  }
  function rowFee(row) {
    var n = row.Fee != null ? row.Fee : (row['סכום'] != null ? row['סכום'] : null);
    return n != null ? formatFee(n) : '–';
  }
  function rowStatus(row) {
    return row.Status != null ? row.Status : (row['סטטוס'] != null ? row['סטטוס'] : '');
  }
  function rowId(row) {
    return row.ID != null ? row.ID : (row['לזהות'] != null ? row['לזהות'] : '');
  }

  function getFilteredBookings() {
    var q = (els.tableFilter && els.tableFilter.value) ? String(els.tableFilter.value).trim().toLowerCase() : '';
    if (!q) return state.bookings || [];
    var list = state.bookings || [];
    return list.filter(function (row) {
      var artist = (row.Artist != null ? row.Artist : row['אמן'] || '').toString().toLowerCase();
      var date = (row.Date != null ? row.Date : row['תאריך'] || '').toString().toLowerCase();
      return artist.indexOf(q) >= 0 || date.indexOf(q) >= 0;
    });
  }

  function renderBookings(rows) {
    if (!els.bookingsBody) return;
    if (rows) state.bookings = rows;
    var toShow = getFilteredBookings();
    var showFee = state.role === 'Admin';
    var showAction = state.role === 'Admin';
    var colSpan = 5 + (showFee ? 1 : 0) + (showAction ? 1 : 0);
    if (!toShow || toShow.length === 0) {
      els.bookingsBody.innerHTML = '<tr class="empty-row"><td colspan="' + colSpan + '">' + ((els.tableFilter && els.tableFilter.value) ? 'לא נמצאו תוצאות לחיפוש' : 'אין אירועים להצגה') + '</td></tr>';
      return;
    }
    var html = toShow.slice(0, 50).map(function (row) {
      var date = rowDate(row);
      var artist = rowArtist(row);
      var venue = rowVenue(row);
      var fee = rowFee(row);
      var status = rowStatus(row);
      var id = rowId(row);
      var feeCell = showFee ? '<td class="col-fee">' + escapeHtml(fee) + '</td>' : '';
      var statusLower = (status && String(status).toLowerCase()) || '';
      var paymentAlreadySent = statusLower === 'payment sent';
      var actionCell = showAction
        ? (paymentAlreadySent
          ? '<td class="col-action"><span class="billing-sent-msg" title="דרישת תשלום כבר נשלחה לאירוע זה">דרישת תשלום כבר נשלחה לאירוע זה</span></td>'
          : '<td class="col-action"><button type="button" class="btn btn-sm btn-billing" data-booking-id="' + escapeHtml(String(id)) + '" data-booking-status="' + escapeHtml(String(status || '')) + '" title="שלח דרישת תשלום (מורנינג)">שלח דרישת תשלום</button></td>')
        : '';
      return (
        '<tr>' +
        '<td>' + escapeHtml(date) + '</td>' +
        '<td>' + escapeHtml(artist) + '</td>' +
        '<td>' + escapeHtml(venue) + '</td>' +
        feeCell +
        '<td><span class="status-badge ' + statusClass(status) + '">' + escapeHtml(statusLabel(status)) + '</span></td>' +
        actionCell +
        '</tr>'
      );
    }).join('');
    els.bookingsBody.innerHTML = html;
    var btns = els.bookingsBody.querySelectorAll('.btn-billing');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        var bid = this.getAttribute('data-booking-id');
        var st = (this.getAttribute('data-booking-status') || '').toLowerCase();
        if (st === 'payment sent') {
          if (els.apiStatus) els.apiStatus.textContent = 'דרישת תשלום כבר נשלחה לאירוע זה';
          return;
        }
        if (bid) { hapticFeedback(); sendPaymentRequest(bid); }
      });
    }
  }

  function sendPaymentRequest(bookingId) {
    if (!API_URL) return;
    var bid = String(bookingId).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    var btn = document.querySelector('[data-booking-id="' + bid + '"]');
    if (btn) { btn.disabled = true; btn.textContent = 'שולח…'; }
    fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'sendPaymentRequest', bookingId: bookingId })
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res && res.ok) {
          setApiStatus(true);
          runFlow();
        } else {
          setApiStatus(false, (res && res.error) ? res.error : 'שגיאה בשליחת דרישת תשלום');
        }
      })
      .catch(function () {
        setApiStatus(false, 'שגיאת רשת');
      })
      .then(function () {
        if (btn) { btn.disabled = false; btn.textContent = 'שלח דרישת תשלום'; }
      });
  }

  function escapeHtml(s) {
    if (s == null) return '';
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function setUpdateTime() {
    if (!els.lastUpdate) return;
    var now = new Date();
    els.lastUpdate.textContent = 'עודכן: ' + now.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function setApiStatus(ok, message) {
    if (!els.apiStatus) return;
    els.apiStatus.textContent = message || (ok ? 'מחובר' : 'שגיאה');
    els.apiStatus.classList.toggle('error', !ok);
    els.apiStatus.classList.toggle('ok', ok);
  }

  function fetchWhoami() {
    return fetch(urlAction('whoami')).then(function (r) { return r.json(); });
  }

  function fetchArtists() {
    return fetch(urlAction('artists')).then(function (r) { return r.json(); });
  }

  function fetchLogo() {
    return fetch(urlAction('logo')).then(function (r) { return r.json(); });
  }

  function fetchData() {
    return fetch(urlAction('data') || API_URL).then(function (r) { return r.json(); });
  }

  function loadLogo() {
    if (!API_URL || !els.headerLogo) return;
    fetchLogo().then(function (res) {
      if (res && res.logoDataUrl) {
        els.headerLogo.src = res.logoDataUrl;
        els.headerLogo.alt = 'אמא הפקות';
        els.headerLogo.classList.add('visible');
        if (els.brandFallbackText) els.brandFallbackText.style.display = 'none';
      } else {
        if (els.brandFallbackText) els.brandFallbackText.style.display = 'block';
      }
    }).catch(function () {
      if (els.brandFallbackText) els.brandFallbackText.style.display = 'block';
    });
  }

  function initTheme() {
    var stored = (typeof localStorage !== 'undefined') ? localStorage.getItem('theme') : null;
    var theme = stored === 'light' || stored === 'dark' ? stored : 'dark';
    var root = document.documentElement;
    if (root) root.setAttribute('data-theme', theme);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#f5f5f7' : '#0d0d0f');
  }

  function toggleTheme() {
    var root = document.documentElement;
    var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    root.setAttribute('data-theme', next);
    if (typeof localStorage !== 'undefined') localStorage.setItem('theme', next);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', next === 'light' ? '#f5f5f7' : '#0d0d0f');
  }

  function openModal() {
    document.body.classList.add('modal-open');
    if (els.modalOverlay) {
      els.modalOverlay.classList.add('visible');
      els.modalOverlay.setAttribute('aria-hidden', 'false');
    }
  }

  function closeModal() {
    document.body.classList.remove('modal-open');
    if (els.modalOverlay) {
      els.modalOverlay.classList.remove('visible');
      els.modalOverlay.setAttribute('aria-hidden', 'true');
    }
  }

  function getPendingBookings() {
    try {
      var j = (typeof localStorage !== 'undefined') ? localStorage.getItem(PENDING_KEY) : null;
      return j ? JSON.parse(j) : [];
    } catch (e) { return []; }
  }
  function savePendingBookings(arr) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(PENDING_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  function updatePendingIndicator() {
    if (!els.pendingIndicator) return;
    var p = getPendingBookings();
    if (p.length > 0) {
      els.pendingIndicator.textContent = ' · ' + p.length + ' ממתינים לשליחה';
      els.pendingIndicator.style.display = 'inline';
      els.pendingIndicator.className = 'pending-indicator visible';
    } else {
      els.pendingIndicator.textContent = '';
      els.pendingIndicator.style.display = 'none';
      els.pendingIndicator.className = 'pending-indicator';
    }
  }
  function flushPendingBookings() {
    var p = getPendingBookings();
    if (!p.length || !API_URL) {
      updatePendingIndicator();
      return;
    }
    var item = p[0];
    submitNewBooking(item.payload).then(function (res) {
      if (res && res.ok) {
        p.shift();
        savePendingBookings(p);
        updatePendingIndicator();
        runFlow();
      }
    }).catch(function () {}).then(function () { updatePendingIndicator(); });
  }

  function submitNewBooking(payload) {
    if (!API_URL) {
      setApiStatus(false, 'חסר כתובת API');
      return Promise.reject(new Error('No API URL'));
    }
    var body = {
      action: 'addBooking',
      date: String(payload.date || '').trim(),
      artist: String(payload.artist || '').trim(),
      venue: String(payload.venue || '').trim(),
      fee: payload.fee != null && payload.fee !== '' ? Number(payload.fee) : 0,
      notes: String(payload.notes || '').trim()
    };
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }

  function runFlow() {
    if (!API_URL) {
      setApiStatus(false, 'הגדר DASHBOARD_API_URL');
      renderBookings([]);
      renderStats({ stats: {} });
      return Promise.resolve();
    }
var skelRow = '<tr class="skeleton-row"><td><span class="skeleton-line"></span></td><td><span class="skeleton-line"></span></td><td><span class="skeleton-line"></span></td><td><span class="skeleton-line"></span></td><td><span class="skeleton-line"></span></td><td><span class="skeleton-line"></span></td></tr>';
    if (els.statsGrid) els.statsGrid.classList.add('is-loading');
    if (els.bookingsBody) els.bookingsBody.innerHTML = skelRow + skelRow + skelRow + skelRow + skelRow;
    return Promise.all([fetchWhoami(), fetchData()]).then(function (results) {
      var who = results[0] || {};
      var data = results[1] || {};
      if (data && (data.error === 'Unauthorized Access' || data.error === 'Unauthorized License')) {
        setApiStatus(false, data.error === 'Unauthorized License' ? 'Unauthorized License' : 'Unauthorized Access');
        if (els.statsGrid) els.statsGrid.classList.remove('is-loading');
        renderStats({ stats: {} });
        if (els.bookingsBody) els.bookingsBody.innerHTML = '<tr class="empty-row"><td colspan="6">גישה לא מורשית.</td></tr>';
        return;
      }
      var role = who.role || data.role || 'Staff';
      applyRoleView(role);
      setApiStatus(true);
      if (els.statsGrid) els.statsGrid.classList.remove('is-loading');
      renderStats(data);
      state.bookings = data.bookings || [];
      renderBookings(state.bookings);
      setUpdateTime();
      flushPendingBookings();
    }).catch(function (err) {
      setApiStatus(false, 'שגיאת רשת');
      if (els.statsGrid) els.statsGrid.classList.remove('is-loading');
      if (els.bookingsBody) els.bookingsBody.innerHTML = '<tr class="empty-row"><td colspan="6">לא ניתן לטעון נתונים.</td></tr>';
      renderStats({ stats: {} });
    });
  }

  if (els.themeToggle) els.themeToggle.addEventListener('click', function () { hapticFeedback(); toggleTheme(); });

  if (els.refreshBtn) els.refreshBtn.addEventListener('click', function () { hapticFeedback(); runFlow(); });

  if (els.newBookingBtn) els.newBookingBtn.addEventListener('click', function () {
    hapticFeedback();
    if (els.formArtist) els.formArtist.value = '';
    if (els.formDate) els.formDate.value = new Date().toISOString().slice(0, 10);
    if (els.formVenue) els.formVenue.value = '';
    if (els.formFee) els.formFee.value = '';
    if (els.formNotes) els.formNotes.value = '';
    openModal();
  });

  if (els.modalCancel) els.modalCancel.addEventListener('click', function () { hapticFeedback(); closeModal(); });
  if (els.modalOverlay) els.modalOverlay.addEventListener('click', function (e) {
    if (e.target === els.modalOverlay) { hapticFeedback(); closeModal(); }
  });

  var submitBtn = els.formNewBooking ? els.formNewBooking.querySelector('button[type="submit"]') : null;
  if (els.formNewBooking) els.formNewBooking.addEventListener('submit', function (e) {
    e.preventDefault();
    var date = els.formDate ? els.formDate.value : '';
    var artist = els.formArtist ? String(els.formArtist.value || '').trim() : '';
    var venue = els.formVenue ? els.formVenue.value : '';
    var fee = els.formFee ? els.formFee.value : '';
    var notes = els.formNotes ? els.formNotes.value : '';
    if (!date || !artist || !venue) {
      setApiStatus(false, 'יש למלא תאריך, אמן ומקום');
      return;
    }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'שומר...'; }
    hapticFeedback();
    var payload = { date: date, artist: artist, venue: venue, fee: fee, notes: notes };
    submitNewBooking(payload).then(function (res) {
      if (res && res.ok) {
        showSuccessToast();
        closeModal();
        runFlow();
        setApiStatus(true);
        updatePendingIndicator();
      } else {
        setApiStatus(false, (res && res.error) ? res.error : 'שגיאה בשמירה');
        var p = getPendingBookings();
        p.push({ payload: payload, attemptedAt: Date.now() });
        savePendingBookings(p);
        updatePendingIndicator();
        if (els.apiStatus) els.apiStatus.textContent = 'נשמר locally – יישלח כשהחיבור יחזור';
      }
    }).catch(function () {
      setApiStatus(false, 'שגיאת רשת – וודא שהסקריפט פרוס ואפשר גישה');
      var p = getPendingBookings();
      p.push({ payload: payload, attemptedAt: Date.now() });
      savePendingBookings(p);
      updatePendingIndicator();
      if (els.apiStatus) els.apiStatus.textContent = 'נשמר locally – יישלח כשהחיבור יחזור';
    }).then(function () {
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'שמירה'; }
    });
  });

  function showTermsIfNeeded() {
    if (!els.termsOverlay) return;
    var accepted = (typeof sessionStorage !== 'undefined') && sessionStorage.getItem(TERMS_ACCEPTED_KEY);
    if (accepted) {
      els.termsOverlay.setAttribute('hidden', '');
      return;
    }
    if (els.termsLink && typeof window !== 'undefined' && window.TERMS_URL) {
      els.termsLink.href = window.TERMS_URL;
    }
    els.termsOverlay.removeAttribute('hidden');
  }

  function acceptTerms() {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(TERMS_ACCEPTED_KEY, '1');
    if (els.termsOverlay) els.termsOverlay.setAttribute('hidden', '');
    hapticFeedback();
    startApp();
  }

  function startApp() {
    updatePendingIndicator();
    loadLogo();
    runFlow().then(function () { loadLogo(); flushPendingBookings(); });
    setInterval(runFlow, 2 * 60 * 1000);
  }

  if (els.termsAgreeBtn) els.termsAgreeBtn.addEventListener('click', acceptTerms);

  if (els.tableFilter) els.tableFilter.addEventListener('input', function () {
    renderBookings();
  });

  initTheme();
  showTermsIfNeeded();
  if ((typeof sessionStorage !== 'undefined') && sessionStorage.getItem(TERMS_ACCEPTED_KEY)) {
    startApp();
  } else {
    updatePendingIndicator();
  }
})();
