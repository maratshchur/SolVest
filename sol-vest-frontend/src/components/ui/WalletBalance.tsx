import { useEffect, useState, useCallback } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Wallet, RefreshCw, Coins } from 'lucide-react';

// ВАЖНО: Убедитесь, что этот адрес совпадает с тем, что в useSolVest.ts
const USDC_MINT = new PublicKey("77u3giVhJjgPM9kEESGxJmRmpzvGLxeALHnMMtsaxqrT");

export const WalletBalance = () => {
    const { connection } = useConnection();
    const { publicKey } = useWallet();

    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    const fetchBalances = useCallback(async () => {
        if (!publicKey) return;
        setLoading(true);

        try {
            // 1. Получаем баланс SOL
            const sol = await connection.getBalance(publicKey);
            setSolBalance(sol / LAMPORTS_PER_SOL);

            // 2. Получаем баланс USDC
            // Сначала находим адрес токен-аккаунта (ATA) для этого пользователя и минта
            const usdcAta = getAssociatedTokenAddressSync(USDC_MINT, publicKey);
            
            try {
                const tokenBalance = await connection.getTokenAccountBalance(usdcAta);
                setUsdcBalance(tokenBalance.value.uiAmount);
            } catch (e) {
                // Если аккаунта нет, значит баланс 0 (пользователь еще не взаимодействовал с токеном)
                setUsdcBalance(0);
            }

        } catch (e) {
            console.error("Ошибка при получении баланса:", e);
        } finally {
            setLoading(false);
        }
    }, [connection, publicKey]);

    // Обновляем при подключении кошелька
    useEffect(() => {
        fetchBalances();
        
        // Опционально: авто-обновление каждые 10 секунд
        const interval = setInterval(fetchBalances, 10000);
        return () => clearInterval(interval);
    }, [fetchBalances]);

    if (!publicKey) return null;

    return (
        <div className="flex items-center gap-4 bg-slate-900/80 border border-slate-800 rounded-lg px-4 py-2 backdrop-blur-sm shadow-lg">
            {/* Баланс SOL */}
            <div className="flex items-center gap-2 border-r border-slate-700 pr-4">
                <div className="bg-purple-900/30 p-1.5 rounded-full text-purple-400">
                    <Wallet size={14} />
                </div>
                <div className="flex flex-col leading-none">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">SOL</span>
                    <span className="text-sm font-bold text-white font-mono">
                        {solBalance !== null ? solBalance.toFixed(3) : '---'}
                    </span>
                </div>
            </div>

            {/* Баланс USDC */}
            <div className="flex items-center gap-2">
                <div className="bg-green-900/30 p-1.5 rounded-full text-green-400">
                    <Coins size={14} />
                </div>
                <div className="flex flex-col leading-none">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">USDC</span>
                    <span className="text-sm font-bold text-white font-mono">
                        {usdcBalance !== null ? usdcBalance.toLocaleString() : '---'}
                    </span>
                </div>
            </div>

            {/* Кнопка обновления */}
            <button 
                onClick={fetchBalances} 
                className={`text-slate-500 hover:text-white transition-colors ${loading ? 'animate-spin' : ''}`}
                title="Обновить баланс"
            >
                <RefreshCw size={14} />
            </button>
        </div>
    );
};