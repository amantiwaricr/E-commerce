import { MoonIcon, SunIcon } from './icons';
import { useTheme } from '../context/ThemeContext';

/**
 * Flips the storefront between the light and the dark palette.
 *
 * It shows the theme you would switch *to*, which is what people reach for,
 * and says so out loud for anyone on a screen reader.
 */
export default function ThemeToggle({ className = '' }) {
  const { isDark, toggle } = useTheme();
  const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';

  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggle}
      aria-label={label}
      title={label}
      aria-pressed={isDark}
    >
      {isDark ? <SunIcon width={18} height={18} /> : <MoonIcon width={18} height={18} />}
    </button>
  );
}
