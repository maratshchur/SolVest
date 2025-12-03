import * as anchor from "@coral-xyz/anchor";
import { 
    createMint, 
    createAssociatedTokenAccount, 
    mintTo, 
    getOrCreateAssociatedTokenAccount 
} from "@solana/spl-token";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

// =================================================================
// ⚙️ НАСТРОЙКИ
// =================================================================

// Список кошельков, которые нужно "зарядить" (SOL + USDC)
// Вставьте сюда адреса из вашего Phantom
const TEST_WALLETS = [
    "5KP7KFySmgGprrb7q2ZmxRmQgfNDHhQUdoA5JX3gX484", // Аккаунт 1
    "8Nr9YhUSTPiSb523XStvzStK5qN3ZzFAACsKuYyPGSC8", // Аккаунт 2 (если есть)
"BaZQuQv8vg51oMEwXSoNyzoLFKryzRwgFUN77DU8EqVF"
];

const SOL_AMOUNT = 100;      // Сколько SOL дать каждому
const USDC_AMOUNT = 50_000;  // Сколько USDC дать каждому

// =================================================================

async function main() {
    // Подключение к Localhost (берется из переменных окружения или конфига Anchor)
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;
    
    // Админский кошелек (id.json), который все оплачивает
    const payer = (provider.wallet as anchor.Wallet).payer;

    console.log("🚀 Запуск автоматической настройки Localnet...");
    console.log("🔑 Admin Wallet:", payer.publicKey.toString());

    // ---------------------------------------------------------
    // 1. Создаем токен USDC (Mint)
    // ---------------------------------------------------------
    console.log("\n1️⃣  Создаем фейковый USDC...");
    const usdcMint = await createMint(
        connection,
        payer,             // Плательщик
        payer.publicKey,   // Mint Authority (кто может печатать)
        null,
        6                  // 6 знаков (как у настоящего USDC)
    );

    console.log("✅ USDC Mint создан:", usdcMint.toString());
    console.log("⚠️  НЕ ЗАБУДЬТЕ ОБНОВИТЬ ЭТОТ АДРЕС НА ФРОНТЕНДЕ!");

    // ---------------------------------------------------------
    // 2. Обрабатываем список тестовых кошельков
    // ---------------------------------------------------------
    console.log("\n2️⃣  Раздаем токены тестовым кошелькам...");

    for (const addressStr of TEST_WALLETS) {
        try {
            const userPubkey = new PublicKey(addressStr);
            console.log(`\n👤 Обработка: ${addressStr.slice(0, 6)}...`);

            // --- A. Раздаем SOL ---
            console.log(`   -> Airdrop ${SOL_AMOUNT} SOL...`);
            const signature = await connection.requestAirdrop(
                userPubkey, 
                SOL_AMOUNT * LAMPORTS_PER_SOL
            );
            // Ждем подтверждения транзакции
            const latestBlockHash = await connection.getLatestBlockhash();
            await connection.confirmTransaction({
                blockhash: latestBlockHash.blockhash,
                lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
                signature: signature,
            });

            // --- B. Создаем USDC аккаунт (ATA) ---
            console.log(`   -> Создание Token Account...`);
            const userTokenAccount = await getOrCreateAssociatedTokenAccount(
                connection,
                payer,          // Админ платит за создание аккаунта (ренту)
                usdcMint,
                userPubkey      // Владелец аккаунта - тестовый юзер
            );

            // --- C. Печатаем USDC ---
            console.log(`   -> Минт ${USDC_AMOUNT} USDC...`);
            await mintTo(
                connection,
                payer,
                usdcMint,
                userTokenAccount.address,
                payer,          // Админ подписывает печать
                USDC_AMOUNT * 1_000_000 // Учитываем decimals
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