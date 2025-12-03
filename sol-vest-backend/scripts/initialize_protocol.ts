import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolVestBackend } from "../target/types/sol_vest_backend";
import { PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { 
    getAssociatedTokenAddressSync, 
    createAssociatedTokenAccountInstruction, 
    ASSOCIATED_TOKEN_PROGRAM_ID, 
    TOKEN_PROGRAM_ID 
} from "@solana/spl-token";

// ====================================================
// ⚙️ НАСТРОЙКИ
// ====================================================
const USDC_MINT_ADDRESS = new PublicKey("8yxM88Sn4z7xwJJ5brodvSXEumLEgNbAcxkMcGBdxxM3"); 
const PROTOCOL_FEE = 200; 
// ====================================================

async function main() {
    const provider = anchor.AnchorProvider.env();
    anchor.setProvider(provider);
    const program = anchor.workspace.SolVestBackend as Program<SolVestBackend>;
    const wallet = (provider.wallet as anchor.Wallet);

    console.log("🚀 Инициализация протокола Sol-Vest...");

    // 1. Находим PDA
    const [protocolPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("protocol")],
        program.programId
    );
    console.log("📍 Protocol PDA:", protocolPda.toString());

    // 2. Вычисляем адрес ATA
    const feeDestination = getAssociatedTokenAddressSync(
        USDC_MINT_ADDRESS,
        wallet.publicKey
    );
    console.log("💰 Адрес для комиссий (ATA):", feeDestination.toString());

    // =========================================================
    // 🛠 ИСПРАВЛЕНИЕ: Проверяем и создаем ATA, если его нет
    // =========================================================
    const accountInfo = await provider.connection.getAccountInfo(feeDestination);
    
    if (!accountInfo) {
        console.log("⚠️ Токен-аккаунт не найден. Создаем его...");
        try {
            const tx = new Transaction().add(
                createAssociatedTokenAccountInstruction(
                    wallet.publicKey, // Payer
                    feeDestination,   // Associated Token Account
                    wallet.publicKey, // Owner
                    USDC_MINT_ADDRESS,// Mint
                    TOKEN_PROGRAM_ID,
                    ASSOCIATED_TOKEN_PROGRAM_ID
                )
            );
            
            const sig = await provider.sendAndConfirm(tx);
            console.log("✅ Токен-аккаунт создан! Sig:", sig);
        } catch (e) {
            console.error("Ошибка при создании ATA:", e);
            return;
        }
    } else {
        console.log("✅ Токен-аккаунт уже существует.");
    }
    // =========================================================

    try {
        // 3. Вызываем метод контракта
        const tx = await program.methods
            .initializeProtocol(PROTOCOL_FEE)
            .accounts({
                owner: wallet.publicKey,
                feeDestination: feeDestination,
                // systemProgram не обязателен, Anchor сам подставит, но можно оставить
            })
            .rpc();

        console.log("🎉 Протокол успешно инициализирован!");
        console.log("📝 Transaction Signature:", tx);
        
        const accountData = await program.account.protocol.fetch(protocolPda);
        console.log("\n--- Данные в блокчейне ---");
        console.log("Fee (%):", accountData.protocolFeeBasisPoints / 100 + "%");
        console.log("Fee Wallet:", accountData.feeDestination.toString());

    } catch (error) {
        console.error("\n❌ Ошибка:", error);
    }
}

main().then(
    () => process.exit(),
    (err) => {
        console.error(err);
        process.exit(-1);
    }
);