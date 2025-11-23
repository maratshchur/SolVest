import { useState, useEffect } from 'react';
import { useSolVest } from '../../hooks/useSolVest';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { PlusCircle, Trash2, Loader2, Calendar, DollarSign } from 'lucide-react';

export const CreateCampaignForm = () => {
    const { createCampaign, isCreating } = useSolVest();
    
    // Состояние для этапов
    const [milestones, setMilestones] = useState([
        { amount: '', duration: '' } // Один этап по умолчанию
    ]);
    
    // Глобальные настройки
    const [votingDuration, setVotingDuration] = useState(''); // Длительность голосования (дни)

    // Автоматический подсчет общей цели
    const totalGoal = milestones.reduce((acc, m) => acc + (Number(m.amount) || 0), 0);

    const addMilestone = () => {
        setMilestones([...milestones, { amount: '', duration: '' }]);
    };

    const removeMilestone = (index: number) => {
        if (milestones.length > 1) {
            setMilestones(milestones.filter((_, i) => i !== index));
        }
    };

    const updateMilestone = (index: number, field: 'amount' | 'duration', value: string) => {
        const newMilestones = [...milestones];
        newMilestones[index][field] = value;
        setMilestones(newMilestones);
    };

    const handleSubmit = async () => {
        try {
            // Подготовка данных для отправки
            const formattedMilestones = milestones.map(m => ({
                amount: Number(m.amount),
                duration: Number(m.duration) * 86400 // Конвертируем дни в секунды
            }));

            await createCampaign({
                goal: totalGoal, // число (например 5000)
                milestones: formattedMilestones.map(m => ({
                    name: `Milestone ${m.id}`, // или поле ввода
                    description: "Generated via UI", // или поле ввода
                    amount: Number(m.amount),
                    duration: Number(m.duration) * 86400 // Дни -> Секунды
                })),
                fundraisingDuration: Number(votingDuration) * 86400 // Дни -> Секунды (используем как длительность сбора)
            });

            // Сброс формы
            setMilestones([{ amount: '', duration: '' }]);
            setVotingDuration('');
            alert("Проект успешно создан!");
        } catch (e) {
            console.error(e);
            alert("Ошибка при создании (см. консоль)");
        }
    };

    return (
        <Card className="mb-8 border-slate-800 bg-slate-900/50">
            <div className="flex items-center gap-2 mb-6 text-blue-400">
                <PlusCircle size={24} />
                <h2 className="text-xl font-bold">Запуск нового проекта</h2>
            </div>

            <div className="space-y-6">
                {/* Список этапов */}
                <div className="space-y-4">
                    <label className="text-sm font-medium text-slate-300">План развития (Этапы)</label>
                    
                    {milestones.map((milestone, index) => (
                        <div key={index} className="flex gap-4 items-start bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                            <div className="mt-3 text-slate-500 font-mono text-sm">#{index + 1}</div>
                            
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Сумма (USDC)</label>
                                    <Input 
                                        type="number" 
                                        value={milestone.amount}
                                        onChange={e => updateMilestone(index, 'amount', e.target.value)}
                                        placeholder="Например: 5000"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Срок выполнения (Дней)</label>
                                    <Input 
                                        type="number" 
                                        value={milestone.duration}
                                        onChange={e => updateMilestone(index, 'duration', e.target.value)}
                                        placeholder="Например: 30"
                                    />
                                </div>
                            </div>

                            {milestones.length > 1 && (
                                <button 
                                    onClick={() => removeMilestone(index)}
                                    className="mt-7 text-red-500 hover:text-red-400 transition"
                                >
                                    <Trash2 size={20} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                {/* Кнопка добавления этапа */}
                <button 
                    onClick={addMilestone}
                    className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition"
                >
                    <PlusCircle size={16} /> Добавить следующий этап
                </button>

                <hr className="border-slate-800" />

                {/* Итоговые настройки */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="text-sm text-slate-300 mb-2 block">Длительность голосования (Дней)</label>
                        <div className="relative">
                            <Calendar className="absolute left-3 top-3 text-slate-500" size={16} />
                            <Input 
                                className="pl-10"
                                type="number" 
                                value={votingDuration}
                                onChange={e => setVotingDuration(e.target.value)}
                                placeholder="3"
                            />
                        </div>
                    </div>
                    
                    <div className="bg-slate-800 p-4 rounded-lg flex flex-col justify-center">
                        <span className="text-slate-400 text-sm">Общая цель сбора:</span>
                        <div className="text-2xl font-bold text-white flex items-center gap-1">
                            {totalGoal.toLocaleString()} <span className="text-blue-500">USDC</span>
                        </div>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <Button onClick={handleSubmit} disabled={isCreating || totalGoal <= 0}>
                        {isCreating ? <><Loader2 className="animate-spin mr-2" /> Создание...</> : 'Опубликовать проект'}
                    </Button>
                </div>
            </div>
        </Card>
    );
};