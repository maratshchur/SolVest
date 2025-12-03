/**
 * Этот скрипт показывает разницу между:
 * 1. Date.now() - текущее время в миллисекундах (формат JS)
 * 2. Math.floor(Date.now() / 1000) - текущее время в секундах (формат Solana/Unix Timestamp)
 */

function checkCurrentTime() {
    // 1. Получаем текущее время в МИЛЛИСЕКУНДАХ
    const currentTimeMs = Date.now();
    
    // 2. Получаем текущее время в СЕКУНДАХ (Unix Timestamp)
    // Solana и большинство блокчейнов используют секунды для метки времени.
    const currentTimeSeconds = Math.floor(currentTimeMs / 1000);

    // 3. Выводим результат
    console.log("--- Текущее время ---");
    console.log(`Date.now() (MS):  ${currentTimeMs}`);
    console.log(`(MS / 1000) (SEC): ${currentTimeSeconds}`);
    console.log(`\nОбратный перевод в объект Date:`);
    console.log(`MS -> Date: ${new Date(currentTimeMs).toISOString()}`);
    console.log(`SEC -> Date: ${new Date(currentTimeSeconds * 1000).toISOString()}`);
    
    // 4. Демонстрация проблемы (Ваш случай)
    console.log("\n--- Демонстрация Проблемы ---");
    
    const deadlineFromSolana = 1701547500; // Пример (5 минут вперед от 1701547200)

    console.log(`Deadline из Solana (SEC): ${deadlineFromSolana}`);
    
    // ПРАВИЛЬНАЯ ПРОВЕРКА (СЕКУНДЫ в МИЛЛИСЕКУНДЫ):
    const isDeadlinePassedCorrectly = currentTimeMs > deadlineFromSolana * 1000;
    console.log(`Правильная проверка (Deadline прошёл?): ${isDeadlinePassedCorrectly}`);
    
    // НЕПРАВИЛЬНАЯ ПРОВЕРКА (СЕКУНДЫ vs МИЛЛИСЕКУНДЫ):
    const isDeadlinePassedIncorrectly = currentTimeMs > deadlineFromSolana;
    console.log(`НЕПРАВИЛЬНАЯ проверка (Deadline прошёл?): ${isDeadlinePassedIncorrectly}`);
    
    if (isDeadlinePassedIncorrectly) {
        console.log("!!! Именно это вызывает вашу проблему, т.к. 10-значное число (секунды) всегда меньше 13-значного числа (миллисекунды).");
    }
}

checkCurrentTime();