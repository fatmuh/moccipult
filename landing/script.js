// ============================================
// MOCCIPULT LANDING PAGE — INTERACTIONS
// ============================================

document.addEventListener('DOMContentLoaded', () => {

  // ---- Navbar scroll shadow ----
  const navbar = document.getElementById('navbar');
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 20);
  });

  // ---- Mobile menu toggle ----
  const hamburger = document.getElementById('hamburger');
  const navLinks = document.getElementById('navLinks');
  if (hamburger && navLinks) {
    hamburger.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      const spans = hamburger.querySelectorAll('span');
      const isOpen = navLinks.classList.contains('open');
      spans[0].style.transform = isOpen ? 'rotate(45deg) translate(5px, 5px)' : '';
      spans[1].style.opacity = isOpen ? '0' : '1';
      spans[2].style.transform = isOpen ? 'rotate(-45deg) translate(5px, -5px)' : '';
    });
  }

  // ---- Scroll-triggered fade-up ----
  const observerOptions = { threshold: 0.15, rootMargin: '0px 0px -40px 0px' };
  const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry, i) => {
      if (entry.isIntersecting) {
        // Stagger children if they are grid items
        const delay = entry.target.dataset.delay || 0;
        setTimeout(() => {
          entry.target.classList.add('visible');
        }, delay);
        fadeObserver.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe all sections
  document.querySelectorAll(
    '.feature-card, .stat-card, .how-step, .testimonial-card, .pricing-card, .section-header, .cta-card, .compare-table-wrap'
  ).forEach((el, i) => {
    el.classList.add('fade-up');
    el.dataset.delay = (i % 6) * 80; // stagger within row
    fadeObserver.observe(el);
  });

  // ---- Animated counter ----
  const counters = document.querySelectorAll('.stat-number[data-target]');
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseFloat(el.dataset.target);
        const duration = 2000;
        const start = performance.now();
        
        const animate = (now) => {
          const progress = Math.min((now - start) / duration, 1);
          // Ease out cubic
          const eased = 1 - Math.pow(1 - progress, 3);
          const current = target * eased;
          
          if (target >= 1) {
            el.textContent = Math.round(current);
          } else {
            el.textContent = current.toFixed(1);
          }
          
          if (progress < 1) {
            requestAnimationFrame(animate);
          } else {
            el.textContent = target >= 1 ? Math.round(target) : target.toFixed(1);
          }
        };
        
        requestAnimationFrame(animate);
        counterObserver.unobserve(el);
      }
    });
  }, { threshold: 0.5 });

  counters.forEach(el => counterObserver.observe(el));

  // ---- Smooth scroll for anchor links ----
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Close mobile menu if open
        navLinks.classList.remove('open');
      }
    });
  });

});
