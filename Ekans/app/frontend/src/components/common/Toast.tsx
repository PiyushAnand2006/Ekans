import { useCallback, useEffect, useState } from 'react';

type ToastType = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let _listeners: Array<(toast: ToastItem) => void> = [];
let _toastId = 0;

/** Imperative toast function — call from anywhere. */
export function toast(message: string, type: ToastType = 'info') {
  _toastId++;
  const item: ToastItem = { id: _toastId, message, type };
  for (const fn of _listeners) fn(item);
}

/** Toast container component — mount once at app root. */
export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (item: ToastItem) => {
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
      }, 4000);
    };
    _listeners.push(handler);
    return () => {
      _listeners = _listeners.filter((fn) => fn !== handler);
    };
  }, []);

  return (
    <div className="toast-container">
      {items.map((item) => (
        <div key={item.id} className={`toast ${item.type}`}>
          <span className="toast-indicator">{item.type === 'success' ? '[OK]' : item.type === 'error' ? '[!]' : '[i]'}</span>
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}
