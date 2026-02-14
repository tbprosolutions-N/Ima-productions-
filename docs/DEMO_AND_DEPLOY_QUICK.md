# Demo & deploy – 2 minutes

## Run the demo (for your client meeting)

1. **Open a terminal in the project folder.**  
   In Cursor/VS Code: Terminal → New Terminal (it usually opens in the project root).  
   Or in PowerShell: `cd c:\Users\tbsol\Downloads\OS`

2. **Start the app:**  
   `npm run dev`

3. **Open in browser:**  
   http://localhost:3002  
   (If your config uses another port, check the terminal output for the “Local” URL.)  
   Use “Demo login” if you’re not using real Supabase, or log in with your credentials.

---

## Fix: “EPERM” or “operation not permitted” when running Netlify

You ran `npx netlify link` from **C:\Windows\system32**. Netlify must run from the **project folder** so it doesn’t try to write files into System32.

1. In PowerShell: `cd c:\Users\tbsol\Downloads\OS`
2. Then: `npx netlify link`
3. Choose your team and the site that serves **npc-am.com**.

After that, `npm run deploy` will work from this folder.
