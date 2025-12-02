import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolVestBackend } from "../target/types/sol_vest_backend";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

// ====================================================
// ⚙️ НАСТРОЙКИ (Вставь сюда свои данные!)
// ====================================================

// 1. Адрес USDC Mint (который создал setup_usdc.ts)
const USDC_MINT_ADDRESS = new PublicKey("77u3giVhJjgPM9kEESGxJmRmpzvGLxeALHnMMtsaxqrT"); 
// (Замените на свой актуальный, если пересоздавали!)

// 2. Размер комиссии (в базисных пунктах). 200 = 2.00%
const PROTOCOL_FEE = 200; 

// ====================================================

async function main() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.SolVestBackend as Program<SolVestBackend>;
    const wallet = (provider.wallet as anchor.Wallet);

    console.log("🚀 Инициализация протокола Sol-Vest...");

    // 1. Находим PDA адрес для аккаунта настроек протокола
    // В Rust: seeds = [b"protocol"]
    const [protocolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("protocol")],
        program.programId
    );

    console.log("📍 Protocol PDA будет:", protocolPda.toString());

    // 2. Вычисляем адрес токен-аккаунта админа (куда будет падать комиссия)
    // Это должен быть ATA (Associated Token Account) для USDC вашего кошелька
    const feeDestination = getAssociatedTokenAddressSync(
        USDC_MINT_ADDRESS,
        wallet.publicKey
    );

    console.log("💰 Комиссии будут идти на:", feeDestination.toString());

    try {
        // 3. Вызываем метод контракта
        const tx = await program.methods
            .initializeProtocol(PROTOCOL_FEE)
            .accounts({
                // ❌ УДАЛИТЕ ЭТУ СТРОКУ, Anchor сам подставит этот PDA
                // protocol: protocolPda, 
                
                owner: wallet.publicKey,
                feeDestination: feeDestination,
                
                // systemProgram часто тоже подставляется автоматически, 
                // но если ошибка останется только на нем, удалите и его.
                // Пока удаляем только protocol.
                // systemProgram: anchor.web3.SystemProgram.programId,
            })
            .rpc();

        console.log("✅ Протокол успешно инициализирован!");
        console.log("📝 Transaction Signature:", tx);
        
        // 4. Проверяем, что записалось
        const accountData = await program.account.protocol.fetch(protocolPda);
        console.log("\n--- Данные в блокчейне ---");
        console.log("Owner:", accountData.owner.toString());
        console.log("Fee (%):", accountData.protocolFeeBasisPoints / 100 + "%");
        console.log("Fee Wallet:", accountData.feeDestination.toString());

    } catch (error) {
        console.error("\n❌ Ошибка:", error);
        console.log("Возможно, протокол УЖЕ инициализирован.");
    }
}

main().then(
    () => process.exit(),
    (err) => {
        console.error(err);
        process.exit(-1);
    }
);