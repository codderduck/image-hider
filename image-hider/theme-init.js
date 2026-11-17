// Applies the saved popup theme before the stylesheet paints.
// Light is the default; dark is opt-in through the header toggle.
try {
  const saved = localStorage.getItem("imageHiderTheme");
  document.documentElement.dataset.theme = saved === "dark" ? "dark" : "light";
} catch (e) {
  document.documentElement.dataset.theme = "light";
}
