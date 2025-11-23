import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { CreateCampaignForm } from './components/features/CreateCampaignForm';
import { CampaignList } from './components/features/CampaignList';
import { Users, Rocket } from 'lucide-react';
import { useAnchorWallet } from '@solana/wallet-adapter-react';

function App() {
  const wallet = useAnchorWallet();

  return (
    <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
      <header className="border-b border-slate-800/50 backdrop-blur-md sticky top-0 z-50">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <Rocket className="text-white" size={20} />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              Sol-Vest
            </h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {!wallet ? (
          <div className="text-center py-20">
            <h2 className="text-3xl font-bold mb-4">Децентрализованный краудфандинг</h2>
            <p className="text-slate-400 mb-8">Подключите кошелек, чтобы управлять инвестициями и создавать проекты</p>
            <div className="flex justify-center">
                <WalletMultiButton />
            </div>
          </div>
        ) : (
          <>
            <CreateCampaignForm />
            <div className="mt-12">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                <Users className="text-blue-500" />
                Активные проекты
              </h2>
              <CampaignList />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;