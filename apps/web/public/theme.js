// Puts the theme class on <html> before the first paint, so dark mode doesn't flash white while the
// app loads. next-themes does the same with an inline script, which our CSP (script-src 'self')
// blocks. Same storage key and values as next-themes (src/routes/__root.tsx).
try {
  var theme = localStorage.getItem('theme') || 'system'
  if (theme === 'system') theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.classList.add(theme)
  document.documentElement.style.colorScheme = theme
} catch (_) {}
