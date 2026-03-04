
// Simple starter app logic

document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");

  const vesselCount = Object.keys(VDB || {}).length;

  app.innerHTML = `
    <p>Total vessels loaded: <strong>${vesselCount}</strong></p>
    <p>If this shows 0, paste your vessel database into vessels.js</p>
  `;
});
