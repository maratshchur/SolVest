import * as anchor from "@coral-xyz/anchor";
import { 
    createMint, 
    createAssociatedTokenAccount, 
    mintTo, 
    getAssociatedTokenAddress 
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

async function main() {
    // Подключаемся к локальной сети
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const connection = provider.connection;
    const payer = (provider.wallet as anchor.Wallet).payer;

    console.log("🛠 Настройка окружения на Localnet...");
    console.log("🔑 Мой кошелек:", payer.publicKey.toString());

    // 1. Создаем токен "Fake USDC" (6 знаков после запятой)
    const usdcMint = await createMint(
        connection,
        payer,             // Плательщик комиссии
        payer.publicKey,   // Владелец Mint (может печатать токены)
        null,              // Freeze authority (не нужен)
        6                  // Decimals (КАК У НАСТОЯЩЕГО USDC)
    );

    console.log("---------------------------------------------------");
    console.log("✅ USDC Mint создан:", usdcMint.toString());
    console.log("👉 ВСТАВЬТЕ ЭТОТ АДРЕС В КОНСТАНТЫ ФРОНТЕНДА!");
    console.log("---------------------------------------------------");

    // 2. Создаем токен-аккаунт (кошелек для токенов) для себя
    const myTokenAccount = await createAssociatedTokenAccount(
        connection,
        payer,
        usdcMint,
        payer.publicKey
    );

    console.log("💳 Мой USDC аккаунт:", myTokenAccount.toString());

    // 3. Печатаем себе 10,000 "USDC"
    await mintTo(
        connection,
        payer,
        usdcMint,
        myTokenAccount,
        payer,
        10000 * 1000000 // 10,000 USDC * 6 decimals
    );

    console.log("💰 Успешно напечатано 10,000 Fake USDC на ваш счет.");
}

main().then(
    () => process.exit(),
    (err) => {
        console.error(err);
        process.exit(-1);
    }
);