/**
 * Satya Narayan Salon - Admin Portal Controller
 * Optimized live-only Supabase Auth & Realtime synchronization.
 */

// 1. STATE VARIABLES
let bookingsData = [];
let reviewsData = [];
let currentBookingFilter = 'all';
let currentReviewFilter = 'all';
let replyingReviewId = null;
let realtimeChannel = null;

// Initialize Module
document.addEventListener('DOMContentLoaded', () => {
  checkAdminSession();
  setupUIEventListeners();
});

// 2. SESSION AUTHENTICATION & SECURITY
const checkAdminSession = async () => {
  if (supabaseClient) {
    try {
      // 1. Check if any admin profile exists in the database
      const { count, error: countError } = await supabaseClient
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'admin');

      if (countError) {
        console.error("Failed to query profiles for admin count:", countError);
      }

      const adminExists = count > 0;
      console.log("Admin account exists in database:", adminExists);

      const loginForm = document.getElementById('form-admin-passcode');
      const registerForm = document.getElementById('form-admin-register');
      const loginTitle = document.querySelector('#admin-login-screen h3');
      const loginDesc = document.querySelector('#admin-login-screen p');

      if (adminExists) {
        if (loginForm) loginForm.classList.remove('hidden');
        if (registerForm) registerForm.classList.add('hidden');
        if (loginTitle) loginTitle.textContent = "Admin Login";
        if (loginDesc) loginDesc.textContent = "ড্যাশবোর্ড অ্যাক্সেস করতে আপনার পাসওয়ার্ড দিন";
        
        // Prefill email field
        const emailField = document.getElementById('admin-email');
        if (emailField && !emailField.value) {
          emailField.value = localStorage.getItem('admin_email') || (window.env && window.env.ADMIN_EMAIL) || 'admin@salon.com';
        }
      } else {
        if (loginForm) loginForm.classList.add('hidden');
        if (registerForm) registerForm.classList.remove('hidden');
        if (loginTitle) loginTitle.textContent = "Create Admin Account";
        if (loginDesc) loginDesc.textContent = "প্রথম অ্যাডমিন অ্যাকাউন্ট তৈরি করুন";
      }

      // 2. Check active user session
      const { data: { session } } = await supabaseClient.auth.getSession();
      if (session && session.user) {
        // Fetch role from profiles table to check authorization
        const { data: profile, error } = await supabaseClient
          .from('profiles')
          .select('role')
          .eq('id', session.user.id)
          .single();

        if (!error && profile && profile.role === 'admin') {
          // Sync admin details to UI
          const profileName = document.getElementById('profile-admin-name');
          const profileEmail = document.getElementById('profile-admin-email');
          if (profileName) profileName.textContent = session.user.user_metadata?.full_name || 'দেবব্রত মান্না (মালিক)';
          if (profileEmail) profileEmail.textContent = session.user.email;
          
          // Save admin email to local storage for subsequent login queries
          localStorage.setItem('admin_email', session.user.email);

          showDashboard();
          return;
        } else {
          console.warn("Non-admin user session detected:", profile?.role);
          await supabaseClient.auth.signOut();
        }
      }
    } catch (e) {
      console.error("Error during session check:", e);
    }
    
    showLoginScreen();
  } else {
    showLoginScreen();
  }
};

const showDashboard = () => {
  document.getElementById('admin-login-screen').classList.add('hidden');
  document.getElementById('admin-dashboard-content').classList.remove('hidden');
  document.getElementById('btn-admin-logout').classList.remove('hidden');
  
  loadDashboardData();
  setupRealtimeListeners();
};

const showLoginScreen = () => {
  document.getElementById('admin-login-screen').classList.remove('hidden');
  document.getElementById('admin-login-screen').classList.add('flex');
  document.getElementById('admin-dashboard-content').classList.add('hidden');
  document.getElementById('btn-admin-logout').classList.add('hidden');
  
  // Cleanup realtime subscription on logout
  if (realtimeChannel) {
    supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }
};

// 3. UI EVENT HANDLERS & NAVIGATION
const setupUIEventListeners = () => {
  // Login Form Submit
  const loginForm = document.getElementById('form-admin-passcode');
  if (loginForm) {
    loginForm.addEventListener('submit', handlePasscodeLogin);
  }

  // Logout Click
  const btnLogout = document.getElementById('btn-admin-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', handleAdminLogout);
  }

  // Tab Switching
  const tabBtnOverview = document.getElementById('tab-btn-overview');
  const tabBtnBookings = document.getElementById('tab-btn-bookings');
  const tabBtnReviews = document.getElementById('tab-btn-reviews');

  const overviewTab = document.getElementById('admin-overview-tab');
  const bookingsTab = document.getElementById('admin-bookings-tab');
  const reviewsTab = document.getElementById('admin-reviews-tab');

  const allTabBtns = [tabBtnOverview, tabBtnBookings, tabBtnReviews];
  const allTabs = [overviewTab, bookingsTab, reviewsTab];

  const switchTab = (activeBtn, activeTab) => {
    allTabBtns.forEach(btn => {
      if (btn) {
        btn.classList.remove('bg-gradient-gold', 'text-stone-950');
        btn.classList.add('text-stone-400', 'hover:text-white');
      }
    });
    allTabs.forEach(tab => {
      if (tab) tab.classList.add('hidden');
    });

    if (activeBtn) {
      activeBtn.classList.remove('text-stone-400', 'hover:text-white');
      activeBtn.classList.add('bg-gradient-gold', 'text-stone-950');
    }
    if (activeTab) activeTab.classList.remove('hidden');
  };

  if (tabBtnOverview) tabBtnOverview.addEventListener('click', () => switchTab(tabBtnOverview, overviewTab));
  if (tabBtnBookings) tabBtnBookings.addEventListener('click', () => switchTab(tabBtnBookings, bookingsTab));
  if (tabBtnReviews) tabBtnReviews.addEventListener('click', () => switchTab(tabBtnReviews, reviewsTab));

  // Booking Filter Buttons
  const bookingFilterBtns = document.querySelectorAll('.booking-filter-btn');
  bookingFilterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      bookingFilterBtns.forEach(b => {
        b.classList.remove('bg-gold-400', 'text-stone-950');
        b.classList.add('bg-white/5', 'text-stone-400', 'hover:text-white');
      });
      e.target.classList.remove('bg-white/5', 'text-stone-400', 'hover:text-white');
      e.target.classList.add('bg-gold-400', 'text-stone-950');
      currentBookingFilter = e.target.dataset.filter;
      renderBookingsGrid();
    });
  });

  // Booking Search input
  const bookingSearch = document.getElementById('booking-search');
  if (bookingSearch) {
    bookingSearch.addEventListener('input', renderBookingsGrid);
  }

  // Review Filter Buttons
  const reviewFilterBtns = document.querySelectorAll('.review-filter-btn');
  reviewFilterBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      reviewFilterBtns.forEach(b => {
        b.classList.remove('bg-gold-400', 'text-stone-950');
        b.classList.add('bg-white/5', 'text-stone-400', 'hover:text-white');
      });
      e.target.classList.remove('bg-white/5', 'text-stone-400', 'hover:text-white');
      e.target.classList.add('bg-gold-400', 'text-stone-950');
      currentReviewFilter = e.target.dataset.filterRev;
      renderReviewsList();
    });
  });

  // Review Search input
  const reviewSearch = document.getElementById('review-search');
  if (reviewSearch) {
    reviewSearch.addEventListener('input', renderReviewsList);
  }

  // Submit Register Form Event
  const registerForm = document.getElementById('form-admin-register');
  if (registerForm) {
    registerForm.addEventListener('submit', handleRegisterSubmit);
  }

  // Submit Review Reply Event
  const btnSubmitReply = document.getElementById('btn-submit-reply');
  if (btnSubmitReply) {
    btnSubmitReply.addEventListener('click', submitReviewReply);
  }
};

// 4. AUTHENTICATION CONTROLLER METHODS
const handleRegisterSubmit = async (e) => {
  e.preventDefault();
  const emailInput = document.getElementById('register-email');
  const passwordInput = document.getElementById('register-password');
  const errorMsg = document.getElementById('register-error-msg');
  const btnSubmit = document.getElementById('btn-register-submit');

  const email = emailInput.value.trim();
  const password = passwordInput.value;

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'নিবন্ধন হচ্ছে...';

  try {
    console.log("Signing up first admin user via Supabase Auth:", email);
    const { data, error } = await supabaseClient.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          full_name: 'দেবব্রত মান্না (মালিক)'
        }
      }
    });

    if (error) throw error;

    console.log("Admin account successfully created! Attempting auto-login...");
    // Save email in local storage for passcode login page fallback
    localStorage.setItem('admin_email', email);

    const loginResult = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (loginResult.error) throw loginResult.error;

    errorMsg.classList.add('hidden');
    emailInput.value = '';
    passwordInput.value = '';

    showToast("অ্যাডমিন অ্যাকাউন্ট তৈরি করা হয়েছে এবং সফলভাবে লগইন করা হয়েছে।");
    // Reload state to transition page to dashboard
    checkAdminSession();
  } catch (err) {
    console.error("Admin registration failed:", err);
    errorMsg.textContent = `নিবন্ধন ব্যর্থ হয়েছে: ${err.message || 'আবার চেষ্টা করুন।'}`;
    errorMsg.classList.remove('hidden');
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'অ্যাডমিন অ্যাকাউন্ট তৈরি করুন';
  }
};

const handlePasscodeLogin = async (e) => {
  e.preventDefault();
  const emailInput = document.getElementById('admin-email');
  const passwordInput = document.getElementById('admin-password');
  const errorMsg = document.getElementById('login-error-msg');
  const btnSubmit = document.getElementById('btn-login-submit');

  const email = emailInput ? emailInput.value.trim() : (localStorage.getItem('admin_email') || (window.env && window.env.ADMIN_EMAIL) || 'admin@salon.com');
  const password = passwordInput.value.trim();

  btnSubmit.disabled = true;
  btnSubmit.textContent = 'লগইন হচ্ছে...';

  try {
    console.log("Attempting admin login for:", email);
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email,
      password: password
    });

    if (error) throw error;

    const user = data.user;
    if (!user) {
      throw new Error("সেশন সাকসেসফুল হলেও ইউজার ইনফরমেশন পাওয়া যায়নি।");
    }

    // Verify role in profiles table
    console.log("Verifying admin role for user ID:", user.id);
    const { data: profile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      console.error("Profile query failed:", profileError);
      await supabaseClient.auth.signOut();
      throw new Error("ইউজারের প্রোফাইল খুঁজে পাওয়া যায়নি। অনুগ্রহ করে schema.sql সঠিকভাবে রান করুন।");
    }

    if (profile.role !== 'admin') {
      console.warn("Non-admin role detected:", profile.role);
      await supabaseClient.auth.signOut();
      throw new Error("অননুমোদিত অ্যাক্সেস: আপনি এডমিন নন।");
    }

    // Login successful
    errorMsg.classList.add('hidden');
    passwordInput.value = '';
    
    // Inject details to profile
    const profileName = document.getElementById('profile-admin-name');
    const profileEmail = document.getElementById('profile-admin-email');
    if (profileName) profileName.textContent = user.user_metadata?.full_name || 'দেবব্রত মান্না (মালিক)';
    if (profileEmail) profileEmail.textContent = user.email;

    showDashboard();
    showToast("সফলভাবে লগইন করা হয়েছে।");
  } catch (err) {
    console.error("Detailed authentication error:", err);
    let displayError = "ভুল পাসওয়ার্ড। আবার চেষ্টা করুন।";
    
    if (err && err.message && typeof err.message === 'string' && err.message !== '{}' && err.message !== '[object Object]') {
      displayError = err.message;
      if (displayError.toLowerCase().includes("confirm") || displayError.toLowerCase().includes("email")) {
        displayError = "লগইন ব্যর্থ: ইমেইল নিশ্চিত করা হয়নি। অনুগ্রহ করে schema.sql রান করুন।";
      } else if (displayError.toLowerCase().includes("invalid login credentials")) {
        displayError = "ভুল ইমেইল অথবা পাসওয়ার্ড। আবার চেষ্টা করুন।";
      }
    } else if (err && typeof err === 'string' && err !== '{}' && err !== '[object Object]') {
      displayError = err;
    }
    
    errorMsg.textContent = displayError;
    errorMsg.classList.remove('hidden');
    passwordInput.value = '';
    passwordInput.focus();
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = 'লগইন করুন';
  }
};

const handleAdminLogout = async () => {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  showLoginScreen();
  showToast("লগআউট সম্পন্ন হয়েছে।");
};

// 5. RETRIEVE DATA FROM SUPABASE
const loadDashboardData = async () => {
  await Promise.all([
    loadBookings(),
    loadReviews()
  ]);
  renderStatistics();
};

const loadBookings = async () => {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('appointments')
        .select('*')
        .order('preferred_date', { ascending: false });
      
      if (error) throw error;
      bookingsData = data || [];
    } catch (e) {
      console.error("Failed to load appointments:", e);
    }
  }
  renderBookingsGrid();
};

const loadReviews = async () => {
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from('reviews')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      reviewsData = data.map(item => ({
        ...item,
        replies: typeof item.replies === 'string' ? JSON.parse(item.replies) : (item.replies || [])
      })) || [];
    } catch (e) {
      console.error("Failed to load reviews:", e);
    }
  }
  renderReviewsList();
};

// 6. SUPABASE REALTIME CONFIGURATION
const setupRealtimeListeners = () => {
  if (supabaseClient && !realtimeChannel) {
    console.log("Setting up Supabase Realtime channel subscription...");
    realtimeChannel = supabaseClient
      .channel('admin-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments' }, (payload) => {
        console.log("Realtime appointment change caught:", payload);
        loadBookings().then(renderStatistics);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, (payload) => {
        console.log("Realtime review change caught:", payload);
        loadReviews().then(renderStatistics);
      })
      .subscribe((status) => {
        console.log("Supabase Realtime status subscription:", status);
      });
  }
};

// 7. RENDERING LOGIC
const renderStatistics = () => {
  // Appointments count
  const totalBookings = bookingsData.length;
  const pending = bookingsData.filter(b => b.status === 'Pending').length;
  const confirmed = bookingsData.filter(b => b.status === 'Confirmed').length;
  const completed = bookingsData.filter(b => b.status === 'Completed').length;
  const cancelled = bookingsData.filter(b => b.status === 'Cancelled').length;

  document.getElementById('stat-total-bookings').textContent = totalBookings;
  document.getElementById('stat-pending-bookings').textContent = pending;
  document.getElementById('stat-confirmed-bookings').textContent = confirmed;
  document.getElementById('stat-completed-bookings').textContent = completed;
  document.getElementById('stat-cancelled-bookings').textContent = cancelled;

  // Reviews count
  const totalReviews = reviewsData.length;
  const approvedReviews = reviewsData.filter(r => r.status === 'approved').length;
  const pendingReviews = reviewsData.filter(r => r.status === 'pending').length;
  
  // Avg rating
  const avgRating = totalReviews > 0 
    ? (reviewsData.reduce((acc, r) => acc + r.rating, 0) / totalReviews).toFixed(1)
    : '0.0';

  document.getElementById('stat-total-reviews').textContent = `${totalReviews} টি`;
  document.getElementById('stat-approved-reviews').textContent = `${approvedReviews} টি`;
  document.getElementById('stat-pending-reviews').textContent = `${pendingReviews} টি`;
  document.getElementById('stat-avg-rating').innerHTML = `${avgRating} <span class="text-xs text-stone-400">/ 5.0</span>`;
};

const renderBookingsGrid = () => {
  const grid = document.getElementById('bookings-manager-grid');
  const countBadge = document.getElementById('booking-count-badge');
  const searchQuery = document.getElementById('booking-search').value.toLowerCase().trim();

  // Filter & Search
  let filtered = bookingsData;
  if (currentBookingFilter !== 'all') {
    filtered = filtered.filter(b => b.status === currentBookingFilter);
  }
  if (searchQuery) {
    filtered = filtered.filter(b => 
      b.name.toLowerCase().includes(searchQuery) || 
      b.mobile_number.includes(searchQuery) ||
      b.service.toLowerCase().includes(searchQuery)
    );
  }

  countBadge.textContent = `বুকিং: ${filtered.length} টি`;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12 text-stone-500 bg-white/2 p-6 rounded-2xl border border-white/5">
        <span class="material-symbols-outlined text-3xl text-stone-600 mb-2">find_in_page</span>
        <p class="text-xs">কোনো অ্যাপয়েন্টমেন্ট পাওয়া যায়নি।</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(book => {
    let badgeColor = '';
    if (book.status === 'Pending') badgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    else if (book.status === 'Confirmed') badgeColor = 'bg-green-500/10 text-green-400 border-green-500/20';
    else if (book.status === 'Completed') badgeColor = 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    else if (book.status === 'Cancelled') badgeColor = 'bg-red-500/10 text-red-400 border-red-500/20';

    const cleanPhone = book.mobile_number.replace(/\D/g, '');
    const waLink = `https://wa.me/${cleanPhone.startsWith('91') ? cleanPhone : '91' + cleanPhone}`;
    const callLink = `tel:${book.mobile_number}`;

    const formattedConfirmTime = book.confirmed_at 
      ? `<p class="text-[10px] text-stone-500 mt-1 flex items-center gap-1"><span class="material-symbols-outlined text-xs">done_all</span>নিশ্চিত করা হয়েছে: ${new Date(book.confirmed_at).toLocaleString('bn-BD')}</p>`
      : '';

    return `
      <div class="glass-panel p-5 rounded-2xl space-y-4 flex flex-col justify-between hover:border-gold-500/30 transition-all duration-300">
        <div class="space-y-3">
          <div class="flex justify-between items-start">
            <span class="text-xs font-semibold px-2.5 py-0.5 rounded-full border ${badgeColor}">
              ${book.status}
            </span>
            <span class="text-[10px] text-stone-500">${new Date(book.created_at).toLocaleDateString('bn-BD')}</span>
          </div>
          <div>
            <h4 class="font-bold text-gradient-gold text-sm">${book.name}</h4>
            <p class="text-xs text-stone-400 font-semibold mt-0.5">${book.mobile_number}</p>
          </div>
          <div class="space-y-1 text-xs border-t border-b border-white/5 py-2.5">
            <p class="flex items-center gap-1.5"><span class="material-symbols-outlined text-stone-500 text-base">content_cut</span> <span class="font-semibold text-stone-300">${book.service}</span></p>
            <p class="flex items-center gap-1.5"><span class="material-symbols-outlined text-stone-500 text-base">event</span> <span class="text-stone-300">${book.preferred_date}</span></p>
            <p class="flex items-center gap-1.5"><span class="material-symbols-outlined text-stone-500 text-base">schedule</span> <span class="text-stone-300">${book.preferred_time}</span></p>
            ${book.message ? `<p class="text-stone-400 italic text-[11px] mt-1.5 p-2 bg-white/2 rounded">"${book.message}"</p>` : ''}
          </div>
          ${formattedConfirmTime}
        </div>

        <div class="space-y-2 mt-4">
          <div class="flex gap-2">
            <a href="${callLink}" class="bg-white/5 hover:bg-white/10 text-stone-200 border border-white/10 p-2 rounded-lg flex-1 text-center transition-all flex items-center justify-center gap-1 text-xs">
              <span class="material-symbols-outlined text-sm text-gold-400">call</span> কল করুন
            </a>
            <a href="${waLink}" target="_blank" class="bg-white/5 hover:bg-white/10 text-stone-200 border border-white/10 p-2 rounded-lg flex-1 text-center transition-all flex items-center justify-center gap-1 text-xs">
              <span class="material-symbols-outlined text-sm text-green-400 font-bold">chat</span> হোয়াটসঅ্যাপ
            </a>
          </div>

          <div class="flex gap-2 pt-1">
            ${book.status === 'Pending' ? `
              <button onclick="updateBookingStatus('${book.id}', 'Confirmed')" class="bg-green-600 hover:bg-green-500 text-stone-950 font-bold text-[10px] px-3 py-2 rounded-lg flex-1 transition-all uppercase tracking-wider">Confirm</button>
              <button onclick="updateBookingStatus('${book.id}', 'Cancelled')" class="bg-red-950/40 hover:bg-red-900/40 border border-red-500/20 text-red-400 text-[10px] px-3 py-2 rounded-lg flex-1 transition-all uppercase tracking-wider">Cancel</button>
            ` : ''}
            
            ${book.status === 'Confirmed' ? `
              <button onclick="updateBookingStatus('${book.id}', 'Completed')" class="bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] px-3 py-2 rounded-lg flex-1 transition-all uppercase tracking-wider">Complete</button>
              <button onclick="updateBookingStatus('${book.id}', 'Cancelled')" class="bg-red-950/40 hover:bg-red-900/40 border border-red-500/20 text-red-400 text-[10px] px-3 py-2 rounded-lg flex-1 transition-all uppercase tracking-wider">Cancel</button>
            ` : ''}

            <button onclick="deleteBookingRow('${book.id}')" class="bg-white/5 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 text-stone-400 border border-white/10 p-2 rounded-lg transition-all flex items-center justify-center" title="মুছে ফেলুন">
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
};

const renderReviewsList = () => {
  const list = document.getElementById('reviews-manager-list');
  const countBadge = document.getElementById('review-count-badge');
  const searchQuery = document.getElementById('review-search').value.toLowerCase().trim();

  // Filter & Search
  let filtered = reviewsData;
  if (currentReviewFilter !== 'all') {
    filtered = filtered.filter(r => r.status === currentReviewFilter);
  }
  if (searchQuery) {
    filtered = filtered.filter(r => 
      r.name.toLowerCase().includes(searchQuery) || 
      r.comment.toLowerCase().includes(searchQuery) ||
      r.service.toLowerCase().includes(searchQuery)
    );
  }

  countBadge.textContent = `রিভিউ: ${filtered.length} টি`;

  if (filtered.length === 0) {
    list.innerHTML = `
      <div class="text-center py-12 text-stone-500 bg-white/2 p-6 rounded-2xl border border-white/5">
        <span class="material-symbols-outlined text-3xl text-stone-600 mb-2">rate_review</span>
        <p class="text-xs">কোনো রিভিউ পাওয়া যায়নি।</p>
      </div>
    `;
    return;
  }

  list.innerHTML = filtered.map(rev => {
    let ratingStars = '★'.repeat(rev.rating) + '☆'.repeat(5 - rev.rating);
    
    let statusBadge = '';
    if (rev.status === 'pending') statusBadge = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    else if (rev.status === 'approved') statusBadge = 'bg-green-500/10 text-green-400 border-green-500/20';
    else if (rev.status === 'rejected') statusBadge = 'bg-red-500/10 text-red-400 border-red-500/20';

    // Show optional review attachments (base64 photo)
    const attachmentImg = rev.image 
      ? `<div class="mt-3"><img src="${rev.image}" alt="attachment" class="max-h-32 rounded border border-white/10 object-cover"></div>` 
      : '';

    // Render Admin Replies
    const repliesHtml = rev.replies.map(reply => `
      <div class="bg-gold-500/5 border-l-2 border-gold-400 p-2.5 rounded-r text-[11px] text-stone-300 leading-relaxed">
        <p class="font-bold text-[10px] text-gold-400">অ্যাডমিন উত্তর:</p>
        <p class="mt-0.5">${reply}</p>
      </div>
    `).join('');

    return `
      <div class="glass-panel p-5 rounded-2xl space-y-4 hover:border-gold-500/30 transition-all duration-300">
        <div class="flex flex-col sm:flex-row sm:justify-between items-start sm:items-center gap-2">
          <div class="flex items-center gap-2.5">
            ${rev.photo ? `<img src="${rev.photo}" class="w-8 h-8 rounded-full border border-white/10" alt="avatar">` : `
              <div class="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-xs font-bold text-gold-400">
                ${rev.name.charAt(0)}
              </div>
            `}
            <div>
              <h4 class="font-bold text-sm text-stone-200 flex items-center gap-1">
                ${rev.name}
                ${rev.verified ? `<span class="material-symbols-outlined text-green-400 text-sm" title="Verified Customer">verified</span>` : ''}
              </h4>
              <p class="text-[10px] text-stone-500">${new Date(rev.created_at).toLocaleString('bn-BD')}</p>
            </div>
          </div>
          <div class="flex items-center gap-2 self-stretch sm:self-auto justify-between">
            <span class="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border ${statusBadge}">
              ${rev.status}
            </span>
            <span class="text-xs font-bold text-gold-400 tracking-wider font-mono">${ratingStars}</span>
          </div>
        </div>

        <div class="text-xs text-stone-300 space-y-1.5 pl-0 sm:pl-10.5">
          <p class="text-[10px] text-stone-400 font-semibold uppercase tracking-wider flex items-center gap-1"><span class="material-symbols-outlined text-xs">category</span> সেবা: ${rev.service}</p>
          <p class="p-3 bg-white/2 rounded-xl italic leading-relaxed text-stone-300 font-normal">"${rev.comment}"</p>
          ${attachmentImg}
        </div>

        ${rev.replies.length > 0 ? `
          <div class="space-y-2 pl-0 sm:pl-10.5 mt-2">
            ${repliesHtml}
          </div>
        ` : ''}

        <div class="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/5 pl-0 sm:pl-10.5">
          <div class="flex gap-2">
            ${rev.status !== 'approved' ? `
              <button onclick="updateReviewStatus('${rev.id}', 'approved')" class="bg-green-600 hover:bg-green-500 text-stone-950 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all">APPROVE</button>
            ` : ''}
            ${rev.status !== 'rejected' ? `
              <button onclick="updateReviewStatus('${rev.id}', 'rejected')" class="bg-white/5 hover:bg-red-900/20 hover:text-red-400 hover:border-red-500/20 border border-white/10 text-stone-300 text-[10px] font-bold px-3 py-1.5 rounded-lg transition-all">REJECT</button>
            ` : ''}
          </div>

          <div class="flex gap-2">
            <button onclick="openReplyModal('${rev.id}')" class="bg-white/5 hover:bg-white/10 text-stone-200 border border-white/10 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1">
              <span class="material-symbols-outlined text-xs">reply</span> উত্তর দিন
            </button>
            <button onclick="deleteReviewRow('${rev.id}')" class="bg-white/5 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/20 border border-white/10 text-stone-400 p-1.5 rounded-lg transition-all flex items-center justify-center" title="রিভিউ মুছুন">
              <span class="material-symbols-outlined text-sm">delete</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
};

// 8. WRITE ACTION OPERATIONS
window.updateBookingStatus = async (id, newStatus) => {
  if (supabaseClient) {
    try {
      const updateData = { status: newStatus };
      if (newStatus === 'Confirmed') {
        updateData.confirmed_at = new Date().toISOString();
      } else if (newStatus === 'Pending' || newStatus === 'Cancelled') {
        updateData.confirmed_at = null;
      }

      const { error } = await supabaseClient
        .from('appointments')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      showToast(`বুকিং স্ট্যাটাস '${newStatus}' করা হয়েছে।`);
      loadBookings();
    } catch (e) {
      console.error("Booking update failed:", e);
      showToast("স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।");
    }
  }
};

window.deleteBookingRow = async (id) => {
  if (!confirm("আপনি কি নিশ্চিতভাবে এই অ্যাপয়েন্টমেন্ট মুছে ফেলতে চান?")) return;
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('appointments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showToast("অ্যাপয়েন্টমেন্ট সফলভাবে মুছে ফেলা হয়েছে।");
      loadBookings();
    } catch (e) {
      console.error("Booking deletion failed:", e);
      showToast("মুছে ফেলতে ব্যর্থ হয়েছে।");
    }
  }
};

window.updateReviewStatus = async (id, newStatus) => {
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('reviews')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      showToast(`রিভিউ স্ট্যাটাস '${newStatus}' করা হয়েছে।`);
      loadReviews();
    } catch (e) {
      console.error("Review update failed:", e);
      showToast("রিভিউ স্ট্যাটাস পরিবর্তন ব্যর্থ হয়েছে।");
    }
  }
};

window.deleteReviewRow = async (id) => {
  if (!confirm("আপনি কি নিশ্চিতভাবে এই রিভিউটি মুছে ফেলতে চান?")) return;
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('reviews')
        .delete()
        .eq('id', id);

      if (error) throw error;
      showToast("রিভিউ সফলভাবে মুছে ফেলা হয়েছে।");
      loadReviews();
    } catch (e) {
      console.error("Review deletion failed:", e);
      showToast("রিভিউ মুছতে ব্যর্থ হয়েছে।");
    }
  }
};

// 9. REPLY MODAL ACTIONS
window.openReplyModal = (id) => {
  const review = reviewsData.find(r => r.id === id);
  if (!review) return;

  replyingReviewId = id;
  document.getElementById('reply-review-user').textContent = review.name;
  document.getElementById('reply-review-comment').textContent = `"${review.comment}"`;
  document.getElementById('reply-text').value = '';
  
  const modal = document.getElementById('reply-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
};

window.closeReplyModal = () => {
  replyingReviewId = null;
  const modal = document.getElementById('reply-modal');
  modal.classList.remove('flex');
  modal.classList.add('hidden');
};

const submitReviewReply = async () => {
  if (!replyingReviewId || !supabaseClient) return;

  const replyTextInput = document.getElementById('reply-text');
  const replyText = replyTextInput.value.trim();

  if (!replyText) {
    alert("অনুগ্রহ করে কিছু লিখুন!");
    return;
  }

  const review = reviewsData.find(r => r.id === replyingReviewId);
  if (!review) return;

  // Append new reply to replies array
  const updatedReplies = [...review.replies, replyText];

  try {
    const { error } = await supabaseClient
      .from('reviews')
      .update({ replies: updatedReplies })
      .eq('id', replyingReviewId);

    if (error) throw error;

    showToast("রিভিউ এর উত্তর সফলভাবে পাঠানো হয়েছে।");
    closeReplyModal();
    loadReviews();
  } catch (e) {
    console.error("Saving reply failed:", e);
    alert("উত্তর সংরক্ষণ করা ব্যর্থ হয়েছে।");
  }
};

// 10. TOAST NOTIFICATION UTILITY
const showToast = (message) => {
  const container = document.getElementById('admin-toast-container');
  const toast = document.createElement('div');
  toast.className = "bg-stone-900 border border-gold-400/30 text-gold-400 text-xs px-4 py-3 rounded-xl shadow-lg pointer-events-auto transition-all duration-300 transform translate-y-2 opacity-0 font-medium";
  toast.textContent = message;
  
  container.appendChild(toast);
  
  // Trigger animation
  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  // Remove toast
  setTimeout(() => {
    toast.classList.add('translate-y-2', 'opacity-0');
    setTimeout(() => {
      container.removeChild(toast);
    }, 300);
  }, 3500);
};
