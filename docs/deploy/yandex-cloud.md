# Подробный деплой Scrumbun в Yandex Cloud

Эта инструкция описывает не абстрактный, а реальный рабочий путь деплоя, который мы уже прошли для этого проекта на Windows, с Yandex Cloud, REG.RU, Docker, Managed PostgreSQL и host-level Nginx.

Документ специально включает:

- нормальный happy path;
- точные команды для Windows PowerShell;
- все реальные проблемы, в которые мы упирались;
- способы быстро диагностировать и обойти типичные сбои.

## Что получится в итоге

После прохождения инструкции у вас будет:

- VM в Yandex Compute Cloud;
- приватный Managed PostgreSQL в той же сети;
- Docker Compose на сервере;
- образы в Yandex Container Registry;
- домен `app.proc-sima.online`, указывающий на VM;
- HTTPS на хостовом Nginx;
- рабочие проверки:
  - `https://app.proc-sima.online/healthz`
  - `https://app.proc-sima.online/api/health`
  - `https://app.proc-sima.online/api/ready`

## Итоговая рабочая схема

- `web` контейнер слушает только `127.0.0.1:8080` на сервере.
- `api` контейнер доступен только внутри docker-сети.
- хостовый `nginx` на Ubuntu принимает `80/443` и проксирует в контейнерный `web`.
- `web` внутри Compose проксирует `/api` в `api`.
- PostgreSQL вынесен в Yandex Managed PostgreSQL и доступен только из VPC.
- DNS для домена в нашем рабочем варианте управляется через REG.RU.

## Что должно быть заранее

### Локально

- Windows + PowerShell
- установлен `docker`
- установлен `yc`
- SSH-ключ:
  - публичный: `C:\Users\<YOU>\.ssh\id_ed25519.pub`
  - приватный: `C:\Users\<YOU>\.ssh\id_ed25519`

### В Yandex Cloud

- активный billing account;
- cloud;
- folder;
- service account для Terraform;
- authorized key JSON для service account.

### Для домена

- домен куплен у REG.RU;
- есть доступ в личный кабинет REG.RU;
- понимаете, кто реально сейчас обслуживает DNS-зону:
  - REG.RU
  - или Yandex Cloud NS.

### Для почты

- SMTP-провайдер;
- если SMTP через Gmail:
  - включена 2-Step Verification;
  - создан App Password.

## Важный контекст про наш реальный прод

Ниже значения приведены как пример того, что в итоге сработало у нас:

- `cloud_id = "b1ghnla7mpr0hfrgr73k"`
- `folder_id = "b1g9beb05e7n1inrh08b"`
- `DEPLOY_HOST = "89.169.152.87"`
- `postgresql_fqdn = "rc1a-61fmkmq2hvrs40r8.mdb.yandexcloud.net"`
- `YC_REGISTRY_HOST = "cr.yandex"`
- `YC_REGISTRY_ID = "crp5qfrnejllefpos8v6"`

Не копируйте эти значения вслепую в другой проект. Используйте их как ориентир формата.

## 1. Создать cloud и folder

Если у вас уже есть рабочие cloud/folder, этот шаг можно пропустить.

Нужен именно каталог, в котором:

- есть права на создание VPC;
- есть права на создание Compute VM;
- есть права на создание Managed PostgreSQL;
- нет конфликтующих ручных ресурсов, если вы хотите чистый Terraform apply.

### Как проверить cloud_id и folder_id

В Yandex Cloud Console:

1. Откройте нужный `cloud`.
2. Откройте нужный `folder`.
3. Смотрите идентификаторы в верхней панели.

### Очень важная реальная проблема

У нас много времени ушло на банальную опечатку в ID.

Типичные симптомы:

- `yc resource-manager folder get ...` пишет `not found`;
- Terraform пишет `Folder with id ... not found`;
- UI как будто показывает, что каталог существует, а CLI не видит.

Что проверять:

- нет ли опечатки в `cloud_id`;
- нет ли опечатки в `folder_id`;
- вы точно используете тот же cloud/folder, что открыт в UI.

## 2. Создать service account для Terraform

Рекомендуемый путь для Terraform в Yandex Cloud здесь: не пользовательский OAuth token, а service account key.

### Что создать

1. В нужном folder создайте service account, например:
   - `terraform-sa`
2. Создайте для него authorized key в JSON.
3. Сохраните JSON локально, например:

```powershell
D:\scrumbun\authorized_key.json
```

### Какие роли нужны

В нашем рабочем случае понадобились:

- на cloud: `editor`
- на folder: `editor`

Практический вывод: если минимальные роли не дают ожидаемого доступа и вы упираетесь в странные `not found`, сначала убедитесь, что:

- service account действительно видит cloud;
- service account действительно видит folder;
- роли назначены именно на cloud/folder, а не только на карточку самого service account.

## 3. Настроить `yc` под service account

На Windows PowerShell:

```powershell
yc config profile create sa-prod
yc config profile activate sa-prod
yc config set service-account-key D:\scrumbun\authorized_key.json
yc config set cloud-id b1ghnla7mpr0hfrgr73k
yc config set folder-id b1g9beb05e7n1inrh08b
```

Проверка:

```powershell
yc config get cloud-id
yc config get folder-id
yc resource-manager folder get b1g9beb05e7n1inrh08b
```

Если последняя команда отрабатывает и возвращает `status: ACTIVE`, значит CLI-auth рабочий.

### Реальная проблема, с которой мы столкнулись

Даже при правильных правах всё продолжало падать, пока не выяснилось, что:

- `cloud_id` был введён с опечаткой;
- `folder_id` тоже один раз был введён с опечаткой.

Именно поэтому перед Terraform всегда сначала проверяйте:

```powershell
yc resource-manager folder get <FOLDER_ID>
```

## 4. Подготовить Terraform

Всё лежит в:

- [infra/yandex-cloud/main.tf](D:/scrumbun/infra/yandex-cloud/main.tf)
- [infra/yandex-cloud/variables.tf](D:/scrumbun/infra/yandex-cloud/variables.tf)
- [infra/yandex-cloud/outputs.tf](D:/scrumbun/infra/yandex-cloud/outputs.tf)

### Что должно быть в `terraform.tfvars`

Пример:

```hcl
cloud_id             = "b1ghnla7mpr0hfrgr73k"
folder_id            = "b1g9beb05e7n1inrh08b"
project_name         = "scrumbun"
zone                 = "ru-central1-a"
deploy_user          = "ubuntu"
ssh_public_key       = "ssh-ed25519 AAAA... your-key-comment"
postgresql_username  = "scrumbun"
postgresql_password  = "CHANGE_ME"
postgresql_database_name = "scrumbun"
yc_registry_id       = "crp5qfrnejllefpos8v6"
web_public_port      = 8080
```

### Важные фактические правки, которые уже внесены в Terraform

В текущем репозитории уже учтены реальные проблемы, на которые мы наткнулись:

- VM использует `ubuntu-2404-lts`;
- для SSH в VM добавлен `metadata.ssh-keys`;
- создание PostgreSQL database зависит от PostgreSQL user;
- DNS-ресурсы временно отключены из Terraform, потому что публичная зона `proc-sima.online` оказалась занята вне текущего cloud/folder.

## 5. Применить Terraform

Из PowerShell:

```powershell
cd D:\scrumbun\infra\yandex-cloud
Remove-Item Env:YC_TOKEN -ErrorAction SilentlyContinue
$env:YC_SERVICE_ACCOUNT_KEY_FILE = "D:\scrumbun\authorized_key.json"
terraform init
terraform plan
terraform apply
```

После успешного применения:

```powershell
terraform output
```

Нужны значения:

- `vm_public_ip`
- `postgresql_fqdn`
- `yc_registry_id`

### Что у нас реально пошло не так на этом шаге

#### 5.1. `Folder with id ... not found`

Причины:

- опечатка в `cloud_id`;
- опечатка в `folder_id`;
- Terraform и `yc` смотрят в разные контексты;
- service account не видит cloud/folder.

Что делать:

1. Проверить `yc resource-manager folder get <folder_id>`.
2. Проверить роли у service account.
3. Убедиться, что Terraform использует service account key, а не старый `YC_TOKEN`.

#### 5.2. `Quota limit vpc.networks.count exceeded`

Причина:

- в folder уже есть ручная сеть, и квота не дает создать ещё одну.

Что делать:

1. Зайти в `Virtual Private Cloud`.
2. Удалить старые подсети.
3. Удалить старую сеть.
4. Повторить `terraform apply`.

#### 5.3. `Public Zone "proc-sima.online." is occupied`

Причина:

- в Yandex DNS уже существует зона с этим доменом, но она находилась не там, где мы ожидали.

Что делать:

- не блокировать весь деплой из-за DNS;
- временно отключить DNS из Terraform;
- закончить инфраструктуру;
- потом управлять DNS через REG.RU.

Именно так сейчас устроен этот репозиторий.

## 6. Проверить VM после Terraform

Подключение:

```powershell
ssh -o IdentitiesOnly=yes -i "$HOME\.ssh\id_ed25519" ubuntu@<VM_PUBLIC_IP>
```

### Реальная проблема, которая у нас была

Сначала SSH работал, но на сервере не было:

- `docker`
- `docker compose`
- `nginx`
- `/opt/scrumbun`

Причина была не в SSH, а в сломанном `cloud-init`.

Проблема:

- в `cloud-init.yaml` использовался `printf` с `%s`;
- это привело к некорректному bootstrap-сценарию.

Решение уже зафиксировано в [infra/yandex-cloud/cloud-init.yaml](D:/scrumbun/infra/yandex-cloud/cloud-init.yaml).

### Если VM поднялась, но bootstrap не сработал

Подключитесь по SSH и руками проверьте:

```bash
whoami
hostname
docker --version
docker compose version
nginx -v
ls -la /opt/scrumbun
```

Если чего-то нет, как временный recovery-путь:

```bash
sudo apt-get update
sudo apt-get install -y docker.io docker-compose-v2 nginx
sudo systemctl enable docker
sudo systemctl start docker
sudo systemctl enable nginx
sudo systemctl start nginx
sudo mkdir -p /opt/scrumbun/docker/nginx /opt/scrumbun/certs /opt/scrumbun/rendered
sudo chown -R ubuntu:ubuntu /opt/scrumbun
```

Если bootstrap не сработал из-за старой VM-конфигурации, безопаснее пересоздать только VM:

```powershell
terraform apply -replace="yandex_compute_instance.app"
```

## 7. Создать Container Registry

Сейчас проект использует Yandex Container Registry, а не старый формат Cloud Registry.

### Правильный хост

Используем:

```text
cr.yandex
```

### Реальная проблема, которая у нас была

Мы пытались пушить в registry ID, который выглядел валидным, но реально не существовал.

Симптом:

```text
unexpected status from POST request ... 404 Not Found
```

### Как создать registry

```powershell
yc container registry create --name scrumbun-registry
yc container registry list
```

Из вывода возьмите `registry_id`.

В нашем рабочем случае это был:

```text
crp5qfrnejllefpos8v6
```

## 8. Подготовить `.env.production`

Скопируйте шаблон:

```powershell
cd D:\scrumbun
Copy-Item .env.production.example .env.production
```

Минимально должны быть заполнены:

- `WEB_ORIGIN`
- `APP_DOMAIN`
- `SESSION_COOKIE_SECRET`
- `DATABASE_URL`
- `DATABASE_SSL_*`
- `SMTP_*`
- `YC_REGISTRY_HOST`
- `YC_REGISTRY_ID`
- `IMAGE_TAG`
- `DEPLOY_HOST`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `TLS_CERT_PATH`
- `TLS_KEY_PATH`

### Рабочие значения без секретов

Пример:

```env
LOG_LEVEL=info
NODE_ENV=production
DEPLOYMENT_TARGET=yandex-cloud

API_PORT=4000
WEB_ORIGIN=https://app.proc-sima.online
APP_DOMAIN=app.proc-sima.online
VITE_API_URL=/api
VITE_LOG_LEVEL=info

TRUST_PROXY=true
SESSION_COOKIE_NAME=scrumbun_session
SESSION_COOKIE_SECRET=CHANGE_ME_TO_LONG_RANDOM_SECRET
SESSION_COOKIE_DOMAIN=app.proc-sima.online
SESSION_COOKIE_SAME_SITE=lax
SESSION_COOKIE_SECURE=true

DATABASE_APPLY_STRATEGY=migrate-deploy
DATABASE_SSL_MODE=verify-full
DATABASE_SSL_ROOT_CERT_PATH=/run/secrets/yandex-cloud-postgres-ca.crt
DATABASE_SSL_ROOT_CERT_PATH_HOST=./certs/yandex-cloud-postgres-ca.crt
DATABASE_SSL_ROOT_CERT_PATH_CONTAINER=/run/secrets/yandex-cloud-postgres-ca.crt

YC_REGISTRY_HOST=cr.yandex
YC_REGISTRY_ID=crp5qfrnejllefpos8v6
IMAGE_TAG=2026-04-01-1
WEB_PUBLIC_PORT=8080
DEPLOY_HOST=89.169.152.87
DEPLOY_USER=ubuntu
DEPLOY_PATH=/opt/scrumbun
TLS_CERT_PATH=/etc/letsencrypt/live/app.proc-sima.online/fullchain.pem
TLS_KEY_PATH=/etc/letsencrypt/live/app.proc-sima.online/privkey.pem
```

### Правильный `DATABASE_URL`

Если пароль содержит спецсимволы вроде `!`, `#`, `@`, их нужно URL-encode.

Пример:

```env
DATABASE_URL=postgresql://scrumbun:password_with_urlencoded_chars@rc1a-61fmkmq2hvrs40r8.mdb.yandexcloud.net:6432/scrumbun?sslmode=verify-full&sslrootcert=/run/secrets/yandex-cloud-postgres-ca.crt
```

Если не экранировать спецсимволы, Prisma и драйвер БД будут ломаться очень неочевидно.

## 9. Скачать CA для Managed PostgreSQL

Локально:

```powershell
New-Item -ItemType Directory -Force -Path D:\scrumbun\certs | Out-Null
curl.exe -o D:\scrumbun\certs\yandex-cloud-postgres-ca.crt https://storage.yandexcloud.net/cloud-certs/CA.pem
```

Скопировать на сервер:

```powershell
scp -i "$HOME\.ssh\id_ed25519" D:\scrumbun\certs\yandex-cloud-postgres-ca.crt ubuntu@89.169.152.87:/opt/scrumbun/certs/yandex-cloud-postgres-ca.crt
```

Проверка:

```powershell
ssh -o IdentitiesOnly=yes -i "$HOME\.ssh\id_ed25519" ubuntu@89.169.152.87
```

На сервере:

```bash
ls -la /opt/scrumbun/certs
```

## 10. Сборка и push образов

### Предпочтительный путь

Есть скрипты:

- [scripts/deploy/yc-build-push.sh](D:/scrumbun/scripts/deploy/yc-build-push.sh)
- [scripts/deploy/yc-rollout.sh](D:/scrumbun/scripts/deploy/yc-rollout.sh)

Они уже доработаны под Windows-окружение и `cr.yandex`.

Запуск:

```powershell
cd D:\scrumbun
bash scripts/deploy/yc-build-push.sh
```

### Реальные проблемы, которые у нас были

#### 10.1. `yc: command not found`

Причина:

- Git Bash не видел `yc`.

Что сделано:

- скрипты научены искать `yc` в стандартных Windows-путях.

#### 10.2. `USERNAME: unbound variable`

Причина:

- в Git Bash переменная `USERNAME` может быть не выставлена.

Что сделано:

- скрипт теперь использует безопасный fallback.

#### 10.3. Docker build падал на `node_modules`

Симптом:

```text
archive/tar: unknown file mode ?rwxr-xr-x
```

Причина:

- в build context попали локальные `node_modules` из workspace на Windows.

Что сделано:

- в `.dockerignore` добавлено:

```text
**/node_modules
```

### Надежный PowerShell fallback без Bash

Если build-скрипт ведет себя нестабильно, используйте прямые PowerShell-команды:

```powershell
cd D:\scrumbun

$YC = "C:\Users\Артём\yandex-cloud\bin\yc.exe"
$RegistryHost = "cr.yandex"
$RegistryId = "crp5qfrnejllefpos8v6"
$ImageTag = "2026-04-01-1"
$ApiImage = "$RegistryHost/$RegistryId/scrumbun-api:$ImageTag"
$WebImage = "$RegistryHost/$RegistryId/scrumbun-web:$ImageTag"

& $YC config profile activate sa-prod
$Token = & $YC iam create-token
$Token | docker login --username iam --password-stdin $RegistryHost

docker build -f docker/api.Dockerfile -t $ApiImage .
docker build -f docker/web.Dockerfile -t $WebImage .

docker push $ApiImage
docker push $WebImage
```

## 11. Подготовить rollout на сервер

```powershell
cd D:\scrumbun

$HostName = "89.169.152.87"
$SshKey = "$HOME\.ssh\id_ed25519"

ssh -o IdentitiesOnly=yes -i $SshKey ubuntu@$HostName "mkdir -p /opt/scrumbun /opt/scrumbun/docker/nginx /opt/scrumbun/certs"
scp -i $SshKey compose.production.yml ubuntu@${HostName}:/opt/scrumbun/compose.production.yml
scp -i $SshKey .env.production ubuntu@${HostName}:/opt/scrumbun/.env.production
scp -i $SshKey docker/nginx/host-proxy.conf.template ubuntu@${HostName}:/opt/scrumbun/docker/nginx/host-proxy.conf.template
```

## 12. Выполнить rollout

### Предпочтительный путь

```powershell
$env:DEPLOY_SSH_KEY_PATH = "$HOME\.ssh\id_ed25519"
bash scripts/deploy/yc-rollout.sh
```

### Надежный PowerShell fallback

```powershell
$YC = "C:\Users\Артём\yandex-cloud\bin\yc.exe"
$RegistryHost = "cr.yandex"
$HostName = "89.169.152.87"
$SshKey = "$HOME\.ssh\id_ed25519"

$Token = & $YC iam create-token
$Token | ssh -o IdentitiesOnly=yes -i $SshKey ubuntu@$HostName "sudo docker login --username iam --password-stdin $RegistryHost"

ssh -o IdentitiesOnly=yes -i $SshKey ubuntu@$HostName "cd /opt/scrumbun && sudo docker compose --env-file .env.production -f compose.production.yml pull && sudo docker compose --env-file .env.production -f compose.production.yml up -d --remove-orphans && sudo docker compose --env-file .env.production -f compose.production.yml ps"
```

### Реальная проблема, которая у нас была

Сначала remote rollout падал с:

```text
permission denied while trying to connect to the Docker daemon socket
```

Причина:

- команды на сервере выполнялись от `ubuntu`, а docker socket был доступен только через `sudo`.

Что сделано:

- rollout-скрипт уже переведен на `sudo docker ...`.

## 13. Проверить контейнеры

Подключение:

```powershell
ssh -o IdentitiesOnly=yes -i "$HOME\.ssh\id_ed25519" ubuntu@89.169.152.87
```

На сервере:

```bash
cd /opt/scrumbun
sudo docker compose --env-file .env.production -f compose.production.yml ps
sudo docker compose --env-file .env.production -f compose.production.yml logs --tail=120 api
sudo docker compose --env-file .env.production -f compose.production.yml logs --tail=120 web
```

### Что у нас реально ломалось

#### 13.1. API container unhealthy

В логах было видно, что entrypoint запускал неправильную prisma-команду.

Что сделано:

- в [docker/api-entrypoint.sh](D:/scrumbun/docker/api-entrypoint.sh) стратегия `migrate-deploy` теперь запускает:

```sh
pnpm --filter @scrumbun/db db:deploy
```

А не несуществующий локально `prisma` бинарник.

После этого:

- миграции применились;
- API стал healthy.

#### 13.2. `curl http://127.0.0.1:4000/...` на хосте не работает

Это нормально.

Почему:

- `api` не публикует порт на хост;
- `api` доступен только внутри docker-сети;
- снаружи нужно ходить через `web`, который слушает `127.0.0.1:8080`.

Проверять надо так:

```powershell
ssh -o IdentitiesOnly=yes -i "$HOME\.ssh\id_ed25519" ubuntu@89.169.152.87 "curl -i http://127.0.0.1:8080/api/health && echo '' && curl -i http://127.0.0.1:8080/api/ready"
```

## 14. Настроить DNS через REG.RU

В нашем рабочем варианте публичный DNS через Yandex Cloud не использовался до конца, потому что зона `proc-sima.online` была уже занята где-то вне текущего Terraform-контекста.

Поэтому рабочий путь был такой:

1. в REG.RU вернуть NS на REG.RU:
   - `ns1.reg.ru`
   - `ns2.reg.ru`
2. создать A-запись:

```text
Тип: A
Имя: app
Значение: 89.169.152.87
```

### Проверка

Локально:

```powershell
nslookup app.proc-sima.online
```

Должно начать резолвиться в:

```text
89.169.152.87
```

Пока домен не смотрит в правильный IP:

- не запускайте `certbot`;
- не пытайтесь проверять HTTPS.

## 15. Выпустить TLS-сертификат

Только когда `app.proc-sima.online` уже указывает на сервер.

Подключитесь по SSH:

```powershell
ssh -o IdentitiesOnly=yes -i "$HOME\.ssh\id_ed25519" ubuntu@89.169.152.87
```

На сервере:

```bash
sudo apt-get update
sudo apt-get install -y certbot
sudo systemctl stop nginx
sudo certbot certonly --standalone -d app.proc-sima.online -m your-email@example.com --agree-tos --no-eff-email
```

После выпуска сертификата:

```bash
exit
```

## 16. Сгенерировать host-level Nginx конфиг

Локально:

```powershell
cd D:\scrumbun
bash scripts/deploy/render-host-nginx.sh
```

Скрипт создаст:

- `./rendered/scrumbun-host-proxy.conf`

Скопировать на сервер:

```powershell
scp -i "$HOME\.ssh\id_ed25519" .\rendered\scrumbun-host-proxy.conf ubuntu@89.169.152.87:/tmp/scrumbun-host-proxy.conf
```

## 17. Включить хостовый Nginx

Подключитесь к серверу:

```powershell
ssh -o IdentitiesOnly=yes -i "$HOME\.ssh\id_ed25519" ubuntu@89.169.152.87
```

На сервере:

```bash
sudo mv /tmp/scrumbun-host-proxy.conf /etc/nginx/conf.d/scrumbun.conf
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl restart nginx
```

## 18. Финальные проверки

Локально:

```powershell
curl -I https://app.proc-sima.online/healthz
curl https://app.proc-sima.online/api/health
curl https://app.proc-sima.online/api/ready
```

Ожидаем:

- `healthz` => `200 OK`
- `api/health` => `{"ok":true,...}`
- `api/ready` => `{"ok":true,"readiness":"ready","database":"connected",...}`

Дополнительно:

```powershell
cd D:\scrumbun
bash scripts/deploy/yc-smoke-check.sh
```

## 19. SMTP и письмо подтверждения

Это отдельный важный блок, потому что у нас он реально сломался уже после успешного деплоя.

### Что произошло у нас

Регистрация падала с сообщением:

```text
Не удалось отправить письмо подтверждения
```

По логам API стало видно:

- контейнеры живы;
- база жива;
- проблема именно в SMTP auth.

### Если вы используете Mail.ru

Нельзя использовать обычный пароль от ящика.

Нужен:

- app password / пароль приложения для почтовых клиентов.

### Если вы используете Gmail

Нужны:

1. включенная 2-Step Verification;
2. App Password из:

```text
https://myaccount.google.com/apppasswords
```

### Рабочий SMTP-блок для Gmail

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=YOUR_GOOGLE_APP_PASSWORD
SMTP_FROM_EMAIL=your-gmail@gmail.com
SMTP_FROM_NAME=Scrumbun
```

### После смены SMTP-настроек

Перезалить `.env.production`:

```powershell
scp -i "$HOME\.ssh\id_ed25519" .env.production ubuntu@89.169.152.87:/opt/scrumbun/.env.production
```

Перезапустить контейнеры:

```powershell
ssh -o IdentitiesOnly=yes -i "$HOME\.ssh\id_ed25519" ubuntu@89.169.152.87 "cd /opt/scrumbun && sudo docker compose --env-file .env.production -f compose.production.yml up -d --remove-orphans && sudo docker compose --env-file .env.production -f compose.production.yml ps"
```

Посмотреть логи API:

```powershell
ssh -o IdentitiesOnly=yes -i "$HOME\.ssh\id_ed25519" ubuntu@89.169.152.87 "cd /opt/scrumbun && sudo docker compose --env-file .env.production -f compose.production.yml logs --tail=100 api"
```

## 20. Что проверять после каждого релиза

После нового rollout:

1. `docker compose ps`
2. `docker compose logs --tail=100 api`
3. `docker compose logs --tail=100 web`
4. `curl -I https://app.proc-sima.online/healthz`
5. `curl https://app.proc-sima.online/api/health`
6. `curl https://app.proc-sima.online/api/ready`
7. ручная проверка UI в браузере
8. ручная проверка регистрации / логина
9. ручная проверка отправки письма

## 21. Краткий чеклист полного деплоя

1. Проверить `cloud_id` и `folder_id`.
2. Создать service account и authorized key.
3. Настроить профиль `yc` под service account.
4. Убедиться, что `yc resource-manager folder get <folder_id>` работает.
5. Подготовить `terraform.tfvars`.
6. Выполнить `terraform apply`.
7. Если Terraform упирается в старую VPC или старый DNS, почистить конфликтующие ресурсы или вынести DNS из Terraform.
8. Получить `vm_public_ip`, `postgresql_fqdn`, `yc_registry_id`.
9. Подготовить `.env.production`.
10. Скачать CA для PostgreSQL и положить его в `certs`.
11. Создать Container Registry, если его ещё нет.
12. Собрать и запушить образы.
13. Скопировать deployment-файлы на сервер.
14. Выполнить rollout.
15. Проверить здоровье `api` и `web`.
16. Настроить A-запись у DNS-провайдера.
17. Дождаться, пока домен смотрит в сервер.
18. Выпустить сертификат.
19. Включить host-level nginx.
20. Прогнать smoke-check и UI-проверку.

## 22. Самые частые причины поломки

### Проблема

`Folder not found`

### Причины

- опечатка в `cloud_id`;
- опечатка в `folder_id`;
- не тот auth-контекст;
- service account не видит cloud/folder.

### Проблема

`Quota limit vpc.networks.count exceeded`

### Причина

- в folder уже есть ручная сеть.

### Проблема

`Public Zone "..." is occupied`

### Причина

- зона уже существует в другом контексте Yandex DNS.

### Проблема

SSH заходит, но сервер пустой

### Причина

- сломанный `cloud-init`.

### Проблема

`yc` не виден из `bash`

### Причина

- типичный Windows/Git Bash path mismatch.

### Проблема

Docker push возвращает `404`

### Причина

- registry ID не существует;
- используется неправильный registry host.

### Проблема

API unhealthy после rollout

### Причина

- ошибка в entrypoint;
- неправильная миграция БД;
- неверный `DATABASE_URL`;
- неправильный путь к CA-файлу.

### Проблема

Регистрация не отправляет письмо

### Причина

- SMTP auth;
- не app password;
- неправильный SMTP provider;
- устаревшие данные в `.env.production`.

## 23. Где лежат ключевые файлы

- [compose.production.yml](D:/scrumbun/compose.production.yml)
- [docker/api-entrypoint.sh](D:/scrumbun/docker/api-entrypoint.sh)
- [docker/nginx/host-proxy.conf.template](D:/scrumbun/docker/nginx/host-proxy.conf.template)
- [scripts/deploy/yc-build-push.sh](D:/scrumbun/scripts/deploy/yc-build-push.sh)
- [scripts/deploy/yc-rollout.sh](D:/scrumbun/scripts/deploy/yc-rollout.sh)
- [scripts/deploy/render-host-nginx.sh](D:/scrumbun/scripts/deploy/render-host-nginx.sh)
- [scripts/deploy/yc-smoke-check.sh](D:/scrumbun/scripts/deploy/yc-smoke-check.sh)
- [infra/yandex-cloud/main.tf](D:/scrumbun/infra/yandex-cloud/main.tf)
- [infra/yandex-cloud/cloud-init.yaml](D:/scrumbun/infra/yandex-cloud/cloud-init.yaml)
- [infra/yandex-cloud/outputs.tf](D:/scrumbun/infra/yandex-cloud/outputs.tf)

## 24. Практический вывод

Самое важное, что показал этот деплой:

- сначала нужно стабилизировать auth и Terraform;
- потом стабилизировать VM bootstrap;
- потом registry;
- потом rollout;
- и только потом DNS, TLS и SMTP.

Если пытаться чинить всё сразу, легко потерять полдня на ложных симптомах.

Правильный порядок для этого проекта:

1. инфраструктура;
2. SSH и bootstrap;
3. registry;
4. образы;
5. rollout;
6. внутренние healthcheck;
7. DNS;
8. TLS;
9. SMTP;
10. пользовательские сценарии.
