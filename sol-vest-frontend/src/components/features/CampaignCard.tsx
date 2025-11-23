import { FC } from 'react';
import { Card } from '../ui/Card';
import { CheckCircle2, Clock, XCircle, PlayCircle, Lock } from 'lucide-react';

// Хелпер для определения статуса
// В Anchor enum приходит в виде объекта: { funding: {} } или { active: {} }
const getStateConfig = (stateObj: any) => {
    const key = Object.keys(stateObj)[0].toLowerCase();
    
    switch (key) {
        case 'funding':
            return { label: 'Сбор средств', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Clock };
        case 'active':
            return { label: 'В работе', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: PlayCircle };
        case 'failed':
            return { label: 'Неудача', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: XCircle };
        case 'completed':
            return { label: 'Завершен', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: CheckCircle2 };
        default:
            return { label: 'Unknown', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', icon: Lock };
    }
};

export const CampaignCard: FC<{ account: any, publicKey: string }> = ({ account, publicKey }) => {
    // 1. ИСПРАВЛЕНИЕ: Используем правильные ключи из IDL (raisedAmount вместо currentAmount)
    const raisedAmount = account.raisedAmount ? account.raisedAmount.toNumber() / 1_000_000 : 0;
    const totalGoal = account.totalGoal ? account.totalGoal.toNumber() / 1_000_000 : 0;
    
    // 2. ИСПРАВЛЕНИЕ: Индекс этапа теперь milestoneIdx
    const currentMilestoneIdx = account.milestoneIdx; 
    
    const milestones = account.milestones;
    const progressPercent = Math.min((raisedAmount / totalGoal) * 100, 100);

    // Получаем конфиг стилей на основе стейта
    const config = getStateConfig(account.state);
    const StatusIcon = config.icon;
    const stateKey = Object.keys(account.state)[0].toLowerCase();

    return (
        <Card className={`mb-6 border ${config.border} transition-all hover:bg-slate-900/80`}>
            {/* Хедер карточки */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${config.bg} ${config.color} mb-2`}>
                        <StatusIcon size={12} />
                        {config.label}
                    </div>
                    <h3 className="text-xl font-bold text-white">Project #{publicKey.slice(0, 6)}...</h3>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold text-white">{raisedAmount.toLocaleString()} USDC</div>
                    <div className="text-sm text-slate-500">из {totalGoal.toLocaleString()} USDC</div>
                </div>
            </div>

            {/* Прогресс бар */}
            <div className="w-full bg-slate-800 h-2 rounded-full mb-6 overflow-hidden">
                <div 
                    className="bg-gradient-to-r from-blue-600 to-cyan-400 h-full transition-all duration-500" 
                    style={{ width: `${progressPercent}%` }}
                />
            </div>

            {/* Этапы (Milestones) */}
            <div className="space-y-3">
                <h4 className="text-sm font-medium text-slate-400 mb-2">Этапы выполнения</h4>
                <div className="grid gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                    {milestones.map((m: any, idx: number) => {
                        // 3. ИСПРАВЛЕНИЕ: Используем goalAmount (как в IDL)
                        const mAmount = m.goalAmount.toNumber() / 1_000_000;
                        
                        const isActive = stateKey === 'active' && idx === currentMilestoneIdx;
                        const isDone = idx < currentMilestoneIdx || stateKey === 'completed';
                        
                        let statusColor = "text-slate-500";
                        let statusIcon = <Clock size={16} />;
                        let statusText = "Ожидание";
                        
                        if (isActive) {
                            statusColor = "text-green-400";
                            statusIcon = <PlayCircle size={16} className="animate-pulse" />;
                            statusText = "В работе";
                        } else if (isDone) {
                            statusColor = "text-blue-400";
                            statusIcon = <CheckCircle2 size={16} />;
                            statusText = "Выполнен";
                        }

                        return (
                            <div key={idx} className={`flex items-center justify-between p-3 rounded bg-slate-800/50 ${isActive ? 'border border-green-500/30' : ''}`}>
                                <div className="flex items-center gap-3">
                                    <div className={statusColor}>{statusIcon}</div>
                                    <div className="overflow-hidden">
                                        <div className="text-sm text-white font-medium truncate w-32 md:w-40" title={m.name}>
                                            {m.name || `Этап ${idx + 1}`}
                                        </div>
                                        <div className="text-xs text-slate-500 truncate w-32" title={m.description}>
                                            {m.description}
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right whitespace-nowrap">
                                    <div className="text-sm font-bold text-slate-300">{mAmount} USDC</div>
                                    <div className="text-xs text-slate-500">{statusText}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            {/* Кнопки действий */}
            <div className="mt-6 pt-4 border-t border-slate-800 flex gap-3">
                 {stateKey === 'funding' && (
                     <button className="flex-1 bg-blue-600 hover:bg-blue-500 text-white py-2 rounded-lg font-medium transition shadow-lg shadow-blue-500/20">
                         Инвестировать
                     </button>
                 )}
                 {stateKey === 'active' && (
                     <button className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-medium transition">
                         Голосовать
                     </button>
                 )}
            </div>
        </Card>
    );
};