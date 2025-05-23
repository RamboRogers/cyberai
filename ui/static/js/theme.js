/* ui/static/js/theme.js */

const THEME_STORAGE_KEY = 'cyberai-theme';

/**
 * Detects the user's browser theme preference and returns the corresponding theme.
 * @returns {string} - 'hacker' for dark mode, 'business' for light mode
 */
function detectBrowserTheme() {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'hacker'; // Dark mode -> hacker theme
    } else {
        return 'business'; // Light mode -> business theme
    }
}

/**
 * Gets the default theme based on browser preference or fallback.
 * @returns {string} - The default theme name
 */
function getDefaultTheme() {
    return detectBrowserTheme();
}

/**
 * Applies the selected theme to the HTML document and updates icon visibility.
 * @param {string} themeName - The name of the theme to apply ('hacker' or 'business').
 * @param {string} sunIconId - The ID of the sun icon SVG element.
 * @param {string} moonIconId - The ID of the moon icon SVG element.
 */
function applyTheme(themeName, sunIconId = 'theme-icon-sun', moonIconId = 'theme-icon-moon') {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem(THEME_STORAGE_KEY, themeName);

    const sunIcon = document.getElementById(sunIconId);
    const moonIcon = document.getElementById(moonIconId);

    if (sunIcon && moonIcon) {
        if (themeName === 'business') {
            // Business theme - show sun icon (light mode)
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        } else {
            // Hacker theme - show moon icon (dark mode)
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        }
    }

    console.log(`Theme applied: ${themeName}`);
}

/**
 * Toggles between 'hacker' and 'business' themes.
 * @param {string} sunIconId - The ID of the sun icon SVG element.
 * @param {string} moonIconId - The ID of the moon icon SVG element.
 */
function toggleTheme(sunIconId = 'theme-icon-sun', moonIconId = 'theme-icon-moon') {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'hacker' ? 'business' : 'hacker';
    applyTheme(newTheme, sunIconId, moonIconId);
}

/**
 * Loads the saved theme from localStorage or applies the browser-detected default.
 * @param {string} sunIconId - The ID of the sun icon SVG element.
 * @param {string} moonIconId - The ID of the moon icon SVG element.
 */
function loadTheme(sunIconId = 'theme-icon-sun', moonIconId = 'theme-icon-moon') {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    const themeToApply = savedTheme || getDefaultTheme();

    console.log(`Loading theme: ${themeToApply} (saved: ${savedTheme || 'none'}, browser detected: ${detectBrowserTheme()})`);
    applyTheme(themeToApply, sunIconId, moonIconId);
}

/**
 * Listen for browser theme changes and update if no manual theme is set.
 * This allows the app to respond to system theme changes in real-time.
 */
function setupBrowserThemeListener() {
    if (window.matchMedia) {
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        mediaQuery.addListener((e) => {
            // Only auto-switch if user hasn't manually set a theme
            const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
            if (!savedTheme) {
                const newTheme = e.matches ? 'hacker' : 'business';
                console.log(`Browser theme changed, auto-switching to: ${newTheme}`);
                applyTheme(newTheme);
            }
        });
    }
}

// Expose functions to global scope if not using modules, or handle imports/exports if using modules
// For simplicity in this context, they are global when this script is included.