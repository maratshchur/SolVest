import { type FC, useState } from 'react';
import { Card } from '../ui/Card';
import { 
    CheckCircle2, Clock, XCircle, PlayCircle, Lock, ChevronRight, 
    ThumbsUp, ThumbsDown, AlertTriangle, Timer, UserCheck, 
    Link as LinkIcon, ExternalLink, Flag, Play, CheckCheck, Loader2,
    Undo2, AlertOctagon
} from 'lucide-react';
import { InvestModal } from './InvestModal';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSolVest } from '../../hooks/useSolVest';
import { PublicKey } from '@solana/web3.js';

// Хелпер для конфигурации цветов статуса
const getStateConfig = (stateObj: any) => {
    // Anchor возвращает enum как объект: { funding: {} }
    const key = stateObj ? Object.keys(stateObj)[0].toLowerCase() : 'unknown';
    
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
    const { 
        submitMilestone, 
        vote, 
        finalizeMilestone, 
        claimRefund,
        isSubmitting, 
        isVoting, 
        isFinalizing,
        isRefunding
    } = useSolVest();
    
    // Стейты UI
    const [isInvestModalOpen, setIsInvestModalOpen] = useState(false);
    const [isSubmissionMode, setIsSubmissionMode] = useState(false);
    const [evidenceLink, setEvidenceLink] = useState('');

    // --- ПАРСИНГ ДАННЫХ ИЗ БЛОКЧЕЙНА ---
    const raisedAmount = account.raisedAmount ? account.raisedAmount.toNumber() / 1_000_000 : 0;
    const totalGoal = account.totalGoal ? account.totalGoal.toNumber() / 1_000_000 : 0;
    const progressPercent = Math.min((raisedAmount / totalGoal) * 100, 100);
    
    const milestones = account.milestones;
    const currentMilestoneIdx = account.milestoneIdx; 
    const currentMilestone = milestones[currentMilestoneIdx];
    
    const isCreator = userKey && account.creator.toString() === userKey.toString();
    const stateKey = Object.keys(account.state)[0].toLowerCase();
    
    // Статус текущего этапа (Pending / Voting / Completed)
    const milestoneStateKey = currentMilestone ? Object.keys(currentMilestone.state)[0].toLowerCase() : null;
    const isVotingPhase = milestoneStateKey === 'voting';
    
    // Тайминги
    const nowSeconds = Math.floor(Date.now() / 1000);
    const workDeadline = account.currentMilestoneDeadline ? account.currentMilestoneDeadline.toNumber() : 0;
    const isWorkDeadlinePassed = nowSeconds > workDeadline;
    
    // ИСПРАВЛЕНИЕ: Логика проверки дедлайна голосования
    const voteDeadline = currentMilestone?.voteDeadline ? currentMilestone.voteDeadline.toNumber() : 0;
    // Если voteDeadline == 0, значит данные еще не обновились или дедлайн не установлен -> Считаем, что время НЕ вышло
    const isVoteDeadlinePassed = voteDeadline > 0 && nowSeconds > voteDeadline;

    // --- ХЕНДЛЕРЫ ---

    // 1. Сдача этапа
    const handleSubmitMilestone = async () => {
        if (!evidenceLink.trim()) {
            alert("Пожалуйста, укажите ссылку на отчет (GitHub, Video, Docs).");
            return;
        }
        try {
            await submitMilestone({ 
                campaignKey: new PublicKey(publicKey),
                evidence: evidenceLink 
            });
            setIsSubmissionMode(false);
            setEvidenceLink('');
            alert("Этап сдан! Голосование запущено.");
        } catch (e: any) {
            console.error(e);
            alert("Ошибка: " + e.message);
        }
    };

    // 2. Голосование
    const handleVote = async (voteFor: boolean) => {
        try {
            await vote({ 
                campaignKey: new PublicKey(publicKey), 
                voteFor, 
                milestoneIdx: currentMilestoneIdx 
            });
            alert("Ваш голос учтен!");
        } catch (e: any) {
            console.error(e);
            alert(e.message || "Ошибка голосования");
        }
    };

    // 3. Финализация
    const handleFinalize = async () => {
        try {
            await finalizeMilestone({ 
                campaignKey: new PublicKey(publicKey),
                creatorKey: account.creator 
            });
            alert("Итоги подведены! Статус обновлен.");
        } catch (e: any) {
            console.error(e);
            alert("Ошибка финализации: " + e.message);
        }
    };

    // 4. Возврат средств
    const handleRefund = async () => {
        try {
            await claimRefund({ campaignKey: new PublicKey(publicKey) });
            alert("Средства успешно возвращены на ваш кошелек!");
        } catch (e: any) {
            console.error(e);
            if (e.message && e.message.includes("Account does not exist")) {
                alert("Ошибка: У вас нет вклада в этом проекте или средства уже возвращены.");
            } else {
                alert("Ошибка возврата: " + e.message);
            }
        }
    };

    // Рендер статистики голосования
    const renderVotingStats = () => {
        if (!currentMilestone) return null;
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
                <div className="text-center text-[10px] text-slate-500 mt-1">Всего голосов: {totalVotes.toFixed(0)} (Вес = USDC)</div>
            </div>
        );
    };

    const config = getStateConfig(account.state);
    const StatusIcon = config.icon;
    const formatDate = (unix: number) => {
        if (!unix) return "Не определено";
        return new Date(unix * 1000).toLocaleDateString() + " " + new Date(unix * 1000).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    };

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
                        <h3 className="text-xl font-bold text-white tracking-tight">
                            {account.name || `Project #${publicKey.slice(0, 6)}`}
                        </h3>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-white">{raisedAmount.toLocaleString()} USDC</div>
                        <div className="text-xs text-slate-500">Цель: {totalGoal.toLocaleString()} USDC</div>
                    </div>
                </div>

                {/* --- TOTAL PROGRESS BAR --- */}
                <div className="w-full bg-slate-800 h-1.5 rounded-full mb-6 overflow-hidden">
                    <div 
                        className="bg-gradient-to-r from-blue-600 to-cyan-400 h-full transition-all duration-500" 
                        style={{ width: `${progressPercent}%` }}
                    />
                </div>

                {/* --- АКТИВНЫЙ ЭТАП (Основная логика) --- */}
                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <h4 className="text-sm font-medium text-slate-400">Текущий статус</h4>
                        {stateKey === 'active' && (
                            <span className="text-xs text-blue-400 font-mono">
                                Этап {currentMilestoneIdx + 1} из {milestones.length}
                            </span>
                        )}
                    </div>

                    {stateKey === 'active' && currentMilestone && (
                        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 relative overflow-hidden">
                            {/* Индикатор слева */}
                            <div className={`absolute top-0 left-0 w-1 h-full ${isVotingPhase ? 'bg-yellow-500' : 'bg-blue-500'}`} />
                            
                            <div className="pl-3">
                                <h5 className="text-white font-bold text-lg mb-1">{currentMilestone.name || `Этап ${currentMilestoneIdx + 1}`}</h5>
                                <p className="text-slate-400 text-sm mb-3">{currentMilestone.description}</p>
                                
                                <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                                    <div className="flex items-center gap-1">
                                        <Timer size={14} /> 
                                        {isVotingPhase ? 'Идет голосование' : `Дедлайн: ${formatDate(workDeadline)}`}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <UserCheck size={14} /> 
                                        Бюджет: {(currentMilestone.goalAmount.toNumber() / 1_000_000).toLocaleString()} USDC
                                    </div>
                                </div>

                                {/* ССЫЛКА НА ДОКАЗАТЕЛЬСТВО (Видна всем в фазе голосования) */}
                                {isVotingPhase && currentMilestone.evidence && (
                                    <div className="mb-4 bg-slate-900/80 p-3 rounded-lg border border-slate-700/50 flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-slate-300 text-sm">
                                            <LinkIcon size={16} className="text-blue-400"/>
                                            <span className="font-medium">Отчет о выполнении:</span>
                                        </div>
                                        <a 
                                            href={currentMilestone.evidence.startsWith('http') ? currentMilestone.evidence : `https://${currentMilestone.evidence}`} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 underline underline-offset-4"
                                        >
                                            Открыть <ExternalLink size={12} />
                                        </a>
                                    </div>
                                )}

                                {/* --- ЛОГИКА ДЕЙСТВИЙ --- */}
                                
                                {/* 1. ФАЗА ГОЛОСОВАНИЯ */}
                                {isVotingPhase ? (
                                    <div className="animate-in fade-in duration-300">
                                        {renderVotingStats()}
                                        
                                        {!isVoteDeadlinePassed ? (
                                            // Если время ЕЩЕ НЕ ВЫШЛО (или равно 0) - даем возможность голосовать
                                            <div className="flex gap-2 mt-3">
                                                <button onClick={() => handleVote(true)} disabled={isVoting} className="flex-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/50 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2">
                                                    <ThumbsUp size={14} /> ОДОБРИТЬ
                                                </button>
                                                <button onClick={() => handleVote(false)} disabled={isVoting} className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/50 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-2">
                                                    <ThumbsDown size={14} /> ОТКЛОНИТЬ
                                                </button>
                                            </div>
                                        ) : (
                                            // Если время ВЫШЛО - финализируем
                                            <div className="mt-3">
                                                <div className="text-center text-xs text-yellow-500 mb-2 font-medium">
                                                    Время голосования истекло.
                                                </div>
                                                <button 
                                                    onClick={handleFinalize}
                                                    disabled={isFinalizing}
                                                    className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 shadow-lg shadow-purple-900/20"
                                                >
                                                    {isFinalizing ? <Loader2 className="animate-spin" /> : <Flag size={16} />}
                                                    {isFinalizing ? 'Подведение итогов...' : 'Подвести итоги этапа'}
                                                </button>
                                            </div>
                                        )}
                                        
                                        <p className="text-[10px] text-center text-slate-500 mt-2">
                                            {isVoteDeadlinePassed ? "Голосование закрыто" : `Голосование до ${formatDate(voteDeadline)}`}
                                        </p>
                                    </div>
                                ) : (
                                    // 2. ФАЗА РАБОТЫ (Pending)
                                    <div className="mt-3">
                                        {(isCreator || isWorkDeadlinePassed) && (
                                            <>
                                                {isSubmissionMode ? (
                                                    <div className="bg-slate-900 p-3 rounded-lg border border-slate-700 animate-in fade-in zoom-in-95 duration-200">
                                                        <label className="text-xs text-slate-400 mb-1 block">Ссылка на отчет (GitHub/YouTube/Docs):</label>
                                                        <div className="flex gap-2">
                                                            <input 
                                                                type="text"
                                                                value={evidenceLink}
                                                                onChange={(e) => setEvidenceLink(e.target.value)}
                                                                placeholder="https://..."
                                                                className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
                                                            />
                                                            <button 
                                                                onClick={handleSubmitMilestone}
                                                                disabled={isSubmitting}
                                                                className="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded text-sm font-bold"
                                                            >
                                                                {isSubmitting ? '...' : 'OK'}
                                                            </button>
                                                            <button 
                                                                onClick={() => setIsSubmissionMode(false)}
                                                                className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1.5 rounded text-sm"
                                                            >
                                                                X
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => setIsSubmissionMode(true)}
                                                        className={`w-full py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition ${
                                                            isWorkDeadlinePassed 
                                                                ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-lg shadow-orange-900/20' 
                                                                : 'bg-blue-600 hover:bg-blue-500 text-white'
                                                        }`}
                                                    >
                                                        {isWorkDeadlinePassed ? <Play size={16} /> : <CheckCheck size={16} />}
                                                        {isWorkDeadlinePassed ? 'Дедлайн прошел: Запустить голосование' : 'Сдать работу и начать голосование'}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        
                                        {!isCreator && !isWorkDeadlinePassed && (
                                            <div className="text-center text-xs text-slate-500 py-2 bg-slate-900/50 rounded flex flex-col gap-1">
                                                <span>В работе... Ожидание отчета от автора</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Список остальных этапов */}
                    <div className="grid gap-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                        {milestones.map((m: any, idx: number) => {
                            if (stateKey === 'active' && idx === currentMilestoneIdx) return null;
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
                
                {/* --- FOOTER (Funding Actions) --- */}
                <div className="mt-5 pt-4 border-t border-slate-800 flex gap-3">
                    {stateKey === 'funding' && (
                         <button 
                             onClick={() => setIsInvestModalOpen(true)} 
                             className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm py-2.5 rounded-lg font-medium transition shadow-lg shadow-blue-900/20 flex items-center justify-center gap-2"
                         >
                             Инвестировать <ChevronRight size={16} />
                         </button>
                     )}
                     
                     {stateKey === 'completed' && (
                         <div className="w-full text-center text-sm py-2 font-medium text-green-500 bg-green-900/10 rounded-lg border border-green-900/30 flex items-center justify-center gap-2">
                             <CheckCircle2 size={16} /> Кампания успешно завершена
                         </div>
                     )}

                     {/* Кнопка возврата средств при статусе Failed */}
                     {stateKey === 'failed' && (
                         <div className="w-full space-y-3">
                             <div className="text-center text-xs text-red-400 bg-red-900/10 py-2 rounded border border-red-900/30 flex items-center justify-center gap-2">
                                 <AlertOctagon size={14} /> Проект остановлен голосованием
                             </div>
                             
                             <button 
                                 onClick={handleRefund}
                                 disabled={isRefunding}
                                 className="w-full bg-slate-800 hover:bg-red-900/40 text-white border border-slate-700 hover:border-red-500/50 text-sm py-2.5 rounded-lg font-medium transition flex items-center justify-center gap-2 group"
                             >
                                 {isRefunding ? <Loader2 className="animate-spin" size={16} /> : <Undo2 size={16} className="text-slate-400 group-hover:text-red-400 transition-colors"/>}
                                 {isRefunding ? 'Возврат...' : 'Вернуть мои вложения'}
                             </button>
                         </div>
                     )}
                </div>
            </Card>

            <InvestModal 
                isOpen={isInvestModalOpen} 
                onClose={() => setIsInvestModalOpen(false)} 
                campaignPublicKey={publicKey} 
                campaignName={account.name || `Project ${publicKey.slice(0, 4)}...`} 
            />
        </>
    );
};