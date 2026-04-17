# 📱 Home Budget Tracker V2 — Setup Guide

Complete setup takes about **5–10 minutes**. Follow these steps once and the app runs forever.

**What's new in V2:**
- 📊 Dashboard with charts (Category breakdown + Spending trend)
- 🗒️ Expense History with Edit & Delete
- 👤 Personal Expense Tracker (separate per-user tracker)
- 🔍 Search and filter on History
- 🆔 Unique row IDs — no wrong-row updates ever

---

## PART 1 — Google Sheet + Apps Script Backend

### Step 1: Create a Google Sheet

1. Go to [sheets.google.com](https://sheets.google.com) and sign in
2. Click **+ Blank spreadsheet**
3. Name it **Home Budget** (top-left title bar)

---

### Step 2: Open Apps Script Editor

1. In your Google Sheet, click **Extensions** (top menu)
2. Click **Apps Script**
3. A new tab opens with a code editor

---

### Step 3: Paste the Script

1. **Select all** existing code in the editor (`Ctrl+A`)
2. **Delete it**
3. Open the file `apps-script.gs` (from this project folder) in any text editor (e.g. Notepad)
4. **Copy all** the code from `apps-script.gs`
5. **Paste** it into the Apps Script editor
6. Click **💾 Save** (floppy disk icon) or press `Ctrl+S`
7. Name the project **Home Budget API** when prompted

---

### Step 4: Set Up Sheets & Column Headers (Run Once)

1. In the Apps Script editor, find the **function dropdown** at the top (shows `doPost` by default)
2. **Change it** to `setupHeadersV2` using the dropdown
3. Click **▶ Run**
4. A **permissions dialog** may appear → Click **Review permissions** → **Allow**
5. You'll see a success popup in your Google Sheet ✅

> **What this does:** Creates two sheets — **Expenses** (for shared costs) and **PersonalExpenses** (for individual tracking). The ID column in each sheet is automatically hidden.

---

### Step 5: Deploy as Web App

1. In the Apps Script editor, click **Deploy** (top right) → **New deployment**
2. Click the **gear icon ⚙** next to "Select type" → choose **Web app**
3. Fill in:
   - **Description**: `Home Budget API v2`
   - **Execute as**: `Me`
   - **Who has access**: `Anyone`
4. Click **Deploy**
5. Click **Authorize access** if prompted → Allow
6. **Copy the Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
   > ⚠️ Keep this URL safe. Anyone with it can add entries to your sheet.

> **Updating the script later?** Always redeploy as a **New version**: Deploy → Manage deployments → ✏ Edit → Version: New version → Deploy.

---

## PART 2 — Configure the App

### Step 6: Add Your URL to the App

1. Open the app (`index.html`) in your browser or phone
2. Tap the **⚙ Settings** button (top right)
3. Paste the Web App URL you copied
4. Tap **💾 Save URL**
5. Tap **🔗 Test** to verify — you should see "Connected! API v2.0 is running"

---

## PART 3 — Install on Your Phone (PWA)

The app can be installed on your phone like a real app — no app store needed!

### Android (Chrome)

1. Open the app URL in Chrome on your Android phone
2. Tap the **three-dot menu (⋮)** at the top right
3. Tap **"Add to Home screen"**
4. Tap **"Install"** in the popup
5. The app icon appears on your home screen 📱

### iOS (Safari)

1. Open the app URL in **Safari** (must be Safari, not Chrome)
2. Tap the **Share button** (box with arrow) at the bottom
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **"Add"** at the top right
5. The app icon appears on your home screen 📱

---

## PART 4 — Hosting (Required for Phone Install)

To install as PWA on phones, the app must be on a real URL (HTTPS). Here are two **free** options:

### Option A: GitHub Pages (Recommended)

1. Create a free account at [github.com](https://github.com)
2. Create a new repository named `home-budget`
3. Upload all project files to the repository
4. Go to **Settings** → **Pages**
5. Under "Source", select **main** branch and **/ (root)**
6. Click **Save** — your URL will be:
   ```
   https://yourusername.github.io/home-budget/
   ```
7. Share this URL with both Smruti and Sajhni

### Option B: Netlify (Drag & Drop)

1. Create a free account at [netlify.com](https://netlify.com)
2. Go to your Netlify dashboard
3. Drag the entire **Home Budget** project folder into the deploy area
4. Netlify gives you an instant URL like:
   ```
   https://random-name-123.netlify.app
   ```
5. Optionally rename it in site settings

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "Save Failed" error | Check internet connection; verify API URL in Settings |
| "Connection Failed" on Test | Re-deploy the Apps Script as a **New version** |
| Data not appearing in Sheet | Open Apps Script → **Executions** to see error logs |
| App won't install on phone | Must be on HTTPS (hosted URL, not a local file) |
| Dashboard shows "Setup Required" | Open ⚙ Settings and add your API URL |
| Edit/Delete buttons missing | Entry was added before V2 (legacy ID). Add new entries via the app. |
| Can't edit old V1 entries | Run `setupHeadersV2` again — it auto-migrates old rows with IDs |
| Charts don't show | No entries in the selected date range — add some expenses first |

---

## Google Sheet Structure (V2)

### Expenses Sheet (Shared Costs)

| A: ID (hidden) | B: Month | C: Date | D: Category | E: Remark | F: Smruti Amount | G: Sajhni Amount | H: Total |
|----------------|----------|---------|-------------|-----------|------------------|------------------|---------|
| lf2k4x-a3r7z | April 2026 | 04/17/2026 | Groceries | Big Bazaar | 850.00 | | 850.00 |
| lf2k5y-b4s8w | April 2026 | 04/17/2026 | Petrol | | | 500.00 | 500.00 |

### PersonalExpenses Sheet (Individual Tracker)

| A: ID (hidden) | B: Month | C: Date | D: Category | E: Remark | F: Amount | G: User |
|----------------|----------|---------|-------------|-----------|-----------|---------|
| lf2k6z-c5t9x | April 2026 | 04/17/2026 | Food | Lunch | 250.00 | Smruti |
| lf2k7a-d6u0y | April 2026 | 04/17/2026 | E-commerce | Amazon | 1200.00 | Sajhni |

---

## How to Use V2 Features

### Adding Expenses (Add Tab ➕)
- Same as before — pick date, category, who paid, amount, remark → Save
- Both Smruti and Sajhni use the same app (no login needed)

### Viewing Dashboard (Dashboard Tab 📊)
- See total spend, individual totals, and transaction count
- Category breakdown pie chart + spending trend line chart
- Filter by: **This Month** | **Last 7 Days** | **Custom date range**

### Viewing & Editing History (History Tab 🗒️)
- **Common** mode: shared expenses — tap any row to edit or delete
- **Personal** mode: individual tracker — tap any row to edit or delete
- Search by remark or category using the search bar
- Filter by category using the dropdown

### Adding Personal Expenses
1. Go to **History** tab
2. Toggle to **Personal** mode
3. Tap **+ Add Personal Expense**
4. Fill in: Who (Smruti/Sajhni) → Date → Category (Food/E-commerce/Others) → Amount → Remark
5. Tap **Save Personal Expense**

---

*Built as a Progressive Web App (PWA). No login required. All data stored in your own Google Sheet.*
