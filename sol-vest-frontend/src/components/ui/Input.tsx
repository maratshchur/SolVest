import { type InputHTMLAttributes, type FC } from 'react';

export const Input: FC<InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input
        className="w-full bg-slate-950 border border-slate-800 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-600"
        {...props}
    />
);