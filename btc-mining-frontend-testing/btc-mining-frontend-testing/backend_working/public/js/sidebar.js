(function () {
  var sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Inject hamburger button into header if not already present
  var header = document.querySelector('.header');
  if (header && !document.getElementById('sidebar-toggle')) {
    var btn = document.createElement('button');
    btn.id = 'sidebar-toggle';
    btn.setAttribute('aria-label', 'Toggle sidebar');
    btn.innerHTML = '<i class="fas fa-bars"></i>';
    btn.style.cssText = 'background:none;border:none;color:#54BAF2;font-size:20px;cursor:pointer;padding:4px 8px;display:none;';
    header.querySelector('.header-left').prepend(btn);

    // Show only on mobile
    var style = document.createElement('style');
    style.textContent = '@media(max-width:768px){#sidebar-toggle{display:inline-flex !important;align-items:center;}}';
    document.head.appendChild(style);

    btn.addEventListener('click', function () {
      sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('active');
    });
  }

  // Inject backdrop overlay
  var overlay = document.createElement('div');
  overlay.id = 'sidebar-overlay';
  overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,14,46,0.6);z-index:99;backdrop-filter:blur(2px);';
  document.body.appendChild(overlay);

  var overlayStyle = document.createElement('style');
  overlayStyle.textContent = '#sidebar-overlay.active{display:block;}';
  document.head.appendChild(overlayStyle);

  overlay.addEventListener('click', function () {
    sidebar.classList.remove('open');
    overlay.classList.remove('active');
  });
})();
