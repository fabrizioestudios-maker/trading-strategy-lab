// NEXUS · adaptador del sitio web: fuera de claude.ai, las descargas (CSV, capturas) usan un enlace normal.
// No ofrece almacenamiento en la nube ni Claude: esas capacidades devuelven null y el reproductor usa el navegador.
(function () {
  'use strict';
  if (window.claude) return;
  const descargas = {
    async save({ filename, data }) {
      const blob = data instanceof Blob ? data : new Blob([data], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename || 'archivo';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    },
  };
  window.claude = { use: async (nombre) => (nombre === 'downloads' ? descargas : null) };
})();
