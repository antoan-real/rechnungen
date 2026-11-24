// Schach: die Lern-App ist eine eigenständige Datei (schach.html, läuft auch offline allein im Browser)
// und wird hier eingebettet. Fortschritt liegt im Browser (localStorage), Hell/Dunkel folgt der App.
export function mount(el) {
  el.innerHTML = `<iframe class="schach-frame" src="schach.html" title="Schach"></iframe>`;
}
