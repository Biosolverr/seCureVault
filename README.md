# SecureVault Monorepo

Смарт-контракт + фронтенд для Base mainnet.

```
securevault-monorepo/
├── contracts/          # Hardhat проект (Solidity 0.8.24)
│   ├── contracts/SecureVault.sol
│   ├── scripts/deploy.js
│   └── test/SecureVault.test.js
├── frontend/           # Next.js (деплоится на Vercel)
│   ├── pages/index.js
│   └── lib/contract.js
├── vercel.json
└── package.json
```

## Задеплоенный контракт

**Base mainnet:** `0xcc3ecd133d27e2c9f0d6ae1701d8f70364efdc34`

## Исправленные баги

| # | Баг | Фикс |
|---|-----|------|
| 1 | `lastState` не обновлялся → событие всегда из INIT | `prevState` сохраняется локально до перехода |
| 2 | Карантин не блокировал действия | Модификатор `notQuarantined` на deposit/lock/execute/refund/initiateExecution |
| 3 | `receive()` застревал ETH при неожиданных суммах | `revert("Use deposit()")` для всех сумм ≠ QUARANTINE_STAKE |
| 4 | `initiateExecution` был открыт для любого | Проверка `msg.sender == counterparty \|\| owner()` |
| 5 | Replay-атака в `recoverAccount` (внешняя версия) | Используем EIP-712 с `_hashTypedDataV4` (chainId + address(this)) |

## Запуск

### Тесты контракта
```bash
cd contracts
npm install
npm test
```

### Локальный фронтенд
```bash
cd frontend
npm install
npm run dev
```

### Деплой на Vercel

1. Загрузи репозиторий на GitHub
2. В Vercel: **Import Project** → выбери репо
3. Vercel автоматически возьмёт настройки из `vercel.json`
4. Нажми **Deploy**

Либо через CLI:
```bash
npm i -g vercel
vercel --prod
```

### Деплой контракта (тестнет)
```bash
cd contracts
cp .env.example .env
# Заполни .env
npm run deploy:testnet
```
