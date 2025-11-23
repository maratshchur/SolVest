import { type FC, type ReactNode } from 'react';

export const Card: FC<{ children: ReactNode; className?: string }> = ({ children, className }) => (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl ${className}`}>
        {children}
    </div>
);