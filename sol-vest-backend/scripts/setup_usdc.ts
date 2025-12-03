import * as anchor from "@coral-xyz/anchor";
import { 
    createMint, 
    createAssociatedTokenAccount, 
    mintTo, 
    getOrCreateAssociatedTokenAccount 
} from "@solana/spl-token";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";


const TEST_WALLETS = [
    "5KP7KFySmgGprrb7q2ZmxRmQgfNDHhQUdoA5JX3gX484",
    "8Nr9YhUSTPiSb523XStvzStK5qN3ZzFAACsKuYyPGSC8",
"BaZQuQv8vg51oMEwXSoNyzoLFKryzRwgFUN77DU8EqVF"
];

const SOL_AMOUNT = 100;
const USDC_AMOUNT = 50_000;


async function main() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;
    
    const payer = (provider.wallet as anchor.Wallet).payer;

    console.log("🚀 Запуск автоматической настройки Localnet...");
    console.log("🔑 Admin Wallet:", payer.publicKey.toString());

    console.log("\n1️⃣  Создаем фейковый USDC...");
    const usdcMint = await createMint(
        connection,
        payer,             
        payer.publicKey,  
        null,
        6                  
    );

    console.log("✅ USDC Mint создан:", usdcMint.toString());
    console.log("⚠️  НЕ ЗАБУДЬТЕ ОБНОВИТЬ ЭТОТ АДРЕС НА ФРОНТЕНДЕ!");

    console.log("\n2️⃣  Раздаем токены тестовым кошелькам...");

    for (const addressStr of TEST_WALLETS) {
        try {
            const userPubkey = new PublicKey(addressStr);
            console.log(`\n👤 Обработка: ${addressStr.slice(0, 6)}...`);

            console.log(`   -> Airdrop ${SOL_AMOUNT} SOL...`);
            const signature = await connection.requestAirdrop(
                userPubkey, 
                SOL_AMOUNT * LAMPORTS_PER_SOL
            );
            const latestBlockHash = await connection.getLatestBlockhash();
            await connection.confirmTransaction({
                blockhash: latestBlockHash.blockhash,
                lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
                signature: signature,
            });

            console.log(`   -> Создание Token Account...`);
            const userTokenAccount = await getOrCreateAssociatedTokenAccount(
                connection,
                payer,          
                usdcMint,
                userPubkey 
            );

            console.log(`   -> Минт ${USDC_AMOUNT} USDC...`);
            await mintTo(
                connection,
                payer,
                usdcMint,
                userTokenAccount.address,
                payer,          
                USDC_AMOUNT * 1_000_000 
            );
            
            console.log(`   ✅ Готово!`);

        } catch (error) {
            console.error(`   ❌ Ошибка с кошельком ${addressStr}:`, error);
        }
    }

    console.log("\n🎉 Настройка завершена успешно!");
    console.log(`Mint Address для копирования: ${usdcMint.toString()}`);
}

main().then(
    () => process.exit(),
    (err) => {
        console.error(err);
        process.exit(-1);
    }
);

// ANCHOR_PROVIDER_URL="http://127.0.0.1:8899" ANCHOR_WALLET="$HOME/.config/solana/id.json" npx ts-node scripts/setup_usdc.ts