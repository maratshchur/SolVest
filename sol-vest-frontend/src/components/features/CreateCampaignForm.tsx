import { useState } from 'react';
import { useSolVest } from '../../hooks/useSolVest';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { 
    PlusCircle, Trash2, Loader2, Calendar, Type, 
    Link as LinkIcon, DollarSign, Rocket, Layers, Layout
} from 'lucide-react';

export const CreateCampaignForm = () => {
    const { createCampaign, isCreating } = useSolVest();
    
    const [campaignName, setCampaignName] = useState('');
    const [milestones, setMilestones] = useState([
        { name: '', description: '', amount: '', duration: '' } 
    ]);
    const [votingDuration, setVotingDuration] = useState('');

    const totalGoal = milestones.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);

    const addMilestone = () => setMilestones([...milestones, { name: '', description: '', amount: '', duration: '' }]);
    
    const removeMilestone = (index: number) => {
        if (milestones.length > 1) setMilestones(milestones.filter((_, i) => i !== index));
    };

    const updateMilestone = (index: number, field: string, value: string) => {
        const newMilestones = [...milestones];
        // @ts-ignore
        newMilestones[index][field] = value;
        setMilestones(newMilestones);
    };

    const handleSubmit = async () => {
        if (!campaignName.trim()) {
            alert("Пожалуйста, введите название проекта");
            return;
        }

        try {
            await createCampaign({
                name: campaignName,
                goal: totalGoal,
                milestones: milestones.map(m => ({
                    name: m.name || `Stage`,
                    description: m.description || "#", 
                    amount: Number(m.amount),
                    duration: Number(m.duration) * 86400 
                })),
                fundraisingDuration: Number(votingDuration) * 86400 
            });
            
            setCampaignName('');
            setMilestones([{ name: '', description: '', amount: '', duration: '' }]);
            setVotingDuration('');
            alert("Проект успешно создан!");
        } catch (e) {
            console.error(e);
            alert("Ошибка при создании. Проверьте консоль.");
        }
    };

    return (
        <div className="max-w-4xl mx-auto">
            <Card className="border-slate-800 bg-slate-950/80 backdrop-blur-xl shadow-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-slate-900 to-slate-900/50 p-6 border-b border-slate-800 flex items-center gap-4">
                    <div className="bg-blue-600 p-3 rounded-xl shadow-lg shadow-blue-500/20">
                        <Rocket className="text-white" size={24} />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-tight">Создание проекта</h2>
                        <p className="text-slate-400 text-sm mt-1">Опишите идею, этапы финансирования и прикрепите ссылки на ТЗ</p>
                    </div>
                </div>
                <div className="p-6 space-y-8">
                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                            <Layout size={16} className="text-blue-500"/>
                            Название проекта
                        </label>
                        <div className="relative group/input">
                            <Type className="absolute left-3 top-3 text-slate-500 group-focus-within/input:text-blue-400" size={18} />
                            <input 
                                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-3 pl-10 pr-4 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all font-medium text-lg"
                                placeholder="Например: Solana DeFi Protocol" 
                                value={campaignName}
                                onChange={e => setCampaignName(e.target.value)}
                                autoFocus
                            />
                        </div>
                    </div>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                <Layers size={16} className="text-blue-500"/>
                                Дорожная карта (Milestones)
                            </label>
                            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-full border border-slate-700">
                                {milestones.length} {milestones.length === 1 ? 'этап' : 'этапа'}
                            </span>
                        </div>
                        {milestones.map((milestone, index) => (
                            <div key={index} className="relative group bg-slate-900/50 rounded-xl border border-slate-800 hover:border-slate-600 transition-all duration-300 p-5">
                                <div className="absolute -left-3 -top-3 w-8 h-8 flex items-center justify-center bg-slate-800 text-white text-sm font-bold rounded-lg border border-slate-700 shadow-md z-10">
                                    {index + 1}
                                </div>
                                {milestones.length > 1 && (
                                    <button 
                                        onClick={() => removeMilestone(index)}
                                        className="absolute -right-2 -top-2 bg-slate-800 p-1.5 rounded-full text-slate-400 hover:text-red-400 hover:bg-slate-700 border border-slate-700 transition shadow-sm opacity-0 group-hover:opacity-100"
                                        title="Удалить этап"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                )}
                                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mt-2">
                                    <div className="md:col-span-7 space-y-4">
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-slate-500 ml-1">Название этапа</label>
                                            <div className="relative group/input">
                                                <Type className="absolute left-3 top-3 text-slate-500 group-focus-within/input:text-blue-400 transition-colors" size={18} />
                                                <input 
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                                                    placeholder="Например: Разработка MVP" 
                                                    value={milestone.name}
                                                    onChange={e => updateMilestone(index, 'name', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-slate-500 ml-1">Ссылка на ТЗ / Описание (Google Docs, GitHub)</label>
                                            <div className="relative group/input">
                                                <LinkIcon className="absolute left-3 top-3 text-slate-500 group-focus-within/input:text-blue-400 transition-colors" size={18} />
                                                <input 
                                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg py-2.5 pl-10 pr-4 text-sm text-blue-400 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all underline decoration-blue-500/30"
                                                    placeholder="https://..." 
                                                    value={milestone.description}
                                                    onChange={e => updateMilestone(index, 'description', e.target.value)}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="md:col-span-5 flex flex-col gap-4 bg-slate-800/30 p-4 rounded-lg border border-slate-700/50">
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-slate-400 ml-1 font-medium">Сумма (USDC)</label>
                                            <div className="relative group/input">
                                                <DollarSign className="absolute left-3 top-2.5 text-slate-500 group-focus-within/input:text-green-400 transition-colors" size={16} />
                                                <input 
                                                    type="number" 
                                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 pl-9 pr-3 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500/50 focus:border-green-500 transition-all"
                                                    value={milestone.amount}
                                                    onChange={e => updateMilestone(index, 'amount', e.target.value)}
                                                    placeholder="5000"
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1.5">
                                            <label className="text-xs text-slate-400 ml-1 font-medium">Срок (Дней)</label>
                                            <div className="relative group/input">
                                                <Calendar className="absolute left-3 top-2.5 text-slate-500 group-focus-within/input:text-yellow-400 transition-colors" size={16} />
                                                <input 
                                                    type="number" 
                                                    className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 pl-9 pr-3 text-sm text-white font-mono placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500 transition-all"
                                                    value={milestone.duration}
                                                    onChange={e => updateMilestone(index, 'duration', e.target.value)}
                                                    placeholder="30"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}

                        <button 
                            onClick={addMilestone}
                            className="w-full py-4 border border-dashed border-slate-700 bg-slate-900/30 rounded-xl text-slate-400 hover:text-white hover:border-blue-500 hover:bg-blue-500/10 transition-all flex items-center justify-center gap-2 text-sm font-medium group"
                        >
                            <div className="bg-slate-800 p-1 rounded group-hover:bg-blue-500 transition-colors">
                                <PlusCircle size={16} className="text-slate-400 group-hover:text-white" />
                            </div>
                            Добавить следующий этап
                        </button>
                    </div>

                    <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-xl border border-slate-700 flex flex-col md:flex-row justify-between items-center gap-6 shadow-xl">
                        <div className="w-full md:w-1/2 space-y-2">
                            <label className="text-sm font-medium text-slate-300 block">Период сбора средств (Дней)</label>
                            <div className="relative group/input">
                                <Calendar className="absolute left-3 top-2.5 text-slate-500 group-focus-within/input:text-blue-400" size={18} />
                                <input 
                                    className="w-full bg-slate-950 border border-slate-600 rounded-lg py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 transition-all"
                                    type="number" 
                                    value={votingDuration}
                                    onChange={e => setVotingDuration(e.target.value)}
                                    placeholder="Например: 30"
                                />
                            </div>
                        </div>
                        <div className="text-center md:text-right">
                            <span className="text-slate-400 text-xs uppercase tracking-wider font-semibold">Итоговая цель</span>
                            <div className="text-3xl font-bold text-white mt-1">
                                {totalGoal.toLocaleString()} <span className="text-blue-500 text-xl font-normal">USDC</span>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2">
                        <Button 
                            onClick={handleSubmit} 
                            disabled={isCreating || totalGoal <= 0}
                            className="w-full py-4 text-lg font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-lg shadow-blue-900/30 rounded-xl transition-all transform active:scale-[0.99]"
                        >
                            {isCreating ? (
                                <div className="flex items-center justify-center gap-2">
                                    <Loader2 className="animate-spin" /> 
                                    Отправка в блокчейн...
                                </div>
                            ) : 'Опубликовать проект'}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};