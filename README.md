# IPP System 

Система для кафедр: загрузка Excel нагрузки → автогенерация динамичных `row.*` плейсхолдеров → вставка в DOCX (внутри циклов) → загрузка DOCX (скан плейсхолдеров) → настройка пары **Excel + DOCX** → генерация индивидуального плана преподавателя.

---

## Tech Stack

- **Backend:** FastAPI, Python, psycopg2, pandas, docxtpl, python-docx
- **DB:** PostgreSQL
- **Frontend:** React (Vite), react-router-dom, axios

---

## Database Setup

> Выполни **FULL RESET** схемы из файла `db/db_reset.sql`.

---

## Run project locally

### Backend
```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --reload
```

Backend:
- http://127.0.0.1:8000/
- http://127.0.0.1:8000/docs

---

### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend:
- http://localhost:5173


---

## Git workflow & commit standard

### Branch naming

Используем единый формат имен веток:

#### Типы веток
- `feature/<short-topic>` — новая функциональность  
  Пример: `feature/file-upload`
- `fix/<short-topic>` — исправление бага  
  Пример: `fix/docx-parser-bug`
- `refactor/<short-topic>` — рефакторинг без изменения логики  
  Пример: `refactor/db-connection`
- `chore/<short-topic>` — рутина (зависимости, конфиги, скрипты)  
  Пример: `chore/add-env-template`
- `docs/<short-topic>` — документация  
  Пример: `docs/update-readme`

#### Правила
- использовать **только латиницу**
- **нижний регистр**
- слова разделяются символом `-`
- одна ветка — одна логическая задача

---

### Commit message format (Conventional Commits)

Формат сообщения коммита:

`<type>(<scope>): <short summary>`

#### Где:
- `<type>` — тип изменения  
- `<scope>` — область изменений (`backend`, `frontend`, `db`, `docs`, `ci` и т.д.)  
- `<short summary>` — краткое описание в повелительном наклонении  

---

### Allowed commit types
- `feat` — новая функциональность  
- `fix` — багфикс  
- `refactor` — рефакторинг без изменения поведения  
- `perf` — оптимизация производительности  
- `test` — добавление или обновление тестов  
- `docs` — документация  
- `chore` — зависимости, конфиги, служебные изменения  
- `build` — сборка и пакеты  
- `ci` — CI/CD  
- `style` — форматирование (без изменения логики)

---

### Pull Requests
Каждый PR должен:
- иметь понятный заголовок (как commit summary)
- содержать краткое описание (что сделано и почему)
- включать скрин/пример запроса (если меняли UI или API)

Шаблон описания PR:
- **What:** что сделано
- **Why:** зачем
- **How to test:** как проверить

---