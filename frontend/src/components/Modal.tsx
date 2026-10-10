import type { ReactNode } from 'react';

type Props = {
  title: string;
  subtitle: string;
  onClose: () => void;
  closeDisabled?: boolean;
  className?: string;
  children: ReactNode;
};

export function Modal({
  title,
  subtitle,
  onClose,
  closeDisabled,
  className = '',
  children,
}: Props) {
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className={`modal ${className}`} onClick={(event) => event.stopPropagation()}>
        <div className="modalHead">
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} disabled={closeDisabled}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
