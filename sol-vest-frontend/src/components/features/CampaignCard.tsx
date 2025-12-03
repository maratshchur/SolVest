import { type FC, useState, useMemo } from 'react';
import { Card } from '../ui/Card';
import { 
    CheckCircle2, Clock, XCircle, PlayCircle, Lock, ChevronRight, 
    ThumbsUp, ThumbsDown, Timer, UserCheck, Link as LinkIcon, 
    ExternalLink, Flag, Play, CheckCheck, Loader2, Undo2
} from 'lucide-react';
import { InvestModal } from './InvestModal';
import { useWallet } from '@solana/wallet-adapter-react';
import { useSolVest } from '../../hooks/useSolVest';
import { PublicKey } from '@solana/web3.js';
import { BN } from '@coral-xyz/anchor';

const getStateConfig = (stateObj: any) => {
    const key = stateObj ? Object.keys(stateObj)[0].toLowerCase() : 'unknown';
    switch (key) {
        case 'funding': return { label: 'Сбор средств', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: Clock };
        case 'active': return { label: 'В работе', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20', icon: PlayCircle };
        case 'failed': return { label: 'Неудача', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: XCircle };
        case 'completed': return { label: 'Завершен', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', icon: CheckCircle2 };
        default: return { label: 'Unknown', color: 'text-slate-400', bg: 'bg-slate-500/10', border: 'border-slate-500/20', icon: Lock };
    }
};

const formatLink = (url: string) => {
    if (!url || url === "#" || url === "No description provided") return null;
    return url.startsWith('http') ? url : `https://${url}`;
};

export const CampaignCard: FC<{ account: any, publicKey: string }> = ({ account, publicKey }) => {
    const { publicKey: userKey } = useWallet();
    const { 
        submitMilestone, vote, finalizeMilestone, claimRefund,
        isSubmitting, isVoting, isFinalizing, isRefunding
    } = useSolVest();
    
    const [isInvestModalOpen, setIsInvestModalOpen] = useState(false);
    const [isSubmissionMode, setIsSubmissionMode] = useState(false);
    const [evidenceLink, setEvidenceLink] = useState('');

    const campaignData = useMemo(() => {
        const raised = account.raisedAmount ? new BN(account.raisedAmount).toNumber() / 1_000_000 : 0;
        const goal = account.totalGoal ? new BN(account.totalGoal).toNumber() / 1_000_000 : 0;
        const idx = account.milestoneIdx; 
        const milestones = account.milestones || [];
        const currentMs = milestones[idx];

        let msState = 'unknown';
        if (currentMs && currentMs.state) {
            msState = Object.keys(currentMs.state)[0].toLowerCase();
        }

        let vDeadline = 0;
        if (currentMs && currentMs.voteDeadline) {
            vDeadline = new BN(currentMs.voteDeadline).toNumber();
        }

        const wDeadline = account.currentMilestoneDeadline ? new BN(account.currentMilestoneDeadline).toNumber() : 0;

        return {
            name: account.name,
            raised,
            goal,
            progress: Math.min((raised / goal) * 100, 100),
            milestoneIdx: idx,
            milestones,
            currentMilestone: currentMs,
            milestoneState: msState, 
            voteDeadline: vDeadline,
            workDeadline: wDeadline,
            stateKey: Object.keys(account.state)[0].toLowerCase(),
            isCreator: userKey && account.creator.toString() === userKey.toString()
        };
    }, [account, userKey]);

    const { 
        name, raised, goal, progress, milestoneIdx, milestones, 
        currentMilestone, milestoneState, voteDeadline, workDeadline, 
        stateKey, isCreator 
    } = campaignData;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const isVotingPhase = milestoneState === 'voting';
    const isVoteDeadlinePassed = voteDeadline > 0 && nowSeconds > voteDeadline;
    const isWorkDeadlinePassed = nowSeconds > workDeadline;

    const handleSubmitMilestone = async () => {
        if (!evidenceLink.trim()) return alert("Укажите ссылку на отчет");
        try {
            await submitMilestone({ campaignKey: new PublicKey(publicKey), evidence: evidenceLink });
            setIsSubmissionMode(false);
            setEvidenceLink('');
            alert("Этап сдан!");
        } catch (e: any) {
            console.error(e);
            alert("Ошибка: " + e.message);
        }
    };

    const handleVote = async (voteFor: boolean) => {
        try {
            await vote({ campaignKey: new PublicKey(publicKey), voteFor, milestoneIdx });
            alert("Голос принят!");
        } catch (e: any) {
            console.error(e);
            alert(e.message || "Ошибка голосования");
        }
    };

    const handleFinalize = async () => {
        try {
            await finalizeMilestone({ campaignKey: new PublicKey(publicKey), creatorKey: account.creator });
        } catch (e: any) {
            console.error(e);
            alert(e.message);
        }
    };

    const handleRefund = async () => {
        try {
            await claimRefund({ campaignKey: new PublicKey(publicKey) });
            alert("Средства возвращены!");
        } catch (e: any) {
            console.error(e);
            alert(e.message);
        }
    };

    const renderVotingStats = () => {
        if (!currentMilestone) return null;
        const vf = currentMilestone.votesFor ? new BN(currentMilestone.votesFor).toNumber() / 1_000_000 : 0;
        const va = currentMilestone.votesAgainst ? new BN(currentMilestone.votesAgainst).toNumber() / 1_000_000 : 0;
        const total = vf + va;
        const pf = total > 0 ? (vf / total) * 100 : 0;
        const pa = total > 0 ? (va / total) * 100 : 0;

        return (
            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-800 mt-2">
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-green-400 flex items-center gap-1"><ThumbsUp size={12}/> {vf.toFixed(0)}</span>
                    <span className="text-red-400 flex items-center gap-1">{va.toFixed(0)} <ThumbsDown size={12}/></span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-800">
                    <div className="bg-green-500 transition-all" style={{ width: `${pf}%` }} />
                    <div className="bg-red-500 transition-all" style={{ width: `${pa}%` }} />
                </div>
            </div>
        );
    };

    const config = getStateConfig(account.state);
    const StatusIcon = config.icon;
    const formatTime = (unix: number) => unix ? new Date(unix * 1000).toLocaleDateString() : "--";

    return (
        <>
            <Card className={`mb-6 border ${config.border} transition-all hover:bg-slate-950 hover:shadow-xl`}>
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${config.bg} ${config.color} mb-2`}>
                            <StatusIcon size={12} /> {config.label}
                        </div>
                        <h3 className="text-xl font-bold text-white tracking-tight">{name || `Project #${publicKey.slice(0, 6)}`}</h3>
                    </div>
                    <div className="text-right">
                        <div className="text-2xl font-bold text-white">{raised.toLocaleString()} USDC</div>
                        <div className="text-xs text-slate-500">из {goal.toLocaleString()} USDC</div>
                    </div>
                </div>

                <div className="w-full bg-slate-800 h-1.5 rounded-full mb-6 overflow-hidden">
                    <div className="bg-gradient-to-r from-blue-600 to-cyan-400 h-full transition-all" style={{ width: `${progress}%` }} />
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-end">
                        <h4 className="text-sm font-medium text-slate-400">Статус этапов</h4>
                        {stateKey === 'active' && <span className="text-xs text-blue-400 font-mono">Этап {milestoneIdx + 1} / {milestones.length}</span>}
                    </div>

                    {stateKey === 'active' && currentMilestone && (
                        <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-4 relative overflow-hidden">
                            <div className={`absolute top-0 left-0 w-1 h-full ${isVotingPhase ? 'bg-yellow-500' : 'bg-blue-500'}`} />
                            <div className="pl-3">
                                <h5 className="text-white font-bold text-lg mb-1">{currentMilestone.name || `Этап ${milestoneIdx + 1}`}</h5>
                                <div className="mb-3">
                                    {formatLink(currentMilestone.description) ? (
                                        <a 
                                            href={formatLink(currentMilestone.description)!} 
                                            target="_blank" 
                                            rel="noreferrer"
                                            className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 hover:underline transition-all bg-slate-900/50 px-3 py-2 rounded-lg border border-slate-800"
                                        >
                                            <ExternalLink size={14} /> 
                                            Открыть техническое задание (Ссылка)
                                        </a>
                                    ) : (
                                        <p className="text-slate-500 text-sm italic">Ссылка на описание не указана</p>
                                    )}
                                </div>
                                <div className="flex gap-4 text-xs text-slate-500 mb-3">
                                    <div className="flex items-center gap-1"><Timer size={14}/> {isVotingPhase ? 'Голосование' : `Дедлайн: ${formatTime(workDeadline)}`}</div>
                                    <div className="flex items-center gap-1"><UserCheck size={14}/> Бюджет: {(new BN(currentMilestone.goalAmount).toNumber()/1_000_000).toLocaleString()} $</div>
                                </div>

                                {isVotingPhase && currentMilestone.evidence && (
                                    <div className="mb-4 bg-slate-900/80 p-2 rounded border border-slate-700/50 flex justify-between items-center">
                                        <div className="flex items-center gap-2 text-slate-300 text-xs"><LinkIcon size={14}/> <span>Отчет (Proof):</span></div>
                                        <a href={currentMilestone.evidence.startsWith('http') ? currentMilestone.evidence : `https://${currentMilestone.evidence}`} target="_blank" rel="noreferrer" className="text-xs text-blue-400 hover:underline flex items-center gap-1">Открыть <ExternalLink size={10}/></a>
                                    </div>
                                )}

                                {isVotingPhase ? (
                                    <div className="animate-in fade-in">
                                        {renderVotingStats()}
                                        {!isVoteDeadlinePassed ? (
                                            <div className="flex gap-2 mt-3">
                                                <button onClick={() => handleVote(true)} disabled={isVoting} className="flex-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 border border-green-600/50 py-2 rounded text-xs font-bold flex justify-center gap-2 transition"><ThumbsUp size={14}/> ОДОБРИТЬ</button>
                                                <button onClick={() => handleVote(false)} disabled={isVoting} className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-600/50 py-2 rounded text-xs font-bold flex justify-center gap-2 transition"><ThumbsDown size={14}/> ОТКЛОНИТЬ</button>
                                            </div>
                                        ) : (
                                            <div className="mt-3">
                                                <div className="text-center text-xs text-yellow-500 mb-2">Голосование завершено</div>
                                                <button onClick={handleFinalize} disabled={isFinalizing} className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded text-sm font-bold flex justify-center gap-2 shadow-lg"><Flag size={16}/> {isFinalizing ? '...' : 'Подвести итоги'}</button>
                                            </div>
                                        )}
                                        <p className="text-[10px] text-center text-slate-500 mt-2">{isVoteDeadlinePassed ? "Время вышло" : `До ${formatTime(voteDeadline)}`}</p>
                                    </div>
                                ) : (
                                    <div className="mt-3">
                                        {(isCreator || isWorkDeadlinePassed) && (
                                            isSubmissionMode ? (
                                                <div className="bg-slate-900 p-2 rounded border border-slate-700">
                                                    <input value={evidenceLink} onChange={e => setEvidenceLink(e.target.value)} placeholder="Ссылка на отчет..." className="w-full bg-slate-950 border border-slate-700 rounded px-2 py-1 text-sm text-white mb-2" />
                                                    <div className="flex gap-2">
                                                        <button onClick={handleSubmitMilestone} disabled={isSubmitting} className="flex-1 bg-green-600 text-white py-1 rounded text-xs font-bold">ОТПРАВИТЬ</button>
                                                        <button onClick={() => setIsSubmissionMode(false)} className="px-3 bg-slate-700 text-white py-1 rounded text-xs">ОТМЕНА</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <button onClick={() => setIsSubmissionMode(true)} className={`w-full py-2 rounded text-sm font-bold flex justify-center gap-2 transition ${isWorkDeadlinePassed ? 'bg-orange-600 text-white' : 'bg-blue-600 text-white'}`}>
                                                    {isWorkDeadlinePassed ? <Play size={16}/> : <CheckCheck size={16}/>}
                                                    {isWorkDeadlinePassed ? 'Дедлайн прошел: Сдать' : 'Сдать работу'}
                                                </button>
                                            )
                                        )}
                                        {!isCreator && !isWorkDeadlinePassed && <div className="text-center text-xs text-slate-500 py-2">В работе...</div>}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="grid gap-1 max-h-32 overflow-y-auto pr-1 custom-scrollbar">
                        {milestones.map((m: any, idx: number) => {
                            if (stateKey === 'active' && idx === milestoneIdx) return null;
                            const isDone = idx < milestoneIdx || stateKey === 'completed';
                            const link = formatLink(m.description);

                            return (
                                <div key={idx} className={`flex justify-between items-center p-2 rounded text-xs ${isDone ? 'bg-slate-900 text-slate-500' : 'bg-slate-950 text-slate-600'}`}>
                                    <div className="flex items-center gap-2">
                                        {isDone ? <CheckCircle2 size={12} className="text-blue-500"/> : <Lock size={12}/>} 
                                        <span>{m.name}</span>
                                        {link && (
                                            <a href={link} target="_blank" rel="noreferrer" className="text-slate-500 hover:text-blue-400 transition" title="Открыть описание">
                                                <ExternalLink size={10} />
                                            </a>
                                        )}
                                    </div>
                                    <span>{(new BN(m.goalAmount).toNumber()/1_000_000).toLocaleString()} $</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
                <div className="mt-5 pt-4 border-t border-slate-800">
                    {stateKey === 'funding' && <button onClick={() => setIsInvestModalOpen(true)} className="w-full bg-blue-600 hover:bg-blue-500 text-white py-2 rounded font-medium flex justify-center gap-2">Инвестировать <ChevronRight size={16}/></button>}
                    {stateKey === 'failed' && <button onClick={handleRefund} disabled={isRefunding} className="w-full bg-slate-800 hover:bg-red-900/40 text-white border border-slate-700 py-2 rounded font-medium flex justify-center gap-2">{isRefunding ? <Loader2 className="animate-spin"/> : <Undo2/>} Вернуть средства</button>}
                    {stateKey === 'completed' && <div className="text-center text-green-500 text-sm flex justify-center gap-2"><CheckCircle2 size={16}/> Успешно завершен</div>}
                </div>
            </Card>
            <InvestModal isOpen={isInvestModalOpen} onClose={() => setIsInvestModalOpen(false)} campaignPublicKey={publicKey} campaignName={name} />
        </>
    );
};