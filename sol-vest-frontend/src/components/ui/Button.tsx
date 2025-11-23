import { type ButtonHTMLAttributes, type FC } from 'react';
import { clsx } from 'clsx';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'outline';
}

export const Button: FC<ButtonProps> = ({ className, variant = 'primary', ...props }) => {
    return (
        <button
            className={clsx(
                "px-4 py-2 rounded-lg font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed",
                variant === 'primary' 
                    ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20" 
                    : "border border-slate-700 hover:bg-slate-800 text-slate-300",
                className
            )}
            {...props}
        />
    );
};
