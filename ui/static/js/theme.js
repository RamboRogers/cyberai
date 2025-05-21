// ui/static/js/theme.js
document.addEventListener('DOMContentLoaded', () => {
    const themeToggleButton = document.getElementById('theme-toggle-button');
    const themeToggleText = document.getElementById('theme-toggle-text');
    const lightIcon = document.getElementById('theme-icon-light');
    const darkIcon = document.getElementById('theme-icon-dark');

    const THEME_HACKER = 'hacker';
    const THEME_BUSINESS = 'business-dark';
    const LOCAL_STORAGE_KEY = 'themePreference';

    let currentTheme = localStorage.getItem(LOCAL_STORAGE_KEY) || THEME_HACKER;

    function applyTheme(theme) {
        document.documentElement.dataset.theme = theme;
        currentTheme = theme;
        localStorage.setItem(LOCAL_STORAGE_KEY, theme);
        updateButtonAppearance(theme);
    }

    function updateButtonAppearance(theme) {
        if (!themeToggleButton || !themeToggleText || !lightIcon || !darkIcon) {
            // Elements might not be present on all pages or before DOM is fully ready
            return;
        }
        if (theme === THEME_BUSINESS) {
            themeToggleText.textContent = 'Switch to Hacker Mode';
            lightIcon.classList.remove('hidden');
            darkIcon.classList.add('hidden');
        } else {
            themeToggleText.textContent = 'Switch to Business Mode';
            darkIcon.classList.remove('hidden');
            lightIcon.classList.add('hidden');
        }
    }

    function toggleTheme() {
        const newTheme = currentTheme === THEME_HACKER ? THEME_BUSINESS : THEME_HACKER;
        applyTheme(newTheme);
    }

    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', toggleTheme);
    }

    // Apply the initial theme when the script loads
    applyTheme(currentTheme);
});
