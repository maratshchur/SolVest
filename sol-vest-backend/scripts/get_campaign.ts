import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolVestBackend } from "../target/types/sol_vest_backend"; // Путь к типам, если они сгенерированы
// Если типы не сгенерированы, можно использовать 'any' или загрузить IDL JSON вручную

// Функция для форматирования даты из Unix timestamp (BN)
const formatDate = (timestamp: anchor.BN) => {
  if (timestamp.toNumber() === 0) return "Не установлено";
  return new Date(timestamp.toNumber() * 1000).toLocaleString();
};

// Функция для перевода BN в число (для USDC с учетом 6 децималов, например)
const formatAmount = (amount: anchor.BN) => {
  return amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

async function main() {
  // 1. Настройка провайдера
  // Anchor возьмет настройки из переменных окружения ANCHOR_PROVIDER_URL и ANCHOR_WALLET
  // Или из файла Anchor.toml
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  // 2. Инициализация программы
  // Мы предполагаем, что вы запускаете это из корня проекта Anchor,
  // где доступен target/idl/sol_vest_backend.json
  const program = anchor.workspace.SolVestBackend as Program<SolVestBackend>;

  if (!program) {
    console.error("Программа не найдена! Убедитесь, что вы запустили 'anchor build' и находитесь в корне проекта.");
    return;
  }

  console.log("Чтение аккаунтов с программы:", program.programId.toString());

  try {
    // 3. Получение всех аккаунтов типа Campaign
    // .all() делает getProgramAccounts с фильтром по дискриминатору
    const campaigns = await program.account.campaign.all();

    if (campaigns.length === 0) {
      console.log("Кампании не найдены.");
      return;
    }

    console.log(`Найдено кампаний: ${campaigns.length}\n`);

    // 4. Вывод данных
    campaigns.forEach((camp, index) => {
      const data = camp.account;
      
      console.log(`=== Кампания #${index + 1} [${camp.publicKey.toString()}] ===`);
      console.log(`Название:         ${data.name}`);
      console.log(`Создатель:        ${data.creator.toString()}`);
      console.log(`Цель сбора:       ${formatAmount(data.totalGoal)} токенов`);
      console.log(`Собрано:          ${formatAmount(data.raisedAmount)} токенов`);
      console.log(`Статус:           ${Object.keys(data.state)[0].toUpperCase()}`); // Anchor возвращает enum как объект { active: {} }
      console.log(`Дедлайн сбора:    ${formatDate(data.deadline)}`);
      console.log(`Текущий этап (idx): ${data.milestoneIdx}`);
      
      if (data.currentMilestoneDeadline.toNumber() > 0) {
        console.log(`Дедлайн этапа:    ${formatDate(data.currentMilestoneDeadline)}`);
      }

      console.log(`\n--- Этапы (Milestones) ---`);
      data.milestones.forEach((m: any, mIndex: number) => {
        console.log(`  Этап ${mIndex}: ${m.name}`);
        console.log(`    Описание: ${m.description}`);
        console.log(`    Сумма:    ${formatAmount(m.goalAmount)}`);
        console.log(`    Статус:   ${Object.keys(m.state)[0].toUpperCase()}`);
        console.log(`    Голоса:   ЗА [${formatAmount(m.votesFor)}] / ПРОТИВ [${formatAmount(m.votesAgainst)}]`);
        if (m.voteDeadline.toNumber() > 0) {
          console.log(`    Конец голосования: ${formatDate(m.voteDeadline)}`);
        }
      });
      console.log("\n=======================================================\n");
    });

  } catch (error) {
    console.error("Ошибка при получении кампаний:", error);
  }
}

main();