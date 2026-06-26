/**
 * Satya Narayan Salon - Premium Reviews Module connected to Supabase
 * Features Google Sign-in, Guest submissions, Image uploads, Admin redirection, and dynamic sorting.
 */

// 1. STATE VARIABLES
let reviewsData = [];
let currentUser = null; // Stores Google User info { name, photo, email }
let currentRating = 5; // Default rating for submissions
let activeFormTab = 'google'; // 'google' or 'guest'
let guestUploadedImage = null; // Stores Base64 of guest upload

// Initialize Module on Load
document.addEventListener('DOMContentLoaded', () => {
  setupSupabaseAuthListener();
  setupUIEventListeners();
  loadAndRenderReviews();
  subscribeRealtimeReviews();
});

// 2. REALTIME SUBSCRIPTION
const subscribeRealtimeReviews = () => {
  if (supabaseClient) {
    supabaseClient
      .channel('public:reviews')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reviews' }, payload => {
        console.log("Realtime review change:", payload);
        loadAndRenderReviews();
      })
      .subscribe();
  }
};

// Image Compression Helper Utility
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const max_size = 800;

        if (width > height) {
          if (width > max_size) {
            height *= max_size / width;
            width = max_size;
          }
        } else {
          if (height > max_size) {
            width *= max_size / height;
            height = max_size;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
        resolve(dataUrl);
      };
      img.onerror = (e) => reject(e);
      img.src = event.target.result;
    };
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
};

// 3. AUTHENTICATION & SESSION LISTENER
const setupSupabaseAuthListener = () => {
  if (supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session && session.user) {
        const user = session.user;
        currentUser = {
          name: user.user_metadata.full_name || user.email,
          photo: user.user_metadata.avatar_url || "https://lh3.googleusercontent.com/a/default-user=s120",
          email: user.email
        };
        updateAuthUI(true);
      } else {
        currentUser = null;
        updateAuthUI(false);
      }
    });
  }
};

// 4. EVENT LISTENERS SETUP
const setupUIEventListeners = () => {
  // Form Tabs Toggle
  const tabGoogle = document.getElementById('tab-google-form');
  const tabGuest = document.getElementById('tab-guest-form');
  const formGoogle = document.getElementById('form-google-submit');
  const formGuest = document.getElementById('form-guest-submit');

  if (tabGoogle && tabGuest) {
    tabGoogle.addEventListener('click', () => {
      activeFormTab = 'google';
      tabGoogle.classList.add('bg-gradient-gold', 'text-background');
      tabGoogle.classList.remove('bg-surface-container-high', 'text-on-surface-variant');
      tabGuest.classList.add('bg-surface-container-high', 'text-on-surface-variant');
      tabGuest.classList.remove('bg-gradient-gold', 'text-background');
      formGoogle.classList.remove('hidden');
      formGuest.classList.add('hidden');
    });

    tabGuest.addEventListener('click', () => {
      activeFormTab = 'guest';
      tabGuest.classList.add('bg-gradient-gold', 'text-background');
      tabGuest.classList.remove('bg-surface-container-high', 'text-on-surface-variant');
      tabGoogle.classList.add('bg-surface-container-high', 'text-on-surface-variant');
      tabGoogle.classList.remove('bg-gradient-gold', 'text-background');
      formGuest.classList.remove('hidden');
      formGoogle.classList.add('hidden');
    });
  }

  // Google Login / Logout
  const btnGoogleLogin = document.getElementById('btn-google-login');
  const btnGoogleLogout = document.getElementById('btn-google-logout');

  if (btnGoogleLogin) {
    btnGoogleLogin.addEventListener('click', loginWithGoogle);
  }
  if (btnGoogleLogout) {
    btnGoogleLogout.addEventListener('click', logoutGoogle);
  }

  // Interactive Rating Stars (Form submissions)
  const starContainers = document.querySelectorAll('.form-rating-stars');
  starContainers.forEach(container => {
    const stars = container.querySelectorAll('.form-star');
    stars.forEach(star => {
      star.addEventListener('click', (e) => {
        const rating = parseInt(e.target.dataset.rating);
        currentRating = rating;
        updateStarsUI(container, rating);
      });
      star.addEventListener('mouseenter', (e) => {
        const rating = parseInt(e.target.dataset.rating);
        highlightStars(container, rating);
      });
      star.addEventListener('mouseleave', () => {
        updateStarsUI(container, currentRating);
      });
    });
  });

  // Guest Image Upload Preview with compression
  const imageInput = document.getElementById('guest-image');
  const imagePreview = document.getElementById('guest-image-preview');
  if (imageInput) {
    imageInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          guestUploadedImage = await compressImage(file);
          imagePreview.src = guestUploadedImage;
          imagePreview.classList.remove('hidden');
        } catch (err) {
          console.error("Compression error:", err);
          alert("ছবি কম্প্রেশন করতে ব্যর্থ হয়েছে।");
          imageInput.value = '';
          guestUploadedImage = null;
          imagePreview.classList.add('hidden');
        }
      } else {
        guestUploadedImage = null;
        imagePreview.classList.add('hidden');
      }
    });
  }

  // Form Submit - Google Review
  const btnSubmitGoogle = document.getElementById('btn-submit-google');
  if (btnSubmitGoogle) {
    btnSubmitGoogle.addEventListener('click', submitGoogleReview);
  }

  // Form Submit - Guest Review
  const btnSubmitGuest = document.getElementById('btn-submit-guest');
  if (btnSubmitGuest) {
    btnSubmitGuest.addEventListener('click', submitGuestReview);
  }

  // Sorting Control Selector
  const sortSelect = document.getElementById('reviews-sort');
  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      renderReviewsGrid();
    });
  }

  // Admin Access Modal Toggle - Redirects to secure admin panel
  const adminPanelToggle = document.getElementById('admin-panel-toggle');
  if (adminPanelToggle) {
    adminPanelToggle.addEventListener('click', () => {
      window.location.href = 'admin/';
    });
  }
};

// 5. AUTHENTICATION HANDLERS
const loginWithGoogle = async () => {
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.href
        }
      });
      if (error) throw error;
    } catch (e) {
      console.error("Supabase Google Auth Error:", e);
      alert("গুগল লগইন এই মুহূর্তে উপলব্ধ নয়।");
    }
  }
};

const logoutGoogle = async () => {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  currentUser = null;
  updateAuthUI(false);
  showToast("লগআউট সম্পন্ন হয়েছে");
  loadAndRenderReviews();
};

const updateAuthUI = (isLoggedIn) => {
  const loginState = document.getElementById('google-login-state');
  const formState = document.getElementById('google-review-form-state');
  const userPhoto = document.getElementById('logged-user-photo');
  const userName = document.getElementById('logged-user-name');

  if (isLoggedIn && currentUser) {
    if (loginState) loginState.classList.add('hidden');
    if (formState) formState.classList.remove('hidden');
    if (userPhoto) userPhoto.src = currentUser.photo || "https://lh3.googleusercontent.com/a/default-user=s120";
    if (userName) userName.textContent = currentUser.name;
  } else {
    if (loginState) loginState.classList.remove('hidden');
    if (formState) formState.classList.add('hidden');
  }
};

// Stars highlighting helpers
const highlightStars = (container, rating) => {
  const stars = container.querySelectorAll('.form-star');
  stars.forEach(star => {
    const starRating = parseInt(star.dataset.rating);
    if (starRating <= rating) {
      star.textContent = 'star';
      star.classList.add('text-gold-400');
    } else {
      star.textContent = 'star_rate';
      star.classList.remove('text-gold-400');
    }
  });
};

const updateStarsUI = (container, rating) => {
  highlightStars(container, rating);
};

// 6. REVIEW SUBMISSION LOGIC
const submitGoogleReview = async () => {
  if (!currentUser) return;

  const serviceSelect = document.getElementById('google-service');
  const commentText = document.getElementById('google-comment');

  if (!serviceSelect.value) {
    alert("অনুগ্রহ করে একটি পরিষেবা নির্বাচন করুন।");
    return;
  }
  if (!commentText.value.trim()) {
    alert("অনুগ্রহ করে আপনার মূল্যবান মতামত লিখুন।");
    return;
  }

  const newReview = {
    name: currentUser.name,
    verified: true,
    photo: currentUser.photo,
    rating: currentRating,
    service: serviceSelect.options[serviceSelect.selectedIndex].text,
    comment: commentText.value.trim(),
    image: null,
    status: "approved",
    replies: []
  };

  const success = await saveReview(newReview);
  if (success) {
    // Reset Form
    serviceSelect.value = "";
    commentText.value = "";
    currentRating = 5;
    updateStarsUI(document.querySelector('#form-google-submit .form-rating-stars'), 5);

    showSuccessModal();
  }
};

const submitGuestReview = async () => {
  const guestName = document.getElementById('guest-name');
  const serviceSelect = document.getElementById('guest-service');
  const commentText = document.getElementById('guest-comment');

  if (!guestName.value.trim()) {
    alert("অনুগ্রহ করে আপনার নাম লিখুন।");
    return;
  }
  if (!serviceSelect.value) {
    alert("অনুগ্রহ করে একটি পরিষেবা নির্বাচন করুন।");
    return;
  }
  if (!commentText.value.trim()) {
    alert("অনুগ্রহ করে আপনার মতামত লিখুন।");
    return;
  }

  const newReview = {
    name: guestName.value.trim(),
    mobile_number: null,
    verified: false,
    photo: null,
    rating: currentRating,
    service: serviceSelect.options[serviceSelect.selectedIndex].text,
    comment: commentText.value.trim(),
    image: guestUploadedImage,
    status: "approved",
    replies: []
  };

  const success = await saveReview(newReview);
  if (success) {
    // Reset Form
    guestName.value = "";
    serviceSelect.value = "";
    commentText.value = "";
    guestUploadedImage = null;
    document.getElementById('guest-image').value = '';
    document.getElementById('guest-image-preview').classList.add('hidden');
    currentRating = 5;
    updateStarsUI(document.querySelector('#form-guest-submit .form-rating-stars'), 5);

    showSuccessModal();
  }
};

const saveReview = async (review) => {
  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('reviews')
        .insert([
          {
            name: review.name,
            mobile_number: review.mobile_number || null,
            photo: review.photo,
            service: review.service,
            rating: review.rating,
            comment: review.comment,
            image: review.image,
            verified: review.verified,
            helpful: 0,
            status: review.status,
            replies: review.replies
          }
        ]);
      if (error) throw error;
      console.log("Review submitted to Supabase successfully.");
      loadAndRenderReviews();
      return true;
    } catch (e) {
      console.error("Supabase write failed: ", e);
      alert("রিভিউ জমা দিতে সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।");
      return false;
    }
  } else {
    alert("Supabase সংযোগ পাওয়া যায়নি।");
    return false;
  }
};

const showSuccessModal = () => {
  const successModal = document.getElementById('submission-success-modal');
  if (successModal) {
    successModal.classList.remove('hidden');
    successModal.classList.add('flex');
    
    const btnClose = document.getElementById('success-modal-close');
    if (btnClose) {
      btnClose.onclick = () => {
        successModal.classList.add('hidden');
        successModal.classList.remove('flex');
      };
    }
  }
};

// 7. DATA RETRIEVAL & RENDERING ENGINE
const loadAndRenderReviews = async () => {
  if (supabaseClient) {
    try {
      // Query approved reviews only (status is 'approved')
      const { data, error } = await supabaseClient
        .from('reviews')
        .select('*')
        .eq('status', 'approved')
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      
      reviewsData = data.map(item => ({
        id: item.id,
        name: item.name,
        photo: item.photo,
        service: item.service,
        rating: item.rating,
        comment: item.comment,
        image: item.image,
        verified: item.verified,
        helpful: item.helpful,
        status: item.status,
        date: item.created_at,
        replies: typeof item.replies === 'string' ? JSON.parse(item.replies) : (item.replies || [])
      }));
      
      renderReviewsGrid();
      renderMetrics();
      return;
    } catch (e) {
      console.warn("Supabase fetch failed: ", e);
    }
  }
  
  reviewsData = [];
  renderReviewsGrid();
  renderMetrics();
};

const renderMetrics = () => {
  const totalCount = reviewsData.length;
  
  const avgRatingEl = document.getElementById('avg-rating-value');
  const avgRatingTextEl = document.getElementById('avg-rating-text');
  const totalReviewsCountEl = document.getElementById('total-reviews-count');

  if (totalCount === 0) {
    if (avgRatingEl) avgRatingEl.textContent = '0.0';
    if (avgRatingTextEl) avgRatingTextEl.textContent = 'স্টার (০টি মতামত)';
    if (totalReviewsCountEl) totalReviewsCountEl.textContent = 'মোট রিভিউ: ০ টি';
    renderDistributionBars([0, 0, 0, 0, 0], 0);
    return;
  }

  const totalStars = reviewsData.reduce((sum, item) => sum + item.rating, 0);
  const avg = (totalStars / totalCount).toFixed(1);

  if (avgRatingEl) avgRatingEl.textContent = avg;
  if (avgRatingTextEl) avgRatingTextEl.textContent = `⭐ ${avg}/৫`;
  if (totalReviewsCountEl) totalReviewsCountEl.textContent = `মোট রিভিউ: ${totalCount} টি`;

  const distCounts = [0, 0, 0, 0, 0];
  reviewsData.forEach(item => {
    const star = Math.round(item.rating);
    if (star >= 1 && star <= 5) {
      distCounts[5 - star]++;
    }
  });

  renderDistributionBars(distCounts, totalCount);
};

const renderDistributionBars = (counts, total) => {
  for (let i = 1; i <= 5; i++) {
    const count = counts[5 - i];
    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
    
    const barFill = document.getElementById(`bar-fill-${i}`);
    const barPct = document.getElementById(`bar-pct-${i}`);
    
    if (barFill) barFill.style.width = `${percentage}%`;
    if (barPct) barPct.textContent = `${percentage}%`;
  }
};

const renderReviewsGrid = () => {
  const gridContainer = document.getElementById('reviews-cards-grid');
  if (!gridContainer) return;

  if (reviewsData.length === 0) {
    gridContainer.innerHTML = `
      <div class="col-span-full text-center py-12 text-on-surface-variant font-body-md">
        <span class="material-symbols-outlined text-4xl mb-2 text-gold-400">rate_review</span>
        <p>এখনো কোনো রিভিউ নেই। প্রথম রিভিউ দিতে উপরে ফর্মটি ব্যবহার করুন।</p>
      </div>
    `;
    return;
  }

  // Sorting
  const sortOption = document.getElementById('reviews-sort') ? document.getElementById('reviews-sort').value : 'newest';
  
  // Clone to avoid mutation of state
  const reviewsToSort = [...reviewsData];
  
  reviewsToSort.sort((a, b) => {
    if (sortOption === 'highest') {
      return b.rating - a.rating;
    } else if (sortOption === 'helpful') {
      return (b.helpful || 0) - (a.helpful || 0);
    } else {
      return new Date(b.date) - new Date(a.date);
    }
  });

  let html = '';
  reviewsToSort.forEach(review => {
    let starsHtml = '';
    for (let s = 1; s <= 5; s++) {
      if (s <= review.rating) {
        starsHtml += `<span class="material-symbols-outlined text-gold-400 text-sm" style="font-variation-settings: 'FILL' 1;">star</span>`;
      } else {
        starsHtml += `<span class="material-symbols-outlined text-white/20 text-sm">star_rate</span>`;
      }
    }

    const badgeHtml = review.verified 
      ? `<span class="inline-flex items-center gap-1 bg-green-500/10 text-green-400 border border-green-500/20 text-[10px] font-label-md px-2 py-0.5 rounded-full"><span class="material-symbols-outlined text-xs">verified</span>✔ Verified Customer</span>`
      : `<span class="inline-flex items-center gap-1 bg-white/5 text-white/50 border border-white/10 text-[10px] font-label-md px-2 py-0.5 rounded-full"><span class="material-symbols-outlined text-xs">person</span>Guest Customer</span>`;

    const userPhotoSrc = review.photo || "https://lh3.googleusercontent.com/a/default-user=s120";
    const userPhoto = review.verified
      ? `<img src="${userPhotoSrc}" alt="${review.name}" class="w-10 h-10 rounded-full border border-gold-400/20 shadow-md">`
      : `<div class="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-gold-400 border border-white/5"><span class="material-symbols-outlined text-xl">account_circle</span></div>`;

    const reviewImage = review.image
      ? `<div class="mt-4 max-w-xs rounded-lg overflow-hidden border border-white/10 shadow-sm hover:scale-[1.01] transition-transform duration-300">
          <img src="${review.image}" alt="Review Upload" class="w-full object-cover max-h-48 cursor-pointer" onclick="window.open('${review.image}')">
         </div>`
      : '';

    const formattedDate = new Date(review.date).toLocaleDateString('bn-BD', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let repliesHtml = '';
    if (review.replies && review.replies.length > 0) {
      review.replies.forEach(reply => {
        repliesHtml += `
          <div class="mt-4 bg-gold-400/5 border-l-2 border-gold-400 p-4 rounded-r-lg space-y-1 text-left">
            <p class="font-label-md text-gold-400 text-xs uppercase tracking-wider flex items-center gap-1 justify-start">
              <span class="material-symbols-outlined text-sm" style="font-variation-settings: 'FILL' 1;">stars</span> দেবব্রত মান্না (মালিক)
            </p>
            <p class="text-sm text-on-surface-variant leading-relaxed font-body-md">${reply}</p>
          </div>
        `;
      });
    }

    html += `
      <div class="glass-panel p-6 rounded-2xl border border-gold-400/10 hover:border-gold-400/20 transition-all duration-300 flex flex-col gap-4 relative ambient-glow text-left">
        <div class="flex items-center justify-between gap-4">
          <div class="flex items-center gap-3">
            ${userPhoto}
            <div>
              <div class="flex items-center gap-2 flex-wrap justify-start">
                <h4 class="font-headline-sm text-base text-on-surface font-semibold">${review.name}</h4>
                ${badgeHtml}
              </div>
              <p class="text-xs text-on-surface-variant font-body-md mt-0.5 text-left">${formattedDate}</p>
            </div>
          </div>
          <div class="flex flex-col items-end gap-1">
            <div class="flex">${starsHtml}</div>
            <span class="bg-white/5 border border-white/10 text-on-surface text-[10px] px-2 py-0.5 rounded-sm font-label-md">${review.service}</span>
          </div>
        </div>

        <p class="text-on-surface-variant font-body-md text-sm leading-relaxed mt-2 italic text-left">"${review.comment}"</p>
        
        ${reviewImage}
        
        ${repliesHtml}

        <div class="flex items-center justify-between border-t border-white/5 pt-4 mt-auto">
          <button onclick="voteHelpful('${review.id}')" id="btn-helpful-${review.id}" class="text-xs text-on-surface-variant hover:text-gold-400 transition-colors flex items-center gap-1.5 font-label-md">
            <span class="material-symbols-outlined text-sm">thumb_up</span> এই মতামতটি সহায়ক (${review.helpful || 0})
          </button>
        </div>
      </div>
    `;
  });

  gridContainer.innerHTML = html;
};

// 8. HELPFULNESS UPVOTE LOGIC
window.voteHelpful = async (id) => {
  const votedKeys = JSON.parse(localStorage.getItem('voted_reviews')) || [];
  if (votedKeys.includes(id)) {
    showToast("আপনি ইতিমধ্যে এটি ভোট দিয়েছেন।");
    return;
  }

  const reviewItem = reviewsData.find(r => r.id === id);
  if (!reviewItem) return;

  const newHelpfulCount = (reviewItem.helpful || 0) + 1;

  if (supabaseClient) {
    try {
      const { error } = await supabaseClient
        .from('reviews')
        .update({ helpful: newHelpfulCount })
        .eq('id', id);
      
      if (error) throw error;
      votedKeys.push(id);
      localStorage.setItem('voted_reviews', JSON.stringify(votedKeys));
      loadAndRenderReviews();
      showToast("ভোট যোগ করা হয়েছে!");
    } catch (e) {
      console.error("Upvote Supabase error:", e);
    }
  }
};

// Helper: Toast Notifications
const showToast = (message) => {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-24 left-1/2 transform -translate-x-1/2 z-50 bg-surface-container-high border border-gold-400/20 px-6 py-3 rounded-full text-on-surface font-body-md text-sm shadow-xl text-center flex items-center gap-2 animate-fade-in';
  toast.innerHTML = `<span class="material-symbols-outlined text-gold-400 text-sm">info</span> ${message}`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 500);
  }, 3000);
};
