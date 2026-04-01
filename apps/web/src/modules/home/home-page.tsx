import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/auth-context'
import { AppHeader } from '../../shared/ui/app-header'

const featureCards = [
  {
    index: '01',
    title: 'Поток работы без шума',
    body: 'Одна доска собирает задачи, исполнителей, цвета, сроки и реальные колонки в единую систему.',
    points: ['Drag-and-drop по колонкам', 'Цвета участников и статусов', 'Быстрое редактирование']
  },
  {
    index: '02',
    title: 'Команда за минуты',
    body: 'Вместо ручной рутины доска живет через invite-код, роли и понятные права доступа.',
    points: ['Вступление по коду', 'Owner и admin-контроль', 'Управление досками']
  },
  {
    index: '03',
    title: 'Готовый фундамент',
    body: 'Под капотом уже собран рабочий fullstack-стек, который можно доводить до продакшена.',
    points: ['React + Fastify', 'PostgreSQL + Prisma', 'Docker-ready структура']
  }
]

const workflowSteps = [
  {
    index: '01',
    title: 'Создать пространство',
    body: 'Запускаете новую доску, задаете структуру колонок и сразу определяете ритм команды.'
  },
  {
    index: '02',
    title: 'Собрать команду',
    body: 'Делитесь кодом приглашения, подключаете людей и назначаете каждому цвет и роль.'
  },
  {
    index: '03',
    title: 'Двигать работу вперед',
    body: 'Редактируете карточки, переносите задачи мышью и держите статус проекта под контролем.'
  }
]

function ArrowIcon() {
  return (
    <svg fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

function InviteIcon() {
  return (
    <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
    </svg>
  )
}

function DockerIcon() {
  return (
    <svg fill="none" height="14" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <rect height="8" rx="2" ry="2" width="20" x="2" y="2" />
      <rect height="8" rx="2" ry="2" width="20" x="2" y="14" />
      <line x1="6" x2="6.01" y1="6" y2="6" />
      <line x1="6" x2="6.01" y1="18" y2="18" />
    </svg>
  )
}

export function HomePage() {
  const auth = useAuth()
  const isAuthenticated = auth.status === 'authenticated' && auth.session
  const accountEmail = auth.session?.user.email ?? ''
  const authenticatedMenuItems = [
    { kind: 'link' as const, label: 'Главная', to: '/' },
    { kind: 'link' as const, label: 'Все доски', to: '/boards' },
    { kind: 'link' as const, label: 'Канбан', to: '/app' },
    {
      kind: 'link' as const,
      label: 'Модерация',
      to: '/admin',
      hidden: auth.session?.user.role !== 'admin'
    },
    {
      kind: 'action' as const,
      label: 'Выйти',
      danger: true,
      onSelect: () => {
        auth.logout().catch(() => undefined)
      }
    }
  ]

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
      }
    )

    document.querySelectorAll('.landing-v2-fade-up, .landing-v2-scale-in').forEach((element) => {
      observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <section className="control-shell landing-v2">
      <div className="landing-v2-bg" aria-hidden="true">
        <div className="landing-v2-glow landing-v2-glow-top" />
        <div className="landing-v2-glow landing-v2-glow-bottom" />
        <div className="landing-v2-noise" />
      </div>

      <AppHeader
        guestActions={
          <>
            <Link className="ghost-btn" to="/login">
              Войти
            </Link>
            <Link className="btn-new" to="/register">
              Создать аккаунт
            </Link>
          </>
        }
        menuItems={authenticatedMenuItems}
        status={
          isAuthenticated
            ? `Вы в аккаунте // ${accountEmail}`
            : 'Канбан для команды, который выглядит как продукт, а не как черновик.'
        }
        title="SCRUMBUN // CONTROL SYSTEM"
      />

      <main className="landing-v2-main">
        <section className="landing-v2-hero">
          <div className="landing-v2-hero-copy landing-v2-fade-up">
            <div className="landing-v2-kicker">Система для задач и команды</div>

            <h1 className="landing-v2-title">Канбан, который помогает принимать решения.</h1>

            <p className="landing-v2-lead">
              Scrumbun собирает в одном месте доски, роли, приглашения, цвета, drag-and-drop и
              реальный fullstack-фундамент. Главная страница теперь не объясняет стек, а продает
              сам опыт работы с продуктом.
            </p>

            <div className="landing-v2-hero-actions">
              <Link className="landing-v2-primary-button" to={isAuthenticated ? '/app' : '/register'}>
                Начать работу
                <ArrowIcon />
              </Link>
              <Link className="landing-v2-secondary-button" to={isAuthenticated ? '/boards' : '/login'}>
                {isAuthenticated ? 'Открыть доски' : 'У меня есть аккаунт'}
              </Link>
            </div>

            <div className="landing-v2-trust-row">
              <div className="landing-v2-trust-pill">
                <InviteIcon />
                <span>Invite-коды</span>
              </div>
              <div className="landing-v2-trust-pill">
                <ShieldIcon />
                <span>Роли и модерация</span>
              </div>
              <div className="landing-v2-trust-pill">
                <DockerIcon />
                <span>Docker-ready</span>
              </div>
            </div>
          </div>

          <div className="landing-v2-showcase landing-v2-scale-in">
            <div className="landing-v2-showcase-grid" />

            <div className="landing-v2-floating-board">
              <div className="landing-v2-board-column landing-v2-board-column-offset">
                <div className="landing-v2-board-heading" />
                <div className="landing-v2-board-card landing-v2-board-card-small" />
                <div className="landing-v2-board-card landing-v2-board-card-large is-accent" />
              </div>

              <div className="landing-v2-board-column">
                <div className="landing-v2-board-heading" />
                <div className="landing-v2-board-card landing-v2-board-card-xl is-accent" />
                <div className="landing-v2-board-card landing-v2-board-card-small" />
              </div>
            </div>
          </div>
        </section>

        <section className="landing-v2-section">
          <div className="landing-v2-section-intro landing-v2-fade-up">
            <h2>Фокус на процессе, а не на настройках.</h2>
            <p>
              Профессионалы используют строгие системы. Мы убрали визуальный шум, чтобы вы могли
              сосредоточиться на главном — движении задач от идеи до релиза.
            </p>
          </div>

          <div className="landing-v2-feature-grid">
            {featureCards.map((card, index) => (
              <article
                className={`landing-v2-feature-card landing-v2-fade-up ${index === 1 ? 'delay-100' : ''} ${index === 2 ? 'delay-200' : ''}`}
                key={card.title}
              >
                <div className="landing-v2-feature-index">{card.index}</div>
                <h3>{card.title}</h3>
                <p>{card.body}</p>
                <ul>
                  {card.points.map((point) => (
                    <li key={point}>
                      <CheckIcon />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-v2-journey">
          <div className="landing-v2-journey-copy landing-v2-fade-up">
            <div className="landing-v2-kicker">Один понятный путь</div>
            <h2>Страница ведет к действию, а не распыляет внимание.</h2>
            <p>
              У главной есть одна задача: быстро объяснить, почему Scrumbun полезен прямо сейчас,
              и довести пользователя до входа в рабочее пространство.
            </p>
          </div>

          <div className="landing-v2-step-stack">
            {workflowSteps.map((step) => (
              <article className="landing-v2-step-card landing-v2-fade-up" key={step.title}>
                <div className="landing-v2-step-index">{step.index}</div>
                <div className="landing-v2-step-copy">
                  <h3>{step.title}</h3>
                  <p>{step.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-v2-final-cta landing-v2-fade-up">
          <div className="landing-v2-final-copy">
            <h2>Запустить доску и довести команду до стабильного потока.</h2>
          </div>

          <div className="landing-v2-final-actions">
            <Link className="landing-v2-primary-button" to={isAuthenticated ? '/app' : '/register'}>
              {isAuthenticated ? 'Открыть доску' : 'Создать аккаунт'}
            </Link>
            <Link className="landing-v2-secondary-button" to={isAuthenticated ? '/boards' : '/login'}>
              {isAuthenticated ? 'Управление досками' : 'Войти в систему'}
            </Link>
          </div>
        </section>
      </main>
    </section>
  )
}
