import { useState, useMemo } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSolVest } from '../../hooks/useSolVest';
import { CampaignCard } from './CampaignCard';
import { LayoutGrid, User, Loader2 } from 'lucide-react';

type FilterType = 'all' | 'my';

export const CampaignList = () => {
    const { campaigns, isLoading } = useSolVest();
    const { publicKey } = useWallet();
    const [activeTab, setActiveTab] = useState<FilterType>('all');

    const myCampaignsCount = useMemo(() => {
        if (!campaigns || !publicKey) return 0;
        return campaigns.filter(c => 
            c.account.creator.toString() === publicKey.toString()
        ).length;
    }, [campaigns, publicKey]);

    const filteredCampaigns = useMemo(() => {
        if (!campaigns) return [];

        let result = campaigns;
        if (activeTab === 'my' && publicKey) {
            result = result.filter(c => 
                c.account.creator.toString() === publicKey.toString()
            );
        }
        return [...result].reverse();
    }, [campaigns, activeTab, publicKey, ]);

    if (isLoading) {
        return (
            <div className="flex justify-center items-center py-20">
                <div className="text-slate-500 flex items-center gap-2 bg-slate-900/50 px-4 py-2 rounded-full border border-slate-800">
                    <Loader2 className="animate-spin text-blue-500" size={18} />
                    Загрузка проектов...
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-slate-950/50 p-2 rounded-xl border border-slate-800 backdrop-blur-sm">
                <div className="flex bg-slate-900 p-1 rounded-lg w-full md:w-auto">
                    <button
                        onClick={() => setActiveTab('all')}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-md text-sm font-medium transition-all ${
                            activeTab === 'all' 
                                ? 'bg-slate-800 text-white shadow-sm' 
                                : 'text-slate-400 hover:text-slate-200'
                        }`}
                    >
                        <LayoutGrid size={16} />
                        Все проекты
                        <span className="bg-slate-700 text-slate-300 text-[10px] px-1.5 py-0.5 rounded-full ml-1">
                            {campaigns.length}
                        </span>
                    </button>
                    <button
                        onClick={() => setActiveTab('my')}
                        disabled={!publicKey}
                        className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2 rounded-md text-sm font-medium transition-all ${
                            activeTab === 'my' 
                                ? 'bg-blue-600/20 text-blue-400 shadow-sm border border-blue-500/20' 
                                : 'text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                    >
                        <User size={16} />
                        Мои проекты
                        {publicKey && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ml-1 ${
                                activeTab === 'my' ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-300'
                            }`}>
                                {myCampaignsCount}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            {filteredCampaigns.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    {filteredCampaigns.map((c) => (
                        <CampaignCard 
                            key={c.publicKey.toString()} 
                            publicKey={c.publicKey.toString()} 
                            account={c.account} 
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                    <div className="bg-slate-900 inline-flex p-4 rounded-full mb-4">
                        <LayoutGrid size={32} className="text-slate-600" />
                    </div>
                    <p className="text-slate-300 font-medium text-lg">
                        {activeTab === 'my' ? 'У вас пока нет созданных проектов' : 'Проекты не найдены'}
                    </p>
                    <p className="text-slate-500 text-sm mt-2 max-w-md mx-auto">
                        {activeTab === 'my' 
                            ? 'Создайте свою первую кампанию, заполнив форму выше, и она появится здесь.' 
                            : 'Возможно, вы первый, кто запустит краудфандинг на этой платформе!'}
                    </p>
                </div>
            )}
        </div>
    );
};