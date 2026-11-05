/** A phone follows its own light or dark setting (the wall follows the household's night window). */
export function startPhoneTheme(): void {
  const dark = window.matchMedia('(prefers-color-scheme: dark)');
  const param = new URLSearchParams(location.search).get('theme');
  const apply = () => {
    document.documentElement.dataset.theme = param === 'dark' || param === 'light' ? param : dark.matches ? 'dark' : 'light';
  };
  apply();
  dark.addEventListener('change', apply);
}
