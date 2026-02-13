# 🤖 ProcureAI — Intelligent Procurement SaaS

> **Automate your entire procurement lifecycle.** From demand forecasting to purchase order generation, ProcureAI keeps you in control while AI handles the complexity.

![ProcureAI Dashboard](https://via.placeholder.com/1200x600?text=ProcureAI+Dashboard+Preview) 
*(Replace with actual screenshot)*

## 📌 Overview

**ProcureAI** is an AI-powered SaaS platform designed to modernize procurement for SMBs and enterprises. It replaces manual spreadsheets and slow approval emails with an intelligent, automated workflow.

### Key Problems We Solve:
*   **Stockouts & Overstocks:** AI predicts demand based on sales velocity.
*   **Manual Supplier Comparison:** Automatically tracks and compares supplier price sheets.
*   **Slow PO Creation:** Generates smart PO drafts with one click.
*   **Lack of Visibility:** Real-time analytics on spend, savings, and supplier performance.

---

## 🚀 Key Features

*   **📈 AI Demand Forecasting:** Predict reorder needs from historical data (30/60/90 days).
*   **🤖 Smart PO Generation:** Auto-drafts Purchase Orders with optimal quantities.
*   **✅ Multi-Level Approvals:** Configurable workflows (Manager → Finance → Head).
*   **🔍 Supplier Scoring:** Rate suppliers based on price, delivery time, and quality.
*   **📊 Real-Time Analytics:** Visualize spend by category, supplier, and period.
*   **🔔 Smart Alerts:** Low stock notifications and price anomaly detection.

---

## 🛠️ Tech Stack

Built with a modern, high-performance, and open-source stack.

### Frontend
*   **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/)
*   **UI Library:** [Shadcn/UI](https://ui.shadcn.com/)
*   **State Management:** React Hooks / Context
*   **Animations:** Framer Motion

### Backend (Planned)
*   **Runtime:** Python 3.11+ / Node.js
*   **Framework:** FastAPI / Express
*   **Database:** PostgreSQL (Neon)
*   **Auth:** Clerk
*   **AI/ML:** Prophet (Forecasting), Scikit-learn (Anomalies)

---

## 🏁 Getting Started

### Prerequisites
*   Node.js 18+ installed
*   npm or yarn or pnpm

### Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/yourusername/procure-ai.git
    cd procure-ai
    ```

2.  **Install Frontend Dependencies**
    ```bash
    cd client
    npm install
    ```

3.  **Run Development Server**
    ```bash
    npm run dev
    ```

4.  Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📂 Project Structure

```bash
procure-ai/
├── client/                 # Next.js Frontend
│   ├── src/
│   │   ├── app/            # App Router (Pages)
│   │   ├── components/     # UI Components
│   │   └── lib/            # Utilities
│   └── public/             # Static Assets
├── server/                 # Backend API (Coming Soon)
└── README.md               # Documentation
```

---

## 🛣️ Roadmap

- [x] **Phase 1:** Project Skeleton & UI Shell (Done)
- [x] **Phase 1.9:** Landing Page Polish & Motion (Done)
- [ ] **Phase 2:** Authentication & User Roles (Coming Next)
- [ ] **Phase 3:** Core Procurement Workflows (PO Creation)
- [ ] **Phase 4:** AI Integration (Forecasting Models)

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Made with ❤️ by the ProcureAI Team.
