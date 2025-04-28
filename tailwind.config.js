/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./ui/templates/**/*.{html,js}",
    "./ui/static/**/*.{html,js}"
  ],
  theme: {
    extend: {
      colors: {
        // Map theme names to CSS variables
        surface: 'var(--color-surface)',
        'surface-alt': 'var(--color-surface-alt)',
        'on-surface': 'var(--color-on-surface)',
        'on-surface-strong': 'var(--color-on-surface-strong)',
        primary: 'var(--color-primary)',
        'on-primary': 'var(--color-on-primary)',
        secondary: 'var(--color-secondary)',
        'on-secondary': 'var(--color-on-secondary)',
        outline: 'var(--color-outline)',
        'outline-strong': 'var(--color-outline-strong)',
        info: 'var(--color-info)',
        'on-info': 'var(--color-on-info)',
        success: 'var(--color-success)',
        'on-success': 'var(--color-on-success)',
        warning: 'var(--color-warning)',
        'on-warning': 'var(--color-on-warning)',
        danger: 'var(--color-danger)',
        'on-danger': 'var(--color-on-danger)',

        // Keep original custom colors if needed, or remove if redundant
        // 'cyberpunk-green': '#00ff00',
        // 'dark-gray': '#121212',
      },
      // Optional: Map fonts and radius if you want Tailwind classes for them
      fontFamily: {
          mono: ['var(--font-mono)', 'monospace'], // Example
          // sans: ['Your Sans Font', 'sans-serif'] // Example
      },
      borderRadius: {
          DEFAULT: 'var(--radius-radius)', // Example
          // Add other radius sizes if needed
      }
    },
  },
  plugins: [],
} 