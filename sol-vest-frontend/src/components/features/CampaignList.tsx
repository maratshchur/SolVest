import { useSolVest } from '../../hooks/useSolVest';
import { CampaignCard } from './CampaignCard'; // Убедитесь, что путь импорта верный

export const CampaignList = () => {
    const { campaigns, isLoading } = useSolVest();

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-20">
                <div className="text-slate-500 animate-pulse flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"/>
                    Загрузка проектов...
                </div>
            </div>
        );
    }

    if (!campaigns || campaigns.length === 0) {
        return (
            <div className="text-center py-20 border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
                <p className="text-slate-400">Пока нет активных проектов</p>
                <p className="text-slate-600 text-sm mt-2">Станьте первым, кто создаст кампанию!</p>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {campaigns.map((c) => (
                <CampaignCard 
                    key={c.publicKey.toString()} 
                    publicKey={c.publicKey.toString()} 
                    account={c.account} 
                />
            ))}
        </div>
    );
};