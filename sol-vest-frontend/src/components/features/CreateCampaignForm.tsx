import { useState } from 'react';
import { useSolVest } from '../../hooks/useSolVest';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Card } from '../ui/Card';
import { PlusCircle, Loader2 } from 'lucide-react';

export const CreateCampaignForm = () => {
    const { createCampaign, isCreating } = useSolVest();
    const [form, setForm] = useState({ goal: '', m1: '', m2: '' });

    const handleSubmit = async () => {
        try {
            await createCampaign({
                goal: Number(form.goal),
                m1: Number(form.m1),
                m2: Number(form.m2)
            });
            setForm({ goal: '', m1: '', m2: '' });
            alert("Проект успешно создан!");
        } catch (e) {
            console.error(e);
            alert("Ошибка при создании");
        }
    };

    return (
        <Card className="mb-8">
            <div className="flex items-center gap-2 mb-4 text-blue-400">
                <PlusCircle size={24} />
                <h2 className="text-xl font-bold">Новый проект</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Input 
                    type="number" placeholder="Общая цель (USDC)" 
                    value={form.goal} onChange={e => setForm({...form, goal: e.target.value})}
                />
                <Input 
                    type="number" placeholder="Этап 1 (USDC)" 
                    value={form.m1} onChange={e => setForm({...form, m1: e.target.value})}
                />
                <Input 
                    type="number" placeholder="Этап 2 (USDC)" 
                    value={form.m2} onChange={e => setForm({...form, m2: e.target.value})}
                />
            </div>
            <div className="mt-4 flex justify-end">
                <Button onClick={handleSubmit} disabled={isCreating || !form.goal}>
                    {isCreating ? <div className="flex gap-2"><Loader2 className="animate-spin" /> Создание...</div> : 'Запустить кампанию'}
                </Button>
            </div>
        </Card>
    );
};