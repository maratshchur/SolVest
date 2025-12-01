import { type FC, useState } from 'react';
import { Card } from '../ui/Card';
import { 
    CheckCircle2, Clock, XCircle, PlayCircle, Lock, ChevronRight, 
    ThumbsUp, ThumbsDown, AlertTriangle, Timer, UserCheck
} from 'lucide-react';
import { InvestModal } from './InvestModal';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSolVest } from '../../hooks/useSolVest';
import { PublicKey } from '@solana/web3.js';

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
    const { publicKey: userKey } = useWallet();
    const { submitMilestone, vote, isSubmitting, isVoting } = useSolVest();
    
    const [isInvestModalOpen, setIsInvestModalOpen] = useState(false);

    // Данные кампании
    const raisedAmount = account.raisedAmount ? account.raisedAmount.toNumber() / 1_000_000 : 0;
    const totalGoal = account.totalGoal ? account.totalGoal.toNumber() / 1_000_000 : 0;
    const milestones = account.milestones;
    const currentMilestoneIdx = account.milestoneIdx; 
    const currentMilestone = milestones[currentMilestoneIdx];
    
    // Определение ролей и состояния
    const isCreator = userKey && account.creator.toString() === userKey.toString();
    const stateKey = Object.keys(account.state)[0].toLowerCase(); // funding, active, failed, completed
    
    // Логика текущего этапа (если проект активен)
    // Milestone State: 0 = Pending, 1 = Voting, 2 = Completed
    // В JS это приходит как объект { pending: {} }, { voting: {} } и т.д.
    const milestoneStateKey = currentMilestone ? Object.keys(currentMilestone.state)[0].toLowerCase() : null;
    const isVotingPhase = milestoneStateKey === 'voting';
    const isPendingPhase = milestoneStateKey === 'pending';

    // Проверка дедлайна (для принудительного запуска голосования)
    // current_milestone_deadline - это timestamp (unix seconds)
    const deadline = account.currentMilestoneDeadline ? account.currentMilestoneDeadline.toNumber() : 0;
    const nowSeconds = Math.floor(Date.now() / 1000);
    const isDeadlinePassed = nowSeconds > deadline;

    // Хендлеры
    const handleSubmitMilestone = async () => {
        try {
            await submitMilestone({ campaignKey: new PublicKey(publicKey) });
            alert("Голосование запущено!");
        } catch (e) {
            console.error(e);
            alert("Ошибка при запуске этапа");
        }
    };

    const handleVote = async (voteFor: boolean) => {
        try {
            await vote({ 
                campaignKey: new PublicKey(publicKey), 
                voteFor, 
                milestoneIdx: currentMilestoneIdx 
            });
            alert("Голос принят!");
        } catch (e) {
            console.error(e);
            alert("Ошибка голосования (возможно, вы уже голосовали или не являетесь инвестором)");
        }
    };

    // Рендер прогресса голосования
    const renderVotingStats = () => {
        if (!currentMilestone) return null;
        
        // Получаем голоса (с учетом децималов USDC, т.к. голоса весят по сумме вклада)
        const votesFor = currentMilestone.votesFor ? currentMilestone.votesFor.toNumber() / 1_000_000 : 0;
        const votesAgainst = currentMilestone.votesAgainst ? currentMilestone.votesAgainst.toNumber() / 1_000_000 : 0;
        const totalVotes = votesFor + votesAgainst;
        
        const percentFor = totalVotes > 0 ? (votesFor / totalVotes) * 100 : 0;
        const percentAgainst = totalVotes > 0 ? (votesAgainst / totalVotes) * 100 : 0;

        return (
            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 mt-2">
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-green-400 flex items-center gap-1"><ThumbsUp size={12}/> ЗА: {votesFor.toFixed(0)}</span>
                    <span className="text-red-400 flex items-center gap-1">ПРОТИВ: {votesAgainst.toFixed(0)} <ThumbsDown size={12}/></span>
                </div>
                <div className="flex h-2 rounded-full overflow-hidden bg-slate-800">
                    <div className="bg-green-500 transition-all duration-500" style={{ width: `${percentFor}%` }} />
                    <div className="bg-red-500 transition-all duration-500" style={{ width: `${percentAgainst}%` }} />
                </div>
                <div className="text-center text-[10px] text-slate-500 mt-1">
                    Всего голосов: {totalVotes.toFixed(0)} (Вес голоса = USDC)
                </div>
            </div>
        );
    };

    const config = getStateConfig(account.state);
    const StatusIcon = config.icon;

    // Форматирование даты
    const formatDate = (unix: number) => new Date(unix * 1000).toLocaleDateString();

    return (
        <>
            <Card className={`mb-6 border ${config.border} transition-all hover:bg-slate-950 hover:shadow-xl hover:shadow-blue-900/10`}>
                {/* --- HEADER --- */}
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
                        <div className="text-xs text-slate-500">Цель: {totalGoal.toLocaleString()} USDC</div>
                    </div>
                </div>

                {/* --- MAIN PROGRESS --- */}
                <div className="w-full bg-slate-800 h-1.5 rounded-full mb-6 overflow-hidden">
                    <div 
                        className="bg-gradient-to-r from-blue-600 to-cyan-400 h-full transition-all duration-500" 
                        style={{ width: `${Math.min((raisedAmount / totalGoal) * 100, 100)}%` }}
                    />
                </div>

                {/* --- MILESTONES & ACTIVE STAGE LOGIC --- */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <h4 className="text-sm font-medium text-slate-400">Текущий статус</h4>
                        {stateKey === 'active' && (
                            <span className="text-xs text-blue-400 font-mono">
                                Этап {currentMilestoneIdx + 1} из {milestones.length}
                            </span>
                        )}
                    </div>

                    {/* Если проект АКТИВЕН, показываем детальную панель текущего этапа */}
                    {stateKey === 'active' && currentMilestone && (
                        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 relative overflow-hidden">
                            {/* Индикатор фазы */}
                            <div className={`absolute top-0 left-0 w-1 h-full ${isVotingPhase ? 'bg-yellow-500' : 'bg-blue-500'}`} />
                            
                            <div className="pl-3">
                                <h5 className="text-white font-bold text-lg mb-1">{currentMilestone.name || `Этап ${currentMilestoneIdx + 1}`}</h5>
                                <p className="text-slate-400 text-sm mb-3">{currentMilestone.description}</p>
                                
                                <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                                    <div className="flex items-center gap-1">
                                        <Timer size={14} /> 
                                        {isVotingPhase ? 'Идет голосование' : `Дедлайн: ${formatDate(deadline)}`}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <UserCheck size={14} /> 
                                        Бюджет: {(currentMilestone.goalAmount.toNumber() / 1_000_000).toLocaleString()} USDC
                                    </div>
                                </div>

                                {/* ЛОГИКА ГОЛОСОВАНИЯ (UI) */}
                                {isVotingPhase ? (
                                    <div className="animate-in fade-in duration-300">
                                        {renderVotingStats()}
                                        
                                        <div className="flex gap-2 mt-3">
                                            <button 
                                                onClick={() => handleVote(true)}
                                                disabled={isVoting}
                                                className="flex-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/50 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2"
                                            >
                                                <ThumbsUp size={14} /> ОДОБРИТЬ
                                            </button>
                                            <button 
                                                onClick={() => handleVote(false)}
                                                disabled={isVoting}
                                                className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/50 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2"
                                            >
                                                <ThumbsDown size={14} /> ОТКЛОНИТЬ
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-center text-slate-500 mt-2">
                                            Голосование завершится {formatDate(currentMilestone.voteDeadline ? currentMilestone.voteDeadline.toNumber() : 0)}
                                        </p>
                                    </div>
                                ) : (
                                    // ЛОГИКА ВЫПОЛНЕНИЯ (PENDING)
                                    <div className="mt-3">
                                        {/* Кнопка сдачи этапа */}
                                        {(isCreator || isDeadlinePassed) && (
                                            <button
                                                onClick={handleSubmitMilestone}
                                                disabled={isSubmitting}
                                                className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition ${
                                                    isDeadlinePassed 
                                                        ? 'bg-yellow-600 hover:bg-yellow-500 text-white shadow-lg shadow-yellow-900/20' // Стиль для форс-мажора
                                                        : 'bg-blue-600 hover:bg-blue-500 text-white' // Стиль для автора
                                                }`}
                                            >
                                                {isSubmitting ? 'Обработка...' : isDeadlinePassed ? (
                                                    <><AlertTriangle size={16} /> Дедлайн прошел: Начать голосование</>
                                                ) : (
                                                    <><CheckCircle2 size={16} /> Сдать работу и начать голосование</>
                                                )}
                                            </button>
                                        )}
                                        
                                        {!isCreator && !isDeadlinePassed && (
                                            <div className="text-center text-xs text-slate-500 py-2 bg-slate-900/50 rounded">
                                                Ожидание сдачи работы автором...
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Список всех этапов (свернутый/компактный) */}
                    <div className="grid gap-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                        {milestones.map((m: any, idx: number) => {
                            const isCurrent = stateKey === 'active' && idx === currentMilestoneIdx;
                            // Пропускаем детальную отрисовку текущего, так как он выше крупно
                            if (isCurrent) return null;

                            const isDone = idx < currentMilestoneIdx || stateKey === 'completed';
                            return (
                                <div key={idx} className={`flex justify-between items-center p-2 rounded text-xs ${isDone ? 'bg-slate-900 text-slate-500' : 'bg-slate-950 text-slate-600'}`}>
                                    <span className="flex items-center gap-2">
                                        {isDone ? <CheckCircle2 size={12} className="text-blue-500"/> : <Lock size={12}/>}
                                        {m.name || `Stage ${idx + 1}`}
                                    </span>
                                    <span>{(m.goalAmount.toNumber() / 1_000_000).toLocaleString()} $</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                
                {/* --- FOOTER ACTIONS --- */}
                <div className="mt-5 pt-4 border-t border-slate-800 flex gap-3">
                    {stateKey === 'funding' && (
                         <button 
                             onClick={() => setIsInvestModalOpen(true)}
                             className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm py-2.5 rounded-lg font-medium transition shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                         >
                             Инвестировать <ChevronRight size={16} />
                         </button>
                     )}
                     {(stateKey === 'completed' || stateKey === 'failed') && (
                         <div className="w-full text-center text-sm text-slate-500 py-1">
                             Кампания {stateKey === 'completed' ? 'успешно завершена' : 'остановлена'}
                         </div>
                     )}
                </div>
            </Card>

            <InvestModal 
                isOpen={isInvestModalOpen}
                onClose={() => setIsInvestModalOpen(false)}
                campaignPublicKey={publicKey}
                campaignName={`Project ${publicKey.slice(0, 4)}...`}
            />
        </>
    );
};