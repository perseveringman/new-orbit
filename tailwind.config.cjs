/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Helvetica',
          'Arial',
          'sans-serif'
        ]
      },
      colors: {
        inspector: {
          'surface-0': 'var(--inspector-surface-0)',
          'surface-1': 'var(--inspector-surface-1)',
          'surface-2': 'var(--inspector-surface-2)',
          'surface-3': 'var(--inspector-surface-3)',
          'border-subtle': 'var(--inspector-border-subtle)',
          'border-strong': 'var(--inspector-border-strong)',
          'text-primary': 'var(--inspector-text-primary)',
          'text-secondary': 'var(--inspector-text-secondary)',
          'text-dim': 'var(--inspector-text-dim)',
          'git-added': 'var(--inspector-git-added)',
          'git-modified': 'var(--inspector-git-modified)',
          'git-deleted': 'var(--inspector-git-deleted)',
          'git-renamed': 'var(--inspector-git-renamed)',
          accent: 'var(--inspector-accent)'
        }
      }
    }
  },
  plugins: []
};
