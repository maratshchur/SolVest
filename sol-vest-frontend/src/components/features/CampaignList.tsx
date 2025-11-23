import { useSolVest } from '../../hooks/useSolVest';
import { Card } from '../ui/Card';
import { Target, Activity } from 'lucide-react';

export const CampaignList = () => {
    const { campaigns, isLoading } = useSolVest();

    if (isLoading) return <div className="text-center text-slate-500 animate-pulse">Загрузка проектов...</div>;

    if (campaigns.length === 0) return <div className="text-center text-slate-500">Пока нет активных проектов</div>;

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {campaigns.map((c) => {
                const data = c.account;
                const raised = data.raisedAmount.toNumber() / 1_000_000;
                const goal = data.totalGoal.toNumber() / 1_000_000;
                const progress = Math.min((raised / goal) * 100, 100);
                const status = Object.keys(data.state)[0];

                return (
                    <Card key={c.publicKey.toString()} className="hover:border-blue-500/50 transition-colors">
                        <div className="flex justify-between items-start mb-4">
                            <span className="text-xs font-mono text-slate-500 bg-slate-950 px-2 py-1 rounded">
                                {c.publicKey.toString().slice(0, 8)}...
                            </span>
                            <span className={`text-xs font-bold px-2 py-1 rounded uppercase ${
                                status === 'active' ? 'bg-green-900/30 text-green-400' : 'bg-yellow-900/30 text-yellow-400'
                            }`}>
                                {status}
                            </span>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-1 text-slate-400">
                                    <span>Собрано</span>
                                    <span>{progress.toFixed(1)}%</span>
                                </div>
                                <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-blue-500 rounded-full transition-all duration-1000" 
                                        style={{ width: `${progress}%` }}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div className="bg-slate-950 p-3 rounded-lg">
                                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                                        <Target size={14} /> Цель
                                    </div>
                                    <div className="font-semibold">{goal.toLocaleString()} USDC</div>
                                </div>
                                <div className="bg-slate-950 p-3 rounded-lg">
                                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                                        <Activity size={14} /> Этап
                                    </div>
                                    <div className="font-semibold">{data.milestoneIdx + 1} из {data.milestones.length}</div>
                                </div>
                            </div>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
};