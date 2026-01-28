/**
 * Artist-Ops 360 - Dashboard Application
 * Handles all client-side interactions and data display
 */

// ============================================
// Sample Data (Replace with API calls)
// ============================================

const sampleEvents = [
  {
    id: 1,
    artist: "The Revivalists",
    venue: "Shelter TLV",
    date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
    fee: 18000,
    status: "confirmed",
    paymentStatus: "pending"
  },
  {
    id: 2,
    artist: "DJ Shadow",
    venue: "Barby Club",
    date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    fee: 25000,
    status: "confirmed",
    paymentStatus: "paid"
  },
  {
    id: 3,
    artist: "Infected Mushroom",
    venue: "Expo Tel Aviv",
    date: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    fee: 45000,
    status: "pending",
    paymentStatus: "pending"
  },
  {
    id: 4,
    artist: "Static & Ben El",
    venue: "Zappa Herzliya",
    date: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    fee: 35000,
    status: "confirmed",
    paymentStatus: "overdue"
  }
];

const attentionItems = [
  {
    id: 1,
    icon: "⚠️",
    title: "חשבונית באיחור",
    description: "Static & Ben El @ Zappa - 7 ימים באיחור",
    type: "overdue"
  },
  {
    id: 2,
    icon: "📝",
    title: "לקוח חדש - חסר מידע",
    description: "Shelter TLV - חסרים פרטי חיוב",
    type: "incomplete"
  },
  {
    id: 3,
    icon: "📄",
    title: "הסכם ממתין לחתימה",
    description: "Infected Mushroom @ Expo",
    type: "pending"
  },
  {
    id: 4,
    icon: "🔄",
    title: "סנכרון יומן נכשל",
    description: "בדוק את הגדרות החיבור",
    type: "error"
  }
];

// ============================================
// Initialization
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initializeDashboard();
  setupEventListeners();
  updateDateTime();
  
  // Update time every minute
  setInterval(updateDateTime, 60000);
});

function initializeDashboard() {
  renderEvents();
  renderAttentionItems();
  updateStats();
}

// ============================================
// Date & Time
// ============================================

function updateDateTime() {
  const dateDisplay = document.getElementById('dateDisplay');
  const now = new Date();
  
  const options = { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  };
  
  dateDisplay.textContent = now.toLocaleDateString('he-IL', options);
}

// ============================================
// Render Functions
// ============================================

function renderEvents() {
  const container = document.getElementById('eventsList');
  const hebrewMonths = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
  
  container.innerHTML = sampleEvents.map(event => {
    const day = event.date.getDate();
    const month = hebrewMonths[event.date.getMonth()];
    const statusClass = getStatusClass(event.paymentStatus);
    const statusText = getStatusText(event.paymentStatus);
    
    return `
      <div class="event-card" data-status="${event.paymentStatus}" onclick="openEventDetails(${event.id})">
        <div class="event-header">
          <div class="event-info">
            <div class="event-artist">${event.artist}</div>
            <div class="event-venue">${event.venue}</div>
          </div>
          <div class="event-date-box">
            <span class="event-day">${day}</span>
            <span class="event-month">${month}</span>
          </div>
        </div>
        <div class="event-footer">
          <span class="event-fee">₪${event.fee.toLocaleString('he-IL')}</span>
          <span class="event-status ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderAttentionItems() {
  const container = document.getElementById('attentionList');
  
  container.innerHTML = attentionItems.map(item => `
    <div class="attention-item" onclick="handleAttentionItem(${item.id})">
      <span class="attention-icon">${item.icon}</span>
      <div class="attention-content">
        <div class="attention-title">${item.title}</div>
        <div class="attention-desc">${item.description}</div>
      </div>
      <span class="attention-action">←</span>
    </div>
  `).join('');
}

function updateStats() {
  // In production, these would come from your API
  const stats = {
    events: sampleEvents.length,
    revenue: sampleEvents.reduce((sum, e) => sum + e.fee, 0),
    pending: sampleEvents.filter(e => e.status === 'pending').length,
    overdue: sampleEvents.filter(e => e.paymentStatus === 'overdue').length
  };
  
  document.getElementById('statEvents').textContent = stats.events;
  document.getElementById('statRevenue').textContent = `₪${(stats.revenue / 1000).toFixed(0)}K`;
  document.getElementById('statPending').textContent = stats.pending;
  document.getElementById('statOverdue').textContent = stats.overdue;
}

// ============================================
// Helper Functions
// ============================================

function getStatusClass(status) {
  const classes = {
    paid: 'status-paid',
    pending: 'status-pending',
    overdue: 'status-overdue',
    confirmed: 'status-confirmed'
  };
  return classes[status] || 'status-pending';
}

function getStatusText(status) {
  const texts = {
    paid: 'שולם',
    pending: 'ממתין',
    overdue: 'באיחור',
    confirmed: 'מאושר'
  };
  return texts[status] || status;
}

// ============================================
// Event Handlers
// ============================================

function setupEventListeners() {
  // Search
  const searchInput = document.getElementById('searchInput');
  searchInput.addEventListener('input', debounce(handleSearch, 300));
  
  // New booking form
  const form = document.getElementById('newBookingForm');
  form.addEventListener('submit', handleNewBooking);
  
  // Navigation
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', handleNavigation);
  });
  
  // Modal close on overlay click
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  });
  
  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();
  
  if (!query) {
    renderEvents();
    return;
  }
  
  const filtered = sampleEvents.filter(event => 
    event.artist.toLowerCase().includes(query) ||
    event.venue.toLowerCase().includes(query)
  );
  
  renderFilteredEvents(filtered);
}

function renderFilteredEvents(events) {
  const container = document.getElementById('eventsList');
  const hebrewMonths = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ', 'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
  
  if (events.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <p>לא נמצאו תוצאות</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = events.map(event => {
    const day = event.date.getDate();
    const month = hebrewMonths[event.date.getMonth()];
    const statusClass = getStatusClass(event.paymentStatus);
    const statusText = getStatusText(event.paymentStatus);
    
    return `
      <div class="event-card" data-status="${event.paymentStatus}" onclick="openEventDetails(${event.id})">
        <div class="event-header">
          <div class="event-info">
            <div class="event-artist">${event.artist}</div>
            <div class="event-venue">${event.venue}</div>
          </div>
          <div class="event-date-box">
            <span class="event-day">${day}</span>
            <span class="event-month">${month}</span>
          </div>
        </div>
        <div class="event-footer">
          <span class="event-fee">₪${event.fee.toLocaleString('he-IL')}</span>
          <span class="event-status ${statusClass}">${statusText}</span>
        </div>
      </div>
    `;
  }).join('');
}

function handleNavigation(e) {
  e.preventDefault();
  
  // Update active state
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  e.currentTarget.classList.add('active');
  
  const page = e.currentTarget.dataset.page;
  showToast(`ניווט ל${getPageName(page)}`, 'info');
}

function getPageName(page) {
  const names = {
    dashboard: 'דאשבורד',
    events: 'אירועים',
    artists: 'אמנים',
    clients: 'לקוחות',
    finance: 'כספים',
    settings: 'הגדרות'
  };
  return names[page] || page;
}

function handleKeyboard(e) {
  // Escape closes modal
  if (e.key === 'Escape') {
    closeModal();
  }
  
  // Cmd/Ctrl + K opens search
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
  }
  
  // Cmd/Ctrl + N opens new booking
  if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
    e.preventDefault();
    openNewBooking();
  }
}

// ============================================
// Modal Functions
// ============================================

function openNewBooking() {
  const modal = document.getElementById('modalOverlay');
  modal.classList.add('active');
  
  // Set default date to today
  const dateInput = document.querySelector('input[name="date"]');
  dateInput.valueAsDate = new Date();
  
  // Focus first input
  setTimeout(() => {
    document.querySelector('input[name="artist"]').focus();
  }, 300);
}

function closeModal() {
  const modal = document.getElementById('modalOverlay');
  modal.classList.remove('active');
  
  // Reset form
  document.getElementById('newBookingForm').reset();
}

function handleNewBooking(e) {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);
  
  // Validate
  if (!data.artist || !data.venue || !data.date) {
    showToast('נא למלא את כל השדות הנדרשים', 'error');
    return;
  }
  
  // In production, this would send to your API
  console.log('New booking:', data);
  
  // Add to sample data
  const newEvent = {
    id: sampleEvents.length + 1,
    artist: data.artist,
    venue: data.venue,
    date: new Date(data.date),
    fee: parseInt(data.fee) || 0,
    status: 'pending',
    paymentStatus: 'pending'
  };
  
  sampleEvents.unshift(newEvent);
  
  // Update UI
  renderEvents();
  updateStats();
  closeModal();
  
  showToast('ההזמנה נוצרה בהצלחה! 🎉', 'success');
}

// ============================================
// Action Functions
// ============================================

function openEventDetails(eventId) {
  const event = sampleEvents.find(e => e.id === eventId);
  if (event) {
    showToast(`פותח: ${event.artist} @ ${event.venue}`, 'info');
    // In production, navigate to event details page
  }
}

function handleAttentionItem(itemId) {
  const item = attentionItems.find(i => i.id === itemId);
  if (item) {
    showToast(`מטפל ב: ${item.title}`, 'info');
    // In production, navigate to relevant page
  }
}

function syncCalendar() {
  showToast('מסנכרן יומן... 🔄', 'info');
  
  // Simulate API call
  setTimeout(() => {
    showToast('היומן סונכרן בהצלחה! ✅', 'success');
  }, 2000);
}

function generateReport() {
  showToast('מייצר דוח חודשי... 📊', 'info');
  
  // Simulate report generation
  setTimeout(() => {
    showToast('הדוח מוכן להורדה! 📄', 'success');
  }, 1500);
}

function openInvoices() {
  showToast('פותח רשימת חשבוניות...', 'info');
}

// ============================================
// Toast Notifications
// ============================================

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  
  const icons = {
    success: '✅',
    error: '❌',
    info: 'ℹ️',
    warning: '⚠️'
  };
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${icons[type]}</span>
    <span class="toast-message">${message}</span>
  `;
  
  container.appendChild(toast);
  
  // Remove after animation
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// ============================================
// Utility Functions
// ============================================

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================
// API Integration (Placeholder)
// ============================================

const API = {
  baseUrl: 'https://api.airtable.com/v0/YOUR_BASE_ID',
  
  async getEvents() {
    // In production:
    // const response = await fetch(`${this.baseUrl}/Bookings`, { headers: {...} });
    // return response.json();
    return sampleEvents;
  },
  
  async createBooking(data) {
    // In production:
    // const response = await fetch(`${this.baseUrl}/Bookings`, {
    //   method: 'POST',
    //   headers: {...},
    //   body: JSON.stringify({ fields: data })
    // });
    // return response.json();
    console.log('API.createBooking:', data);
    return { success: true };
  },
  
  async updateBooking(id, data) {
    console.log('API.updateBooking:', id, data);
    return { success: true };
  },
  
  async deleteBooking(id) {
    console.log('API.deleteBooking:', id);
    return { success: true };
  }
};

// ============================================
// Service Worker Registration (PWA)
// ============================================

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // navigator.serviceWorker.register('/sw.js')
    //   .then(reg => console.log('SW registered:', reg))
    //   .catch(err => console.log('SW registration failed:', err));
  });
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderEvents,
    renderAttentionItems,
    updateStats,
    showToast
  };
}
