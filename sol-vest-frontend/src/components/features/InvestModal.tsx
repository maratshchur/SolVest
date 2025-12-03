import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useSolVest } from '../../hooks/useSolVest';
import { Card } from '../ui/Card';
import { X, DollarSign, Loader2, Wallet } from 'lucide-react';
import { Button } from '../ui/Button';

interface InvestModalProps {
    isOpen: boolean;
    onClose: () => void;
    campaignPublicKey: string;
    campaignName?: string;
}

export const InvestModal = ({ isOpen, onClose, campaignPublicKey, campaignName }: InvestModalProps) => {
    const { invest, isInvesting } = useSolVest();
    const [amount, setAmount] = useState('');

    if (!isOpen) return null;

    const handleInvest = async () => {
        if (!amount || Number(amount) <= 0) return;
        try {
            await invest({
                campaignKey: new PublicKey(campaignPublicKey),
                amount: Number(amount)
            });
            setAmount('');
            onClose();
            alert(`Успешно инвестировано ${amount} USDC!`);
        } catch (e) {
            console.error(e);
            alert("Ошибка инвестирования. Проверьте баланс USDC и SOL.");
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <Card className="w-full max-w-md bg-slate-900 border-slate-800 shadow-2xl relative">
                <button 
                    onClick={onClose}
                    className="absolute right-4 top-4 text-slate-500 hover:text-white transition"
                >
                    <X size={20} />
                </button>

                <div className="mb-6">
                    <div className="flex items-center gap-2 mb-2 text-blue-400">
                        <Wallet size={24} />
                        <h3 className="text-xl font-bold">Инвестиция</h3>
                    </div>
                    <p className="text-sm text-slate-400">
                        Проект: <span className="text-white font-medium">{campaignName || campaignPublicKey.slice(0, 8) + '...'}</span>
                    </p>
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="text-sm font-medium text-slate-300 mb-2 block">Сумма вложений (USDC)</label>
                        <div className="relative group">
                            <DollarSign className="absolute left-3 top-3 text-slate-500 group-focus-within:text-green-400 transition" size={18} />
                            <input 
                                type="number"
                                autoFocus
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all text-lg font-mono"
                                placeholder="100"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                        </div>
                        <p className="text-xs text-slate-500 mt-2">
                            * С вашего баланса также спишется небольшая комиссия в SOL (rent) за создание счета инвестора.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button 
                            onClick={onClose}
                            className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 transition font-medium"
                        >
                            Отмена
                        </button>
                        <Button 
                            onClick={handleInvest}
                            disabled={isInvesting || !amount}
                            className="flex-1 bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-green-900/20"
                        >
                            {isInvesting ? (
                                <div className="flex items-center gap-2 justify-center">
                                    <Loader2 className="animate-spin" /> Обработка...
                                </div>
                            ) : 'Подтвердить'}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};