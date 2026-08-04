(function () {
  var sidebar = document.querySelector('.sidebar');
  var mainContent = document.querySelector('.main-content');
  var toggleBtn = document.getElementById('sidebarToggle');
  var hamburgerBtn = document.getElementById('sidebarHamburger');
  var overlay = document.getElementById('sidebarOverlay');

  if (!sidebar) return;

  // Desktop collapse
  var collapsed = localStorage.getItem('bpSidebarCollapsed') === 'true';
  if (collapsed) {
    sidebar.classList.add('collapsed');
    if (mainContent) mainContent.classList.add('collapsed');
  }

  if (toggleBtn) {
    toggleBtn.addEventListener('click', function () {
      collapsed = !collapsed;
      sidebar.classList.toggle('collapsed', collapsed);
      if (mainContent) mainContent.classList.toggle('collapsed', collapsed);
      localStorage.setItem('bpSidebarCollapsed', collapsed);
    });
  }

  // Mobile hamburger
  function openMobile() {
    sidebar.classList.add('mobile-open');
    if (overlay) overlay.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeMobile() {
    sidebar.classList.remove('mobile-open');
    if (overlay) overlay.classList.remove('visible');
    document.body.style.overflow = '';
  }

  if (hamburgerBtn) {
    hamburgerBtn.addEventListener('click', openMobile);
  }

  if (overlay) {
    overlay.addEventListener('click', closeMobile);
  }

  // Close on Escape
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMobile();
  });

  // Reset desktop collapse on small screens when resizing back to desktop
  window.addEventListener('resize', function () {
    if (window.innerWidth > 768) {
      closeMobile();
    }
  });
})();
