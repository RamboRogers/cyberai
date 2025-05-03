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

        // Cyberpunk theme colors
        'cyberpunk-green': 'var(--accent-color, #00ff66)',
        'cyberpunk-secondary': 'var(--secondary-color, #00cc66)',
        'cyberpunk-tertiary': 'var(--tertiary-color, #007744)',

        // Keep original custom colors if needed, or remove if redundant
        // 'cyberpunk-green': '#00ff00',
        // 'dark-gray': '#121212',
      },
      // Optional: Map fonts and radius if you want Tailwind classes for them
      fontFamily: {
          mono: ['var(--font-mono)', 'monospace'], // Use the variable defined in admin.css
          sans: [ // Add Tailwind's default sans-serif stack
            'ui-sans-serif', 
            'system-ui', 
            '-apple-system', 
            'BlinkMacSystemFont', 
            '"Segoe UI"', 
            'Roboto', 
            '"Helvetica Neue"', 
            'Arial', 
            '"Noto Sans"', 
            'sans-serif', 
            '"Apple Color Emoji"', 
            '"Segoe UI Emoji"', 
            '"Segoe UI Symbol"', 
            '"Noto Color Emoji"'
          ],
      },
      borderRadius: {
          DEFAULT: 'var(--radius-radius)', // Example
          // Add other radius sizes if needed
      },
      boxShadow: {
        'cyberpunk': '0 0 5px rgba(0, 255, 102, 0.3)',
        'cyberpunk-hover': '0 0 10px rgba(0, 255, 102, 0.5)',
      },
    },
  },
  plugins: [
    function({ addBase, addComponents, theme }) {
      // Base link styles
      addBase({
        'a': { 
          'color': 'var(--accent-color, #00ff66)',
          'text-decoration': 'underline',
          'transition': 'color 0.2s, text-decoration 0.2s, box-shadow 0.2s',
        },
        'a:hover': {
          'color': 'var(--secondary-color, #00cc66)',
        },
        'a:focus': {
          'outline': '2px solid var(--accent-color)',
          'outline-offset': '2px',
          'box-shadow': '0 0 0 2px var(--bg-color), 0 0 0 4px var(--accent-color)',
          'border-radius': '2px',
        },
        // Ensure pre and code blocks use the monospace font
        'pre, code, kbd, samp': {
          'font-family': theme('fontFamily.mono'),
        },
        'pre': {
          'overflow-x': 'auto', // Ensure pre blocks can scroll horizontally
          'padding': theme('padding.4'), // Add some padding
          'background-color': 'var(--color-surface-alt)', // Use alt surface for contrast
          'border-radius': theme('borderRadius.DEFAULT'), // Use default border radius
          'border': '1px solid var(--color-outline)', // Add subtle border
        }
      });
      
      // Component classes for our different link styles
      addComponents({
        '.link-default': {
          'color': 'var(--accent-color, #00ff66)',
          'text-decoration': 'underline',
          '&:hover': {
            'color': 'var(--secondary-color, #00cc66)',
          }
        },
        '.link-button': {
          'display': 'inline-flex',
          'align-items': 'center',
          'justify-content': 'center',
          'padding': '0.5rem 1rem',
          'background-color': 'var(--tertiary-color, #007744)',
          'color': 'var(--text-color, #ffffff)',
          'text-decoration': 'none',
          'border-radius': '3px',
          'font-weight': 'bold',
          'box-shadow': '0 0 5px rgba(0, 255, 102, 0.3)',
          '&:hover': {
            'background-color': 'var(--secondary-color, #00cc66)',
            'color': 'var(--bg-color, #0f0f0f)',
            'box-shadow': '0 0 10px rgba(0, 255, 102, 0.5)',
          }
        },
        '.link-subtle': {
          'text-decoration': 'none',
          'background-image': 'linear-gradient(var(--accent-color, #00ff66), var(--accent-color, #00ff66))',
          'background-position': '0% 100%',
          'background-repeat': 'no-repeat',
          'background-size': '0% 2px',
          'transition': 'background-size 0.3s, color 0.2s',
          'padding-bottom': '2px',
          '&:hover': {
            'text-decoration': 'none',
            'background-size': '100% 2px',
          }
        },
        '.link-icon': {
          'display': 'inline-flex',
          'align-items': 'center',
          'gap': '0.25rem',
          'svg': {
            'width': '1em',
            'height': '1em',
            'transition': 'transform 0.2s',
          },
          '&:hover svg': {
            'transform': 'translateX(2px)',
          }
        },
        '.chat-link': {
          'display': 'flex',
          'align-items': 'center',
          'width': '100%',
          'text-decoration': 'none',
          'border-radius': 'var(--radius-radius, 0.375rem)',
          'padding': '0.5rem 0.75rem',
          'transition': 'all 0.2s ease-in-out',
          'color': 'var(--color-on-surface, #ffffff)',
          'font-weight': '500',
          'gap': '0.5rem',
          '&:hover': {
            'background-color': 'var(--color-surface-alt, #1f2937)',
            'color': 'var(--color-primary, #00ff66)',
          },
          '&.active': {
            'background-color': 'var(--color-surface-alt, #1f2937)',
            'color': 'var(--color-primary, #00ff66)',
            'border-left': '2px solid var(--color-primary, #00ff66)',
          }
        },
        '.chat-badge': {
          'display': 'flex',
          'align-items': 'center',
          'gap': '0.5rem',
          'width': '100%',
          'text-decoration': 'none',
          'border-radius': 'var(--radius-radius, 0.375rem)',
          'padding': '0.5rem 0.75rem',
          'transition': 'all 0.2s ease-in-out',
          'color': 'var(--color-on-surface, #ffffff)',
          'background-color': 'transparent',
          'font-weight': '500',
          '&:hover': {
            'background-color': 'rgba(0, 255, 102, 0.1)',
            'color': 'var(--color-primary, #00ff66)',
          },
          '&.active': {
            'background-color': 'rgba(0, 255, 102, 0.1)',
            'color': 'var(--color-primary, #00ff66)',
            'border-left': '2px solid var(--color-primary, #00ff66)',
          }
        }
      });
    }
  ],
} 