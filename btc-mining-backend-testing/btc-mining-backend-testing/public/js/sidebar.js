(function () {
  var sidebar   = document.getElementById('mainSidebar');
  var content   = document.getElementById('mainContent');
  var toggle    = document.getElementById('sidebarToggle');
  var hamburger = document.getElementById('sidebarHamburger');
  var overlay   = document.getElementById('sidebarOverlay');
  if (!sidebar) return;

  function setCollapsed(v) {
    sidebar.classList.toggle('collapsed', v);
    if (content) content.classList.toggle('collapsed', v);
    try { localStorage.setItem('sidebarCollapsed', v ? '1' : '0'); } catch(e){}
  }

  var saved = '';
  try { saved = localStorage.getItem('sidebarCollapsed'); } catch(e){}
  if (saved === '1') setCollapsed(true);

  if (toggle) toggle.addEventListener('click', function () {
    setCollapsed(!sidebar.classList.contains('collapsed'));
  });

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

  if (hamburger) hamburger.addEventListener('click', openMobile);
  if (overlay)   overlay.addEventListener('click', closeMobile);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeMobile();
  });

  window.addEventListener('resize', function() {
    if (window.innerWidth > 768) closeMobile();
  });

  // Close action menus on outside click
  document.addEventListener('click', function (e) {
    document.querySelectorAll('.action-menu-dropdown.open').forEach(function (menu) {
      if (!menu.closest('.action-menu-wrapper').contains(e.target)) {
        menu.classList.remove('open');
      }
    });
  });
})();

function toggleActionMenu(btn) {
  var wrapper = btn.closest('.action-menu-wrapper');
  var menu = wrapper.querySelector('.action-menu-dropdown');
  var isOpen = menu.classList.contains('open');
  document.querySelectorAll('.action-menu-dropdown.open').forEach(function(m){ m.classList.remove('open'); });
  if (!isOpen) menu.classList.add('open');
}
