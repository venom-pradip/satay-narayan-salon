/**
 * Satya Narayan Salon - Scroll Animation Controller
 * Performs high-performance preloading and canvas rendering
 * for a 247-frame scroll-driven image sequence.
 */

document.addEventListener('DOMContentLoaded', () => {
  // CONFIGURATION
  const TOTAL_FRAMES = 247;
  const FRAME_DIR = 'frames';
  const FRAME_PREFIX = 'ezgif-frame-';
  const FRAME_EXTENSION = 'jpg';
  
  // SELECTIONS
  const preloader = document.getElementById('preloader');
  const progressBar = document.getElementById('progress-bar');
  const loaderPercentage = document.getElementById('loader-percentage');
  const canvas = document.getElementById('animation-canvas');
  const context = canvas.getContext('2d');
  const sequenceSection = document.getElementById('sequence-section');
  const scrollHeroOverlay = document.getElementById('scroll-hero-overlay');
  const navbar = document.getElementById('navbar');

  // ANIMATION STATE
  const images = [];
  let loadedCount = 0;
  let currentFrameIndex = 0;
  let targetFrameIndex = 0;
  let isCanvasInitialized = false;

  // UTILITY: Left pad numbers (e.g. 1 -> "001")
  const padNum = (num, size = 3) => {
    let s = num + "";
    while (s.length < size) s = "0" + s;
    return s;
  };

  // 1. PRELOAD IMAGES
  const preloadSequence = () => {
    return new Promise((resolve) => {
      for (let i = 1; i <= TOTAL_FRAMES; i++) {
        const img = new Image();
        const frameNum = padNum(i);
        img.src = `${FRAME_DIR}/${FRAME_PREFIX}${frameNum}.${FRAME_EXTENSION}`;
        
        img.onload = () => {
          handleImageLoad(resolve);
        };
        
        img.onerror = () => {
          console.warn(`Failed to load frame ${i}: ${img.src}`);
          // Count as loaded anyway to not block the loader entirely
          handleImageLoad(resolve);
        };
        
        images.push(img);
      }
    });
  };

  const handleImageLoad = (resolvePromise) => {
    loadedCount++;
    const percent = Math.min(100, Math.floor((loadedCount / TOTAL_FRAMES) * 100));
    
    // Smooth loader progress updates
    progressBar.style.width = `${percent}%`;
    loaderPercentage.textContent = `${percent}%`;
    
    if (loadedCount === TOTAL_FRAMES) {
      setTimeout(() => {
        // Hide loader
        preloader.classList.add('fade-out');
        
        // Render first frame
        initializeCanvas();
        updateCanvas(0);
        
        resolvePromise();
      }, 500);
    }
  };

  // 2. CANVAS RESIZING (Sharpen for High-DPR screens & fit to screen like "cover")
  const resizeCanvas = () => {
    if (!canvas || !images[0]) return;

    const dpr = window.devicePixelRatio || 1;
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Set display size
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    // Set buffer size backed by DPR
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    // Scale drawing context to account for DPR
    context.scale(dpr, dpr);
    
    // Redraw current frame
    if (isCanvasInitialized) {
      renderFrame(currentFrameIndex);
    }
  };

  const initializeCanvas = () => {
    isCanvasInitialized = true;
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
  };

  // 3. COVER SCALE DRAWING LOGIC (behaves like object-fit: cover)
  const renderFrame = (index) => {
    const img = images[index];
    if (!img || !img.complete) return;

    const canvasWidth = window.innerWidth;
    const canvasHeight = window.innerHeight;

    const imgWidth = img.naturalWidth || img.width;
    const imgHeight = img.naturalHeight || img.height;

    const imgRatio = imgWidth / imgHeight;
    const canvasRatio = canvasWidth / canvasHeight;

    let drawWidth, drawHeight;

    if (canvasRatio > imgRatio) {
      // Canvas is wider than image aspect ratio -> crop vertically
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgRatio;
    } else {
      // Canvas is taller than image aspect ratio -> crop horizontally
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imgRatio;
    }

    // Apply smooth 120%-130% zoom based on current frame position to hide watermarks
    const baseScale = 1.2;
    const progress = index / (TOTAL_FRAMES - 1);
    
    // First 100 frames (index 0 to 99) zoom an additional 10% (0.1), smoothly tapered between index 80 and 100 to prevent sudden jumps
    let additionalZoom = 0.0;
    if (index < 80) {
      additionalZoom = 0.1;
    } else if (index < 100) {
      additionalZoom = 0.1 * ((100 - index) / 20);
    }
    
    const scale = baseScale + (progress * 0.1) + additionalZoom;
    const drawWidthScaled = drawWidth * scale;
    const drawHeightScaled = drawHeight * scale;

    const offsetX = (canvasWidth - drawWidthScaled) / 2;
    const offsetY = (canvasHeight - drawHeightScaled) / 2;

    // Clear context and draw image
    context.clearRect(0, 0, canvasWidth, canvasHeight);
    context.drawImage(img, offsetX, offsetY, drawWidthScaled, drawHeightScaled);
  };

  // 4. SCROLL INTERPOLATION
  const handleScroll = () => {
    if (!isCanvasInitialized) return;

    const rect = sequenceSection.getBoundingClientRect();
    const sectionHeight = sequenceSection.offsetHeight;
    const viewportHeight = window.innerHeight;

    // How far we have scrolled within the animation section (0 to maxScrollable)
    const scrolledDistance = -rect.top;
    const maxScrollable = sectionHeight - viewportHeight;

    // Normalized progress: 0 when top enters viewport, 1 when bottom exits
    let scrollFraction = scrolledDistance / maxScrollable;
    scrollFraction = Math.max(0, Math.min(1, scrollFraction));

    // Convert progress to frame index (0 to TOTAL_FRAMES - 1)
    targetFrameIndex = Math.min(TOTAL_FRAMES - 1, Math.floor(scrollFraction * TOTAL_FRAMES));

    // Handle scroll hero heading fade-out (fades away immediately when scrolling starts, completed by 80px of scrolling)
    const fadeLimit = 80;
    if (scrolledDistance < fadeLimit) {
      const fadeProgress = scrolledDistance / fadeLimit;
      scrollHeroOverlay.style.opacity = 1 - fadeProgress;
      scrollHeroOverlay.style.transform = `translateY(${-fadeProgress * 50}px)`;
      scrollHeroOverlay.style.pointerEvents = 'all';
    } else {
      scrollHeroOverlay.style.opacity = 0;
      scrollHeroOverlay.style.transform = 'translateY(-50px)';
      scrollHeroOverlay.style.pointerEvents = 'none';
    }

    // Handle transparent navigation bar background transition on scroll
    if (window.scrollY > 50) {
      navbar.classList.remove('bg-background/20');
      navbar.classList.add('bg-background/85', 'shadow-lg');
    } else {
      navbar.classList.remove('bg-background/85', 'shadow-lg');
      navbar.classList.add('bg-background/20');
    }
  };

  // 5. ANIMATION LOOP (RequestAnimationFrame for smooth updates)
  const updateCanvas = () => {
    // Linear interpolation for smooth frame changes if scrolled quickly
    const frameDiff = targetFrameIndex - currentFrameIndex;
    
    if (Math.abs(frameDiff) > 0.1) {
      // Move closer to target frame (smooth lerping)
      currentFrameIndex += frameDiff * 0.4;
      const roundedFrame = Math.round(currentFrameIndex);
      
      // Clamp index safety check
      const safeFrame = Math.max(0, Math.min(TOTAL_FRAMES - 1, roundedFrame));
      renderFrame(safeFrame);
    } else {
      // Fallback direct update to match scroll position exactly
      renderFrame(targetFrameIndex);
      currentFrameIndex = targetFrameIndex;
    }

    requestAnimationFrame(updateCanvas);
  };

  // 6. APPOINTMENT BOOKING SUBMISSION TO SUPABASE
  const btnSubmitBooking = document.getElementById('btn-submit-booking');
  if (btnSubmitBooking) {
    btnSubmitBooking.addEventListener('click', async () => {
      const nameVal = document.getElementById('name').value.trim();
      const phoneVal = document.getElementById('phone').value.trim();
      const serviceSelect = document.getElementById('service');
      const serviceText = serviceSelect.options[serviceSelect.selectedIndex]?.text || '';
      const dateVal = document.getElementById('date').value;
      const timeVal = document.getElementById('time').value;
      const messageVal = document.getElementById('booking-message') ? document.getElementById('booking-message').value.trim() : '';

      if (!nameVal) {
        alert("অনুগ্রহ করে আপনার নাম লিখুন।");
        return;
      }
      if (!phoneVal) {
        alert("অনুগ্রহ করে আপনার ফোন নম্বর লিখুন।");
        return;
      }
      if (!serviceSelect.value) {
        alert("অনুগ্রহ করে একটি সেবা নির্বাচন করুন।");
        return;
      }
      if (!dateVal) {
        alert("অনুগ্রহ করে অ্যাপয়েন্টমেন্টের তারিখ নির্বাচন করুন।");
        return;
      }
      if (!timeVal) {
        alert("অনুগ্রহ করে অ্যাপয়েন্টমেন্টের সময় নির্বাচন করুন।");
        return;
      }

      const bookingData = {
        name: nameVal,
        mobile_number: phoneVal,
        service: serviceText,
        preferred_date: dateVal,
        preferred_time: timeVal,
        message: messageVal,
        status: 'Pending'
      };

      if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
          const { error } = await supabaseClient
            .from('appointments')
            .insert([bookingData]);
          
          if (error) throw error;
          
          showBookingSuccess();
        } catch (e) {
          console.error("Supabase booking save failed: ", e);
          saveBookingLocally(bookingData);
        }
      } else {
        saveBookingLocally(bookingData);
      }
    });
  }

  const saveBookingLocally = (booking) => {
    const stored = JSON.parse(localStorage.getItem('satya_local_bookings')) || [];
    stored.push(booking);
    localStorage.setItem('satya_local_bookings', JSON.stringify(stored));
    showBookingSuccess();
  };

  const showBookingSuccess = () => {
    // Clear form inputs
    document.getElementById('name').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('service').value = '';
    document.getElementById('date').value = '';
    document.getElementById('time').value = '';
    if (document.getElementById('booking-message')) {
      document.getElementById('booking-message').value = '';
    }

    // Show custom success popup
    const successModal = document.getElementById('submission-success-modal');
    if (successModal) {
      const title = successModal.querySelector('h3');
      const body = successModal.querySelector('p');
      const originalTitle = title.textContent;
      const originalBody = body.textContent;

      title.textContent = "বুকিং সফলভাবে সম্পন্ন হয়েছে!";
      body.textContent = "আপনার অ্যাপয়েন্টমেন্ট বুকিং অনুরোধটি পেন্ডিং অবস্থায় রয়েছে। অ্যাডমিন নিশ্চিত করার পর আপনার সাথে যোগাযোগ করা হবে। ধন্যবাদ!";
      
      successModal.classList.remove('hidden');
      successModal.classList.add('flex');

      const btnClose = document.getElementById('success-modal-close');
      if (btnClose) {
        btnClose.onclick = () => {
          successModal.classList.add('hidden');
          successModal.classList.remove('flex');
          title.textContent = originalTitle;
          body.textContent = originalBody;
        };
      }
    } else {
      alert("ধন্যবাদ! আপনার অ্যাপয়েন্টমেন্ট সফলভাবে বুক করা হয়েছে এবং অনুমোদনের অপেক্ষায় রয়েছে।");
    }
  };

  // 7. CONTACT FORM SUBMISSION TO SUPABASE
  const btnSubmitContact = document.getElementById('btn-submit-contact');
  if (btnSubmitContact) {
    btnSubmitContact.addEventListener('click', async () => {
      const nameVal = document.getElementById('contact-name').value.trim();
      const phoneVal = document.getElementById('contact-phone').value.trim();
      const messageVal = document.getElementById('contact-message').value.trim();

      if (!nameVal) {
        alert("অনুগ্রহ করে আপনার নাম লিখুন।");
        return;
      }
      if (!phoneVal) {
        alert("অনুগ্রহ করে আপনার ফোন নম্বর লিখুন।");
        return;
      }
      if (!messageVal) {
        alert("অনুগ্রহ করে আপনার বার্তা লিখুন।");
        return;
      }

      const contactData = {
        name: nameVal,
        phone: phoneVal,
        message: messageVal,
        status: 'unread'
      };

      if (typeof supabaseClient !== 'undefined' && supabaseClient) {
        try {
          const { error } = await supabaseClient
            .from('contacts')
            .insert([contactData]);
          
          if (error) throw error;
          
          showContactSuccess();
        } catch (e) {
          console.error("Supabase contact save failed: ", e);
          saveContactLocally(contactData);
        }
      } else {
        saveContactLocally(contactData);
      }
    });
  }

  const saveContactLocally = (contact) => {
    const stored = JSON.parse(localStorage.getItem('satya_local_contacts')) || [];
    stored.push(contact);
    localStorage.setItem('satya_local_contacts', JSON.stringify(stored));
    showContactSuccess();
  };

  const showContactSuccess = () => {
    const nameEl = document.getElementById('contact-name');
    const phoneEl = document.getElementById('contact-phone');
    const messageEl = document.getElementById('contact-message');
    if (nameEl) nameEl.value = '';
    if (phoneEl) phoneEl.value = '';
    if (messageEl) messageEl.value = '';

    const successModal = document.getElementById('submission-success-modal');
    if (successModal) {
      const title = successModal.querySelector('h3');
      const body = successModal.querySelector('p');
      const originalTitle = title.textContent;
      const originalBody = body.textContent;

      title.textContent = "বার্তা সফলভাবে পাঠানো হয়েছে!";
      body.textContent = "আপনার মূল্যবান বার্তাটি আমাদের কাছে পৌঁছেছে। আমরা শীঘ্রই আপনার সাথে যোগাযোগ করব। ধন্যবাদ!";
      
      successModal.classList.remove('hidden');
      successModal.classList.add('flex');

      const btnClose = document.getElementById('success-modal-close');
      if (btnClose) {
        btnClose.onclick = () => {
          successModal.classList.add('hidden');
          successModal.classList.remove('flex');
          title.textContent = originalTitle;
          body.textContent = originalBody;
        };
      }
    } else {
      alert("ধন্যবাদ! আপনার বার্তা সফলভাবে পাঠানো হয়েছে।");
    }
  };

  // 8. DYNAMIC GALLERY LOADER & REALTIME SYNC
  const loadAndRenderGallery = async () => {
    const galleryGrid = document.getElementById('gallery-grid');
    if (!galleryGrid) return;

    let galleryItems = [];
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from('gallery')
          .select('*')
          .order('created_at', { ascending: false });
        if (error) throw error;
        galleryItems = data || [];
      } catch (e) {
        console.warn("Failed to load gallery from Supabase: ", e);
      }
    }

    renderGalleryGrid(galleryItems);
  };

  const renderGalleryGrid = (items) => {
    const galleryGrid = document.getElementById('gallery-grid');
    if (!galleryGrid) return;

    if (items.length === 0) {
      galleryGrid.innerHTML = `
        <div class="col-span-full text-center py-12 text-on-surface-variant font-body-md bg-surface-container rounded-xl border border-white/5">
          <p>গ্যালারিতে কোনো ছবি পাওয়া যায়নি।</p>
        </div>
      `;
      return;
    }

    let html = '';
    items.forEach(item => {
      let categoryLabel = item.category;
      if (categoryLabel === 'haircut') categoryLabel = 'Haircut';
      else if (categoryLabel === 'hairstyle') categoryLabel = 'Hairstyle';
      else if (categoryLabel === 'facewash') categoryLabel = 'Face Wash';
      else if (categoryLabel === 'haircolour') categoryLabel = 'Hair Colour';

      html += `
        <div class="group relative rounded-2xl overflow-hidden border border-gold-400/20 shadow-xl aspect-square ambient-glow">
          <img src="${item.url}" alt="${item.caption || ''}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" loading="lazy">
          <div class="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent opacity-80 group-hover:opacity-90 transition-opacity duration-300"></div>
          <div class="absolute bottom-0 left-0 right-0 p-6 transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
            <span class="text-xs font-label-md text-gold-400 uppercase tracking-widest block mb-1">${categoryLabel}</span>
            <h3 class="font-headline-sm text-lg text-on-surface">${item.caption || ''}</h3>
          </div>
        </div>
      `;
    });
    galleryGrid.innerHTML = html;
  };

  const subscribeRealtimeGallery = () => {
    if (typeof supabaseClient !== 'undefined' && supabaseClient) {
      supabaseClient
        .channel('public:gallery')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery' }, payload => {
          loadAndRenderGallery();
        })
        .subscribe();
    }
  };

  // START PROMISE CHAIN
  preloadSequence().then(() => {
    // Start listening to scroll events
    window.addEventListener('scroll', handleScroll, { passive: true });
    // Trigger scroll layout immediately once
    handleScroll();
    // Run the animation rendering loop
    requestAnimationFrame(updateCanvas);

    // Load and Sync Gallery
    loadAndRenderGallery();
    subscribeRealtimeGallery();
  });
});
