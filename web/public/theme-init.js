// Aplica o tema salvo antes da pintura (evita piscar). Arquivo externo por causa da CSP (script-src 'self').
try {
  var t = localStorage.getItem('theme');
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
} catch (e) { /* armazenamento indisponível */ }
