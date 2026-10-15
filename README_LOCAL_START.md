# AGENT.ONE: локальный запуск

Исходный код можно запустить без доступа к серверу автора. Нужны Node.js 22+, Go версии из server/go.mod и Docker Compose.

## Быстрый старт

В терминале:

~~~bash
git clone https://github.com/judogaaa/AGENT.ONE.git
cd AGENT.ONE
docker compose up -d
npm ci --prefix client
npm run build --prefix client
~~~

В PowerShell:

~~~powershell
$env:DATABASE_URL = "postgres://agentone:agentone@localhost:5432/agentone?sslmode=disable"
$env:JWT_SECRET = ([guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N"))
cd server
go run ./cmd
~~~

В Windows PowerShell можно также выполнить `./start-local.ps1` из корня репозитория: он настроит изолированное локальное окружение и автоматически установит зависимости при первом запуске.

На Linux/macOS вместо PowerShell задайте DATABASE_URL и JWT_SECRET через export. Секрет можно получить командой openssl rand -hex 32.

Основное приложение: http://localhost:8080. Чтобы создать два учебных аккаунта в **локальной** базе, из корня клона выполните `node scripts/seed.mjs` после запуска API. Скрипт использует только `127.0.0.1`, адреса `example.com` и не создаёт заказы или товары.

## Портал входа и режим разработки

В новом терминале из корня проекта:

~~~bash
npm ci --prefix client-auth
npm run dev --prefix client-auth
~~~

Открыть http://localhost:5180. Это отдельное приложение, его API проксируется на Go (8080).

Для работы над основным интерфейсом в отдельном терминале: npm run dev --prefix client. Vite открывает http://localhost:5173.

## Тесты

~~~bash
npm test --prefix client
npm test --prefix client-auth
cd server && go test ./cmd
~~~

Если данные пусты, изучите scripts/seed.mjs перед локальным заполнением демо-каталога.

Внимание: docker-compose.yml содержит **только локальный тестовый пароль**. Для своего публичного сайта задайте другие секреты, собственные домен, юридические реквизиты, контакты, SMTP/OAuth и конфигурацию безопасности.