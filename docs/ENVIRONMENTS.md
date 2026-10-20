# Окружения

Наш проект: **Qayda Kazakhstan Qodex — моб версия**.
Project reference: `evnqorvwppdjdznhbwip`.
Dashboard: https://supabase.com/dashboard/project/evnqorvwppdjdznhbwip
Region: ap-northeast-2 (Seoul), Free.

Другой проект `qayda-kazakhstan` / `jqekaeothrlushnknohb` используется отдельно (Claude). Не применять к нему миграции и не использовать его ключи.

Новое окружение предназначено для закрытого тестирования с синтетическими данными. Размещение в Seoul не подтверждает соответствие требованиям к реальным персональным данным Казахстана.

Публичная конфигурация лежит в игнорируемых .env.local. Service role клиентами не используется. Веб-адрес и приглашения: https://qayda-qodex-mobile.vercel.app. Vercel: команда Ernur (ernur1), проект qayda-qodex-mobile / prj_O7sNToaVLGu9XH229TFFZHOcstkt, корень apps/web, Node 22, установка из корня репозитория npm ci --include=dev. Production-домен открыт посетителям; отдельные preview/deployment URL защищены Vercel Authentication. Не менять другие проекты команды.

Supabase Auth site_url и точный callback https://qayda-qodex-mobile.vercel.app/auth/callback настроены, локальные и qayda callbacks сохранены. Включён вход по имени через Supabase anonymous Auth: отдельная сессия и UID, те же правила членства/RLS, имя сохраняется в профиле. Это гостевой аккаунт: после выхода/очистки браузера доступ не восстанавливается. Email-вход сохранён, но общедоступная доставка требует отдельного SMTP.

Git-source deployment работает через Vercel API с явным project ID и repo ID 1426894376; автоматическая GitHub-интеграция пока не привязана (repo_no_access при создании). Для повторного выпуска использовать create_deployment с target production и точным commit/ref. Universal/App Links и store signing остаются отдельной работой: публичный веб-адрес не заменяет нативные сборки.
