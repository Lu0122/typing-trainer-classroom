# 字练场 · Typing Trainer Classroom

Repository: [github.com/Lu0122/typing-trainer-classroom](https://github.com/Lu0122/typing-trainer-classroom)

字练场 is an open-source typing practice and classroom competition platform for Chinese and English learners. It combines guided keyboard lessons, article-based typing challenges, student accounts, progress analytics, teacher administration, and multiplayer typing games in one self-hosted application.

The frontend uses Vue 3 and Vite. The backend uses Node.js, Express, and SQLite. It can run locally for development or as a Windows offline package for a classroom LAN, so students only need a browser and do not need Node.js installed.

## Highlights

- Guided keyboard lessons with a 128-key virtual keyboard and physical keyboard feedback.
- English, Chinese, and pinyin typing practice with saved browser progress.
- Server-timed 60-second challenges and per-student leaderboards.
- Student account management, class grouping, assignments, progress reports, and CSV exports.
- One-click student creation and batch import from Excel, CSV, or pasted text.
- A read-only teacher assistant that can answer natural-language questions about students, classes, training progress, assignments, competitions, and feedback.
- Multiplayer modes including races, pursuit, rhythm typing, elimination, territory battles, and competition events.
- Offline Windows runtime packaging with a matching Node.js runtime and SQLite native module.
- Automated tests covering authentication, administration, scoring, multiplayer state, timing, and frontend input behavior.

## Quick start

Requirements: Node.js 20 or newer and npm.

```bash
npm install
Copy-Item .env.example .env
npm run build
npm start
```

Open `http://localhost:3000` for the student site and `http://localhost:3000/admin` for the teacher console. The default administrator password is `admin123`; change `ADMIN_PASSWORD` in `.env` before real use.

The default SQLite database is stored at `data/typing.db`. Runtime data and `.env` are ignored by Git. Do not commit real student records, passwords, API keys, or generated runtime data.

## Windows classroom package

On Windows x64, run:

```bash
npm run package:win
```

The generated ZIP is written to `output/packages/`. Extract it and launch `启动字练场.bat`. The package contains its own Node.js runtime, SQLite native module, frontend assets, and required dependencies. See [Windows runtime instructions](docs/WINDOWS-RUNTIME.md) for LAN access, data migration, firewall, and troubleshooting details.

## Administration and security

Teachers can create individual student accounts or import a class roster. Student names and IDs are checked for duplicates, passwords are stored with salted `scrypt` hashes, and sessions are stored as SHA-256 token digests. The admin assistant only performs read-only queries and records audit logs. SQL submitted through the assistant is restricted to bounded `SELECT` statements and protected fields are blocked at the server layer.

Self-registration can be disabled with `STUDENT_REGISTRATION_ENABLED=false`. Account approval can be enabled with `REQUIRE_ACCOUNT_APPROVAL=true` so teachers approve new registrations before students can log in.

## Development commands

```bash
npm run build       # build the frontend
npm start           # build and start the server
npm test            # run the full test suite
npm run package:win # build the Windows offline package
```

The project documentation is in `docs/`. Source code is organized into `frontend/`, `backend/`, `public/`, `scripts/`, and `test/`.

## License

This project is released under the [MIT License](LICENSE). Third-party dependencies and generated image assets retain their respective notices and licenses.
