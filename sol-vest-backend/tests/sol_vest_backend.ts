import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolVestBackend } from "../target/types/sol_vest_backend";
import { 
  getOrCreateAssociatedTokenAccount, 
  createTransferInstruction, 
  TOKEN_PROGRAM_ID 
} from "@solana/spl-token";
import { expect } from "chai";

describe("sol_vest_backend_integration", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SolVestBackend as Program<SolVestBackend>;

  const adminWallet = provider.wallet as anchor.Wallet;
  const USDC_MINT = new anchor.web3.PublicKey("77u3giVhJjgPM9kEESGxJmRmpzvGLxeALHnMMtsaxqrT");
  
  const ADMIN_USDC_ATA = new anchor.web3.PublicKey("J3s4FooS38kY4oZn3p5QHxv1DJxJLh2pBqy7SwRZHkTA");
  const creator = anchor.web3.Keypair.generate();
  const investor = anchor.web3.Keypair.generate();

  let creatorAta: anchor.web3.PublicKey;
  let investorAta: anchor.web3.PublicKey;
  
  let protocolPda: anchor.web3.PublicKey;
  let campaignPda: anchor.web3.PublicKey;
  let vaultPda: anchor.web3.PublicKey;
  let contributionPda: anchor.web3.PublicKey;

  const TOTAL_GOAL = new anchor.BN(1000_000000);
  const MILESTONE_1_AMOUNT = new anchor.BN(400_000000);
  const MILESTONE_2_AMOUNT = new anchor.BN(600_000000);

  before(async () => {
    console.log("Starting setup...");

    [protocolPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("protocol")],
      program.programId
    );

    const tx = new anchor.web3.Transaction().add(
      anchor.web3.SystemProgram.transfer({
        fromPubkey: adminWallet.publicKey,
        toPubkey: creator.publicKey,
        lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
      }),
      anchor.web3.SystemProgram.transfer({
        fromPubkey: adminWallet.publicKey,
        toPubkey: investor.publicKey,
        lamports: 0.1 * anchor.web3.LAMPORTS_PER_SOL,
      })
    );
    await provider.sendAndConfirm(tx);
    console.log("SOL airdropped to Creator and Investor");

    creatorAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection, 
      adminWallet.payer,
      USDC_MINT, 
      creator.publicKey
    )).address;

    investorAta = (await getOrCreateAssociatedTokenAccount(
      provider.connection, 
      adminWallet.payer, 
      USDC_MINT, 
      investor.publicKey
    )).address;


    const transferTx = new anchor.web3.Transaction().add(
      createTransferInstruction(
        ADMIN_USDC_ATA,
        investorAta,
        adminWallet.publicKey,
        2000_000000
      )
    );
    await provider.sendAndConfirm(transferTx);
    console.log("2000 USDC transferred from Admin to Investor");
  });

  it("Validates Existing Protocol", async () => {
    const protocolAccount = await program.account.protocol.fetch(protocolPda);
    
    console.log("Protocol State:");
    console.log("- Owner:", protocolAccount.owner.toBase58());
    console.log("- Fee Dest:", protocolAccount.feeDestination.toBase58());

    expect(protocolAccount.feeDestination.toBase58()).to.equal(ADMIN_USDC_ATA.toBase58());
  });

  it("Creates Campaign", async () => {
    const campaignKeypair = anchor.web3.Keypair.generate();
    campaignPda = campaignKeypair.publicKey;

    [vaultPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), campaignPda.toBuffer()],
      program.programId
    );

    const milestones = [
      {
        name: "MVP Development",
        description: "Core features implementation",
        goalAmount: MILESTONE_1_AMOUNT,
        duration: new anchor.BN(3),
      },
      {
        name: "Public Launch",
        description: "Marketing and release",
        goalAmount: MILESTONE_2_AMOUNT,
        duration: new anchor.BN(5),
      }
    ];

    await program.methods
      .createCampaign(
        "Integration Test Campaign",
        TOTAL_GOAL,
        milestones,
        new anchor.BN(2000)
      )
      .accounts({
        campaign: campaignPda,
        vault: vaultPda,
        usdcMint: USDC_MINT,
        creator: creator.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      })
      .signers([creator, campaignKeypair])
      .rpc();

    const camp = await program.account.campaign.fetch(campaignPda);
    expect(camp.totalGoal.eq(TOTAL_GOAL)).to.be.true;
    console.log("Campaign created at:", campaignPda.toBase58());
  });

  it("Invests & Triggers 1st Payout", async () => {
    [contributionPda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("contribution"), campaignPda.toBuffer(), investor.publicKey.toBuffer()],
      program.programId
    );

    const creatorBalBefore = (await provider.connection.getTokenAccountBalance(creatorAta)).value.amount;

    await program.methods
      .invest(TOTAL_GOAL)
      .accounts({
        campaign: campaignPda,
        vault: vaultPda,
        contribution: contributionPda,
        investor: investor.publicKey,
        investorTokenAccount: investorAta,
        protocol: protocolPda,
        creatorTokenAccount: creatorAta,
        feeDestination: ADMIN_USDC_ATA,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([investor])
      .rpc();

    const creatorBalAfter = (await provider.connection.getTokenAccountBalance(creatorAta)).value.amount;

    console.log(`Creator Balance: ${creatorBalBefore} -> ${creatorBalAfter}`);
    expect(Number(creatorBalAfter)).to.be.greaterThan(Number(creatorBalBefore));
    
    const camp = await program.account.campaign.fetch(campaignPda);
    expect(JSON.stringify(camp.state)).to.include("active");
    
    console.log("Invested and 1st payout received");
  });

  it("Submits & Votes", async () => {
    await program.methods
      .submitMilestone("https://github.com/proof")
      .accounts({
        campaign: campaignPda,
        signer: creator.publicKey,
      })
      .signers([creator])
      .rpc();

    const [votePda] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("vote"), campaignPda.toBuffer(), investor.publicKey.toBuffer(), Buffer.from([0])],
      program.programId
    );

    await program.methods
      .vote(true)
      .accounts({
        campaign: campaignPda,
        contribution: contributionPda,
        voteRecord: votePda,
        voter: investor.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([investor])
      .rpc();
      
    console.log("Milestone submitted and Voted FOR");
  });

  it("Finalizes & Triggers 2nd Payout", async () => {
    console.log("⏳ Waiting for voting period to end...");
    await new Promise((resolve) => setTimeout(resolve, 4000));

    await program.methods
      .finalizeMilestone()
      .accounts({
        protocol: protocolPda,
        campaign: campaignPda,
        vault: vaultPda,
        caller: creator.publicKey,
        creator: creator.publicKey,
        creatorTokenAccount: creatorAta,
        feeDestination: ADMIN_USDC_ATA,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([creator])
      .rpc();

    const camp = await program.account.campaign.fetch(campaignPda);
    expect(camp.milestoneIdx).to.equal(1);
    
    const creatorBalFinal = (await provider.connection.getTokenAccountBalance(creatorAta)).value.amount;
    console.log("💰 Final Creator Balance:", creatorBalFinal);
    
    expect(Number(creatorBalFinal)).to.be.closeTo(980_000000, 100);

    console.log("Milestone finalized, second payout received");
  });
});