// Se ejecuta en el <head>, antes de pintar: aplica color e imagen de fondo guardados
// para que la página aparezca ya con su fondo (sin destello).
try {
  const html = document.documentElement;
  const color = localStorage.getItem('ntp_bg');
  const img = localStorage.getItem('ntp_bgimg');
  if (color) html.style.backgroundColor = color;
  if (img) {
    html.style.backgroundImage = `url("${img}")`;
    html.classList.add('has-bg');
  }
} catch {}
