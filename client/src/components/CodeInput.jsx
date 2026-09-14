import { useEffect, useRef } from 'react';

/**
 * Four single-character boxes behaving as one field: typing advances, backspace
 * retreats, and a pasted code fills every box at once.
 */
export default function CodeInput({ value, onChange, length = 4, disabled = false }) {
  const refs = useRef([]);

  useEffect(() => {
    refs.current[0]?.focus();
  }, []);

  const setDigit = (index, digit) => {
    const next = value.split('');
    next[index] = digit;
    onChange(next.join('').slice(0, length));
    if (digit && index < length - 1) refs.current[index + 1]?.focus();
  };

  const onKeyDown = (index) => (event) => {
    if (event.key === 'Backspace' && !value[index] && index > 0) refs.current[index - 1]?.focus();
    if (event.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (event.key === 'ArrowRight' && index < length - 1) refs.current[index + 1]?.focus();
  };

  const onPaste = (event) => {
    const digits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!digits) return;
    event.preventDefault();
    onChange(digits);
    refs.current[Math.min(digits.length, length - 1)]?.focus();
  };

  return (
    <div className="code-input" onPaste={onPaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          value={value[i] || ''}
          onChange={(e) => setDigit(i, e.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={onKeyDown(i)}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${i + 1} of ${length}`}
        />
      ))}
    </div>
  );
}
